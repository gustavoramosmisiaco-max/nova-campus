import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'

const NAVY_DARK = '#0F2A4A'
const GREEN = '#5DAA47'

export default function CourseZoomStudent({ courseId }) {
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(function () {
    loadSessions()
  }, [courseId])

  async function loadSessions() {
    setLoading(true)
    const result = await supabase.from('zoom_sessions').select('*').eq('course_id', courseId).order('scheduled_at', { ascending: true })
    if (result.error) {
      setError(result.error.message)
    } else {
      setSessions(result.data)
    }
    setLoading(false)
  }

  function joinSession(link) {
    window.open(link, '_blank', 'noopener,noreferrer')
  }

  if (loading) return <p className="text-slate-400 text-sm">Cargando videoclases...</p>
  if (error) return <p className="text-red-500 text-sm">{error}</p>

  const now = new Date()

  return (
    <div>
      <h3 className="text-lg font-bold mb-4" style={{ color: NAVY_DARK }}>Videoclases</h3>
      {sessions.length === 0 ? (
        <p className="text-slate-400 text-sm">Aún no hay videoclases programadas para este curso.</p>
      ) : (
        <ul className="space-y-3">
          {sessions.map(function (s) {
            const sessionDate = new Date(s.scheduled_at)
            const isPast = sessionDate < now
            return (
              <li
                key={s.id}
                className="rounded-xl p-4 flex justify-between items-center"
                style={{ backgroundColor: '#F4F6F9', border: '1px solid #E5E9F0' }}
              >
                <div>
                  <p className="text-sm font-semibold" style={{ color: NAVY_DARK }}>{s.titulo}</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {sessionDate.toLocaleString('es-PE')} · {s.duracion_minutos} min
                    {isPast ? <span className="text-slate-400 ml-2">(Finalizada)</span> : null}
                  </p>
                </div>
                <button
                  onClick={function () { joinSession(s.zoom_link) }}
                  className="text-xs font-semibold px-4 py-2 rounded-lg text-white transition hover:opacity-90"
                  style={{ backgroundColor: isPast ? '#94A3B8' : GREEN }}
                >
                  {isPast ? 'Finalizada' : 'Unirse'}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}