import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import ExcelJS from 'exceljs'
import { compararPorApellido } from './gradeUtils'

const NAVY_DARK = '#0F172A'
const NAVY = '#2563EB'
const GREEN = '#22C55E'
const GREEN_DARK = '#16A34A'

const inputStyle = { backgroundColor: 'white', border: '1px solid #D6DCE5', color: NAVY_DARK }

function parseNombreCompleto(linea) {
  const palabras = linea.trim().split(/\s+/).filter(Boolean)
  if (palabras.length === 0) return null
  if (palabras.length === 1) return { nombres: palabras[0], apellidos: '' }
  if (palabras.length === 2) return { nombres: palabras[0], apellidos: palabras[1] }
  const apellidos = palabras.slice(-2).join(' ')
  const nombres = palabras.slice(0, -2).join(' ')
  return { nombres, apellidos }
}

async function descargarWorkbook(workbook, filename) {
  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export default function ImportarDocentes() {
  const [areas, setAreas] = useState([])
  const [texto, setTexto] = useState('')
  const [areaId, setAreaId] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [resultados, setResultados] = useState(null)
  const [docentes, setDocentes] = useState([])
  const [loadingDocentes, setLoadingDocentes] = useState(true)
  const [deletingId, setDeletingId] = useState(null)

  useEffect(function () {
    loadAreas()
    loadDocentes()
  }, [])

  async function loadDocentes() {
    setLoadingDocentes(true)
    const result = await supabase
      .from('profiles')
      .select('id, full_name')
      .eq('role', 'docente')
      .order('full_name', { ascending: true })
    if (!result.error) {
      const ordenados = [...result.data].sort(function (a, b) { return compararPorApellido(a.full_name, b.full_name) })
      setDocentes(ordenados)
    }
    setLoadingDocentes(false)
  }

  async function handleDeleteDocente(id, nombre) {
    if (!confirm(`¿Eliminar la cuenta de "${nombre}"? Esta acción no se puede deshacer.`)) return
    setDeletingId(id)
    const { data, error: fnError } = await supabase.functions.invoke('delete-user', {
      body: { userId: id },
    })
    if (fnError) {
      alert('Error al eliminar: ' + fnError.message)
    } else if (data.error) {
      alert('Error al eliminar: ' + data.error)
    } else {
      setDocentes(function (prev) { return prev.filter(function (d) { return d.id !== id }) })
    }
    setDeletingId(null)
  }

  async function loadAreas() {
    const result = await supabase.from('areas_curriculares').select('*').order('orden', { ascending: true })
    if (!result.error) {
      setAreas(result.data)
      if (result.data.length > 0) setAreaId(result.data[0].id)
    }
  }

  const lineas = texto.split('\n').map(function (l) { return l.trim() }).filter(Boolean)

  async function handleCrear() {
    setError('')
    setResultados(null)

    const areaNombre = areas.find(function (a) { return a.id === areaId })?.nombre || ''

    const teachers = lineas.map(function (linea) {
      const p = parseNombreCompleto(linea)
      return { nombres: p.nombres, apellidos: p.apellidos, area: areaNombre }
    }).filter(function (t) { return t.nombres && t.apellidos })

    if (teachers.length === 0) {
      setError('Pega al menos un nombre completo (Nombres y Apellidos) por línea.')
      return
    }

    setLoading(true)
    const { data, error: fnError } = await supabase.functions.invoke('create-teachers', {
      body: { teachers: teachers },
    })

    if (fnError) {
      setError('Error al crear las cuentas: ' + fnError.message)
      setLoading(false)
      return
    }

    if (data.error) {
      setError(data.error)
      setLoading(false)
      return
    }

    setResultados(data.resultados)
    loadDocentes()
    setLoading(false)
  }

  async function exportarExcel() {
    const workbook = new ExcelJS.Workbook()
    const ws = workbook.addWorksheet('Credenciales Docentes')
    ws.columns = [
      { header: 'Nombre completo', key: 'nombre', width: 35 },
      { header: 'Correo', key: 'email', width: 32 },
      { header: 'Contraseña', key: 'password', width: 16 },
      { header: 'Área', key: 'area', width: 30 },
    ]
    ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
    ws.getRow(1).eachCell(function (cell) {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } }
    })

    resultados.forEach(function (r) {
      if (r.error) return
      ws.addRow({ nombre: r.nombre, email: r.email, password: r.password, area: r.area })
    })

    await descargarWorkbook(workbook, `Credenciales_Docentes_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  const exitosos = resultados ? resultados.filter(function (r) { return !r.error }) : []
  const fallidos = resultados ? resultados.filter(function (r) { return r.error }) : []

  return (
    <div>
      <h2 className="text-2xl font-bold mb-2" style={{ color: NAVY_DARK }}>Importar Docentes</h2>
      <p className="text-sm text-slate-400 mb-6">
        Pega la lista de nombres completos (uno por línea), elige el área a la que pertenecen, y la plataforma
        crea sus cuentas automáticamente con correo y contraseña. Luego los asignas a sus asignaturas específicas
        desde la pestaña "Cursos".
      </p>

      <div className="bg-white rounded-2xl p-6 mb-6" style={{ border: '1px solid #E5E9F0' }}>
        <div className="mb-4 max-w-sm">
          <label className="block text-xs font-medium mb-1" style={{ color: NAVY_DARK }}>Área</label>
          <select
            value={areaId}
            onChange={function (e) { setAreaId(e.target.value) }}
            className="w-full rounded-lg px-3 py-2 text-sm outline-none"
            style={inputStyle}
          >
            {areas.map(function (a) { return <option key={a.id} value={a.id}>{a.nombre}</option> })}
          </select>
        </div>

        <label className="block text-xs font-medium mb-1" style={{ color: NAVY_DARK }}>
          Lista de docentes (un nombre completo por línea)
        </label>
        <textarea
          value={texto}
          onChange={function (e) { setTexto(e.target.value) }}
          rows={8}
          placeholder={'Gustavo Adolfo Ramos Misaico\nMaría Elena Torres Vega'}
          className="w-full rounded-lg px-3 py-2 text-sm outline-none font-mono"
          style={inputStyle}
        />
        <p className="text-xs text-slate-400 mt-1">{lineas.length} nombre(s) detectado(s)</p>

        {error && <p className="text-red-500 text-sm mt-3">{error}</p>}

        <button
          onClick={handleCrear}
          disabled={loading || lineas.length === 0}
          className="mt-4 text-sm font-semibold px-5 py-2.5 rounded-lg text-white transition hover:opacity-90 disabled:opacity-50"
          style={{ backgroundColor: GREEN }}
        >
          {loading ? 'Creando cuentas...' : `Crear ${lineas.length} cuenta(s)`}
        </button>
      </div>

      {resultados && (
        <div className="bg-white rounded-2xl p-6" style={{ border: '1px solid #E5E9F0' }}>
          <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
            <h3 className="text-sm font-bold" style={{ color: GREEN_DARK }}>
              {exitosos.length} cuenta(s) creada(s) correctamente
              {fallidos.length > 0 && <span style={{ color: '#B91C1C' }}> · {fallidos.length} con error</span>}
            </h3>
            {exitosos.length > 0 && (
              <button
                onClick={exportarExcel}
                className="text-xs font-semibold px-4 py-2 rounded-lg text-white transition hover:opacity-90"
                style={{ backgroundColor: NAVY }}
              >
                Descargar Excel de credenciales
              </button>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid #E5E9F0' }}>
                  <th className="text-left py-2 pr-3 font-semibold" style={{ color: NAVY_DARK }}>Nombre</th>
                  <th className="text-left py-2 pr-3 font-semibold" style={{ color: NAVY_DARK }}>Correo</th>
                  <th className="text-left py-2 pr-3 font-semibold" style={{ color: NAVY_DARK }}>Contraseña</th>
                  <th className="text-left py-2 font-semibold" style={{ color: NAVY_DARK }}>Área</th>
                </tr>
              </thead>
              <tbody>
                {exitosos.map(function (r, i) {
                  return (
                    <tr key={i} style={{ borderBottom: '1px solid #F4F6F9' }}>
                      <td className="py-2 pr-3" style={{ color: NAVY_DARK }}>{r.nombre}</td>
                      <td className="py-2 pr-3 text-slate-500">{r.email}</td>
                      <td className="py-2 pr-3 font-mono text-slate-500">{r.password}</td>
                      <td className="py-2 text-slate-500">{r.area}</td>
                    </tr>
                  )
                })}
                {fallidos.map(function (r, i) {
                  return (
                    <tr key={'err' + i} style={{ borderBottom: '1px solid #F4F6F9' }}>
                      <td className="py-2 pr-3" style={{ color: '#B91C1C' }}>{r.nombre}</td>
                      <td className="py-2 text-xs text-red-500" colSpan={3}>{r.error}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl p-6 mt-6" style={{ border: '1px solid #E5E9F0' }}>
        <h3 className="text-sm font-bold mb-4" style={{ color: NAVY_DARK }}>
          Docentes registrados {!loadingDocentes && `(${docentes.length})`}
        </h3>
        {loadingDocentes ? (
          <p className="text-slate-400 text-sm">Cargando...</p>
        ) : docentes.length === 0 ? (
          <p className="text-slate-400 text-sm">Aún no hay docentes registrados.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid #E5E9F0' }}>
                <th className="text-left py-2 pr-3 font-semibold" style={{ color: NAVY_DARK }}>Nombre</th>
                <th className="text-right py-2 font-semibold" style={{ color: NAVY_DARK }}></th>
              </tr>
            </thead>
            <tbody>
              {docentes.map(function (d) {
                return (
                  <tr key={d.id} style={{ borderBottom: '1px solid #F4F6F9' }}>
                    <td className="py-2 pr-3" style={{ color: NAVY_DARK }}>{d.full_name}</td>
                    <td className="py-2 text-right">
                      <button
                        onClick={function () { handleDeleteDocente(d.id, d.full_name) }}
                        disabled={deletingId === d.id}
                        className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white transition hover:opacity-90 disabled:opacity-50"
                        style={{ backgroundColor: '#B91C1C' }}
                      >
                        {deletingId === d.id ? 'Eliminando...' : 'Eliminar'}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
