import { createContext, useContext, useEffect, useState, useRef } from 'react'
import { supabase } from './supabaseClient'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const perfilCargadoParaUserId = useRef(null)

  useEffect(() => {
    // Revisa si ya hay una sesión activa al cargar la app
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) {
        loadProfile(session.user.id)
      } else {
        setLoading(false)
      }
    })

    // Escucha cambios de sesión (login, logout, refresco de token)
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session)

      if (!session) {
        perfilCargadoParaUserId.current = null
        setProfile(null)
        setLoading(false)
        return
      }

      // Si ya tenemos el perfil de este mismo usuario cargado, no lo volvemos a pedir.
      // Esto evita que el celular "resetee" pantallas cada vez que la pestaña
      // vuelve de segundo plano (por ejemplo, al abrir el selector de archivos)
      // y Supabase revalida el token en automático.
      if (perfilCargadoParaUserId.current === session.user.id) {
        return
      }

      loadProfile(session.user.id)
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  async function loadProfile(userId) {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()

    if (!error) {
      setProfile(data)
      perfilCargadoParaUserId.current = userId
    }
    setLoading(false)
  }

  async function login(email, password) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error }
  }

  async function logout() {
    await supabase.auth.signOut()
  }

  const value = {
    session,
    profile,
    role: profile?.role || null,
    loading,
    login,
    logout,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  return useContext(AuthContext)
}
