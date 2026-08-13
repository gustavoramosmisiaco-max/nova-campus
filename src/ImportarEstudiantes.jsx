import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import ExcelJS from 'exceljs'

const NAVY_DARK = '#0F172A'
const NAVY = '#2563EB'
const GREEN = '#22C55E'
const GREEN_DARK = '#16A34A'

const GRADOS = [1, 2, 3, 4, 5]
const SECCIONES = ['A', 'B', 'C', 'D', 'E']

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

export default function ImportarEstudiantes({ institucionFija } = {}) {
  const [texto, setTexto] = useState('')
  const [grado, setGrado] = useState(1)
  const [grupo, setGrupo] = useState('A')
  const [instituciones, setInstituciones] = useState([])
  const [institucionId, setInstitucionId] = useState(institucionFija || '')
  const [gradosPorInstitucion, setGradosPorInstitucion] = useState({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [resultados, setResultados] = useState(null)

  useEffect(function () {
    cargarInstituciones()
    cargarGrados()
  }, [])

  async function cargarInstituciones() {
    const result = await supabase.from('instituciones_educativas').select('id, nombre').order('nombre')
    if (!result.error) {
      setInstituciones(result.data)
      if (result.data.length === 1) setInstitucionId(result.data[0].id)
    }
  }

  async function cargarGrados() {
    const result = await supabase.from('grados_institucion').select('institucion_id, numero, nombre').order('orden')
    if (result.error) return
    const mapa = {}
    result.data.forEach(function (g) {
      if (!mapa[g.institucion_id]) mapa[g.institucion_id] = []
      mapa[g.institucion_id].push({ numero: g.numero, nombre: g.nombre })
    })
    setGradosPorInstitucion(mapa)
  }

  function gradosDisponibles() {
    if (institucionId && gradosPorInstitucion[institucionId]) return gradosPorInstitucion[institucionId]
    return GRADOS.map(function (n) { return { numero: n, nombre: n + '°' } })
  }

  const lineas = texto.split('\n').map(function (l) { return l.trim() }).filter(Boolean)

  async function handleCrear() {
    setError('')
    setResultados(null)

    const students = lineas.map(function (linea) {
      const p = parseNombreCompleto(linea)
      return { nombres: p.nombres, apellidos: p.apellidos, grado: grado, grupo: grupo, institucion_id: institucionId || null }
    }).filter(function (s) { return s.nombres && s.apellidos })

    if (students.length === 0) {
      setError('Pega al menos un nombre completo (Nombres y Apellidos) por línea.')
      return
    }

    setLoading(true)
    const { data, error: fnError } = await supabase.functions.invoke('create-students', {
      body: { students: students },
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
    setLoading(false)
  }

  async function exportarExcel() {
    const workbook = new ExcelJS.Workbook()
    const ws = workbook.addWorksheet('Credenciales')
    ws.columns = [
      { header: 'Nombre completo', key: 'nombre', width: 35 },
      { header: 'Correo', key: 'email', width: 32 },
      { header: 'Contraseña', key: 'password', width: 16 },
      { header: 'Grado', key: 'grado', width: 8 },
      { header: 'Sección', key: 'grupo', width: 10 },
      { header: 'Cursos matriculados', key: 'cursos', width: 18 },
    ]
    ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
    ws.getRow(1).eachCell(function (cell) {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } }
    })

    resultados.forEach(function (r) {
      if (r.error) return
      ws.addRow({
        nombre: r.nombre,
        email: r.email,
        password: r.password,
        grado: `${r.grado}°`,
        grupo: r.grupo,
        cursos: r.cursosMatriculados,
      })
    })

    await descargarWorkbook(workbook, `Credenciales_${grado}${grupo}_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  const exitosos = resultados ? resultados.filter(function (r) { return !r.error }) : []
  const fallidos = resultados ? resultados.filter(function (r) { return r.error }) : []

  return (
    <div>
      <h2 className="text-2xl font-bold mb-2" style={{ color: NAVY_DARK }}>Importar Estudiantes</h2>
      <p className="text-sm text-slate-400 mb-6">
        {institucionFija
          ? 'Pega la lista de nombres completos (uno por línea), elige el grado y sección, y la plataforma crea las cuentas automáticamente con su correo y contraseña, matriculándolos en todos los cursos de esa aula.'
          : 'Pega la lista de nombres completos (uno por línea), elige la institución, grado y sección, y la plataforma crea las cuentas automáticamente con su correo y contraseña, matriculándolos en todos los cursos de esa aula.'}
      </p>

      <div className="bg-white rounded-2xl p-6 mb-6" style={{ border: '1px solid #E5E9F0' }}>
        <div className="mb-4 max-w-xs">
          <label className="block text-xs font-medium mb-1" style={{ color: NAVY_DARK }}>Institución educativa</label>
          {institucionFija ? (
            <p className="w-full rounded-lg px-3 py-2 text-sm" style={{ backgroundColor: '#F4F6F9', color: NAVY_DARK, border: '1px solid #D6DCE5' }}>
              {instituciones.find(function (i) { return i.id === institucionFija })?.nombre || 'Tu institución'}
            </p>
          ) : (
            <>
              <select
                value={institucionId}
                onChange={function (e) {
                  const nuevaInstitucion = e.target.value
                  setInstitucionId(nuevaInstitucion)
                  const lista = nuevaInstitucion && gradosPorInstitucion[nuevaInstitucion] ? gradosPorInstitucion[nuevaInstitucion] : GRADOS.map(function (n) { return { numero: n, nombre: n + '°' } })
                  if (!lista.some(function (g) { return g.numero === grado })) setGrado(lista[0]?.numero || 1)
                }}
                className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                style={inputStyle}
              >
                <option value="">-- Selecciona --</option>
                {instituciones.map(function (i) { return <option key={i.id} value={i.id}>{i.nombre}</option> })}
              </select>
              {!institucionId && (
                <p className="text-xs mt-1" style={{ color: '#B45309' }}>Sin institución elegida, los estudiantes se crearán sin institución asignada.</p>
              )}
            </>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4 max-w-xs">
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: NAVY_DARK }}>Grado</label>
            <select
              value={grado}
              onChange={function (e) { setGrado(Number(e.target.value)) }}
              className="w-full rounded-lg px-3 py-2 text-sm outline-none"
              style={inputStyle}
            >
              {gradosDisponibles().map(function (g) { return <option key={g.numero} value={g.numero}>{g.nombre}</option> })}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: NAVY_DARK }}>Sección</label>
            <select
              value={grupo}
              onChange={function (e) { setGrupo(e.target.value) }}
              className="w-full rounded-lg px-3 py-2 text-sm outline-none"
              style={inputStyle}
            >
              {SECCIONES.map(function (s) { return <option key={s} value={s}>Sección {s}</option> })}
            </select>
          </div>
        </div>

        <label className="block text-xs font-medium mb-1" style={{ color: NAVY_DARK }}>
          Lista de estudiantes (un nombre completo por línea)
        </label>
        <textarea
          value={texto}
          onChange={function (e) { setTexto(e.target.value) }}
          rows={10}
          placeholder={'Aixa Shayumi Aguirre Sarmiento\nAlejandro Antonio Ramirez Mejia\nAlessandro Del Piero Ramos Ventura'}
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
                  <th className="text-left py-2 font-semibold" style={{ color: NAVY_DARK }}>Cursos</th>
                </tr>
              </thead>
              <tbody>
                {exitosos.map(function (r, i) {
                  return (
                    <tr key={i} style={{ borderBottom: '1px solid #F4F6F9' }}>
                      <td className="py-2 pr-3" style={{ color: NAVY_DARK }}>{r.nombre}</td>
                      <td className="py-2 pr-3 text-slate-500">{r.email}</td>
                      <td className="py-2 pr-3 font-mono text-slate-500">{r.password}</td>
                      <td className="py-2 text-slate-500">{r.cursosMatriculados}</td>
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
    </div>
  )
}
