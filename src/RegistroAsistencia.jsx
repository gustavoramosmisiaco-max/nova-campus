import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import { useAuth } from './AuthContext'
import { useDocenteContextoActivo } from './DocenteContextoActivo'
import { compararPorApellido } from './gradeUtils'
import jsPDF from 'jspdf'

const NAVY_DARK = '#0F172A'
const NAVY = '#2563EB'
const GREEN = '#22C55E'

const inputStyle = { backgroundColor: 'white', border: '1px solid #D6DCE5', color: NAVY_DARK }

function gradoLabel(g) {
  return g ? `${g}° Secundaria` : 'Sin grado'
}

function esFinDeSemana(fechaStr) {
  const dia = new Date(fechaStr + 'T00:00:00').getDay()
  return dia === 0 || dia === 6
}

export default function RegistroAsistencia() {
  const { session } = useAuth()
  const { institucionSel, aulaSel, areaId, areaNombre, elegirInstitucion, elegirAula, elegirArea } = useDocenteContextoActivo()

  const [loading, setLoading] = useState(true)
  const [misCursos, setMisCursos] = useState([])
  const [tab, setTab] = useState('registrar') // 'registrar' | 'justificaciones' | 'reporte'

  const [unidades, setUnidades] = useState([])
  const [feriados, setFeriados] = useState([])
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10))
  const [estudiantes, setEstudiantes] = useState([])
  const [ausentesHoy, setAusentesHoy] = useState(new Set())
  const [yaRegistrado, setYaRegistrado] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [mensajeExito, setMensajeExito] = useState('')

  const [pendientes, setPendientes] = useState([])
  const [loadingPendientes, setLoadingPendientes] = useState(false)

  const [reporteData, setReporteData] = useState([])
  const [loadingReporte, setLoadingReporte] = useState(false)
  const [busquedaEstudiante, setBusquedaEstudiante] = useState('')

  useEffect(function () {
    cargarMisCursos()
  }, [])

  useEffect(function () {
    if (aulaSel && areaId) {
      cargarUnidadesYFeriados()
    }
  }, [aulaSel, areaId])

  useEffect(function () {
    if (aulaSel && areaId && fecha) {
      cargarEstudiantesYAsistencia()
    }
  }, [aulaSel, areaId, fecha])

  useEffect(function () {
    if (tab === 'justificaciones' && aulaSel && areaId) {
      cargarPendientes()
    }
  }, [tab, aulaSel, areaId])

  useEffect(function () {
    if (tab === 'reporte' && aulaSel && areaId) {
      cargarReporte()
    }
  }, [tab, aulaSel, areaId])

  async function cargarMisCursos() {
    setLoading(true)
    const result = await supabase
      .from('courses')
      .select('id, grado, grupo, institucion_id, instituciones_educativas(nombre), asignaturas(area_id, areas_curriculares(nombre))')
      .eq('docente_id', session.user.id)
    if (!result.error) {
      setMisCursos(result.data)
      const institucionesIds = [...new Set(result.data.map(function (c) { return c.institucion_id || 'sin-institucion' }))]
      if (institucionesIds.length === 1 && !institucionSel) {
        elegirInstitucion(institucionesIds[0])
      }
    }
    setLoading(false)
  }

  async function cargarUnidadesYFeriados() {
    const [grado, grupo] = aulaSel.split('__')
    const unidResult = await supabase
      .from('unidades')
      .select('id, tipo, numero, nombre, fecha_inicio, fecha_fin')
      .eq('area_id', areaId)
      .eq('grado', grado)
      .eq('grupo', grupo)
      .not('fecha_inicio', 'is', null)
      .not('fecha_fin', 'is', null)
      .order('fecha_inicio')
    if (!unidResult.error) setUnidades(unidResult.data)

    if (institucionSel) {
      const ferResult = await supabase.from('feriados').select('fecha, nombre').eq('institucion_id', institucionSel)
      if (!ferResult.error) setFeriados(ferResult.data)
    }
  }

  async function cargarEstudiantesYAsistencia() {
    setError('')
    setMensajeExito('')
    const [grado, grupo] = aulaSel.split('__')
    const cursosDeAula = misCursos.filter(function (c) { return String(c.grado) === grado && c.grupo === grupo && c.asignaturas?.area_id === areaId })
    const courseIds = cursosDeAula.map(function (c) { return c.id })
    if (courseIds.length === 0) { setEstudiantes([]); return }

    const enrollResult = await supabase
      .from('enrollments')
      .select('student:profiles(id, full_name)')
      .in('course_id', courseIds)
      .eq('status', 'activo')
    const lista = enrollResult.error ? [] : enrollResult.data.map(function (e) { return e.student }).filter(Boolean)
    const unicos = [...new Map(lista.map(function (s) { return [s.id, s] })).values()]
    unicos.sort(function (a, b) { return compararPorApellido(a.full_name, b.full_name) })
    setEstudiantes(unicos)

    const asisResult = await supabase
      .from('asistencias')
      .select('student_id')
      .eq('area_id', areaId)
      .eq('grado', grado)
      .eq('grupo', grupo)
      .eq('fecha', fecha)
    if (!asisResult.error) {
      setAusentesHoy(new Set(asisResult.data.map(function (a) { return a.student_id })))
      setYaRegistrado(asisResult.data.length >= 0)
    }
  }

  async function cargarPendientes() {
    setLoadingPendientes(true)
    const [grado, grupo] = aulaSel.split('__')
    const result = await supabase
      .from('asistencias')
      .select('*, student:profiles!asistencias_student_id_fkey(full_name)')
      .eq('area_id', areaId)
      .eq('grado', grado)
      .eq('grupo', grupo)
      .eq('justificacion_estado', 'pendiente')
      .order('fecha', { ascending: false })
    if (!result.error) setPendientes(result.data)
    setLoadingPendientes(false)
  }

  async function cargarReporte() {
    setLoadingReporte(true)
    const [grado, grupo] = aulaSel.split('__')

    const enrollResult = await supabase
      .from('enrollments')
      .select('student:profiles(id, full_name), course:courses!inner(grado, grupo, asignaturas!inner(area_id))')
      .eq('status', 'activo')
      .eq('course.grado', grado)
      .eq('course.grupo', grupo)
      .eq('course.asignaturas.area_id', areaId)
    const listaEstudiantes = enrollResult.error ? [] : [...new Map(
      enrollResult.data.map(function (e) { return [e.student.id, e.student] })
    ).values()]
    listaEstudiantes.sort(function (a, b) { return compararPorApellido(a.full_name, b.full_name) })

    const asisResult = await supabase
      .from('asistencias')
      .select('student_id, fecha, estado')
      .eq('area_id', areaId)
      .eq('grado', grado)
      .eq('grupo', grupo)

    const porEstudiante = {}
    listaEstudiantes.forEach(function (s) {
      porEstudiante[s.id] = { nombre: s.full_name, ausentes: 0, justificadas: 0, fechasAusente: [], fechasJustificadas: [] }
    })
    ;(asisResult.data || []).forEach(function (a) {
      if (!porEstudiante[a.student_id]) return
      if (a.estado === 'justificado') {
        porEstudiante[a.student_id].justificadas++
        porEstudiante[a.student_id].fechasJustificadas.push(a.fecha)
      } else {
        porEstudiante[a.student_id].ausentes++
        porEstudiante[a.student_id].fechasAusente.push(a.fecha)
      }
    })

    const data = Object.values(porEstudiante).map(function (e) {
      const totalFaltas = e.ausentes + e.justificadas
      return { ...e, totalFaltas: totalFaltas }
    })
    data.sort(function (a, b) { return b.totalFaltas - a.totalFaltas })
    setReporteData(data)
    setLoadingReporte(false)
  }

  function handleExportarPDF() {
    const doc = new jsPDF({ format: 'a4', unit: 'mm', orientation: 'landscape' })
    const pageWidth = doc.internal.pageSize.getWidth()
    let y = 15

    doc.setFontSize(14)
    doc.setFont(undefined, 'bold')
    doc.text('Reporte de Asistencia', pageWidth / 2, y, { align: 'center' })
    y += 6
    doc.setFontSize(10)
    doc.setFont(undefined, 'normal')
    doc.text(`${areaNombre} — ${gradoLabel(aulaSel.split('__')[0])}, Sección ${aulaSel.split('__')[1]}`, pageWidth / 2, y, { align: 'center' })
    y += 5
    doc.text(`Generado el ${new Date().toLocaleDateString('es-PE', { day: 'numeric', month: 'long', year: 'numeric' })}`, pageWidth / 2, y, { align: 'center' })
    y += 10

    // Encabezados de la tabla
    const colNombre = 14, colTotal = 90, colSinJustificar = 115, colJustificadas = 205
    doc.setFillColor(15, 23, 42)
    doc.rect(14, y, pageWidth - 28, 7, 'F')
    doc.setFontSize(9)
    doc.setFont(undefined, 'bold')
    doc.setTextColor(255, 255, 255)
    doc.text('Estudiante', colNombre + 2, y + 5)
    doc.text('Total', colTotal, y + 5)
    doc.text('Fechas sin justificar', colSinJustificar, y + 5)
    doc.text('Fechas justificadas', colJustificadas, y + 5)
    doc.setTextColor(0, 0, 0)
    y += 9

    function formatFechas(fechas) {
      if (fechas.length === 0) return '—'
      return fechas
        .slice()
        .sort()
        .map(function (f) { return new Date(f + 'T00:00:00').toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit' }) })
        .join('  ·  ')
    }

    reporteData.forEach(function (e, idx) {
      const textoSinJustificar = doc.splitTextToSize(formatFechas(e.fechasAusente), 88)
      const textoJustificadas = doc.splitTextToSize(formatFechas(e.fechasJustificadas), 85)
      const lineas = Math.max(textoSinJustificar.length, textoJustificadas.length, 1)
      const alturaFila = lineas * 4.2 + 2

      if (y + alturaFila > 200) { doc.addPage('a4', 'landscape'); y = 15 }

      if (idx % 2 === 0) {
        doc.setFillColor(248, 250, 252)
        doc.rect(14, y - 1, pageWidth - 28, alturaFila, 'F')
      }

      doc.setFontSize(9)
      doc.setFont(undefined, 'normal')
      doc.text(e.nombre, colNombre + 2, y + 3)
      doc.setFont(undefined, 'bold')
      doc.setTextColor(e.totalFaltas > 0 ? 185 : 22, e.totalFaltas > 0 ? 28 : 163, e.totalFaltas > 0 ? 28 : 74)
      doc.text(String(e.totalFaltas), colTotal, y + 3)
      doc.setTextColor(185, 28, 28)
      doc.setFont(undefined, 'normal')
      doc.text(textoSinJustificar, colSinJustificar, y + 3)
      doc.setTextColor(180, 83, 9)
      doc.text(textoJustificadas, colJustificadas, y + 3)
      doc.setTextColor(0, 0, 0)

      y += alturaFila
    })

    doc.save(`Asistencia_${areaNombre.replace(/[^a-zA-Z0-9]+/g, '_')}.pdf`)
  }

  function toggleAusente(studentId) {
    setAusentesHoy(function (prev) {
      const next = new Set(prev)
      if (next.has(studentId)) next.delete(studentId); else next.add(studentId)
      return next
    })
  }

  async function handleGuardar() {
    setGuardando(true)
    setError('')
    const [grado, grupo] = aulaSel.split('__')

    // Borra los registros previos de esta fecha y área, y vuelve a insertar según lo marcado ahora
    await supabase.from('asistencias').delete().eq('area_id', areaId).eq('grado', grado).eq('grupo', grupo).eq('fecha', fecha)

    if (ausentesHoy.size > 0) {
      const unidadDelDia = unidades.find(function (u) { return fecha >= u.fecha_inicio && fecha <= u.fecha_fin })
      const payload = [...ausentesHoy].map(function (studentId) {
        return {
          student_id: studentId,
          area_id: areaId,
          grado: grado,
          grupo: grupo,
          unidad_id: unidadDelDia ? unidadDelDia.id : null,
          fecha: fecha,
          estado: 'ausente',
          registrado_por: session.user.id,
        }
      })
      const insertResult = await supabase.from('asistencias').insert(payload)
      if (insertResult.error) { setError(insertResult.error.message); setGuardando(false); return }
    }

    setMensajeExito('Asistencia guardada correctamente.')
    setGuardando(false)
  }

  async function handleAprobar(id, aprobar) {
    await supabase.from('asistencias').update({
      justificacion_estado: aprobar ? 'aprobada' : 'rechazada',
      estado: aprobar ? 'justificado' : 'ausente',
    }).eq('id', id)
    cargarPendientes()
  }

  if (loading) return <p className="text-slate-400 text-sm">Cargando...</p>

  const esFeriado = feriados.find(function (f) { return f.fecha === fecha })
  const fueraDeUnidad = unidades.length > 0 && !unidades.some(function (u) { return fecha >= u.fecha_inicio && fecha <= u.fecha_fin })

  const institucionesUnicas = [...new Map(
    misCursos.map(function (c) { return [c.institucion_id || 'sin-institucion', c.instituciones_educativas?.nombre || 'Sin institución asignada'] })
  ).entries()]

  return (
    <div>
      <h2 className="text-2xl font-bold mb-2" style={{ color: NAVY_DARK }}>Asistencia</h2>
      <p className="text-sm text-slate-400 mb-6">Marca solo a quienes faltaron — el resto queda como presente automáticamente.</p>

      <div className="grid sm:grid-cols-3 gap-3 mb-6">
        <div>
          <label className="block text-xs font-medium mb-1" style={{ color: NAVY_DARK }}>Institución</label>
          <select value={institucionSel} onChange={function (e) { elegirInstitucion(e.target.value) }} className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={inputStyle}>
            <option value="">-- Elige --</option>
            {institucionesUnicas.map(function ([id, nombre]) { return <option key={id} value={id}>{nombre}</option> })}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium mb-1" style={{ color: NAVY_DARK }}>Grado y Sección</label>
          <select value={aulaSel} onChange={function (e) { elegirAula(e.target.value) }} disabled={!institucionSel} className="w-full rounded-lg px-3 py-2 text-sm outline-none disabled:opacity-50" style={inputStyle}>
            <option value="">-- Elige --</option>
            {(function () {
              const cursosInst = misCursos.filter(function (c) { return (c.institucion_id || 'sin-institucion') === institucionSel })
              const aulasUnicas = [...new Map(cursosInst.map(function (c) { return [`${c.grado}__${c.grupo}`, { grado: c.grado, grupo: c.grupo }] })).values()]
              return aulasUnicas.map(function (a) { return <option key={`${a.grado}-${a.grupo}`} value={`${a.grado}__${a.grupo}`}>{gradoLabel(a.grado)} — Sección {a.grupo}</option> })
            })()}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium mb-1" style={{ color: NAVY_DARK }}>Área</label>
          <select value={areaId} onChange={function (e) {
            const [grado, grupo] = aulaSel.split('__')
            const cursosAula = misCursos.filter(function (c) { return String(c.grado) === grado && c.grupo === grupo && (c.institucion_id || 'sin-institucion') === institucionSel })
            const nombreSel = cursosAula.find(function (c) { return c.asignaturas?.area_id === e.target.value })?.asignaturas?.areas_curriculares?.nombre || ''
            elegirArea(e.target.value, nombreSel)
          }} disabled={!aulaSel} className="w-full rounded-lg px-3 py-2 text-sm outline-none disabled:opacity-50" style={inputStyle}>
            <option value="">-- Elige --</option>
            {(function () {
              const [grado, grupo] = (aulaSel || '__').split('__')
              const cursosAula = misCursos.filter(function (c) { return String(c.grado) === grado && c.grupo === grupo && (c.institucion_id || 'sin-institucion') === institucionSel })
              const areasUnicas = [...new Map(cursosAula.map(function (c) { return [c.asignaturas?.area_id, c.asignaturas?.areas_curriculares?.nombre || 'Otras'] })).entries()]
              return areasUnicas.map(function ([id, nombre]) { return <option key={id} value={id}>{nombre}</option> })
            })()}
          </select>
        </div>
      </div>

      {areaId && (
        <>
          <div className="flex gap-2 mb-5 border-b" style={{ borderColor: '#E5E9F0' }}>
            <button onClick={function () { setTab('registrar') }} className="px-4 py-2.5 text-sm font-semibold border-b-2 transition" style={tab === 'registrar' ? { borderColor: GREEN, color: NAVY_DARK } : { borderColor: 'transparent', color: '#94A3B8' }}>
              Registrar
            </button>
            <button onClick={function () { setTab('justificaciones') }} className="px-4 py-2.5 text-sm font-semibold border-b-2 transition" style={tab === 'justificaciones' ? { borderColor: GREEN, color: NAVY_DARK } : { borderColor: 'transparent', color: '#94A3B8' }}>
              Justificaciones {pendientes.length > 0 ? `(${pendientes.length})` : ''}
            </button>
            <button onClick={function () { setTab('reporte') }} className="px-4 py-2.5 text-sm font-semibold border-b-2 transition" style={tab === 'reporte' ? { borderColor: GREEN, color: NAVY_DARK } : { borderColor: 'transparent', color: '#94A3B8' }}>
              Reporte de Asistencia
            </button>
          </div>

          {tab === 'registrar' && (
            <>
              <div className="mb-4 max-w-xs">
                <label className="block text-xs font-medium mb-1" style={{ color: NAVY_DARK }}>Fecha</label>
                <input type="date" value={fecha} onChange={function (e) { setFecha(e.target.value) }} className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={inputStyle} />
              </div>

              {unidades.length === 0 ? (
                <p className="text-xs text-amber-600 mb-4">No hay Unidades con fechas de inicio/fin configuradas para esta Área todavía — pídele al docente que gestiona las carpetas que las agregue en "Actividades".</p>
              ) : esFeriado ? (
                <p className="text-sm rounded-lg p-3 mb-4" style={{ backgroundColor: '#FFF7E6', color: '#B45309' }}>📅 {fecha} es feriado ({esFeriado.nombre}) — no se registra asistencia.</p>
              ) : esFinDeSemana(fecha) ? (
                <p className="text-sm rounded-lg p-3 mb-4" style={{ backgroundColor: '#FFF7E6', color: '#B45309' }}>Esa fecha es fin de semana.</p>
              ) : fueraDeUnidad ? (
                <p className="text-sm rounded-lg p-3 mb-4" style={{ backgroundColor: '#FFF7E6', color: '#B45309' }}>Esa fecha está fuera del rango de cualquier Unidad configurada.</p>
              ) : (
                <>
                  {estudiantes.length === 0 ? (
                    <p className="text-slate-400 text-sm">No hay estudiantes matriculados en esta aula.</p>
                  ) : (
                    <div className="bg-white rounded-2xl p-4" style={{ border: '1px solid #E5E9F0' }}>
                      <p className="text-xs text-slate-400 mb-3">Toca al estudiante que faltó — el resto queda presente.</p>
                      <ul className="space-y-1.5">
                        {estudiantes.map(function (s) {
                          const ausente = ausentesHoy.has(s.id)
                          return (
                            <li key={s.id}>
                              <button
                                onClick={function () { toggleAusente(s.id) }}
                                className="w-full text-left flex items-center justify-between px-3 py-2.5 rounded-xl transition"
                                style={ausente ? { backgroundColor: '#FDECEC' } : { backgroundColor: '#F4F6F9' }}
                              >
                                <span className="text-sm font-medium" style={{ color: ausente ? '#B91C1C' : NAVY_DARK }}>{s.full_name}</span>
                                <span className="text-xs font-semibold px-2.5 py-1 rounded-full" style={ausente ? { backgroundColor: '#B91C1C', color: 'white' } : { backgroundColor: '#E7F3E4', color: '#16A34A' }}>
                                  {ausente ? 'Ausente' : 'Presente'}
                                </span>
                              </button>
                            </li>
                          )
                        })}
                      </ul>
                      {error && <p className="text-red-500 text-sm mt-3">{error}</p>}
                      {mensajeExito && <p className="text-sm mt-3" style={{ color: '#16A34A' }}>✓ {mensajeExito}</p>}
                      <button
                        onClick={handleGuardar}
                        disabled={guardando}
                        className="mt-4 text-sm font-semibold px-5 py-2.5 rounded-xl text-white transition hover:opacity-90 disabled:opacity-50"
                        style={{ background: `linear-gradient(90deg, ${NAVY}, ${GREEN})`, boxShadow: '0 8px 20px rgba(37,99,235,0.3)' }}
                      >
                        {guardando ? 'Guardando...' : `Guardar asistencia (${ausentesHoy.size} ausente${ausentesHoy.size === 1 ? '' : 's'})`}
                      </button>
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {tab === 'justificaciones' && (
            loadingPendientes ? (
              <p className="text-slate-400 text-sm">Cargando...</p>
            ) : pendientes.length === 0 ? (
              <p className="text-slate-400 text-sm">No hay justificaciones pendientes de revisar.</p>
            ) : (
              <ul className="space-y-3">
                {pendientes.map(function (p) {
                  return (
                    <li key={p.id} className="bg-white rounded-2xl p-4" style={{ border: '1px solid #E5E9F0' }}>
                      <p className="text-sm font-semibold" style={{ color: NAVY_DARK }}>{p.student?.full_name}</p>
                      <p className="text-xs text-slate-400 mb-2">Faltó el {new Date(p.fecha + 'T00:00:00').toLocaleDateString('es-PE')}</p>
                      <p className="text-sm mb-3" style={{ color: NAVY_DARK }}>{p.justificacion_texto}</p>
                      {p.justificacion_archivo_url && (
                        <p className="text-xs mb-3" style={{ color: NAVY }}>📎 Adjuntó un archivo</p>
                      )}
                      <div className="flex gap-2">
                        <button onClick={function () { handleAprobar(p.id, true) }} className="text-xs font-semibold px-4 py-2 rounded-lg text-white transition hover:opacity-90" style={{ background: `linear-gradient(90deg, ${NAVY}, ${GREEN})` }}>
                          Aprobar justificación
                        </button>
                        <button onClick={function () { handleAprobar(p.id, false) }} className="text-xs font-semibold px-4 py-2 rounded-lg text-white transition hover:opacity-90" style={{ backgroundColor: '#B91C1C' }}>
                          Rechazar
                        </button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )
          )}

          {tab === 'reporte' && (
            loadingReporte ? (
              <p className="text-slate-400 text-sm">Cargando reporte...</p>
            ) : reporteData.length === 0 ? (
              <p className="text-slate-400 text-sm">No hay estudiantes matriculados en esta aula.</p>
            ) : (function () {
              const totalEstudiantes = reporteData.length
              const totalAusentes = reporteData.reduce(function (a, e) { return a + e.ausentes }, 0)
              const totalJustificadas = reporteData.reduce(function (a, e) { return a + e.justificadas }, 0)
              const sinFaltas = reporteData.filter(function (e) { return e.totalFaltas === 0 }).length
              const maxFaltas = Math.max(1, ...reporteData.map(function (e) { return e.totalFaltas }))
              const totalFaltasGeneral = totalAusentes + totalJustificadas

              return (
                <div>
                  <div className="flex justify-between items-center flex-wrap gap-3 mb-5">
                    <p className="text-sm text-slate-400">{areaNombre} — {gradoLabel(aulaSel.split('__')[0])}, Sección {aulaSel.split('__')[1]}</p>
                    <button
                      onClick={handleExportarPDF}
                      className="text-xs font-semibold px-4 py-2 rounded-lg text-white transition hover:opacity-90"
                      style={{ background: `linear-gradient(90deg, ${NAVY}, ${GREEN})`, boxShadow: '0 8px 20px rgba(37,99,235,0.3)' }}
                    >
                      📄 Exportar PDF (A4)
                    </button>
                  </div>

                  {/* Tarjetas de resumen */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                    <div className="bg-white rounded-2xl p-4" style={{ border: '1px solid #E5E9F0' }}>
                      <p className="text-2xl font-semibold" style={{ color: NAVY_DARK }}>{totalEstudiantes}</p>
                      <p className="text-xs text-slate-400">Estudiantes</p>
                    </div>
                    <div className="bg-white rounded-2xl p-4" style={{ border: '1px solid #E5E9F0' }}>
                      <p className="text-2xl font-semibold" style={{ color: '#16A34A' }}>{sinFaltas}</p>
                      <p className="text-xs text-slate-400">Sin faltas</p>
                    </div>
                    <div className="bg-white rounded-2xl p-4" style={{ border: '1px solid #E5E9F0' }}>
                      <p className="text-2xl font-semibold" style={{ color: '#B91C1C' }}>{totalAusentes}</p>
                      <p className="text-xs text-slate-400">Sin justificar</p>
                    </div>
                    <div className="bg-white rounded-2xl p-4" style={{ border: '1px solid #E5E9F0' }}>
                      <p className="text-2xl font-semibold" style={{ color: '#B45309' }}>{totalJustificadas}</p>
                      <p className="text-xs text-slate-400">Justificadas</p>
                    </div>
                  </div>

                  <div className="grid lg:grid-cols-3 gap-5">
                    {/* Gráfico de barras por estudiante */}
                    <div className="lg:col-span-2 bg-white rounded-2xl p-5" style={{ border: '1px solid #E5E9F0' }}>
                      <p className="text-sm font-bold mb-4" style={{ color: NAVY_DARK }}>Faltas por estudiante</p>
                      <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
                        {reporteData.map(function (e) {
                          const pctAusentes = (e.ausentes / maxFaltas) * 100
                          const pctJustif = (e.justificadas / maxFaltas) * 100
                          return (
                            <div key={e.nombre}>
                              <div className="flex justify-between items-center mb-1">
                                <span className="text-xs font-medium truncate" style={{ color: NAVY_DARK, maxWidth: '65%' }}>{e.nombre}</span>
                                <span className="text-xs font-semibold" style={{ color: e.totalFaltas > 0 ? '#B91C1C' : '#16A34A' }}>{e.totalFaltas}</span>
                              </div>
                              <div className="h-3 rounded-full overflow-hidden flex" style={{ backgroundColor: '#F4F6F9' }}>
                                {e.ausentes > 0 && <div style={{ width: `${pctAusentes}%`, backgroundColor: '#B91C1C' }} />}
                                {e.justificadas > 0 && <div style={{ width: `${pctJustif}%`, backgroundColor: '#EF9F27' }} />}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                      <div className="flex gap-4 mt-4 pt-3 border-t" style={{ borderColor: '#E5E9F0' }}>
                        <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded" style={{ backgroundColor: '#B91C1C' }} /><span className="text-xs text-slate-500">Sin justificar</span></div>
                        <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded" style={{ backgroundColor: '#EF9F27' }} /><span className="text-xs text-slate-500">Justificada</span></div>
                      </div>
                    </div>

                    {/* Dona de proporción general */}
                    <div className="bg-white rounded-2xl p-5 flex flex-col items-center justify-center" style={{ border: '1px solid #E5E9F0' }}>
                      <p className="text-sm font-bold mb-4 self-start" style={{ color: NAVY_DARK }}>Proporción general</p>
                      {totalFaltasGeneral === 0 ? (
                        <p className="text-xs text-slate-400 text-center py-8">Sin inasistencias registradas todavía.</p>
                      ) : (function () {
                        const pctJustif = (totalJustificadas / totalFaltasGeneral) * 100
                        const circunferencia = 2 * Math.PI * 45
                        const largoJustif = (pctJustif / 100) * circunferencia
                        return (
                          <>
                            <svg width="160" height="160" viewBox="0 0 120 120">
                              <circle cx="60" cy="60" r="45" fill="none" stroke="#B91C1C" strokeWidth="16" />
                              <circle
                                cx="60" cy="60" r="45" fill="none" stroke="#EF9F27" strokeWidth="16"
                                strokeDasharray={`${largoJustif} ${circunferencia}`}
                                strokeDashoffset="0"
                                transform="rotate(-90 60 60)"
                              />
                              <text x="60" y="55" textAnchor="middle" fontSize="20" fontWeight="600" fill={NAVY_DARK}>{totalFaltasGeneral}</text>
                              <text x="60" y="72" textAnchor="middle" fontSize="9" fill="#94A3B8">faltas totales</text>
                            </svg>
                            <p className="text-xs text-slate-400 mt-3 text-center">{Math.round(pctJustif)}% de las faltas ya están justificadas</p>
                          </>
                        )
                      })()}
                    </div>
                  </div>
                </div>
              )
            })()
          )}
        </>
      )}
    </div>
  )
}
