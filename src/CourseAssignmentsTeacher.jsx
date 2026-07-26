import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import { useAuth } from './AuthContext'
import { getLetterGrade, getLetterColor } from './gradeUtils'
import PreviewModal from './PreviewModal'

const NAVY_DARK = '#0F2A4A'
const NAVY = '#1d5c8f'
const GREEN = '#5DAA47'

const inputStyle = { backgroundColor: 'white', border: '1px solid #D6DCE5', color: NAVY_DARK }

export default function CourseAssignmentsTeacher({ courseId }) {
  const { session } = useAuth()
  const [assignments, setAssignments] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [titulo, setTitulo] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [fechaEntrega, setFechaEntrega] = useState('')
  const [puntajeMax, setPuntajeMax] = useState(20)

  const [selectedAssignment, setSelectedAssignment] = useState(null)
  const [submissions, setSubmissions] = useState([])
  const [loadingSubs, setLoadingSubs] = useState(false)
  const [subsError, setSubsError] = useState('')

  const [preview, setPreview] = useState(null)

  useEffect(function () {
    loadAssignments()
  }, [courseId])

  async function loadAssignments() {
    setLoading(true)
    const result = await supabase
      .from('assignments')
      .select('*')
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
    setTitulo('')
    setDescripcion('')
    setFechaEntrega('')
    setPuntajeMax(20)
  }

  function openNewForm() {
    resetForm()
    setShowForm(true)
  }

  function openEditForm(a) {
    setEditingId(a.id)
    setTitulo(a.titulo)
    setDescripcion(a.descripcion || '')
    const d = new Date(a.fecha_entrega)
    const pad = function (n) {
      return String(n).padStart(2, '0')
    }
    const localFormatted =
      d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes())
    setFechaEntrega(localFormatted)
    setPuntajeMax(a.puntaje_maximo)
    setShowForm(true)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    const payload = {
      course_id: courseId,
      titulo: titulo,
      descripcion: descripcion,
      fecha_entrega: fechaEntrega,
      puntaje_maximo: puntajeMax,
    }

    let result
    if (editingId) {
      result = await supabase.from('assignments').update(payload).eq('id', editingId)
    } else {
      payload.created_by = session.user.id
      result = await supabase.from('assignments').insert(payload)
    }

    if (result.error) {
      setError(result.error.message)
    } else {
      resetForm()
      setShowForm(false)
      loadAssignments()
    }
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
    const result = await supabase
      .from('submissions')
      .select('*, student:profiles!submissions_student_id_fkey(full_name, email)')
      .eq('assignment_id', assignment.id)
      .order('submitted_at', { ascending: false })

    if (result.error) {
      setSubsError(result.error.message)
      setSubmissions([])
    } else {
      setSubmissions(result.data)
    }
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

  async function handleGrade(submissionId, score) {
    const numScore = Number(score)
    if (isNaN(numScore) || numScore < 0 || numScore > 20) {
      alert('La nota debe ser un número entre 0 y 20.')
      return
    }
    const result = await supabase
      .from('submissions')
      .update({ score: numScore, graded_by: session.user.id, graded_at: new Date().toISOString() })
      .eq('id', submissionId)
    if (result.error) {
      alert('Error al calificar: ' + result.error.message)
    } else {
      openSubmissions(selectedAssignment)
    }
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
        <p className="text-slate-500 text-sm mb-4">
          Entrega: {new Date(selectedAssignment.fecha_entrega).toLocaleString('es-PE')}
        </p>

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
                  className="rounded-xl p-4 flex justify-between items-center flex-wrap gap-3"
                  style={{ backgroundColor: '#F4F6F9', border: '1px solid #E5E9F0' }}
                >
                  <div>
                    <p className="text-sm font-semibold" style={{ color: NAVY_DARK }}>{s.student ? s.student.full_name : ''}</p>
                    <p className="text-xs text-slate-500">
                      Entregado: {new Date(s.submitted_at).toLocaleString('es-PE')}
                    </p>
                    {s.score != null && (
                      <p className={'text-xs font-semibold ' + getLetterColor(s.score)}>
                        Nota actual: {s.score} — {getLetterGrade(s.score)}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={function () { handlePreview(s.file_url) }}
                      className="text-xs font-semibold px-3 py-1.5 rounded-lg transition"
                      style={{ backgroundColor: 'white', color: NAVY, border: '1px solid #D6DCE5' }}
                    >
                      Ver archivo
                    </button>
                    <input
                      type="number"
                      min="0"
                      max="20"
                      step="0.5"
                      defaultValue={s.score != null ? s.score : ''}
                      placeholder="Nota"
                      className="w-16 rounded-lg text-sm px-2 py-1.5 outline-none"
                      style={inputStyle}
                      onBlur={function (e) {
                        if (e.target.value) handleGrade(s.id, e.target.value)
                      }}
                    />
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

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="rounded-xl p-4 mb-5 space-y-3"
          style={{ backgroundColor: '#F4F6F9', border: '1px solid #E5E9F0' }}
        >
          <h4 className="text-sm font-semibold" style={{ color: NAVY_DARK }}>
            {editingId ? 'Editar tarea' : 'Nueva tarea'}
          </h4>
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
                className="rounded-xl p-4 flex justify-between items-center flex-wrap gap-3"
                style={{ backgroundColor: '#F4F6F9', border: '1px solid #E5E9F0' }}
              >
                <div>
                  <p className="text-sm font-semibold" style={{ color: NAVY_DARK }}>{a.titulo}</p>
                  <p className="text-xs text-slate-500">
                    Entrega: {new Date(a.fecha_entrega).toLocaleString('es-PE')}
                  </p>
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
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}