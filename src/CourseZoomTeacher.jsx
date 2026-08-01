import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import { useAuth } from './AuthContext'

const NAVY_DARK = '#0F2A4A'
const NAVY = '#1d5c8f'
const GREEN = '#5DAA47'

const inputStyle = { backgroundColor: 'white', border: '1px solid #D6DCE5', color: NAVY_DARK }

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
    const payload = {
      course_id: courseId,
      titulo: titulo,
      zoom_link: zoomLink,
      scheduled_at: scheduledAt ? `${scheduledAt}:00-05:00` : scheduledAt,
      duracion_minutos: duracion,
    }
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
    const ok = confirm('¿Eliminar esta videoclase?')
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
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-bold" style={{ color: NAVY_DARK }}>Videoclases</h3>
        <button
          onClick={toggleForm}
          className="text-xs font-semibold px-4 py-2 rounded-lg text-white transition hover:opacity-90"
          style={{ backgroundColor: showForm ? '#94A3B8' : GREEN }}
        >
          {showForm ? 'Cancelar' : '+ Programar videoclase'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl p-4 mb-5 space-y-3" style={{ border: '1px solid #E5E9F0' }}>
          <p className="text-sm font-bold" style={{ color: NAVY_DARK }}>{editingId ? 'Editar videoclase' : 'Nueva videoclase'}</p>
          <input
            type="text"
            value={titulo}
            onChange={function (e) { setTitulo(e.target.value) }}
            required
            placeholder="Título"
            className="w-full rounded-lg px-3 py-2 text-sm outline-none"
            style={inputStyle}
          />
          <input
            type="url"
            value={zoomLink}
            onChange={function (e) { setZoomLink(e.target.value) }}
            required
            placeholder="Link de Zoom"
            className="w-full rounded-lg px-3 py-2 text-sm outline-none"
            style={inputStyle}
          />
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: NAVY_DARK }}>Fecha y hora</label>
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={function (e) { setScheduledAt(e.target.value) }}
                required
                className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                style={inputStyle}
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: NAVY_DARK }}>Duración (minutos)</label>
              <input
                type="number"
                value={duracion}
                onChange={function (e) { setDuracion(Number(e.target.value)) }}
                min={15}
                step={5}
                className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                style={inputStyle}
              />
            </div>
          </div>
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <button
            type="submit"
            className="text-sm font-semibold px-4 py-2 rounded-lg text-white transition hover:opacity-90"
            style={{ backgroundColor: GREEN }}
          >
            {editingId ? 'Guardar cambios' : 'Programar'}
          </button>
        </form>
      )}

      {loading && <p className="text-slate-400 text-sm">Cargando videoclases...</p>}
      {!loading && sessions.length === 0 && <p className="text-slate-400 text-sm">Aún no hay videoclases programadas.</p>}

      <ul className="space-y-2">
        {sessions.map(function (s) {
          return (
            <li key={s.id} className="bg-white rounded-xl p-4 flex justify-between items-center flex-wrap gap-2" style={{ border: '1px solid #E5E9F0' }}>
              <div>
                <p className="text-sm font-semibold" style={{ color: NAVY_DARK }}>{s.titulo}</p>
                <p className="text-xs text-slate-400">{new Date(s.scheduled_at).toLocaleString('es-PE')} · {s.duracion_minutos} min</p>
              </div>
              <div className="flex gap-2">
                <a
                  href={s.zoom_link}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white transition hover:opacity-90"
                  style={{ backgroundColor: GREEN }}
                >
                  Iniciar
                </a>
                <button
                  onClick={function () { openEditForm(s) }}
                  className="text-xs font-semibold px-3 py-1.5 rounded-lg transition"
                  style={{ backgroundColor: 'white', color: NAVY_DARK, border: '1px solid #D6DCE5' }}
                >
                  Editar
                </button>
                <button
                  onClick={function () { handleDelete(s.id) }}
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
    </div>
  )
}
