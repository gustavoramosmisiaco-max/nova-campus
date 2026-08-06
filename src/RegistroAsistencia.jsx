import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import { useAuth } from './AuthContext'
import { useDocenteContextoActivo } from './DocenteContextoActivo'
import { compararPorApellido } from './gradeUtils'

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
  const [tab, setTab] = useState('registrar') // 'registrar' | 'justificaciones'

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
        </>
      )}
    </div>
  )
}
