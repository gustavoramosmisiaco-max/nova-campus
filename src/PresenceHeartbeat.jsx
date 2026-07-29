import { useEffect } from 'react'
import { supabase } from './supabaseClient'
import { useAuth } from './AuthContext'

export default function PresenceHeartbeat() {
  const { session } = useAuth()

  useEffect(function () {
    if (!session?.user?.id) return

    async function marcarActivo() {
      await supabase.from('profiles').update({ last_active_at: new Date().toISOString() }).eq('id', session.user.id)
    }

    marcarActivo()
    const interval = setInterval(marcarActivo, 30000)
    return function () { clearInterval(interval) }
  }, [session?.user?.id])

  return null
}

export function estaEnLinea(lastActiveAt) {
  if (!lastActiveAt) return false
  const diffMs = new Date() - new Date(lastActiveAt)
  return diffMs < 2 * 60 * 1000
}
