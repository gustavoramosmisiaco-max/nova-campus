import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import { useAuth } from './AuthContext'
import { getLetterGrade, getLetterColor } from './gradeUtils'
import PreviewModal from './PreviewModal'

const NAVY_DARK = '#0F172A'
const NAVY = '#2563EB'
const GREEN = '#22C55E'

const inputStyle = { backgroundColor: 'white', border: '1px solid #D6DCE5', color: NAVY_DARK }

const INSTRUMENTOS_EVALUACION = [
  'Lista de cotejo',
  'Rúbrica',
  'Escala de valoración',
  'Registro anecdótico',
  'Ficha de observación',
  'Portafolio',
  'Prueba escrita',
  'Guía de entrevista',
]

export default function CourseAssignmentsTeacher({ courseId }) {
  const { session } = useAuth()
  const [activities, setActivities] = useState([])
  const [assignments, setAssignments] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)

  const [actividadId, setActividadId] = useState('')
  const [selectedCapacidades, setSelectedCapacidades] = useState([])
  const [titulo, setTitulo] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [fechaEntrega, setFechaEntrega] = useState('')
  const [puntajeMax, setPuntajeMax] = useState(20)
  const [instrumento, setInstrumento] = useState('')
  const [tema, setTema] = useState('')

  const [selectedAssignment, setSelectedAssignment] = useState(null)
  const [assignmentCapacidades, setAssignmentCapacidades] = useState([])
  const [submissions, setSubmissions] = useState([])
  const [submissionFilesMap, setSubmissionFilesMap] = useState({})
  const [submissionScoresMap, setSubmissionScoresMap] = useState({})
  const [loadingSubs, setLoadingSubs] = useState(false)
  const [subsError, setSubsError] = useState('')

  const [preview, setPreview] = useState(null)

  useEffect(function () {
    loadActivities()
    loadAssignments()
  }, [courseId])

  async function loadActivities() {
    const result = await supabase
      .from('actividades')
      .select('*, competencia:competencias(nombre), actividad_capacidades(criterio, desempeno, capacidad:capacidades(id, nombre, orden))')
      .eq('course_id', courseId)
      .order('created_at', { ascending: true })
    if (!result.error) setActivities(result.data)
  }

  async function loadAssignments() {
    setLoading(true)
    const result = await supabase
      .from('assignments')
      .select('*, assignment_capacidades(capacidad:capacidades(nombre))')
      .eq('course_id', courseId)
      .order('fecha_entrega', { ascending: false })
    if (result.error) {
      setError(result.error.message)
    } else {
      setAssignments(result.data)
    }
    setLoading(false)
  }

  function resetForm() {
    setEditingId(null)
    setActividadId('')
    setSelectedCapacidades([])
    setTitulo('')
    setDescripcion('')
    setFechaEntrega('')
    setPuntajeMax(20)
    setInstrumento('')
    setTema('')
  }

  function openNewForm() {
    resetForm()
    setShowForm(true)
  }

  async function openEditForm(a) {
    setEditingId(a.id)
    setActividadId(a.actividad_id || '')
    setTitulo(a.titulo)
    setDescripcion(a.descripcion || '')
    const d = new Date(a.fecha_entrega)
    const pad = function (n) { return String(n).padStart(2, '0') }
    setFechaEntrega(d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()))
    setPuntajeMax(a.puntaje_maximo)
    setInstrumento(a.instrumento_evaluacion || '')
    setTema(a.tema || '')

    const acResult = await supabase.from('assignment_capacidades').select('capacidad_id').eq('assignment_id', a.id)
    setSelectedCapacidades(!acResult.error ? acResult.data.map(function (x) { return x.capacidad_id }) : [])
    setShowForm(true)
  }

  const actividadSeleccionada = activities.find(function (a) { return a.id === actividadId })
  const capacidadesDeActividad = actividadSeleccionada ? actividadSeleccionada.actividad_capacidades : []

  function handleSelectActividad(id) {
    setActividadId(id)
    setSelectedCapacidades([])
    if (!id) return
    const act = activities.find(function (a) { return a.id === id })
    if (!act) return
    setTema(act.nombre || '')
  }

  function toggleCapacidad(capId) {
    setSelectedCapacidades(function (prev) {
      return prev.includes(capId) ? prev.filter(function (id) { return id !== capId }) : [...prev, capId]
    })
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (selectedCapacidades.length === 0) {
      setError('Selecciona al menos una capacidad a evaluar.')
      return
    }

    const acs = capacidadesDeActividad.filter(function (ac) { return selectedCapacidades.includes(ac.capacidad.id) })
    const competenciaTexto = actividadSeleccionada?.competencia?.nombre || ''
    const capacidadTexto = acs.map(function (ac) { return ac.capacidad.nombre }).join('; ')
    const criterioTexto = acs.map(function (ac) { return ac.criterio }).filter(Boolean).join(' | ')
    const desempenoTexto = acs.map(function (ac) { return ac.desempeno }).filter(Boolean).join(' | ')

    const payload = {
      course_id: courseId,
      actividad_id: actividadId || null,
      titulo: titulo,
      descripcion: descripcion,
      fecha_entrega: fechaEntrega ? `${fechaEntrega}:00-05:00` : fechaEntrega,
      puntaje_maximo: puntajeMax,
      instrumento_evaluacion: instrumento,
      competencia: competenciaTexto,
      capacidad: capacidadTexto,
      criterio: criterioTexto,
      tema: tema,
      desempeno: desempenoTexto,
    }

    let assignmentId = editingId
    let result
    if (editingId) {
      result = await supabase.from('assignments').update(payload).eq('id', editingId)
    } else {
      payload.created_by = session.user.id
      result = await supabase.from('assignments').insert(payload).select('id').single()
      if (!result.error) assignmentId = result.data.id
    }

    if (result.error) {
      setError(result.error.message)
      return
    }

    if (editingId) {
      await supabase.from('assignment_capacidades').delete().eq('assignment_id', assignmentId)
    }
    const acsPayload = selectedCapacidades.map(function (capId) {
      return { assignment_id: assignmentId, capacidad_id: capId }
    })
    const acsResult = await supabase.from('assignment_capacidades').insert(acsPayload)
    if (acsResult.error) {
      setError(acsResult.error.message)
      return
    }

    resetForm()
    setShowForm(false)
    loadAssignments()
  }

  async function handleDeleteAssignment(id) {
    const confirmDelete = confirm('¿Eliminar esta tarea? También se borrarán las entregas de los alumnos.')
    if (!confirmDelete) return
    const result = await supabase.from('assignments').delete().eq('id', id)
    if (result.error) {
      alert('Error: ' + result.error.message)
    } else {
      loadAssignments()
      setSelectedAssignment(null)
    }
  }

  async function openSubmissions(assignment) {
    setSelectedAssignment(assignment)
    setLoadingSubs(true)
    setSubsError('')

    const acResult = await supabase
      .from('assignment_capacidades')
      .select('capacidad:capacidades(id, nombre, orden)')
      .eq('assignment_id', assignment.id)
    const caps = !acResult.error
      ? acResult.data.map(function (x) { return x.capacidad }).sort(function (a, b) { return (a.orden || 0) - (b.orden || 0) })
      : []
    setAssignmentCapacidades(caps)

    const result = await supabase
      .from('submissions')
      .select('*, student:profiles!submissions_student_id_fkey(full_name, email)')
      .eq('assignment_id', assignment.id)
      .order('submitted_at', { ascending: false })

    if (result.error) {
      setSubsError(result.error.message)
      setSubmissions([])
      setLoadingSubs(false)
      return
    }
    setSubmissions(result.data)

    const submissionIds = result.data.map(function (s) { return s.id })

    let filesMap = {}
    if (submissionIds.length > 0) {
      const filesResult = await supabase
        .from('submission_files')
        .select('submission_id, file_url, orden')
        .in('submission_id', submissionIds)
        .order('orden')
      if (!filesResult.error) {
        filesResult.data.forEach(function (f) {
          if (!filesMap[f.submission_id]) filesMap[f.submission_id] = []
          filesMap[f.submission_id].push(f.file_url)
        })
      }
    }
    setSubmissionFilesMap(filesMap)

    let scoresMap = {}
    if (submissionIds.length > 0) {
      const scoresResult = await supabase
        .from('submission_scores')
        .select('submission_id, capacidad_id, score')
        .in('submission_id', submissionIds)
      if (!scoresResult.error) {
        scoresResult.data.forEach(function (s) {
          scoresMap[`${s.submission_id}__${s.capacidad_id}`] = s.score
        })
      }
    }
    setSubmissionScoresMap(scoresMap)
    setLoadingSubs(false)
  }

  function getFileExtension(path) {
    const clean = path.split('?')[0]
    const parts = clean.split('.')
    const last = parts[parts.length - 1]
    return last ? last.toLowerCase() : ''
  }

  async function handlePreview(path) {
    const result = await supabase.storage.from('entregas').createSignedUrl(path, 300)
    if (result.error) {
      alert('Error al abrir el archivo: ' + result.error.message)
      return
    }
    const ext = getFileExtension(path)
    const parts = path.split('/')
    const name = parts[parts.length - 1]
    setPreview({ url: result.data.signedUrl, type: ext, name: name })
  }

  async function handleGradeCapacidad(submissionId, capacidadId, scoreStr) {
    const numScore = Number(scoreStr)
    if (isNaN(numScore) || numScore < 0 || numScore > 20) {
      alert('La nota debe ser un número entre 0 y 20.')
      return
    }

    const upsertResult = await supabase
      .from('submission_scores')
      .upsert(
        { submission_id: submissionId, capacidad_id: capacidadId, score: numScore, graded_by: session.user.id, graded_at: new Date().toISOString() },
        { onConflict: 'submission_id,capacidad_id' }
      )
    if (upsertResult.error) {
      alert('Error al calificar: ' + upsertResult.error.message)
      return
    }

    const allScoresResult = await supabase
      .from('submission_scores')
      .select('score')
      .eq('submission_id', submissionId)
    const values = (allScoresResult.data || []).map(function (s) { return s.score }).filter(function (s) { return s != null })
    const avg = values.length > 0 ? values.reduce(function (a, b) { return a + b }, 0) / values.length : null

    await supabase
      .from('submissions')
      .update({ score: avg, graded_by: session.user.id, graded_at: new Date().toISOString() })
      .eq('id', submissionId)

    setSubmissionScoresMap(function (prev) {
      return { ...prev, [`${submissionId}__${capacidadId}`]: numScore }
    })
    openSubmissions(selectedAssignment)
  }

  if (selectedAssignment) {
    return (
      <div>
        <button
          onClick={function () { setSelectedAssignment(null) }}
          className="text-sm font-semibold mb-4 hover:underline"
          style={{ color: NAVY }}
        >
          ← Volver a tareas
        </button>
        <h3 className="text-lg font-bold mb-1" style={{ color: NAVY_DARK }}>{selectedAssignment.titulo}</h3>
        <p className="text-slate-500 text-sm mb-1">
          Entrega: {new Date(selectedAssignment.fecha_entrega).toLocaleString('es-PE')}
        </p>
        {selectedAssignment.instrumento_evaluacion && (
          <p className="text-xs text-slate-500 mb-4">Instrumento: {selectedAssignment.instrumento_evaluacion}</p>
        )}

        {subsError && <p className="text-red-500 text-sm mb-3">{subsError}</p>}
        {loadingSubs && <p className="text-slate-400 text-sm">Cargando entregas...</p>}
        {!loadingSubs && submissions.length === 0 && (
          <p className="text-slate-400 text-sm">Ningún alumno ha entregado aún.</p>
        )}

        {!loadingSubs && submissions.length > 0 && (
          <ul className="space-y-3">
            {submissions.map(function (s) {
              return (
                <li
                  key={s.id}
                  className="rounded-xl p-4"
                  style={{ backgroundColor: '#F4F6F9', border: '1px solid #E5E9F0' }}
                >
                  <div className="flex justify-between items-start flex-wrap gap-3 mb-3">
                    <div>
                      <p className="text-sm font-semibold" style={{ color: NAVY_DARK }}>{s.student ? s.student.full_name : ''}</p>
                      <p className="text-xs text-slate-500">
                        Entregado: {new Date(s.submitted_at).toLocaleString('es-PE')}
                      </p>
                      {s.score != null && (
                        <p className={'text-xs font-semibold ' + getLetterColor(s.score)}>
                          Promedio de esta tarea: {s.score.toFixed(1)} — {getLetterGrade(s.score)}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1.5 justify-end">
                      {(submissionFilesMap[s.id] || []).map(function (path, i) {
                        const esPdf = path.toLowerCase().endsWith('.pdf')
                        return (
                          <button
                            key={path}
                            onClick={function () { handlePreview(path) }}
                            className="text-xs font-semibold px-3 py-1.5 rounded-lg transition"
                            style={{ backgroundColor: 'white', color: NAVY, border: '1px solid #D6DCE5' }}
                          >
                            {esPdf ? '📄' : '📷'} Archivo {i + 1}
                          </button>
                        )
                      })}
                      {(!submissionFilesMap[s.id] || submissionFilesMap[s.id].length === 0) && s.file_url && (
                        <button
                          onClick={function () { handlePreview(s.file_url) }}
                          className="text-xs font-semibold px-3 py-1.5 rounded-lg transition"
                          style={{ backgroundColor: 'white', color: NAVY, border: '1px solid #D6DCE5' }}
                        >
                          Ver archivo
                        </button>
                      )}
                      {s.link_url && (
                        <a
                          href={s.link_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs font-semibold px-3 py-1.5 rounded-lg transition inline-block"
                          style={{ backgroundColor: 'white', color: NAVY, border: '1px solid #D6DCE5' }}
                        >
                          🔗 Ver link
                        </a>
                      )}
                      {!s.file_url && s.link_url == null && (!submissionFilesMap[s.id] || submissionFilesMap[s.id].length === 0) && (
                        <span className="text-xs text-slate-400">Sin archivo ni link</span>
                      )}
                    </div>
                  </div>

                  {assignmentCapacidades.length === 0 ? (
                    <p className="text-xs text-slate-400">Esta tarea no tiene capacidades vinculadas.</p>
                  ) : (
                    <div className="space-y-2">
                      {assignmentCapacidades.map(function (cap) {
                        const key = `${s.id}__${cap.id}`
                        const currentScore = submissionScoresMap[key]
                        return (
                          <div
                            key={cap.id}
                            className="flex justify-between items-center rounded-lg px-3 py-2"
                            style={{ backgroundColor: 'white', border: '1px solid #E5E9F0' }}
                          >
                            <span className="text-xs" style={{ color: NAVY_DARK }}>{cap.nombre}</span>
                            <input
                              type="number"
                              min="0"
                              max="20"
                              step="0.5"
                              defaultValue={currentScore != null ? currentScore : ''}
                              placeholder="Nota"
                              className="w-16 rounded-lg text-sm px-2 py-1 outline-none"
                              style={inputStyle}
                              onBlur={function (e) {
                                if (e.target.value) handleGradeCapacidad(s.id, cap.id, e.target.value)
                              }}
                            />
                          </div>
                        )
                      })}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}

        <PreviewModal preview={preview} onClose={function () { setPreview(null) }} />
      </div>
    )
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-bold" style={{ color: NAVY_DARK }}>Tareas</h3>
        <button
          onClick={function () {
            if (showForm) {
              setShowForm(false)
            } else {
              openNewForm()
            }
          }}
          className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white transition hover:opacity-90"
          style={{ backgroundColor: GREEN }}
        >
          {showForm ? 'Cancelar' : '+ Nueva tarea'}
        </button>
      </div>

      {activities.length === 0 && showForm && (
        <p className="text-xs mb-3" style={{ color: '#B91C1C' }}>
          No tienes actividades creadas aún. Ve a la pestaña "Actividades" y crea una primero.
        </p>
      )}

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="rounded-xl p-4 mb-5 space-y-3"
          style={{ backgroundColor: '#F4F6F9', border: '1px solid #E5E9F0' }}
        >
          <h4 className="text-sm font-semibold" style={{ color: NAVY_DARK }}>
            {editingId ? 'Editar tarea' : 'Nueva tarea'}
          </h4>

          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: NAVY_DARK }}>
              Actividad de aprendizaje
            </label>
            <select
              value={actividadId}
              onChange={function (e) { handleSelectActividad(e.target.value) }}
              className="w-full rounded-lg px-3 py-2 text-sm outline-none"
              style={inputStyle}
            >
              <option value="">-- Selecciona una actividad --</option>
              {activities.map(function (a) {
                return <option key={a.id} value={a.id}>Actividad {a.numero_actividad} · {a.nombre}</option>
              })}
            </select>
          </div>

          {actividadId && capacidadesDeActividad.length > 0 && (
            <div>
              <label className="block text-xs font-medium mb-2" style={{ color: NAVY_DARK }}>
                ¿Qué capacidad(es) evalúa esta tarea? (puedes marcar varias)
              </label>
              <div className="space-y-1.5">
                {capacidadesDeActividad
                  .slice()
                  .sort(function (x, y) { return (x.capacidad.orden || 0) - (y.capacidad.orden || 0) })
                  .map(function (ac) {
                    const checked = selectedCapacidades.includes(ac.capacidad.id)
                    return (
                      <label
                        key={ac.capacidad.id}
                        className="flex items-start gap-2 text-sm rounded-lg px-3 py-2 cursor-pointer"
                        style={{ backgroundColor: 'white', border: '1px solid #D6DCE5' }}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={function () { toggleCapacidad(ac.capacidad.id) }}
                          className="mt-0.5"
                        />
                        <span style={{ color: NAVY_DARK }}>{ac.capacidad.nombre}</span>
                      </label>
                    )
                  })}
              </div>
            </div>
          )}

          <input
            type="text"
            value={titulo}
            onChange={function (e) { setTitulo(e.target.value) }}
            required
            placeholder="Título de la tarea"
            className="w-full rounded-lg px-3 py-2 text-sm outline-none"
            style={inputStyle}
          />

          <textarea
            value={descripcion}
            onChange={function (e) { setDescripcion(e.target.value) }}
            placeholder="Descripción (opcional)"
            rows={2}
            className="w-full rounded-lg px-3 py-2 text-sm outline-none"
            style={inputStyle}
          />

          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: NAVY_DARK }}>
              Instrumento de evaluación
            </label>
            <select
              value={instrumento}
              onChange={function (e) { setInstrumento(e.target.value) }}
              className="w-full rounded-lg px-3 py-2 text-sm outline-none"
              style={inputStyle}
            >
              <option value="">-- Selecciona --</option>
              {INSTRUMENTOS_EVALUACION.map(function (i) { return <option key={i} value={i}>{i}</option> })}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: NAVY_DARK }}>Fecha y hora de entrega</label>
              <input
                type="datetime-local"
                value={fechaEntrega}
                onChange={function (e) { setFechaEntrega(e.target.value) }}
                required
                className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                style={inputStyle}
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: NAVY_DARK }}>Puntaje máximo</label>
              <input
                type="number"
                value={puntajeMax}
                onChange={function (e) { setPuntajeMax(e.target.value) }}
                max={20}
                min={0}
                className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                style={inputStyle}
              />
            </div>
          </div>

          {error && <p className="text-red-500 text-sm">{error}</p>}

          <button
            type="submit"
            className="font-semibold px-4 py-2 rounded-lg text-white transition hover:opacity-90"
            style={{ backgroundColor: GREEN }}
          >
            {editingId ? 'Guardar cambios' : 'Crear tarea'}
          </button>
        </form>
      )}

      {loading && <p className="text-slate-400 text-sm">Cargando tareas...</p>}
      {!loading && assignments.length === 0 && (
        <p className="text-slate-400 text-sm">Aún no hay tareas para este curso.</p>
      )}

      {!loading && assignments.length > 0 && (
        <ul className="space-y-3">
          {assignments.map(function (a) {
            return (
              <li
                key={a.id}
                className="rounded-xl p-4"
                style={{ backgroundColor: '#F4F6F9', border: '1px solid #E5E9F0' }}
              >
                <div className="flex justify-between items-start flex-wrap gap-3">
                  <div>
                    <p className="text-sm font-semibold" style={{ color: NAVY_DARK }}>{a.titulo}</p>
                    <p className="text-xs text-slate-500">
                      Entrega: {new Date(a.fecha_entrega).toLocaleString('es-PE')}
                    </p>
                    {a.instrumento_evaluacion && (
                      <p className="text-xs text-slate-500">Instrumento: {a.instrumento_evaluacion}</p>
                    )}
                    {a.assignment_capacidades && a.assignment_capacidades.length > 0 && (
                      <p className="text-xs mt-1" style={{ color: '#16A34A' }}>
                        {a.assignment_capacidades.map(function (ac) { return ac.capacidad.nombre }).join(' · ')}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={function () { openSubmissions(a) }}
                      className="text-xs font-semibold px-3 py-1.5 rounded-lg transition"
                      style={{ backgroundColor: 'white', color: NAVY, border: '1px solid #D6DCE5' }}
                    >
                      Ver entregas
                    </button>
                    <button
                      onClick={function () { openEditForm(a) }}
                      className="text-xs font-semibold px-3 py-1.5 rounded-lg transition"
                      style={{ backgroundColor: 'white', color: NAVY, border: '1px solid #D6DCE5' }}
                    >
                      Editar
                    </button>
                    <button
                      onClick={function () { handleDeleteAssignment(a.id) }}
                      className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white transition hover:opacity-90"
                      style={{ backgroundColor: '#B91C1C' }}
                    >
                      Eliminar
                    </button>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
