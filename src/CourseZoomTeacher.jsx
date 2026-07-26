import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import { useAuth } from './AuthContext'

export default function CourseZoomTeacher({ courseId }) {
  const { session } = useAuth()
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [titulo, setTitulo] = useState('')
  const [zoomLink, setZoomLink] = useState('')
  const [scheduledAt, setScheduledAt] = useState('')
  const [duracion, setDuracion] = useState(60)

  useEffect(function () {
    loadSessions()
  }, [courseId])

  async function loadSessions() {
    setLoading(true)
    const result = await supabase.from('zoom_sessions').select('*').eq('course_id', courseId).order('scheduled_at', { ascending: false })
    if (result.error) {
      setError(result.error.message)
    } else {
      setSessions(result.data)
    }
    setLoading(false)
  }

  function resetForm() {
    setEditingId(null)
    setTitulo('')
    setZoomLink('')
    setScheduledAt('')
    setDuracion(60)
  }

  function openNewForm() {
    resetForm()
    setShowForm(true)
  }

  function formatLocalDate(dateString) {
    const d = new Date(dateString)
    const pad = function (n) {
      return String(n).padStart(2, '0')
    }
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes())
  }

  function openEditForm(s) {
    setEditingId(s.id)
    setTitulo(s.titulo)
    setZoomLink(s.zoom_link)
    setScheduledAt(formatLocalDate(s.scheduled_at))
    setDuracion(s.duracion_minutos)
    setShowForm(true)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    const payload = { course_id: courseId, titulo: titulo, zoom_link: zoomLink, scheduled_at: scheduledAt, duracion_minutos: duracion }
    let result
    if (editingId) {
      result = await supabase.from('zoom_sessions').update(payload).eq('id', editingId)
    } else {
      payload.created_by = session.user.id
      result = await supabase.from('zoom_sessions').insert(payload)
    }
    if (result.error) {
      setError(result.error.message)
    } else {
      resetForm()
      setShowForm(false)
      loadSessions()
    }
  }

  async function handleDelete(id) {
    const ok = confirm('Eliminar esta videoclase?')
    if (!ok) return
    const result = await supabase.from('zoom_sessions').delete().eq('id', id)
    if (result.error) {
      alert('Error: ' + result.error.message)
    } else {
      loadSessions()
    }
  }

  function toggleForm() {
    if (showForm) {
      setShowForm(false)
    } else {
      openNewForm()
    }
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-lg font-semibold text-emerald-400">Videoclases</h3>
        <button onClick={toggleForm} className="text-xs bg-emerald-500 hover:bg-emerald-400 text-slate-900 font-semibold px-3 py-1.5 rounded">
          {showForm ? 'Cancelar' : '+ Programar videoclase'}
        </button>
      </div>

      {showForm ? (
        <form onSubmit={handleSubmit} className="bg-slate-800 rounded-xl p-4 mb-4 space-y-3">
          <h4 className="text-sm font-semibold text-slate-300">{editingId ? 'Editar videoclase' : 'Nueva videoclase'}</h4>
          <input type="text" value={titulo} onChange={function (e) { setTitulo(e.target.value) }} required placeholder="Titulo" className="w-full rounded-lg bg-slate-700 text-white px-3 py-2" />
          <input type="url" value={zoomLink} onChange={function (e) { setZoomLink(e.target.value) }} required placeholder="Link de Zoom" className="w-full rounded-lg bg-slate-700 text-white px-3 py-2" />
          <input type="datetime-local" value={scheduledAt} onChange={function (e) { setScheduledAt(e.target.value) }} required className="w-full rounded-lg bg-slate-700 text-white px-3 py-2" />
          <input type="number" value={duracion} onChange={function (e) { setDuracion(e.target.value) }} min={15} step={5} className="w-full rounded-lg bg-slate-700 text-white px-3 py-2" />
          {error ? <p className="text-red-400 text-sm">{error}</p> : null}
          <button type="submit" className="bg-emerald-500 hover:bg-emerald-400 text-slate-900 font-semibold px-4 py-2 rounded-lg">{editingId ? 'Guardar cambios' : 'Programar'}</button>
        </form>
      ) : null}

      {loading ? <p className="text-slate-400 text-sm">Cargando videoclases...</p> : null}
      {!loading && sessions.length === 0 ? <p className="text-slate-400 text-sm">Aun no hay videoclases programadas.</p> : null}

      <ul className="space-y-2">
        {sessions.map(function (s) {
          return (
            <li key={s.id} className="bg-slate-800 rounded-lg p-3 flex justify-between items-center">
              <div>
                <p className="text-sm font-medium">{s.titulo}</p>
                <p className="text-xs text-slate-400">{new Date(s.scheduled_at).toLocaleString('es-PE')} - {s.duracion_minutos} min</p>
              </div>
              <div className="flex gap-2">
                <a href={s.zoom_link} target="_blank" rel="noreferrer" className="text-xs bg-emerald-500 hover:bg-emerald-400 text-slate-900 font-semibold px-3 py-1.5 rounded">Iniciar</a>
                <button onClick={function () { openEditForm(s) }} className="text-xs bg-slate-700 hover:bg-slate-600 px-3 py-1.5 rounded">Editar</button>
                <button onClick={function () { handleDelete(s.id) }} className="text-xs bg-red-900 hover:bg-red-800 px-3 py-1.5 rounded">Eliminar</button>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}