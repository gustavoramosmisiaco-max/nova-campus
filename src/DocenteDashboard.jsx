import { useState, useEffect } from 'react'
import { useAuth } from './AuthContext'
import MyTeachingCourses from './MyTeachingCourses'
import MisTareas from './MisTareas'
import NotificationBell from './NotificationBell'
import Mensajes from './Mensajes'
import WelcomeAnimation from './WelcomeAnimation'
import FarewellAnimation from './FarewellAnimation'
import RegistroConducta from './RegistroConducta'
import ComunicadoDocente from './ComunicadoDocente'

const NAVY_DARK = '#0F2A4A'
const NAVY = '#1d5c8f'
const GREEN = '#5DAA47'
const GREEN_DARK = '#2f7a1f'

export default function DocenteDashboard() {
  const { profile, logout } = useAuth()
  const [despidiendo, setDespidiendo] = useState(false)
  const [menuMovilAbierto, setMenuMovilAbierto] = useState(false)
  const [tareaDestacadaId, setTareaDestacadaId] = useState(null)

  function handleNavigate(tab, referenciaId) {
    setActiveSection(tab)
    if (referenciaId) setTareaDestacadaId(referenciaId)
  }

  function handleLogoutConDespedida() {
    setDespidiendo(true)
  }
  const [activeSection, setActiveSection] = useState('cursos')
  const [errorVisible, setErrorVisible] = useState('')

  useEffect(function () {
    function handleError(event) {
      setErrorVisible(String(event.error?.stack || event.message || event))
    }
    function handleRejection(event) {
      setErrorVisible(String(event.reason?.stack || event.reason || event))
    }
    window.addEventListener('error', handleError)
    window.addEventListener('unhandledrejection', handleRejection)
    return function () {
      window.removeEventListener('error', handleError)
      window.removeEventListener('unhandledrejection', handleRejection)
    }
  }, [])

  if (errorVisible) {
    return (
      <div style={{ padding: 24, fontFamily: 'monospace', backgroundColor: '#FDECEC', color: '#B91C1C', minHeight: '100vh', whiteSpace: 'pre-wrap' }}>
        <h2 style={{ marginBottom: 12 }}>Se encontró un error (copia todo este texto):</h2>
        {errorVisible}
      </div>
    )
  }

  const menuItems = [
    { id: 'cursos', label: 'Mis Asignaturas', icon: BookIcon },
    { id: 'tareas', label: 'Mis Tareas', icon: TaskIcon },
    { id: 'conducta', label: 'Registro de Conducta', icon: TaskIcon },
    { id: 'comunicados', label: 'Comunicados', icon: TaskIcon },
    { id: 'mensajes', label: 'Mensajes', icon: TaskIcon },
  ]

  const initials = (profile?.full_name || 'DO')
    .split(' ')
    .map(function (w) { return w[0] })
    .slice(0, 2)
    .join('')
    .toUpperCase()

  return (
    <div className="min-h-screen flex" style={{ backgroundColor: '#F4F6F9' }}>
      <WelcomeAnimation role="docente" nombre={profile?.full_name} />
      <FarewellAnimation visible={despidiendo} role="docente" nombre={profile?.full_name} onComplete={logout} />

      {/* Sidebar de escritorio — siempre visible, sin ninguna condición */}
      <aside
        className="w-64 flex-shrink-0 flex-col hidden md:flex"
        style={{ background: `linear-gradient(180deg, ${NAVY_DARK}, #08182c)` }}
      >
        <div className="flex items-center gap-3 px-6 py-6 border-b border-white/10">
          <img src="/logo.png" alt="Nova Campus" className="w-10 h-10 object-contain rounded-full bg-white p-1" />
          <div>
            <p className="text-white font-bold leading-tight">Nova Campus</p>
            <p className="text-xs" style={{ color: GREEN }}>Panel Docente</p>
          </div>
        </div>
        <nav className="flex-1 px-3 py-6 space-y-1 overflow-y-auto">
          {menuItems.map(function (item) {
            const Icon = item.icon
            const active = activeSection === item.id
            return (
              <button
                key={item.id}
                onClick={function () { setActiveSection(item.id) }}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition"
                style={active ? { background: `linear-gradient(90deg, ${NAVY}, ${GREEN})`, color: 'white' } : { color: '#B9C4D3' }}
              >
                <Icon />
                {item.label}
              </button>
            )
          })}
        </nav>
        <div className="px-4 py-5 border-t border-white/10">
          <button
            onClick={handleLogoutConDespedida}
            className="w-full flex items-center justify-center gap-2 text-sm font-semibold rounded-xl py-2.5 transition hover:opacity-90"
            style={{ backgroundColor: 'rgba(255,255,255,0.08)', color: 'white' }}
          >
            Cerrar sesión
          </button>
        </div>
      </aside>

      {/* Fondo oscuro + Sidebar de celular — solo existen si el menú móvil está abierto */}
      {menuMovilAbierto && (
        <>
          <div
            className="fixed inset-0 z-40 md:hidden"
            style={{ backgroundColor: 'rgba(15,42,74,0.6)' }}
            onClick={function () { setMenuMovilAbierto(false) }}
          />
          <aside
            className="w-64 flex-shrink-0 flex flex-col fixed inset-y-0 left-0 z-50 md:hidden"
            style={{ background: `linear-gradient(180deg, ${NAVY_DARK}, #08182c)` }}
          >
            <div className="flex items-center gap-3 px-6 py-6 border-b border-white/10">
              <img src="/logo.png" alt="Nova Campus" className="w-10 h-10 object-contain rounded-full bg-white p-1" />
              <div>
                <p className="text-white font-bold leading-tight">Nova Campus</p>
                <p className="text-xs" style={{ color: GREEN }}>Panel Docente</p>
              </div>
            </div>
            <nav className="flex-1 px-3 py-6 space-y-1 overflow-y-auto">
              {menuItems.map(function (item) {
                const Icon = item.icon
                const active = activeSection === item.id
                return (
                  <button
                    key={item.id}
                    onClick={function () { setActiveSection(item.id); setMenuMovilAbierto(false) }}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition"
                    style={active ? { background: `linear-gradient(90deg, ${NAVY}, ${GREEN})`, color: 'white' } : { color: '#B9C4D3' }}
                  >
                    <Icon />
                    {item.label}
                  </button>
                )
              })}
            </nav>
            <div className="px-4 py-5 border-t border-white/10">
              <button
                onClick={handleLogoutConDespedida}
                className="w-full flex items-center justify-center gap-2 text-sm font-semibold rounded-xl py-2.5 transition hover:opacity-90"
                style={{ backgroundColor: 'rgba(255,255,255,0.08)', color: 'white' }}
              >
                Cerrar sesión
              </button>
            </div>
          </aside>
        </>
      )}

      {/* Contenido principal */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* Header */}
        <header
          className="flex items-center justify-between px-6 md:px-10 py-5 bg-white"
          style={{ borderBottom: '1px solid #E5E9F0' }}
        >
          <div className="flex items-center gap-3 md:hidden">
            <button
              onClick={function () { setMenuMovilAbierto(true) }}
              className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: '#F4F6F9' }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={NAVY_DARK} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
            <img src="/logo.png" alt="Nova Campus" className="w-8 h-8 object-contain rounded-full" />
            <span className="font-bold" style={{ color: NAVY_DARK }}>Nova Campus</span>
          </div>

          <div className="hidden md:block">
            <h2 className="text-lg font-bold" style={{ color: NAVY_DARK }}>
              Hola, {profile?.full_name?.split(' ')[0] || 'Docente'} 👋
            </h2>
            <p className="text-sm text-slate-400">Bienvenido de vuelta a tu panel de docente</p>
          </div>

          <div className="flex items-center gap-3">
            <NotificationBell onNavigate={handleNavigate} />
            <div className="text-right hidden sm:block">
              <p className="text-sm font-semibold" style={{ color: NAVY_DARK }}>{profile?.full_name}</p>
              <p className="text-xs" style={{ color: GREEN_DARK }}>Docente</p>
            </div>
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm"
              style={{ background: `linear-gradient(135deg, ${NAVY}, ${GREEN})` }}
            >
              {initials}
            </div>
            <button
              onClick={handleLogoutConDespedida}
              className="md:hidden text-xs font-semibold px-3 py-2 rounded-lg"
              style={{ backgroundColor: '#F4F6F9', color: NAVY_DARK }}
            >
              Salir
            </button>
          </div>
        </header>

        {/* Contenido */}
        <main className="flex-1 p-6 md:p-10">
          {activeSection === 'cursos' && <MyTeachingCourses />}
          {activeSection === 'tareas' && (
            <MisTareas
              tareaDestacadaId={tareaDestacadaId}
              onTareaDestacadaAtendida={function () { setTareaDestacadaId(null) }}
            />
          )}
          {activeSection === 'conducta' && <RegistroConducta />}
          {activeSection === 'comunicados' && <ComunicadoDocente />}
          {activeSection === 'mensajes' && <Mensajes />}
        </main>
      </div>
    </div>
  )
}

function BookIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  )
}

function TaskIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 11l3 3L22 4" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
  )
}
