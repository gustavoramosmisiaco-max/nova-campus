import { useState, lazy, Suspense } from 'react'
import { useAuth } from './AuthContext'
import NotificationBell from './NotificationBell'
import BloqueoPanel from './BloqueoPanel'
import WelcomeAnimation from './WelcomeAnimation'
import FarewellAnimation from './FarewellAnimation'
import ComunicadoPopup from './ComunicadoPopup'
import ErrorBoundary from './ErrorBoundary'
import FondoEstrellas from './FondoEstrellas'

const MyCourses = lazy(function () { return import('./MyCourses') })
const StudentGrades = lazy(function () { return import('./StudentGrades') })
const TareasPendientes = lazy(function () { return import('./TareasPendientes') })
const MisAsistencias = lazy(function () { return import('./MisAsistencias') })
const Mensajes = lazy(function () { return import('./Mensajes') })
const ExamenesEstudiante = lazy(function () { return import('./ExamenesEstudiante') })
const HorarioEstudiante = lazy(function () { return import('./HorarioEstudiante') })
const PanelInicioEstudiante = lazy(function () { return import('./PanelInicioEstudiante') })

const NAVY_DARK = '#0F172A'
const NAVY = '#2563EB'
const GREEN = '#22C55E'
const GREEN_DARK = '#16A34A'

export default function EstudianteDashboard() {
  const { profile, logout } = useAuth()
  const [activeSection, setActiveSection] = useState('inicio')
  const [despidiendo, setDespidiendo] = useState(false)
  const [menuMovilAbierto, setMenuMovilAbierto] = useState(false)

  function handleLogoutConDespedida() {
    setDespidiendo(true)
  }

  const menuItems = [
    { id: 'inicio', label: 'Inicio', icon: HomeIcon },
    { id: 'cursos', label: 'Mis Asignaturas', icon: BookIcon },
    { id: 'pendientes', label: 'Tareas Pendientes', icon: ClipboardIcon },
    { id: 'asistencia', label: 'Mi Asistencia', icon: AsistenciaIcon },
    { id: 'examenes', label: 'Exámenes', icon: ExamIcon },
    { id: 'notas', label: 'Notas', icon: ChartIcon },
    { id: 'mensajes', label: 'Mensajes', icon: MessageIcon },
    { id: 'horario', label: 'Mi Horario', icon: CalendarIcon },
    { id: 'zoom', label: 'Clases en vivo', icon: VideoIcon },
  ]

  const initials = (profile?.full_name || 'AL')
    .split(' ')
    .map(function (w) { return w[0] })
    .slice(0, 2)
    .join('')
    .toUpperCase()

  return (
    <>
    <WelcomeAnimation role="estudiante" nombre={profile?.full_name} />
    <ComunicadoPopup />
    <FarewellAnimation visible={despidiendo} role="estudiante" nombre={profile?.full_name} onComplete={logout} />
    <BloqueoPanel>
    <div className="min-h-screen flex" style={{ backgroundColor: '#F4F6F9' }}>

      {/* Sidebar de escritorio — siempre visible, sin ninguna condición */}
      <aside
        className="relative w-64 flex-shrink-0 flex-col hidden md:flex overflow-hidden"
        style={{ backgroundColor: NAVY_DARK }}
      >
        <FondoEstrellas variante="oscuro" />
        <div className="relative flex items-center gap-3 px-6 py-6 border-b border-white/10" style={{ zIndex: 1 }}>
          <img src="/logo.png" alt="Nexoris Academy" className="w-10 h-10 object-contain rounded-full bg-white p-1" />
          <div>
            <p className="text-white font-bold leading-tight">Nexoris Academy</p>
            <p className="text-xs" style={{ color: GREEN }}>Panel Estudiante</p>
          </div>
        </div>
        <nav className="relative flex-1 px-3 py-6 space-y-1 overflow-y-auto" style={{ zIndex: 1 }}>
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
        <div className="relative px-4 py-5 border-t border-white/10" style={{ zIndex: 1 }}>
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
            style={{ backgroundColor: NAVY_DARK }}
          >
            <div className="flex items-center gap-3 px-6 py-6 border-b border-white/10">
              <img src="/logo.png" alt="Nexoris Academy" className="w-10 h-10 object-contain rounded-full bg-white p-1" />
              <div>
                <p className="text-white font-bold leading-tight">Nexoris Academy</p>
                <p className="text-xs" style={{ color: GREEN }}>Panel Estudiante</p>
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
            <img src="/logo.png" alt="Nexoris Academy" className="w-8 h-8 object-contain rounded-full" />
            <span className="font-bold" style={{ color: NAVY_DARK }}>Nexoris Academy</span>
          </div>

          <div className="hidden md:block">
            <h2 className="text-lg font-bold" style={{ color: NAVY_DARK }}>
              Hola, {profile?.full_name?.split(' ')[0] || 'Alumno'} 👋
            </h2>
            <p className="text-sm text-slate-400">Bienvenido de vuelta a tu aula virtual</p>
          </div>

          <div className="flex items-center gap-3">
            <NotificationBell onNavigate={setActiveSection} />
            <div className="text-right hidden sm:block">
              <p className="text-sm font-semibold" style={{ color: NAVY_DARK }}>{profile?.full_name}</p>
              <p className="text-xs" style={{ color: GREEN_DARK }}>Estudiante</p>
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
        <main
          className="relative flex-1 p-6 md:p-10 overflow-hidden"
          style={{ background: 'linear-gradient(180deg, #FFFFFF 0%, #FAFBFD 35%, #F5F7FB 70%, #F2F5FA 100%)' }}
        >
          <FondoEstrellas variante="claro" />
          <div className="relative" style={{ zIndex: 1 }}>
          <ErrorBoundary key={activeSection}>
            <Suspense fallback={<p className="text-slate-400 text-sm">Cargando...</p>}>
              {activeSection === 'inicio' && <PanelInicioEstudiante onNavegar={function (tab) { setActiveSection(tab) }} />}
              {activeSection === 'cursos' && <MyCourses />}
              {activeSection === 'horario' && <HorarioEstudiante />}
              {activeSection === 'pendientes' && <TareasPendientes />}
              {activeSection === 'asistencia' && <MisAsistencias />}
              {activeSection === 'examenes' && <ExamenesEstudiante />}
              {activeSection === 'notas' && <StudentGrades />}
              {activeSection === 'mensajes' && <Mensajes />}
              {activeSection === 'zoom' && (
                <EmptyState title="Clases en vivo" subtitle="Aquí aparecerán tus próximas sesiones de Zoom." />
              )}
            </Suspense>
          </ErrorBoundary>
          </div>
        </main>
      </div>
    </div>
    </BloqueoPanel>
    </>
  )
}

function EmptyState({ title, subtitle }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-20 rounded-2xl bg-white" style={{ border: '1px dashed #D6DCE5' }}>
      <h3 className="text-lg font-bold" style={{ color: NAVY_DARK }}>{title}</h3>
      <p className="text-sm text-slate-400 mt-1">{subtitle}</p>
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

function ChartIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3v18h18" />
      <path d="M18 17V9" />
      <path d="M13 17V5" />
      <path d="M8 17v-3" />
    </svg>
  )
}

function VideoIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 7l-7 5 7 5V7z" />
      <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
    </svg>
  )
}

function HomeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <path d="M9 22V12h6v10" />
    </svg>
  )
}

function CalendarIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  )
}

function ClipboardIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 2h6a1 1 0 0 1 1 1v2H8V3a1 1 0 0 1 1-1z" />
      <rect x="4" y="5" width="16" height="16" rx="2" />
      <line x1="9" y1="12" x2="15" y2="12" />
      <line x1="9" y1="16" x2="13" y2="16" />
    </svg>
  )
}

function ExamIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 11l3 3L22 4" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
    </svg>
  )
}

function MessageIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M2 6l10 7 10-7" />
    </svg>
  )
}

function AsistenciaIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <polyline points="17 11 19 13 23 9" />
    </svg>
  )
}
