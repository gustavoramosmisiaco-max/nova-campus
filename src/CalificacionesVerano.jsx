import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import jsPDF from 'jspdf'

const NAVY_DARK = '#0F172A'
const NAVY = '#2563EB'
const GREEN = '#22C55E'

const inputStyle = { backgroundColor: 'white', border: '1px solid #D6DCE5', color: NAVY_DARK }

function nivelCNEB(nota) {
  if (nota == null) return null
  if (nota >= 18) return 'AD'
  if (nota >= 14) return 'A'
  if (nota >= 11) return 'B'
  return 'C'
}

function significadoNivel(nivel) {
  if (nivel === 'AD') return 'Logro Destacado'
  if (nivel === 'A') return 'Logro Esperado'
  if (nivel === 'B') return 'En Proceso'
  if (nivel === 'C') return 'En Inicio'
  return ''
}

export default function CalificacionesVerano() {
  const [loading, setLoading] = useState(true)
  const [talleres, setTalleres] = useState([])
  const [tallerSel, setTallerSel] = useState('')
  const [matriculas, setMatriculas] = useState([])
  const [notas, setNotas] = useState({}) // matriculaId -> { nota, observacion }
  const [guardandoId, setGuardandoId] = useState(null)

  const [tab, setTab] = useState('calificar') // 'calificar' | 'boletin'
  const [busquedaEstudiante, setBusquedaEstudiante] = useState('')
  const [resultadoBoletin, setResultadoBoletin] = useState(null)
  const [buscando, setBuscando] = useState(false)

  useEffect(function () {
    cargarTalleres()
  }, [])

  useEffect(function () {
    if (tallerSel) cargarMatriculas()
  }, [tallerSel])

  async function cargarTalleres() {
    setLoading(true)
    const result = await supabase.from('talleres_verano').select('id, nombre, criterio_evaluacion').order('nombre')
    if (!result.error) setTalleres(result.data)
    setLoading(false)
  }

  async function cargarMatriculas() {
    const [matResult, notasResult] = await Promise.all([
      supabase.from('matriculas_verano').select('*').eq('taller_id', tallerSel).eq('estado', 'pago_validado').order('nombre_estudiante'),
      supabase.from('notas_verano').select('*').in('matricula_id',
        (await supabase.from('matriculas_verano').select('id').eq('taller_id', tallerSel)).data?.map(function (m) { return m.id }) || []
      ),
    ])
    if (!matResult.error) setMatriculas(matResult.data)
    const mapa = {}
    if (!notasResult.error) {
      notasResult.data.forEach(function (n) { mapa[n.matricula_id] = { nota: n.nota, observacion: n.observacion || '' } })
    }
    setNotas(mapa)
  }

  function actualizarCampo(matriculaId, campo, valor) {
    setNotas(function (prev) {
      return { ...prev, [matriculaId]: { ...(prev[matriculaId] || {}), [campo]: valor } }
    })
  }

  async function guardarNota(matriculaId) {
    setGuardandoId(matriculaId)
    const datos = notas[matriculaId] || {}
    await supabase.from('notas_verano').upsert(
      {
        matricula_id: matriculaId,
        nota: datos.nota != null && datos.nota !== '' ? Number(datos.nota) : null,
        observacion: datos.observacion || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'matricula_id' }
    )
    setGuardandoId(null)
  }

  async function actualizarCriterio(tallerId, texto) {
    await supabase.from('talleres_verano').update({ criterio_evaluacion: texto }).eq('id', tallerId)
  }

  async function handleBuscarEstudiante(e) {
    e.preventDefault()
    if (!busquedaEstudiante.trim()) return
    setBuscando(true)
    setResultadoBoletin(null)

    const matResult = await supabase
      .from('matriculas_verano')
      .select('*, taller:talleres_verano(nombre, criterio_evaluacion)')
      .eq('estado', 'pago_validado')
      .ilike('nombre_estudiante', `%${busquedaEstudiante.trim()}%`)

    if (!matResult.error && matResult.data.length > 0) {
      const matriculaIds = matResult.data.map(function (m) { return m.id })
      const notasResult = await supabase.from('notas_verano').select('*').in('matricula_id', matriculaIds)
      const mapaNotas = {}
      if (!notasResult.error) notasResult.data.forEach(function (n) { mapaNotas[n.matricula_id] = n })

      const primero = matResult.data[0]
      const filas = matResult.data.map(function (m) {
        const n = mapaNotas[m.id]
        return {
          taller: m.taller?.nombre,
          criterio: m.taller?.criterio_evaluacion || '',
          nota: n?.nota != null ? n.nota : null,
          observacion: n?.observacion || '',
        }
      })

      setResultadoBoletin({
        nombreEstudiante: primero.nombre_estudiante,
        edadGrado: primero.edad_grado_estudiante,
        filas: filas,
      })
    }
    setBuscando(false)
  }

  function exportarBoletinPDF() {
    if (!resultadoBoletin) return
    const doc = new jsPDF({ format: 'a4', unit: 'mm' })
    const pageWidth = doc.internal.pageSize.getWidth()
    let y = 20

    doc.setFontSize(16)
    doc.setFont(undefined, 'bold')
    doc.text('BOLETÍN DE LOGROS DEL ESTUDIANTE', pageWidth / 2, y, { align: 'center' })
    y += 6
    doc.setFontSize(10)
    doc.setFont(undefined, 'normal')
    doc.text('Ciclo de Verano — Nexoris Academy', pageWidth / 2, y, { align: 'center' })
    y += 12

    doc.setFontSize(11)
    doc.setFont(undefined, 'bold')
    doc.text(`Estudiante: ${resultadoBoletin.nombreEstudiante}`, 14, y)
    y += 6
    if (resultadoBoletin.edadGrado) {
      doc.text(`Grado/Edad: ${resultadoBoletin.edadGrado}`, 14, y)
      y += 6
    }
    y += 4

    doc.setFillColor(15, 23, 42)
    doc.rect(14, y, pageWidth - 28, 8, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(9)
    doc.text('Taller / Área', 17, y + 5.5)
    doc.text('Criterio evaluado', 65, y + 5.5)
    doc.text('Nota', pageWidth - 45, y + 5.5)
    doc.text('Logro', pageWidth - 25, y + 5.5)
    doc.setTextColor(0, 0, 0)
    y += 10

    resultadoBoletin.filas.forEach(function (f, idx) {
      const nivel = nivelCNEB(f.nota)
      const criterioLineas = doc.splitTextToSize(f.criterio || '—', 90)
      const altura = Math.max(criterioLineas.length * 4.2, 8)

      if (idx % 2 === 0) {
        doc.setFillColor(248, 250, 252)
        doc.rect(14, y - 1, pageWidth - 28, altura + 2, 'F')
      }
      doc.setFontSize(9)
      doc.setFont(undefined, 'normal')
      doc.text(f.taller || '—', 17, y + 3)
      doc.text(criterioLineas, 65, y + 3)
      doc.setFont(undefined, 'bold')
      doc.text(f.nota != null ? String(f.nota) : '—', pageWidth - 45, y + 3)
      doc.text(nivel || '—', pageWidth - 25, y + 3)
      doc.setFont(undefined, 'normal')

      y += altura + 3
    })

    y += 8
    doc.setFontSize(9)
    doc.setFont(undefined, 'bold')
    doc.text('Escala de conversión (CNEB)', 14, y)
    y += 5
    doc.setFont(undefined, 'normal')
    doc.text('18-20: AD (Logro Destacado)   14-17: A (Logro Esperado)   11-13: B (En Proceso)   0-10: C (En Inicio)', 14, y)

    y += 12
    doc.setFontSize(8)
    doc.setTextColor(100, 100, 100)
    doc.text(`Generado el ${new Date().toLocaleDateString('es-PE', { day: 'numeric', month: 'long', year: 'numeric' })}`, 14, y)

    doc.save(`Boletin_${resultadoBoletin.nombreEstudiante.replace(/[^a-zA-Z0-9]+/g, '_')}.pdf`)
  }

  if (loading) return <p className="text-slate-400 text-sm">Cargando...</p>

  return (
    <div>
      <h2 className="text-2xl font-bold mb-2" style={{ color: NAVY_DARK }}>Calificaciones — Cursos de Verano</h2>
      <p className="text-sm text-slate-400 mb-6">Registra la nota de cada estudiante por taller, y genera su Boletín de Logros en PDF.</p>

      <div className="flex gap-2 mb-6 border-b" style={{ borderColor: '#E5E9F0' }}>
        <button onClick={function () { setTab('calificar') }} className="px-4 py-2.5 text-sm font-semibold border-b-2 transition" style={tab === 'calificar' ? { borderColor: GREEN, color: NAVY_DARK } : { borderColor: 'transparent', color: '#94A3B8' }}>
          Calificar por taller
        </button>
        <button onClick={function () { setTab('boletin') }} className="px-4 py-2.5 text-sm font-semibold border-b-2 transition" style={tab === 'boletin' ? { borderColor: GREEN, color: NAVY_DARK } : { borderColor: 'transparent', color: '#94A3B8' }}>
          Generar Boletín
        </button>
      </div>

      {tab === 'calificar' && (
        <>
          <div className="mb-4 max-w-md">
            <label className="block text-xs font-medium mb-1" style={{ color: NAVY_DARK }}>Taller</label>
            <select value={tallerSel} onChange={function (e) { setTallerSel(e.target.value) }} className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={inputStyle}>
              <option value="">-- Elige un taller --</option>
              {talleres.map(function (t) { return <option key={t.id} value={t.id}>{t.nombre}</option> })}
            </select>
          </div>

          {tallerSel && (
            <>
              <div className="mb-5">
                <label className="block text-xs font-medium mb-1" style={{ color: NAVY_DARK }}>¿Qué se evalúa en este taller? (aparece en el Boletín)</label>
                <input
                  type="text"
                  defaultValue={talleres.find(function (t) { return t.id === tallerSel })?.criterio_evaluacion || ''}
                  onBlur={function (e) { actualizarCriterio(tallerSel, e.target.value) }}
                  placeholder="Ej: Resuelve problemas de cantidad y regularidad en Aritmética y Álgebra"
                  className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                  style={inputStyle}
                />
              </div>

              {matriculas.length === 0 ? (
                <p className="text-slate-400 text-sm">No hay estudiantes con pago validado en este taller todavía.</p>
              ) : (
                <ul className="space-y-2">
                  {matriculas.map(function (m) {
                    const datos = notas[m.id] || {}
                    return (
                      <li key={m.id} className="bg-white rounded-xl p-3" style={{ border: '1px solid #E5E9F0' }}>
                        <p className="text-sm font-semibold mb-2" style={{ color: NAVY_DARK }}>{m.nombre_estudiante}</p>
                        <div className="flex gap-2 items-center flex-wrap">
                          <input
                            type="number" min={0} max={20} step="0.5"
                            value={datos.nota != null ? datos.nota : ''}
                            onChange={function (e) { actualizarCampo(m.id, 'nota', e.target.value) }}
                            placeholder="Nota"
                            className="w-20 rounded-lg px-2 py-1.5 text-sm outline-none"
                            style={inputStyle}
                          />
                          <input
                            type="text"
                            value={datos.observacion || ''}
                            onChange={function (e) { actualizarCampo(m.id, 'observacion', e.target.value) }}
                            placeholder="Observación (opcional)"
                            className="flex-1 min-w-[200px] rounded-lg px-2 py-1.5 text-sm outline-none"
                            style={inputStyle}
                          />
                          <button
                            onClick={function () { guardarNota(m.id) }}
                            disabled={guardandoId === m.id}
                            className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white transition hover:opacity-90 disabled:opacity-50"
                            style={{ backgroundColor: GREEN }}
                          >
                            {guardandoId === m.id ? '...' : 'Guardar'}
                          </button>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </>
          )}
        </>
      )}

      {tab === 'boletin' && (
        <>
          <form onSubmit={handleBuscarEstudiante} className="flex gap-2 mb-6 max-w-md">
            <input
              type="text"
              value={busquedaEstudiante}
              onChange={function (e) { setBusquedaEstudiante(e.target.value) }}
              placeholder="Nombre del estudiante"
              className="flex-1 rounded-lg px-3 py-2 text-sm outline-none"
              style={inputStyle}
            />
            <button type="submit" disabled={buscando} className="text-sm font-semibold px-4 py-2 rounded-lg text-white transition hover:opacity-90 disabled:opacity-50" style={{ background: `linear-gradient(90deg, ${NAVY}, ${GREEN})` }}>
              {buscando ? 'Buscando...' : 'Buscar'}
            </button>
          </form>

          {resultadoBoletin && (
            <div className="bg-white rounded-2xl p-5" style={{ border: '1px solid #E5E9F0' }}>
              <div className="flex justify-between items-start mb-4 flex-wrap gap-2">
                <div>
                  <p className="text-sm font-bold" style={{ color: NAVY_DARK }}>{resultadoBoletin.nombreEstudiante}</p>
                  {resultadoBoletin.edadGrado && <p className="text-xs text-slate-400">{resultadoBoletin.edadGrado}</p>}
                </div>
                <button onClick={exportarBoletinPDF} className="text-xs font-semibold px-4 py-2 rounded-lg text-white transition hover:opacity-90" style={{ background: `linear-gradient(90deg, ${NAVY}, ${GREEN})`, boxShadow: '0 8px 20px rgba(37,99,235,0.3)' }}>
                  📄 Descargar Boletín PDF
                </button>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: '1px solid #E5E9F0' }}>
                    <th className="text-left py-2 font-semibold" style={{ color: NAVY_DARK }}>Taller</th>
                    <th className="text-center py-2 font-semibold" style={{ color: NAVY_DARK }}>Nota</th>
                    <th className="text-center py-2 font-semibold" style={{ color: NAVY_DARK }}>Logro</th>
                  </tr>
                </thead>
                <tbody>
                  {resultadoBoletin.filas.map(function (f, i) {
                    const nivel = nivelCNEB(f.nota)
                    return (
                      <tr key={i} style={{ borderBottom: '1px solid #F4F6F9' }}>
                        <td className="py-2" style={{ color: NAVY_DARK }}>{f.taller}</td>
                        <td className="py-2 text-center font-semibold">{f.nota != null ? f.nota : '—'}</td>
                        <td className="py-2 text-center">{nivel ? `${nivel} (${significadoNivel(nivel)})` : '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
