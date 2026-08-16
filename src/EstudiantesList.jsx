import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import { compararPorApellido } from './gradeUtils'
import { estaEnLinea } from './PresenceHeartbeat'
import { usePresence } from './PresenceContext'
import { llamarIA } from './aiClient'

const NAVY_DARK = '#0F172A'
const NAVY = '#2563EB'
const GREEN = '#22C55E'
const GREEN_DARK = '#16A34A'

const GRADOS = [1, 2, 3, 4, 5]
const SECCIONES = ['A', 'B', 'C', 'D', 'E']

async function extraerMensajeError(fnError) {
  if (!fnError) return 'Error desconocido'
  try {
    if (fnError.context && typeof fnError.context.json === 'function') {
      const body = await fnError.context.json()
      if (body?.error) return body.error
    }
  } catch (_e) { /* si no se puede leer el detalle, usamos el mensaje genérico */ }
  return fnError.message || 'Error desconocido'
}

function FolderIcon({ color, big }) {
  const size = big ? 26 : 18
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color || GREEN} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  )
}

export default function EstudiantesList({ institucionFija, institucionFijaNombre } = {}) {
  const { isOnline } = usePresence()
  const [students, setStudents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [deletingId, setDeletingId] = useState(null)
  const [selectedInst, setSelectedInst] = useState(institucionFijaNombre || null)
  const [selectedAula, setSelectedAula] = useState(null)
  const [selectedGrado, setSelectedGrado] = useState(null)
  const [eliminandoAula, setEliminandoAula] = useState(false)

  useEffect(function () {
    loadStudents()
  }, [])

  async function loadStudents() {
    setLoading(true)
    setError('')

    const profilesResult = await supabase
      .from('profiles')
      .select('id, full_name, email, codigo_padre, last_active_at, grado, grupo, institucion_id, institucion:instituciones_educativas!profiles_institucion_id_fkey(nombre)')
      .eq('role', 'estudiante')
      .order('full_name', { ascending: true })

    if (profilesResult.error) {
      setError(profilesResult.error.message)
      setLoading(false)
      return
    }

    // Solo se usa como respaldo para estudiantes viejos que aún no tengan institucion_id guardada en su perfil
    const enrollResult = await supabase
      .from('enrollments')
      .select('student_id, course:courses(grado, grupo, institucion:instituciones_educativas(nombre))')
      .eq('status', 'activo')

    const aulaMapRespaldo = {}
    if (!enrollResult.error) {
      enrollResult.data.forEach(function (e) {
        if (!aulaMapRespaldo[e.student_id] && e.course) {
          aulaMapRespaldo[e.student_id] = {
            grado: e.course.grado,
            grupo: e.course.grupo,
            institucion: e.course.institucion?.nombre || null,
          }
        }
      })
    }

    const enriched = profilesResult.data.map(function (s) {
      // Prioridad: lo que está guardado directo en el perfil del estudiante
      if (s.institucion_id && s.grado && s.grupo) {
        return { ...s, aula: { grado: s.grado, grupo: s.grupo, institucion: s.institucion?.nombre || 'Sin institución asignada' } }
      }
      // Respaldo: inferido de sus cursos (para estudiantes creados antes de este cambio)
      const respaldo = aulaMapRespaldo[s.id]
      return { ...s, aula: respaldo && respaldo.institucion ? respaldo : { grado: s.grado || null, grupo: s.grupo || null, institucion: 'Sin institución asignada' } }
    })
    enriched.sort(function (a, b) { return compararPorApellido(a.full_name, b.full_name) })

    setStudents(enriched)
    setLoading(false)
  }

  async function handleGenerarCodigo(studentId) {
    const codigo = crypto.randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase()
    const result = await supabase.from('profiles').update({ codigo_padre: codigo }).eq('id', studentId)
    if (result.error) {
      alert('Error al generar el código: ' + result.error.message)
    } else {
      loadStudents()
    }
  }

  async function handleGenerarTodosLosCodigos(items) {
    const sinCodigo = items.filter(function (s) { return !s.codigo_padre })
    if (sinCodigo.length === 0) return
    if (!confirm(`¿Generar código para los ${sinCodigo.length} estudiante(s) que aún no tienen?`)) return

    await Promise.all(sinCodigo.map(function (s) {
      const codigo = crypto.randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase()
      return supabase.from('profiles').update({ codigo_padre: codigo }).eq('id', s.id)
    }))
    loadStudents()
  }

  async function handleDelete(id, nombre) {
    if (!confirm(`¿Eliminar la cuenta de "${nombre}"? Esta acción no se puede deshacer.`)) return
    setDeletingId(id)
    const { data, error: fnError } = await supabase.functions.invoke('delete-user', {
      body: { userId: id },
    })

    if (fnError) {
      const mensaje = await extraerMensajeError(fnError)
      alert('Error al eliminar: ' + mensaje)
    } else if (data.error) {
      alert('Error al eliminar: ' + data.error)
    } else {
      setStudents(function (prev) { return prev.filter(function (s) { return s.id !== id }) })
    }
    setDeletingId(null)
  }

  const [reseteandoId, setReseteandoId] = useState(null)

  async function handleResetPassword(id, nombre) {
    if (!confirm(`¿Resetear la contraseña de "${nombre}"? Se va a generar una contraseña nueva.`)) return
    setReseteandoId(id)
    const { data, error: fnError } = await supabase.functions.invoke('reset-password', {
      body: { userId: id },
    })

    if (fnError) {
      const mensaje = await extraerMensajeError(fnError)
      alert('Error al resetear: ' + mensaje)
    } else if (data.error) {
      alert('Error al resetear: ' + data.error)
    } else {
      alert(`Nueva contraseña de ${nombre}:\n\n${data.password}\n\nCópiala ahora — no se va a volver a mostrar.`)
    }
    setReseteandoId(null)
  }

  async function handleEliminarAulaCompleta(items) {
    const confirmText = prompt(`Vas a eliminar las cuentas de los ${items.length} estudiante(s) de esta aula. Esta acción NO se puede deshacer.\n\nEscribe ELIMINAR (en mayúsculas) para confirmar:`)
    if (confirmText !== 'ELIMINAR') return

    setEliminandoAula(true)

    const resultados = await Promise.all(items.map(async function (s) {
      try {
        const { data, error: fnError } = await supabase.functions.invoke('delete-user', { body: { userId: s.id } })
        return !fnError && !data?.error
      } catch (_e) {
        return false
      }
    }))

    const exitosos = resultados.filter(Boolean).length
    const fallidos = resultados.length - exitosos

    setEliminandoAula(false)
    alert(`Listo: ${exitosos} eliminado(s) correctamente${fallidos > 0 ? `, ${fallidos} con error` : ''}.`)
    setSelectedAula(null)
    loadStudents()
  }

  // ============================================================
  // Generar reporte para padres con IA — Función 3 del plan de IA.
  // Junta asistencia, conducta y tareas del estudiante, se lo manda a la IA,
  // y guarda el texto en reportes_padres para que el Portal de Padres lo muestre.
  // ============================================================
  const [generandoReporteId, setGenerandoReporteId] = useState(null)
  const [reporteAbierto, setReporteAbierto] = useState(null) // { studentId, nombre, texto }
  const [guardandoReporte, setGuardandoReporte] = useState(false)

  async function handleGenerarReporte(studentId, nombre) {
    setGenerandoReporteId(studentId)
    try {
      const asisResult = await supabase
        .from('asistencias')
        .select('estado, fecha')
        .eq('student_id', studentId)
        .order('fecha', { ascending: false })
        .limit(30)

      const conductaResult = await supabase
        .from('conductas_registro')
        .select('descripcion, created_at')
        .eq('student_id', studentId)
        .order('created_at', { ascending: false })
        .limit(10)

      const enrollResult = await supabase.from('enrollments').select('course_id').eq('student_id', studentId).eq('status', 'activo')
      const courseIds = (enrollResult.data || []).map(function (e) { return e.course_id })

      let tareas = []
      if (courseIds.length > 0) {
        const assignResult = await supabase.from('assignments').select('id, titulo').in('course_id', courseIds)
        const assignmentIds = (assignResult.data || []).map(function (a) { return a.id })
        const submissionsResult = assignmentIds.length > 0
          ? await supabase.from('submissions').select('assignment_id, file_url, link_url').eq('student_id', studentId).in('assignment_id', assignmentIds)
          : { data: [] }
        const entregadosSet = new Set((submissionsResult.data || []).filter(function (s) { return s.file_url != null || s.link_url != null }).map(function (s) { return s.assignment_id }))
        tareas = (assignResult.data || []).map(function (a) { return { titulo: a.titulo, entregado: entregadosSet.has(a.id) } })
      }

      const resultado = await llamarIA('reporte_padres', {
        estudianteNombre: nombre,
        asistencias: asisResult.data || [],
        conductas: conductaResult.data || [],
        tareas: tareas,
      })

      if (resultado.error) {
        alert('Error al generar el reporte: ' + resultado.error)
      } else {
        setReporteAbierto({ studentId: studentId, nombre: nombre, texto: resultado.data.reporte })
      }
    } catch (err) {
      alert('Error al generar el reporte: ' + err.message)
    }
    setGenerandoReporteId(null)
  }

  async function guardarReportePadres() {
    if (!reporteAbierto) return
    setGuardandoReporte(true)
    const { data: userData } = await supabase.auth.getUser()
    const result = await supabase.from('reportes_padres').insert({
      student_id: reporteAbierto.studentId,
      generado_por: userData?.user?.id,
      texto: reporteAbierto.texto,
    })
    if (result.error) {
      alert('Error al guardar: ' + result.error.message)
    } else {
      alert('Reporte guardado — ya está visible en el Portal de Padres de este estudiante.')
      setReporteAbierto(null)
    }
    setGuardandoReporte(false)
  }

  if (loading) return <p className="text-slate-400 text-sm">Cargando estudiantes...</p>
  if (error) return <p className="text-red-500 text-sm">Error: {error}</p>

  // ---------- Nivel 3: tabla de estudiantes de una aula ----------
  if (selectedAula) {
    const items = students.filter(function (s) {
      return s.aula.institucion === selectedInst && s.aula.grado === selectedAula.grado && s.aula.grupo === selectedAula.grupo
    })
    return (
      <div>
        <button onClick={function () { setSelectedAula(null) }} className="text-sm font-semibold mb-4 hover:underline" style={{ color: NAVY }}>
          ← Volver a {institucionFija && selectedGrado ? `${selectedGrado}° Secundaria` : selectedInst}
        </button>
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <h2 className="text-lg font-bold" style={{ color: NAVY_DARK }}>
            {selectedAula.grado}° Secundaria — Sección {selectedAula.grupo} ({items.length})
          </h2>
          <div className="flex gap-2">
            {items.some(function (s) { return !s.codigo_padre }) && (
              <button
                onClick={function () { handleGenerarTodosLosCodigos(items) }}
                className="text-xs font-semibold px-4 py-2 rounded-lg text-white transition hover:opacity-90"
                style={{ backgroundColor: '#B45309' }}
              >
                Generar código para todos los que falten
              </button>
            )}
            {items.length > 0 && (
              <button
                onClick={function () { handleEliminarAulaCompleta(items) }}
                disabled={eliminandoAula}
                className="text-xs font-semibold px-4 py-2 rounded-lg text-white transition hover:opacity-90 disabled:opacity-50"
                style={{ backgroundColor: '#B91C1C' }}
              >
                {eliminandoAula ? 'Eliminando...' : `Eliminar los ${items.length} de esta aula`}
              </button>
            )}
          </div>
        </div>
        <div className="bg-white rounded-2xl p-4" style={{ border: '1px solid #E5E9F0' }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid #E5E9F0' }}>
                <th className="text-left py-2 pr-3 font-semibold" style={{ color: NAVY_DARK }}>Nombre</th>
                <th className="text-left py-2 pr-3 font-semibold" style={{ color: NAVY_DARK }}>Correo</th>
                <th className="text-left py-2 pr-3 font-semibold" style={{ color: NAVY_DARK }}>Código de padre</th>
                <th className="text-right py-2 font-semibold" style={{ color: NAVY_DARK }}></th>
              </tr>
            </thead>
            <tbody>
              {items.map(function (s) {
                return (
                  <tr key={s.id} style={{ borderBottom: '1px solid #F4F6F9' }}>
                    <td className="py-2 pr-3" style={{ color: NAVY_DARK }}>
                      <span className="flex items-center gap-1.5">
                        {isOnline(s.id) && <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: '#22C55E' }} title="En línea" />}
                        {s.full_name}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-xs text-slate-500">{s.email || '—'}</td>
                    <td className="py-2 pr-3">
                      {s.codigo_padre ? (
                        <span className="text-xs font-mono font-semibold px-2 py-1 rounded-lg" style={{ backgroundColor: '#E7F3E4', color: '#16A34A' }}>
                          {s.codigo_padre}
                        </span>
                      ) : (
                        <button
                          onClick={function () { handleGenerarCodigo(s.id) }}
                          className="text-xs font-semibold px-2 py-1 rounded-lg text-white transition hover:opacity-90"
                          style={{ backgroundColor: '#B45309' }}
                        >
                          Generar código
                        </button>
                      )}
                    </td>
                    <td className="py-2 text-right">
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={function () { handleGenerarReporte(s.id, s.full_name) }}
                          disabled={generandoReporteId === s.id}
                          className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white transition hover:opacity-90 disabled:opacity-50"
                          style={{ backgroundColor: '#7C3AED' }}
                        >
                          {generandoReporteId === s.id ? 'Generando...' : '🤖 Reporte para padres'}
                        </button>
                        <button
                          onClick={function () { handleResetPassword(s.id, s.full_name) }}
                          disabled={reseteandoId === s.id}
                          className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white transition hover:opacity-90 disabled:opacity-50"
                          style={{ backgroundColor: '#B45309' }}
                        >
                          {reseteandoId === s.id ? '...' : 'Resetear contraseña'}
                        </button>
                        <button
                          onClick={function () { handleDelete(s.id, s.full_name) }}
                          disabled={deletingId === s.id}
                          className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white transition hover:opacity-90 disabled:opacity-50"
                          style={{ backgroundColor: '#B91C1C' }}
                        >
                          {deletingId === s.id ? 'Eliminando...' : 'Eliminar'}
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {reporteAbierto && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={function () { setReporteAbierto(null) }}>
            <div className="bg-white rounded-2xl p-6 w-full max-w-lg" style={{ border: '1px solid #E5E9F0' }} onClick={function (e) { e.stopPropagation() }}>
              <h3 className="text-lg font-bold mb-1" style={{ color: NAVY_DARK }}>Reporte para la familia de {reporteAbierto.nombre}</h3>
              <p className="text-xs text-slate-400 mb-4">Revisa el texto, edítalo si quieres, y guárdalo para que aparezca en el Portal de Padres.</p>
              <textarea
                value={reporteAbierto.texto}
                onChange={function (e) { setReporteAbierto(function (prev) { return { ...prev, texto: e.target.value } }) }}
                rows={6}
                className="w-full rounded-lg px-3 py-2 text-sm outline-none mb-4"
                style={{ backgroundColor: '#F4F6F9', border: '1px solid #D6DCE5', color: NAVY_DARK }}
              />
              <div className="flex gap-2 justify-end">
                <button onClick={function () { setReporteAbierto(null) }} className="text-xs font-semibold px-4 py-2 rounded-lg transition" style={{ backgroundColor: 'white', color: NAVY_DARK, border: '1px solid #D6DCE5' }}>
                  Cancelar
                </button>
                <button
                  onClick={guardarReportePadres}
                  disabled={guardandoReporte}
                  className="text-xs font-semibold px-4 py-2 rounded-lg text-white transition hover:opacity-90 disabled:opacity-50"
                  style={{ backgroundColor: GREEN }}
                >
                  {guardandoReporte ? 'Guardando...' : '✓ Guardar y mostrar a la familia'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ---------- Nivel 2: carpetas de Grado/Sección dentro de una institución ----------
  if (selectedInst) {
    const lista = students.filter(function (s) { return s.aula.institucion === selectedInst })
    const aulas = []
    GRADOS.forEach(function (g) {
      SECCIONES.forEach(function (sec) {
        const items = lista.filter(function (s) { return s.aula.grado === g && s.aula.grupo === sec })
        if (items.length > 0) aulas.push({ grado: g, grupo: sec, cantidad: items.length })
      })
    })
    const sinAula = lista.filter(function (s) { return !s.aula.grado })

    // Con institución fija (Coordinador): primero carpetas de Grado, luego de Sección adentro
    if (institucionFija && !selectedGrado) {
      const gradosConDatos = [...new Set(aulas.map(function (a) { return a.grado }))].sort(function (a, b) { return a - b })
      return (
        <div>
          <h2 className="text-lg font-bold mb-4" style={{ color: NAVY_DARK }}>{selectedInst} ({lista.length})</h2>
          {gradosConDatos.length === 0 && sinAula.length === 0 ? (
            <p className="text-slate-400 text-sm">No hay estudiantes aquí.</p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {gradosConDatos.map(function (g) {
                const cantidad = aulas.filter(function (a) { return a.grado === g }).reduce(function (acc, a) { return acc + a.cantidad }, 0)
                const seccionesCount = aulas.filter(function (a) { return a.grado === g }).length
                return (
                  <button
                    key={g}
                    onClick={function () { setSelectedGrado(g) }}
                    className="text-left rounded-xl p-4 transition hover:-translate-y-0.5"
                    style={{ backgroundColor: '#F4F6F9', border: '1px solid #E5E9F0' }}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <FolderIcon />
                      <span className="text-xs font-semibold" style={{ color: GREEN_DARK }}>{g}° Secundaria</span>
                    </div>
                    <p className="text-sm font-bold" style={{ color: NAVY_DARK }}>{g}° Secundaria</p>
                    <p className="text-xs text-slate-400 mt-1">{seccionesCount} sección(es) · {cantidad} estudiante(s)</p>
                  </button>
                )
              })}

              {sinAula.length > 0 && (
                <button
                  onClick={function () { setSelectedAula({ grado: null, grupo: null }) }}
                  className="text-left rounded-xl p-4 transition hover:-translate-y-0.5"
                  style={{ backgroundColor: '#FDECEC', border: '1px solid #F5C6C6' }}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <FolderIcon color="#B91C1C" />
                    <span className="text-xs font-semibold" style={{ color: '#B91C1C' }}>Sin aula</span>
                  </div>
                  <p className="text-sm font-bold" style={{ color: NAVY_DARK }}>Sin aula asignada</p>
                  <p className="text-xs text-slate-400 mt-1">{sinAula.length} estudiante(s)</p>
                </button>
              )}
            </div>
          )}
        </div>
      )
    }

    // Con institución fija y un Grado ya elegido: mostrar solo las Secciones de ese Grado
    if (institucionFija && selectedGrado) {
      const aulasDelGrado = aulas.filter(function (a) { return a.grado === selectedGrado })
      return (
        <div>
          <button onClick={function () { setSelectedGrado(null) }} className="text-sm font-semibold mb-4 hover:underline" style={{ color: NAVY }}>
            ← Volver a Grados
          </button>
          <h2 className="text-lg font-bold mb-4" style={{ color: NAVY_DARK }}>{selectedGrado}° Secundaria</h2>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {aulasDelGrado.map(function (aula) {
              return (
                <button
                  key={`${aula.grado}${aula.grupo}`}
                  onClick={function () { setSelectedAula(aula) }}
                  className="text-left rounded-xl p-4 transition hover:-translate-y-0.5"
                  style={{ backgroundColor: '#F4F6F9', border: '1px solid #E5E9F0' }}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <FolderIcon />
                    <span className="text-xs font-semibold" style={{ color: GREEN_DARK }}>{aula.grado}° "{aula.grupo}"</span>
                  </div>
                  <p className="text-sm font-bold" style={{ color: NAVY_DARK }}>{aula.grado}° Secundaria — Sección {aula.grupo}</p>
                  <p className="text-xs text-slate-400 mt-1">{aula.cantidad} estudiante(s)</p>
                </button>
              )
            })}
          </div>
        </div>
      )
    }

    return (
      <div>
        {!institucionFija && (
          <button onClick={function () { setSelectedInst(null) }} className="text-sm font-semibold mb-4 hover:underline" style={{ color: NAVY }}>
            ← Volver a Instituciones
          </button>
        )}
        <h2 className="text-lg font-bold mb-4" style={{ color: NAVY_DARK }}>{selectedInst} ({lista.length})</h2>

        {aulas.length === 0 && sinAula.length === 0 ? (
          <p className="text-slate-400 text-sm">No hay estudiantes aquí.</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {aulas.map(function (aula) {
              return (
                <button
                  key={`${aula.grado}${aula.grupo}`}
                  onClick={function () { setSelectedAula(aula) }}
                  className="text-left rounded-xl p-4 transition hover:-translate-y-0.5"
                  style={{ backgroundColor: '#F4F6F9', border: '1px solid #E5E9F0' }}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <FolderIcon />
                    <span className="text-xs font-semibold" style={{ color: GREEN_DARK }}>{aula.grado}° "{aula.grupo}"</span>
                  </div>
                  <p className="text-sm font-bold" style={{ color: NAVY_DARK }}>{aula.grado}° Secundaria — Sección {aula.grupo}</p>
                  <p className="text-xs text-slate-400 mt-1">{aula.cantidad} estudiante(s)</p>
                </button>
              )
            })}

            {sinAula.length > 0 && (
              <button
                onClick={function () { setSelectedAula({ grado: null, grupo: null }) }}
                className="text-left rounded-xl p-4 transition hover:-translate-y-0.5"
                style={{ backgroundColor: '#FDECEC', border: '1px solid #F5C6C6' }}
              >
                <div className="flex items-center gap-2 mb-1">
                  <FolderIcon color="#B91C1C" />
                  <span className="text-xs font-semibold" style={{ color: '#B91C1C' }}>Sin aula</span>
                </div>
                <p className="text-sm font-bold" style={{ color: NAVY_DARK }}>Sin aula asignada</p>
                <p className="text-xs text-slate-400 mt-1">{sinAula.length} estudiante(s)</p>
              </button>
            )}
          </div>
        )}
      </div>
    )
  }

  // ---------- Nivel 1: carpetas de Instituciones ----------
  const instituciones = [...new Set(students.map(function (s) { return s.aula.institucion }))].sort(function (a, b) {
    if (a === 'Sin institución asignada') return 1
    if (b === 'Sin institución asignada') return -1
    return a.localeCompare(b)
  })

  return (
    <div>
      <h2 className="text-2xl font-bold mb-2" style={{ color: NAVY_DARK }}>Estudiantes</h2>
      <p className="text-sm text-slate-400 mb-6">{students.length} estudiante(s) registrado(s) en total.</p>

      {students.length === 0 ? (
        <p className="text-slate-400 text-sm">Aún no hay estudiantes registrados.</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {instituciones.map(function (inst) {
            const cantidad = students.filter(function (s) { return s.aula.institucion === inst }).length
            const sinInst = inst === 'Sin institución asignada'
            return (
              <button
                key={inst}
                onClick={function () { setSelectedInst(inst) }}
                className="text-left rounded-xl p-4 transition hover:-translate-y-0.5"
                style={sinInst ? { backgroundColor: '#FDECEC', border: '1px solid #F5C6C6' } : { backgroundColor: '#F4F6F9', border: '1px solid #E5E9F0' }}
              >
                <div className="flex items-center gap-2 mb-1">
                  <FolderIcon color={sinInst ? '#B91C1C' : NAVY_DARK} />
                  <span className="text-xs font-semibold" style={{ color: sinInst ? '#B91C1C' : NAVY }}>Institución</span>
                </div>
                <p className="text-sm font-bold" style={{ color: NAVY_DARK }}>{inst}</p>
                <p className="text-xs text-slate-400 mt-1">{cantidad} estudiante(s)</p>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
