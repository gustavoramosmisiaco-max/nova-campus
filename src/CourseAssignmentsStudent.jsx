import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import { useAuth } from './AuthContext'
import { getLetterGrade, getLetterColor } from './gradeUtils'
import PreviewModal from './PreviewModal'

const NAVY_DARK = '#0F2A4A'
const NAVY = '#1d5c8f'
const GREEN = '#5DAA47'

export default function CourseAssignmentsStudent({ courseId, actividadId }) {
  const { session } = useAuth()
  const [assignments, setAssignments] = useState([])
  const [submissionsMap, setSubmissionsMap] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [uploadingId, setUploadingId] = useState(null)
  const [preview, setPreview] = useState(null)

  useEffect(function () {
    loadAssignments()
  }, [courseId, actividadId])

  async function loadAssignments() {
    setLoading(true)
    setError('')

    let query = supabase
      .from('assignments')
      .select('*')
      .order('fecha_entrega', { ascending: false })
    query = actividadId ? query.eq('actividad_id', actividadId) : query.eq('course_id', courseId)

    const result = await query
    if (result.error) {
      setError(result.error.message)
      setLoading(false)
      return
    }

    setAssignments(result.data)

    const ids = result.data.map(function (a) { return a.id })
    if (ids.length > 0) {
      const subsResult = await supabase
        .from('submissions')
        .select('*')
        .eq('student_id', session.user.id)
        .in('assignment_id', ids)

      if (!subsResult.error) {
        const map = {}
        subsResult.data.forEach(function (s) {
          map[s.assignment_id] = s
        })
        setSubmissionsMap(map)
      }
    }

    setLoading(false)
  }

  function getFileExtension(path) {
    const clean = path.split('?')[0]
    const parts = clean.split('.')
    const last = parts[parts.length - 1]
    return last ? last.toLowerCase() : ''
  }

  async function handleUpload(assignment, file) {
    if (!file) return
    setUploadingId(assignment.id)
    setError('')

    const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_')
    const path = `${assignment.course_id}/${assignment.id}/${session.user.id}_${Date.now()}_${safeName}`

    const uploadResult = await supabase.storage.from('entregas').upload(path, file, { upsert: true })
    if (uploadResult.error) {
      setError('Error al subir el archivo: ' + uploadResult.error.message)
      setUploadingId(null)
      return
    }

    const existing = submissionsMap[assignment.id]
    let dbResult
    if (existing) {
      dbResult = await supabase
        .from('submissions')
        .update({ file_url: path, submitted_at: new Date().toISOString() })
        .eq('id', existing.id)
    } else {
      dbResult = await supabase.from('submissions').insert({
        assignment_id: assignment.id,
        student_id: session.user.id,
        file_url: path,
        submitted_at: new Date().toISOString(),
      })
    }

    if (dbResult.error) {
      setError('Error al registrar la entrega: ' + dbResult.error.message)
    } else {
      loadAssignments()
    }
    setUploadingId(null)
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

  if (loading) return <p className="text-slate-400 text-sm">Cargando tareas...</p>

  return (
    <div>
      <h3 className="text-lg font-bold mb-4" style={{ color: NAVY_DARK }}>Tareas</h3>

      {error && <p className="text-red-500 text-sm mb-3">{error}</p>}

      {assignments.length === 0 ? (
        <p className="text-slate-400 text-sm">Aún no hay tareas aquí.</p>
      ) : (
        <ul className="space-y-3">
          {assignments.map(function (a) {
            const submission = submissionsMap[a.id]
            const dueDate = new Date(a.fecha_entrega)
            const isPast = dueDate < new Date()
            const isGraded = submission && submission.score != null
            const isUploading = uploadingId === a.id

            return (
              <li
                key={a.id}
                className="rounded-xl p-4"
                style={{ backgroundColor: '#F4F6F9', border: '1px solid #E5E9F0' }}
              >
                <div className="flex justify-between items-start gap-4 flex-wrap">
                  <div>
                    <p className="text-sm font-semibold" style={{ color: NAVY_DARK }}>{a.titulo}</p>
                    {a.descripcion && (
                      <p className="text-sm text-slate-500 mt-1">{a.descripcion}</p>
                    )}
                    {a.instrumento_evaluacion && (
                      <p className="text-xs text-slate-500 mt-1">Instrumento: {a.instrumento_evaluacion}</p>
                    )}
                    <p className="text-xs text-slate-500 mt-1">
                      Entrega: {dueDate.toLocaleString('es-PE')}
                      {isPast && !submission ? (
                        <span className="ml-2 font-semibold text-red-500">Vencida</span>
                      ) : null}
                    </p>
                  </div>

                  <div className="text-right">
                    {isGraded ? (
                      <p className={'text-sm font-bold ' + getLetterColor(submission.score)}>
                        {getLetterGrade(submission.score)}
                      </p>
                    ) : submission ? (
                      <span
                        className="text-xs font-semibold px-3 py-1 rounded-full"
                        style={{ backgroundColor: '#E7F3E4', color: '#2f7a1f' }}
                      >
                        Entregada
                      </span>
                    ) : (
                      <span
                        className="text-xs font-semibold px-3 py-1 rounded-full"
                        style={{ backgroundColor: '#FDECEC', color: '#B91C1C' }}
                      >
                        Sin entregar
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3 mt-3 flex-wrap">
                  {submission && (
                    <button
                      onClick={function () { handlePreview(submission.file_url) }}
                      className="text-xs font-semibold px-3 py-1.5 rounded-lg transition"
                      style={{ backgroundColor: 'white', color: NAVY, border: '1px solid #D6DCE5' }}
                    >
                      Ver mi archivo
                    </button>
                  )}

                  {!isGraded && (
                    <label
                      className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white cursor-pointer transition hover:opacity-90"
                      style={{ backgroundColor: isUploading ? '#94A3B8' : GREEN }}
                    >
                      {isUploading ? 'Subiendo...' : submission ? 'Reemplazar entrega' : 'Subir entrega'}
                      <input
                        type="file"
                        className="hidden"
                        disabled={isUploading}
                        onChange={function (e) { handleUpload(a, e.target.files[0]) }}
                      />
                    </label>
                  )}
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
