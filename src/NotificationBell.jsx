import { useEffect, useState, useRef } from 'react'
import { supabase } from './supabaseClient'
import { useAuth } from './AuthContext'

const NAVY_DARK = '#0F172A'
const NAVY = '#2563EB'
const GREEN = '#22C55E'

const TIPO_COLOR = {
  tarea_nueva: '#2563EB',
  nota_publicada: '#16A34A',
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

const TIPO_A_PESTANA_ESTUDIANTE = {
  tarea_nueva: 'pendientes',
  nota_publicada: 'notas',
  justificacion: 'pendientes',
  mensaje: 'mensajes',
}

const TIPO_A_PESTANA_DOCENTE = {
  tarea_nueva: 'tareas',
  nota_publicada: 'tareas',
  justificacion: 'tareas',
  mensaje: 'mensajes',
}

export default function NotificationBell({ onNavigate }) {
  const { session, profile } = useAuth()
  const [open, setOpen] = useState(false)
  const [notificaciones, setNotificaciones] = useState([])
  const [loading, setLoading] = useState(true)
  const [sonando, setSonando] = useState(false)
  const containerRef = useRef(null)
  const audioCtxRef = useRef(null)

  function reproducirSonido() {
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)()
      }
      const ctx = audioCtxRef.current
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.type = 'sine'
      osc.frequency.setValueAtTime(880, ctx.currentTime)
      osc.frequency.setValueAtTime(1180, ctx.currentTime + 0.08)
      gain.gain.setValueAtTime(0.001, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35)
      osc.start(ctx.currentTime)
      osc.stop(ctx.currentTime + 0.35)
    } catch (e) {
      // navegador sin soporte de audio, silenciosamente no suena
    }
  }

  useEffect(function () {
    cargar()

    const channel = supabase
      .channel(`notificaciones-${session.user.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notificaciones', filter: `user_id=eq.${session.user.id}` }, function (payload) {
        setNotificaciones(function (prev) { return [payload.new, ...prev] })
        reproducirSonido()
        setSonando(true)
        setTimeout(function () { setSonando(false) }, 900)
      })
      .subscribe()

    return function () { supabase.removeChannel(channel) }
  }, [session.user.id])

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
        style={{ backgroundColor: '#EDF9F1' }}
      >
        <style>{`
          @keyframes nexoris-campanear { 0%,100% { transform: rotate(0deg); } 20% { transform: rotate(-14deg); } 40% { transform: rotate(10deg); } 60% { transform: rotate(-7deg); } 80% { transform: rotate(4deg); } }
          .nexoris-bell-sonando { animation: nexoris-campanear 0.6s ease-in-out; transform-origin: 50% 15%; }
        `}</style>
        <svg width="22" height="22" viewBox="0 0 60 60" className={sonando ? 'nexoris-bell-sonando' : ''}>
          <path d="M30 10c-7 0-11 5.5-11 13v8l-4 8h30l-4-8v-8c0-7.5-4-13-11-13z" fill="#3B6D11" />
          <path d="M30 8c-7 0-11 5.5-11 13v8l-4 8h30l-4-8v-8c0-7.5-4-13-11-13z" fill="#639922" />
          <circle cx="30" cy="9" r="3" fill="#27500A" />
          <path d="M25 39a5 5 0 0 0 10 0z" fill="#27500A" />
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
          className="fixed sm:absolute rounded-2xl overflow-hidden top-16 sm:top-12 left-3 right-3 sm:left-auto sm:right-0 w-auto sm:w-[340px] max-h-[70vh] sm:max-h-[420px]"
          style={{
            backgroundColor: 'white',
            border: '1px solid #E5E9F0',
            boxShadow: '0 8px 24px rgba(15,42,74,0.15)',
            zIndex: 50,
          }}
        >
          <div className="flex justify-between items-center px-4 py-3" style={{ borderBottom: '1px solid #E5E9F0' }}>
            <p className="text-sm font-bold" style={{ color: NAVY_DARK }}>Notificaciones</p>
            {noLeidas > 0 && (
              <button onClick={marcarTodasLeidas} className="text-xs font-semibold" style={{ color: NAVY }}>
                Marcar todas leídas
              </button>
            )}
          </div>
          <div className="max-h-[calc(70vh-52px)] sm:max-h-[360px]" style={{ overflowY: 'auto' }}>
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
                      const mapaPestanas = profile?.role === 'docente' ? TIPO_A_PESTANA_DOCENTE : TIPO_A_PESTANA_ESTUDIANTE
                      const destino = mapaPestanas[n.tipo]
                      if (destino && onNavigate) onNavigate(destino, n.referencia_id)
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
