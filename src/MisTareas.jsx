import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import { useAuth } from './AuthContext'
import { getLetterGrade, getLetterColor } from './gradeUtils'
import PreviewModal from './PreviewModal'

const NAVY_DARK = '#0F2A4A'
const NAVY = '#1d5c8f'
const GREEN = '#5DAA47'
const GREEN_DARK = '#2f7a1f'

const inputStyle = { backgroundColor: 'white', border: '1px solid #D6DCE5', color: NAVY_DARK }

export default function MisTareas() {
  const { session } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tareasPorCurso, setTareasPorCurso] = useState([])
  const [selectedTarea, setSelectedTarea] = useState(null)

  useEffect(function () {
    cargarTodo()
  }, [])

  async function cargarTodo() {
    setLoading(true)
    setError('')

    const coursesResult = await supabase
      .from('courses')
      .select('id, nombre, grado, grupo')
      .eq('docente_id', session.user.id)
      .order('grado', { ascending: true })
      .order('nombre', { ascending: true })

    if (coursesResult.error) {
      setError(coursesResult.error.message)
      setLoading(false)
      return
    }
    const courses = coursesResult.data
    const courseIds = courses.map(function (c) { return c.id })
    if (courseIds.length === 0) {
      setTareasPorCurso([])
      setLoading(false)
      return
    }
    const coursesMap = {}
    courses.forEach(function (c) { coursesMap[c.id] = c })

    const enrollResult = await supabase
      .from('enrollments')
      .select('course_id')
      .eq('status', 'activo')
      .in('course_id', courseIds)
    const matriculadosMap = {}
    if (!enrollResult.error) {
      enrollResult.data.forEach(function (e) { matriculadosMap[e.course_id] = (matriculadosMap[e.course_id] || 0) + 1 })
    }

    const actResult = await supabase
      .from('actividades')
      .select('id, course_id, nombre, numero_actividad, actividad_capacidades(criterio, desempeno, desc_ad, desc_a, desc_b, desc_c, capacidad:capacidades(id, nombre, orden))')
      .in('course_id', courseIds)
    if (actResult.error) {
      setError(actResult.error.message)
      setLoading(false)
      return
    }
    const actMap = {}
    actResult.data.forEach(function (a) { actMap[a.id] = a })
    const actIds = actResult.data.map(function (a) { return a.id })

    if (actIds.length === 0) {
      setTareasPorCurso(courses.map(function (c) { return { course: c, tareas: [] } }).filter(function (g) { return g.tareas.length > 0 }))
      setLoading(false)
      return
    }

    const assignResult = await supabase
      .from('assignments')
      .select('id, titulo, fecha_entrega, actividad_id, course_id, tipo_entrega')
      .in('actividad_id', actIds)
      .order('fecha_entrega', { ascending: false })
    if (assignResult.error) {
      setError(assignResult.error.message)
      setLoading(false)
      return
    }

    const assignmentIds = assignResult.data.map(function (a) { return a.id })
    let countMap = {}
    if (assignmentIds.length > 0) {
      const subsResult = await supabase.from('submissions').select('assignment_id, file_url').in('assignment_id', assignmentIds)
      if (!subsResult.error) {
        subsResult.data.forEach(function (s) {
          if (s.file_url == null) return
          countMap[s.assignment_id] = (countMap[s.assignment_id] || 0) + 1
        })
      }
    }

    const enriched = assignResult.data.map(function (a) {
      return {
        ...a,
        actividad: actMap[a.actividad_id],
        totalMatriculados: matriculadosMap[a.course_id] || 0,
        totalEntregados: countMap[a.id] || 0,
      }
    })

    const grouped = courses.map(function (c) {
      return { course: c, tareas: enriched.filter(function (a) { return a.course_id === c.id }) }
    }).filter(function (g) { return g.tareas.length > 0 })

    setTareasPorCurso(grouped)
    setLoading(false)
  }

  if (selectedTarea) {
    return (
      <CalificarTarea
        tarea={selectedTarea}
        onBack={function () { setSelectedTarea(null); cargarTodo() }}
      />
    )
  }

  if (loading) return <p className="text-slate-400 text-sm">Cargando tus tareas...</p>
  if (error) return <p className="text-red-500 text-sm">Error: {error}</p>

  return (
    <div>
      <h2 className="text-2xl font-bold mb-2" style={{ color: NAVY_DARK }}>Mis Tareas</h2>
      <p className="text-sm text-slate-400 mb-6">
        Todas las tareas de todos tus cursos en un solo lugar. Entra directo a calificar sin navegar carpeta por carpeta.
      </p>

      {tareasPorCurso.length === 0 ? (
        <div className="bg-white rounded-2xl p-10 text-center" style={{ border: '1px dashed #D6DCE5' }}>
          <p className="text-slate-400 text-sm">Aún no tienes tareas creadas.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {tareasPorCurso.map(function (g) {
            return (
              <div key={g.course.id}>
                <h3 className="text-sm font-bold mb-3" style={{ color: NAVY_DARK }}>
                  {g.course.nombre} <span className="text-slate-400 font-medium">({g.course.grado}° Sección {g.course.grupo})</span>
                </h3>
                <ul className="space-y-3">
                  {g.tareas.map(function (t) {
                    const pct = t.totalMatriculados > 0 ? Math.round((t.totalEntregados / t.totalMatriculados) * 100) : 0
                    const yaVencio = new Date(t.fecha_entrega) < new Date()
                    return (
                      <li key={t.id} className="bg-white rounded-xl p-4" style={{ border: '1px solid #E5E9F0' }}>
                        <div className="flex justify-between items-start flex-wrap gap-3">
                          <div>
                            <p className="text-xs text-slate-400">Actividad {t.actividad?.numero_actividad} · {t.actividad?.nombre}</p>
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-semibold" style={{ color: NAVY_DARK }}>{t.titulo}</p>
                              {t.tipo_entrega === 'grupal' && (
                                <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: '#f0e7f7', color: '#8a5cb0' }}>Grupal</span>
                              )}
                            </div>
                            <p className="text-xs text-slate-500">
                              Entrega: {new Date(t.fecha_entrega).toLocaleString('es-PE')}
                              {yaVencio && <span className="ml-2 font-semibold text-red-500">Vencida</span>}
                            </p>
                          </div>
                          <button
                            onClick={function () { setSelectedTarea(t) }}
                            className="text-xs font-semibold px-4 py-2 rounded-lg text-white transition hover:opacity-90"
                            style={{ backgroundColor: GREEN }}
                          >
                            Calificar
                          </button>
                        </div>
                        <div className="mt-3">
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-xs text-slate-500">Entregas: {t.totalEntregados} de {t.totalMatriculados}</span>
                            <span className="text-xs font-semibold" style={{ color: pct === 100 ? GREEN : pct >= 50 ? '#B45309' : '#B91C1C' }}>{pct}%</span>
                          </div>
                          <div className="w-full h-2 rounded-full overflow-hidden" style={{ backgroundColor: '#E5E9F0' }}>
                            <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: pct === 100 ? GREEN : pct >= 50 ? '#B45309' : '#B91C1C' }} />
                          </div>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ============================================================
// Vista de calificación (misma lógica que "Ver entregas")
// ============================================================
function CalificarTarea({ tarea, onBack }) {
  const { session } = useAuth()
  const assignmentCapacidades = (tarea.actividad?.actividad_capacidades || [])
    .map(function (ac) { return ac.capacidad })
    .sort(function (a, b) { return (a.orden || 0) - (b.orden || 0) })

  const [submissions, setSubmissions] = useState([])
  const [submissionScoresMap, setSubmissionScoresMap] = useState({})
  const [justificaciones, setJustificaciones] = useState([])
  const [enrolledStudents, setEnrolledStudents] = useState([])
  const [gruposCurso, setGruposCurso] = useState([])
  const [loadingSubs, setLoadingSubs] = useState(true)
  const [aplicandoCeros, setAplicandoCeros] = useState(false)
  const [publicandoNotas, setPublicandoNotas] = useState(false)
  const [preview, setPreview] = useState(null)

  useEffect(function () {
    cargarDetalle()
  }, [])

  async function cargarDetalle() {
    setLoadingSubs(true)

    const result = await supabase
      .from('submissions')
      .select('*, student:profiles!submissions_student_id_fkey(full_name, email)')
      .eq('assignment_id', tarea.id)
      .order('submitted_at', { ascending: false })
    if (result.error) { setSubmissions([]); setLoadingSubs(false); return }
    setSubmissions(result.data)

    const submissionIds = result.data.map(function (s) { return s.id })
    let scoresMap = {}
    if (submissionIds.length > 0) {
      const scoresResult = await supabase.from('submission_scores').select('submission_id, capacidad_id, score').in('submission_id', submissionIds)
      if (!scoresResult.error) scoresResult.data.forEach(function (s) { scoresMap[`${s.submission_id}__${s.capacidad_id}`] = s.score })
    }
    setSubmissionScoresMap(scoresMap)

    const justResult = await supabase
      .from('justificaciones')
      .select('*, student:profiles!justificaciones_student_id_fkey(full_name)')
      .eq('assignment_id', tarea.id)
      .order('created_at', { ascending: false })
    setJustificaciones(!justResult.error ? justResult.data : [])

    const enrollResult = await supabase
      .from('enrollments')
      .select('student:profiles(id, full_name)')
      .eq('course_id', tarea.course_id)
      .eq('status', 'activo')
    setEnrolledStudents(!enrollResult.error ? enrollResult.data.map(function (e) { return e.student }) : [])

    if (tarea.tipo_entrega === 'grupal') {
      const gruposResult = await supabase
        .from('grupos_trabajo')
        .select('id, nombre, grupos_trabajo_miembros(student_id)')
        .eq('course_id', tarea.course_id)
      setGruposCurso(!gruposResult.error ? gruposResult.data : [])
    } else {
      setGruposCurso([])
    }

    setLoadingSubs(false)
  }

  async function handlePreview(path) {
    const result = await supabase.storage.from('entregas').createSignedUrl(path, 300)
    if (result.error) { alert('Error: ' + result.error.message); return }
    const parts = path.split('/')
    const name = parts[parts.length - 1]
    const ext = name.split('.').pop().toLowerCase()
    setPreview({ url: result.data.signedUrl, type: ext, name: name })
  }

  async function handleRevisarJustificacion(justId, nuevoEstado) {
    await supabase
      .from('justificaciones')
      .update({ estado: nuevoEstado, reviewed_by: session.user.id, reviewed_at: new Date().toISOString() })
      .eq('id', justId)
    cargarDetalle()
  }

  async function handleGradeCapacidad(submissionId, capacidadId, scoreStr) {
    const numScore = Number(scoreStr)
    if (isNaN(numScore) || numScore < 0 || numScore > 20) { alert('La nota debe ser un número entre 0 y 20.'); return }

    let idsAActualizar = [submissionId]

    if (tarea.tipo_entrega === 'grupal') {
      const submissionActual = submissions.find(function (s) { return s.id === submissionId })
      if (submissionActual) {
        const miembroResult = await supabase
          .from('grupos_trabajo_miembros')
          .select('grupo_id, grupo:grupos_trabajo!inner(course_id)')
          .eq('student_id', submissionActual.student_id)
          .eq('grupo.course_id', tarea.course_id)
        const grupoIds = (miembroResult.data || []).map(function (m) { return m.grupo_id })
        if (grupoIds.length > 0) {
          const otrosMiembrosResult = await supabase
            .from('grupos_trabajo_miembros')
            .select('student_id')
            .in('grupo_id', grupoIds)
          const idsCompaneros = new Set((otrosMiembrosResult.data || []).map(function (m) { return m.student_id }))
          const otrasSubmissions = submissions.filter(function (s) { return idsCompaneros.has(s.student_id) && s.id !== submissionId })
          idsAActualizar = idsAActualizar.concat(otrasSubmissions.map(function (s) { return s.id }))
        }
      }
    }

    for (const subId of idsAActualizar) {
      await supabase.from('submission_scores').upsert(
        { submission_id: subId, capacidad_id: capacidadId, score: numScore, graded_by: session.user.id, graded_at: new Date().toISOString() },
        { onConflict: 'submission_id,capacidad_id' }
      )
      const allScoresResult = await supabase.from('submission_scores').select('score').eq('submission_id', subId)
      const values = (allScoresResult.data || []).map(function (s) { return s.score }).filter(function (s) { return s != null })
      const avg = values.length > 0 ? values.reduce(function (a, b) { return a + b }, 0) / values.length : null
      await supabase.from('submissions').update({ score: avg, graded_by: session.user.id, graded_at: new Date().toISOString() }).eq('id', subId)
    }

    cargarDetalle()
  }

  async function registrarCeroParaEstudiante(studentId) {
    const nowIso = new Date().toISOString()
    const insertResult = await supabase
      .from('submissions')
      .insert({
        assignment_id: tarea.id,
        student_id: studentId,
        file_url: null,
        submitted_at: nowIso,
        score: 0,
        graded_by: session.user.id,
        graded_at: nowIso,
        publicado: true,
      })
      .select('id')
      .single()

    if (insertResult.error) {
      alert('Error al registrar 0: ' + insertResult.error.message)
      return
    }

    const submissionId = insertResult.data.id
    if (assignmentCapacidades.length > 0) {
      const scoresPayload = assignmentCapacidades.map(function (cap) {
        return { submission_id: submissionId, capacidad_id: cap.id, score: 0, graded_by: session.user.id, graded_at: nowIso }
      })
      await supabase.from('submission_scores').insert(scoresPayload)
    }
  }

  async function handleZeroUnStudent(studentId) {
    if (!confirm('¿Registrar 0 (C) para este estudiante en esta tarea?')) return
    await registrarCeroParaEstudiante(studentId)
    cargarDetalle()
  }

  async function handleZeroTodos() {
    if (missingStudents.length === 0) return
    if (!confirm(`¿Registrar 0 (C) para los ${missingStudents.length} estudiante(s) que no entregaron esta tarea?`)) return
    setAplicandoCeros(true)
    for (const student of missingStudents) {
      await registrarCeroParaEstudiante(student.id)
    }
    setAplicandoCeros(false)
    cargarDetalle()
  }

  async function handleSubirNotas() {
    if (submissions.length === 0) {
      alert('No hay entregas registradas todavía para publicar.')
      return
    }
    if (!confirm('¿Publicar las notas de esta tarea?')) return
    setPublicandoNotas(true)
    await supabase.from('submissions').update({ publicado: true }).eq('assignment_id', tarea.id)
    setPublicandoNotas(false)
    cargarDetalle()
    alert('Notas publicadas correctamente.')
  }

  const submittedStudentIds = new Set(submissions.map(function (s) { return s.student_id }))
  const missingStudents = enrolledStudents.filter(function (s) { return !submittedStudentIds.has(s.id) })
  const yaVencio = new Date(tarea.fecha_entrega) < new Date()
  const hayNotasSinPublicar = submissions.some(function (s) { return !s.publicado })

  return (
    <div>
      <button onClick={onBack} className="text-sm font-semibold mb-4 hover:underline" style={{ color: NAVY }}>← Volver a Mis Tareas</button>
      <p className="text-xs text-slate-400">Actividad {tarea.actividad?.numero_actividad} · {tarea.actividad?.nombre}</p>
      <h3 className="text-lg font-bold mb-1" style={{ color: NAVY_DARK }}>{tarea.titulo}</h3>
      <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
        <p className="text-slate-500 text-sm">Entrega: {new Date(tarea.fecha_entrega).toLocaleString('es-PE')}</p>
        <button
          onClick={handleSubirNotas}
          disabled={publicandoNotas || submissions.length === 0}
          className="text-xs font-semibold px-4 py-2 rounded-lg text-white transition hover:opacity-90 disabled:opacity-50"
          style={{ backgroundColor: hayNotasSinPublicar ? '#B45309' : GREEN }}
        >
          {publicandoNotas ? 'Publicando...' : hayNotasSinPublicar ? 'Subir notas (hay cambios sin publicar)' : 'Subir notas'}
        </button>
      </div>

      {justificaciones.filter(function (j) { return j.estado === 'pendiente' }).length > 0 && (
        <div className="mb-5 rounded-xl p-4" style={{ backgroundColor: '#FFF7E6', border: '1px solid #F5D98A' }}>
          <h4 className="text-sm font-bold mb-3" style={{ color: '#B45309' }}>Justificaciones pendientes de revisión</h4>
          <ul className="space-y-3">
            {justificaciones.filter(function (j) { return j.estado === 'pendiente' }).map(function (j) {
              return (
                <li key={j.id} className="rounded-lg p-3" style={{ backgroundColor: 'white', border: '1px solid #E5E9F0' }}>
                  <p className="text-sm font-semibold" style={{ color: NAVY_DARK }}>{j.student?.full_name}</p>
                  <p className="text-sm text-slate-600 mt-1">{j.mensaje}</p>
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    {j.file_url && (
                      <button onClick={function () { handlePreview(j.file_url) }} className="text-xs font-semibold px-3 py-1.5 rounded-lg transition" style={{ backgroundColor: 'white', color: NAVY, border: '1px solid #D6DCE5' }}>Ver evidencia</button>
                    )}
                    <button onClick={function () { handleRevisarJustificacion(j.id, 'aprobada') }} className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white transition hover:opacity-90" style={{ backgroundColor: GREEN }}>Aprobar (habilitar entrega)</button>
                    <button onClick={function () { handleRevisarJustificacion(j.id, 'rechazada') }} className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white transition hover:opacity-90" style={{ backgroundColor: '#B91C1C' }}>Rechazar</button>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {yaVencio && missingStudents.length > 0 && (
        <div className="mb-5 rounded-xl p-4" style={{ backgroundColor: '#FDECEC', border: '1px solid #F5C6C6' }}>
          <div className="flex justify-between items-center mb-3 flex-wrap gap-2">
            <h4 className="text-sm font-bold" style={{ color: '#B91C1C' }}>{missingStudents.length} estudiante(s) no entregaron (vencida)</h4>
            <button onClick={handleZeroTodos} disabled={aplicandoCeros} className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white transition hover:opacity-90 disabled:opacity-50" style={{ backgroundColor: '#B91C1C' }}>
              {aplicandoCeros ? 'Registrando...' : 'Registrar 0 (C) a todos'}
            </button>
          </div>
          <ul className="space-y-2">
            {missingStudents.map(function (s) {
              return (
                <li key={s.id} className="flex justify-between items-center rounded-lg px-3 py-2" style={{ backgroundColor: 'white', border: '1px solid #E5E9F0' }}>
                  <span className="text-sm" style={{ color: NAVY_DARK }}>{s.full_name}</span>
                  <button onClick={function () { handleZeroUnStudent(s.id) }} className="text-xs font-semibold px-3 py-1 rounded-lg text-white transition hover:opacity-90" style={{ backgroundColor: '#B91C1C' }}>Registrar 0 (C)</button>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {loadingSubs ? <p className="text-slate-400 text-sm">Cargando...</p> : submissions.length === 0 ? (
        <p className="text-slate-400 text-sm">Ningún alumno ha entregado aún.</p>
      ) : tarea.tipo_entrega === 'grupal' && gruposCurso.length > 0 ? (
        (function () {
          const idsEnAlgunGrupo = new Set()
          gruposCurso.forEach(function (g) { g.grupos_trabajo_miembros.forEach(function (m) { idsEnAlgunGrupo.add(m.student_id) }) })
          const sueltos = submissions.filter(function (s) { return !idsEnAlgunGrupo.has(s.student_id) })

          return (
            <ul className="space-y-3">
              {gruposCurso.map(function (g) {
                const miembroIds = g.grupos_trabajo_miembros.map(function (m) { return m.student_id })
                const submissionsDelGrupo = submissions.filter(function (s) { return miembroIds.includes(s.student_id) })
                if (submissionsDelGrupo.length === 0) return null
                const representante = submissionsDelGrupo[0]
                const nombresMiembros = submissionsDelGrupo.map(function (s) { return s.student?.full_name }).filter(Boolean).join(', ')

                return (
                  <li key={g.id} className="rounded-xl p-4" style={{ backgroundColor: '#F4F6F9', border: '1px solid #E5E9F0' }}>
                    <div className="flex justify-between items-start flex-wrap gap-3 mb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-bold" style={{ color: NAVY_DARK }}>{g.nombre}</p>
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: '#f0e7f7', color: '#8a5cb0' }}>Grupal</span>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">{nombresMiembros}</p>
                        {representante.score != null ? (
                          <p className={'text-xs font-semibold mt-1 ' + getLetterColor(representante.score)}>
                            Promedio: {getLetterGrade(representante.score)}
                          </p>
                        ) : (
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-full inline-block mt-1" style={{ backgroundColor: '#FFF7E6', color: '#B45309' }}>Sin calificar</span>
                        )}
                        {!representante.publicado && (
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-full inline-block mt-1 ml-1" style={{ backgroundColor: '#FDECEC', color: '#B91C1C' }}>Sin publicar</span>
                        )}
                      </div>
                      {representante.file_url && (
                        <button onClick={function () { handlePreview(representante.file_url) }} className="text-xs font-semibold px-3 py-1.5 rounded-lg transition" style={{ backgroundColor: 'white', color: NAVY, border: '1px solid #D6DCE5' }}>Ver archivo</button>
                      )}
                    </div>
                    <div className="space-y-2">
                      {assignmentCapacidades.map(function (cap) {
                        const key = `${representante.id}__${cap.id}`
                        const currentScore = submissionScoresMap[key]
                        return (
                          <div key={cap.id} className="flex justify-between items-center rounded-lg px-3 py-2" style={{ backgroundColor: 'white', border: '1px solid #E5E9F0' }}>
                            <span className="text-xs" style={{ color: NAVY_DARK }}>{cap.nombre}</span>
                            <input type="number" min="0" max="20" step="0.5" defaultValue={currentScore != null ? currentScore : ''} placeholder="Nota"
                              className="w-16 rounded-lg text-sm px-2 py-1 outline-none" style={inputStyle}
                              onBlur={function (e) { if (e.target.value) handleGradeCapacidad(representante.id, cap.id, e.target.value) }} />
                          </div>
                        )
                      })}
                    </div>
                  </li>
                )
              })}

              {sueltos.map(function (s) {
                return (
                  <li key={s.id} className="rounded-xl p-4" style={{ backgroundColor: '#FDECEC', border: '1px solid #F5C6C6' }}>
                    <p className="text-xs font-semibold mb-2" style={{ color: '#B91C1C' }}>Sin grupo asignado</p>
                    <p className="text-sm font-semibold" style={{ color: NAVY_DARK }}>{s.student?.full_name}</p>
                    <div className="space-y-2 mt-2">
                      {assignmentCapacidades.map(function (cap) {
                        const key = `${s.id}__${cap.id}`
                        const currentScore = submissionScoresMap[key]
                        return (
                          <div key={cap.id} className="flex justify-between items-center rounded-lg px-3 py-2" style={{ backgroundColor: 'white', border: '1px solid #E5E9F0' }}>
                            <span className="text-xs" style={{ color: NAVY_DARK }}>{cap.nombre}</span>
                            <input type="number" min="0" max="20" step="0.5" defaultValue={currentScore != null ? currentScore : ''} placeholder="Nota"
                              className="w-16 rounded-lg text-sm px-2 py-1 outline-none" style={inputStyle}
                              onBlur={function (e) { if (e.target.value) handleGradeCapacidad(s.id, cap.id, e.target.value) }} />
                          </div>
                        )
                      })}
                    </div>
                  </li>
                )
              })}
            </ul>
          )
        })()
      ) : (
        <ul className="space-y-3">
          {submissions.map(function (s) {
            return (
              <li key={s.id} className="rounded-xl p-4" style={{ backgroundColor: '#F4F6F9', border: '1px solid #E5E9F0' }}>
                <div className="flex justify-between items-start flex-wrap gap-3 mb-3">
                  <div>
                    <p className="text-sm font-semibold" style={{ color: NAVY_DARK }}>{s.student?.full_name}</p>
                    {s.score != null ? (
                      <p className={'text-xs font-semibold ' + getLetterColor(s.score)}>
                        Promedio: {getLetterGrade(s.score)}{s.file_url == null ? ' (no entregó)' : ''}
                      </p>
                    ) : (
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full inline-block mt-1" style={{ backgroundColor: '#FFF7E6', color: '#B45309' }}>Sin calificar</span>
                    )}
                    {!s.publicado && (
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full inline-block mt-1 ml-1" style={{ backgroundColor: '#FDECEC', color: '#B91C1C' }}>Sin publicar</span>
                    )}
                  </div>
                  {s.file_url && (
                    <button onClick={function () { handlePreview(s.file_url) }} className="text-xs font-semibold px-3 py-1.5 rounded-lg transition" style={{ backgroundColor: 'white', color: NAVY, border: '1px solid #D6DCE5' }}>Ver archivo</button>
                  )}
                </div>
                <div className="space-y-2">
                  {assignmentCapacidades.map(function (cap) {
                    const key = `${s.id}__${cap.id}`
                    const currentScore = submissionScoresMap[key]
                    return (
                      <div key={cap.id} className="flex justify-between items-center rounded-lg px-3 py-2" style={{ backgroundColor: 'white', border: '1px solid #E5E9F0' }}>
                        <span className="text-xs" style={{ color: NAVY_DARK }}>{cap.nombre}</span>
                        <input type="number" min="0" max="20" step="0.5" defaultValue={currentScore != null ? currentScore : ''} placeholder="Nota"
                          className="w-16 rounded-lg text-sm px-2 py-1 outline-none" style={inputStyle}
                          onBlur={function (e) { if (e.target.value) handleGradeCapacidad(s.id, cap.id, e.target.value) }} />
                      </div>
                    )
                  })}
                </div>
              </li>
            )
          })}
        </ul>
      )}
      <PreviewModal preview={preview} onClose={function () { setPreview(null) }} />
    </div>
  )
}
