import { createContext, useContext, useEffect, useState, useRef } from 'react'
import { supabase } from './supabaseClient'
import { useAuth } from './AuthContext'

const PresenceContext = createContext({ onlineIds: new Set() })

export function PresenceProvider({ children }) {
  const { session } = useAuth()
  const [onlineIds, setOnlineIds] = useState(new Set())
  const channelRef = useRef(null)

  useEffect(function () {
    if (!session?.user?.id) return

    const channel = supabase.channel('nova-presencia', {
      config: { presence: { key: session.user.id } },
    })
    channelRef.current = channel

    channel
      .on('presence', { event: 'sync' }, function () {
        const state = channel.presenceState()
        setOnlineIds(new Set(Object.keys(state)))
      })
      .subscribe(async function (status) {
        if (status === 'SUBSCRIBED') {
          await channel.track({ online_at: new Date().toISOString() })
        }
      })

    return function () {
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
