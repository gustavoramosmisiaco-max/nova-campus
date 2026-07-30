import { createContext, useContext, useEffect, useState, useRef } from 'react'
import { supabase } from './supabaseClient'
import { useAuth } from './AuthContext'

const PresenceContext = createContext({ onlineIds: new Set() })

export function PresenceProvider({ children }) {
  const { session } = useAuth()
  const [onlineIds, setOnlineIds] = useState(new Set())
  const channelRef = useRef(null)

  function calcularOnlineIds(channel) {
    const state = channel.presenceState()
    const ahora = Date.now()
    const idsVigentes = new Set()
    Object.keys(state).forEach(function (id) {
      const presencias = state[id]
      const masReciente = presencias.reduce(function (max, p) {
        const t = new Date(p.online_at).getTime()
        return t > max ? t : max
      }, 0)
      if (ahora - masReciente < 30000) idsVigentes.add(id)
    })
    return idsVigentes
  }

  useEffect(function () {
    if (!session?.user?.id) return

    const channel = supabase.channel('nova-presencia', {
      config: { presence: { key: session.user.id } },
    })
    channelRef.current = channel

    channel
      .on('presence', { event: 'sync' }, function () {
        setOnlineIds(calcularOnlineIds(channel))
      })
      .subscribe(async function (status) {
        if (status === 'SUBSCRIBED') {
          await channel.track({ online_at: new Date().toISOString() })
        }
      })

    function anunciarSalida() {
      channel.untrack()
    }
    window.addEventListener('beforeunload', anunciarSalida)
    window.addEventListener('pagehide', anunciarSalida)

    function alVolverActiva() {
      if (document.visibilityState === 'visible') {
        channel.track({ online_at: new Date().toISOString() })
        setOnlineIds(calcularOnlineIds(channel))
      }
    }
    document.addEventListener('visibilitychange', alVolverActiva)

    const heartbeat = setInterval(function () {
      channel.track({ online_at: new Date().toISOString() })
      setOnlineIds(calcularOnlineIds(channel))
    }, 15000)

    return function () {
      clearInterval(heartbeat)
      window.removeEventListener('beforeunload', anunciarSalida)
      window.removeEventListener('pagehide', anunciarSalida)
      document.removeEventListener('visibilitychange', alVolverActiva)
      channel.untrack()
      supabase.removeChannel(channel)
    }
  }, [session?.user?.id])

  return (
    <PresenceContext.Provider value={{ onlineIds: onlineIds }}>
      {children}
    </PresenceContext.Provider>
  )
}

export function usePresence() {
  const { onlineIds } = useContext(PresenceContext)
  return {
    onlineIds: onlineIds,
    isOnline: function (userId) { return onlineIds.has(userId) },
  }
}
