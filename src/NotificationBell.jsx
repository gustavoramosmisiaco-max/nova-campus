import { useEffect, useState, useRef } from 'react'
import { supabase } from './supabaseClient'
import { useAuth } from './AuthContext'

const NAVY_DARK = '#0F2A4A'
const NAVY = '#1d5c8f'
const GREEN = '#5DAA47'

const TIPO_COLOR = {
  tarea_nueva: '#1d5c8f',
  nota_publicada: '#2f7a1f',
  justificacion: '#B45309',
  mensaje: '#8a5cb0',
  default: '#5F5E5A',
}

function tiempoRelativo(fecha) {
  const ahora = new Date()
  const then = new Date(fecha)
  const segundos = Math.floor((ahora - then) / 1000)
  if (segundos < 60) return 'hace un momento'
  const minutos = Math.floor(segundos / 60)
  if (minutos < 60) return `hace ${minutos} min`
  const horas = Math.floor(minutos / 60)
  if (horas < 24) return `hace ${horas} h`
  const dias = Math.floor(horas / 24)
  if (dias === 1) return 'ayer'
  return `hace ${dias} días`
}

const TIPO_A_PESTANA = {
  tarea_nueva: 'pendientes',
  nota_publicada: 'notas',
  justificacion: 'pendientes',
  mensaje: 'mensajes',
}

export default function NotificationBell({ onNavigate }) {
  const { session } = useAuth()
  const [open, setOpen] = useState(false)
  const [notificaciones, setNotificaciones] = useState([])
  const [loading, setLoading] = useState(true)
  const containerRef = useRef(null)

  useEffect(function () {
    cargar()
    const interval = setInterval(cargar, 30000)
    return function () { clearInterval(interval) }
  }, [])

  useEffect(function () {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return function () { document.removeEventListener('mousedown', handleClickOutside) }
  }, [])

  async function cargar() {
    const result = await supabase
      .from('notificaciones')
      .select('*')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false })
      .limit(30)
    if (!result.error) setNotificaciones(result.data)
    setLoading(false)
  }

  async function marcarLeida(id) {
    setNotificaciones(function (prev) { return prev.map(function (n) { return n.id === id ? { ...n, leido: true } : n }) })
    await supabase.from('notificaciones').update({ leido: true }).eq('id', id)
  }

  async function marcarTodasLeidas() {
    setNotificaciones(function (prev) { return prev.map(function (n) { return { ...n, leido: true } }) })
    await supabase.from('notificaciones').update({ leido: true }).eq('user_id', session.user.id).eq('leido', false)
  }

  const noLeidas = notificaciones.filter(function (n) { return !n.leido }).length

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <button
        onClick={function () { setOpen(!open) }}
        className="relative w-10 h-10 rounded-full flex items-center justify-center transition hover:opacity-80"
        style={{ backgroundColor: '#F4F6F9' }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={NAVY_DARK} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {noLeidas > 0 && (
          <span
            className="absolute flex items-center justify-center text-white font-bold rounded-full"
            style={{ top: -2, right: -2, minWidth: 16, height: 16, fontSize: 9, backgroundColor: '#B91C1C', padding: '0 3px' }}
          >
            {noLeidas > 9 ? '9+' : noLeidas}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute rounded-2xl overflow-hidden"
          style={{ top: 48, right: 0, width: 340, maxHeight: 420, backgroundColor: 'white', border: '1px solid #E5E9F0', boxShadow: '0 8px 24px rgba(15,42,74,0.15)', zIndex: 50 }}
        >
          <div className="flex justify-between items-center px-4 py-3" style={{ borderBottom: '1px solid #E5E9F0' }}>
            <p className="text-sm font-bold" style={{ color: NAVY_DARK }}>Notificaciones</p>
            {noLeidas > 0 && (
              <button onClick={marcarTodasLeidas} className="text-xs font-semibold" style={{ color: NAVY }}>
                Marcar todas leídas
              </button>
            )}
          </div>
          <div style={{ maxHeight: 360, overflowY: 'auto' }}>
            {loading ? (
              <p className="text-xs text-slate-400 p-4">Cargando...</p>
            ) : notificaciones.length === 0 ? (
              <p className="text-xs text-slate-400 p-4">No tienes notificaciones.</p>
            ) : (
              notificaciones.map(function (n) {
                const color = TIPO_COLOR[n.tipo] || TIPO_COLOR.default
                return (
                  <button
                    key={n.id}
                    onClick={function () {
                      if (!n.leido) marcarLeida(n.id)
                      const destino = TIPO_A_PESTANA[n.tipo]
                      if (destino && onNavigate) onNavigate(destino)
                      setOpen(false)
                    }}
                    className="w-full text-left px-4 py-3 transition"
                    style={{ borderBottom: '1px solid #F4F6F9', backgroundColor: n.leido ? 'white' : '#F4F6F9' }}
                  >
                    <div className="flex items-start gap-2">
                      <span className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0" style={{ backgroundColor: n.leido ? '#E5E9F0' : color }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold" style={{ color: NAVY_DARK }}>{n.titulo}</p>
                        {n.mensaje && <p className="text-xs text-slate-500 mt-0.5">{n.mensaje}</p>}
                        <p className="text-xs text-slate-400 mt-1">{tiempoRelativo(n.created_at)}</p>
                      </div>
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
