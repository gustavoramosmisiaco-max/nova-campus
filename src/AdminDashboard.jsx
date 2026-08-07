import { useState, lazy, Suspense } from 'react'
import { useAuth } from './AuthContext'
import WelcomeAnimation from './WelcomeAnimation'
import FarewellAnimation from './FarewellAnimation'
import ErrorBoundary from './ErrorBoundary'

const CoursesManager = lazy(function () { return import('./CoursesManager') })
const EnrollmentsManager = lazy(function () { return import('./EnrollmentsManager') })
const AsignaturasManager = lazy(function () { return import('./AsignaturasManager') })
const CierrePeriodo = lazy(function () { return import('./CierrePeriodo') })
const ImportarEstudiantes = lazy(function () { return import('./ImportarEstudiantes') })
const ImportarDocentes = lazy(function () { return import('./ImportarDocentes') })
const EstudiantesList = lazy(function () { return import('./EstudiantesList') })
const DocentesList = lazy(function () { return import('./DocentesList') })
const ReportesManager = lazy(function () { return import('./ReportesManager') })
const InstitucionesManager = lazy(function () { return import('./InstitucionesManager') })
const HabilitarCursos = lazy(function () { return import('./HabilitarCursos') })
const VaciarPeriodo = lazy(function () { return import('./VaciarPeriodo') })
const RecreosManager = lazy(function () { return import('./RecreosManager') })
const FeriadosManager = lazy(function () { return import('./FeriadosManager') })
const TalleresVeranoManager = lazy(function () { return import('./TalleresVeranoManager') })
const PromotoresManager = lazy(function () { return import('./PromotoresManager') })

const NAVY_DARK = '#0F172A'
const NAVY = '#2563EB'
const GREEN = '#22C55E'
const GREEN_DARK = '#16A34A'

export default function AdminDashboard() {
  const { profile, logout } = useAuth()
  const [despidiendo, setDespidiendo] = useState(false)
  const [menuMovilAbierto, setMenuMovilAbierto] = useState(false)

  function handleLogoutConDespedida() {
    setDespidiendo(true)
  }
  const [tab, setTab] = useState('cursos')

  const menuItems = [
    { id: 'cursos', label: 'Gestión de Aulas', icon: BookIcon },
    { id: 'matriculas', label: 'Matrículas', icon: ClipboardIcon },
    { id: 'asignaturas', label: 'Asignaturas', icon: LayersIcon },
    { id: 'estudiantes', label: 'Estudiantes', icon: UsersIcon },
    { id: 'docentes', label: 'Docentes', icon: UserCheckIcon },
    { id: 'importar', label: 'Importar Estudiantes', icon: UploadIcon },
    { id: 'importar-docentes', label: 'Importar Docentes', icon: UploadIcon },
    { id: 'reportes', label: 'Reportes', icon: ChartBarIcon },
    { id: 'instituciones', label: 'Instituciones', icon: BuildingIcon },
    { id: 'habilitar-cursos', label: 'Habilitar Cursos', icon: ToggleIcon },
    { id: 'vaciar-periodo', label: 'Vaciar Periodo', icon: TrashIcon },
    { id: 'recreos', label: 'Recreos', icon: CoffeeIcon },
    { id: 'feriados', label: 'Feriados', icon: CalendarIcon },
    { id: 'verano', label: 'Cursos de Verano', icon: SunIcon },
    { id: 'promotores', label: 'Promotores', icon: UserCheckIcon },
    { id: 'periodo', label: 'Cierre de Periodo', icon: CalendarIcon },
  ]

  const initials = (profile?.full_name || 'AD')
    .split(' ')
    .map(function (w) { return w[0] })
    .slice(0, 2)
    .join('')
    .toUpperCase()

  return (
    <div className="min-h-screen flex" style={{ backgroundColor: '#F4F6F9' }}>
      <WelcomeAnimation role="admin" nombre={profile?.full_name} />
      <FarewellAnimation visible={despidiendo} role="admin" nombre={profile?.full_name} onComplete={logout} />

      {/* Sidebar de escritorio — siempre visible, sin ninguna condición */}
      <aside
        className="w-64 flex-shrink-0 flex-col hidden md:flex"
        style={{ background: `linear-gradient(180deg, ${NAVY_DARK}, #08182c)` }}
      >
        <div className="flex items-center gap-3 px-6 py-6 border-b border-white/10">
          <img src="/logo.png" alt="Nexoris Academy" className="w-10 h-10 object-contain rounded-full bg-white p-1" />
          <div>
            <p className="text-white font-bold leading-tight">Nexoris Academy</p>
            <p className="text-xs" style={{ color: GREEN }}>Panel Admin</p>
          </div>
        </div>
        <nav className="flex-1 px-3 py-6 space-y-1 overflow-y-auto">
          {menuItems.map(function (item) {
            const Icon = item.icon
            const active = tab === item.id
            return (
              <button
                key={item.id}
                onClick={function () { setTab(item.id) }}
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
              <img src="/logo.png" alt="Nexoris Academy" className="w-10 h-10 object-contain rounded-full bg-white p-1" />
              <div>
                <p className="text-white font-bold leading-tight">Nexoris Academy</p>
                <p className="text-xs" style={{ color: GREEN }}>Panel Admin</p>
              </div>
            </div>
            <nav className="flex-1 px-3 py-6 space-y-1 overflow-y-auto">
              {menuItems.map(function (item) {
                const Icon = item.icon
                const active = tab === item.id
                return (
                  <button
                    key={item.id}
                    onClick={function () { setTab(item.id); setMenuMovilAbierto(false) }}
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
              Hola, {profile?.full_name?.split(' ')[0] || 'Admin'} 👋
            </h2>
            <p className="text-sm text-slate-400">Panel de administración de Nexoris Academy</p>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-semibold" style={{ color: NAVY_DARK }}>{profile?.full_name}</p>
              <p className="text-xs" style={{ color: GREEN_DARK }}>Administrador</p>
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
          <ErrorBoundary key={tab}>
            <Suspense fallback={<p className="text-slate-400 text-sm">Cargando...</p>}>
              {tab === 'cursos' && <CoursesManager />}
              {tab === 'matriculas' && <EnrollmentsManager />}
              {tab === 'asignaturas' && <AsignaturasManager />}
              {tab === 'estudiantes' && <EstudiantesList />}
              {tab === 'docentes' && <DocentesList />}
              {tab === 'importar' && <ImportarEstudiantes />}
              {tab === 'importar-docentes' && <ImportarDocentes />}
              {tab === 'reportes' && <ReportesManager />}
              {tab === 'instituciones' && <InstitucionesManager />}
              {tab === 'habilitar-cursos' && <HabilitarCursos />}
              {tab === 'vaciar-periodo' && <VaciarPeriodo />}
              {tab === 'recreos' && <RecreosManager />}
            {tab === 'feriados' && <FeriadosManager />}
            {tab === 'verano' && <TalleresVeranoManager />}
            {tab === 'promotores' && <PromotoresManager />}
              {tab === 'periodo' && <CierrePeriodo />}
            </Suspense>
          </ErrorBoundary>
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

function UsersIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
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

function LayersIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 2 7 12 12 22 7 12 2" />
      <polyline points="2 17 12 22 22 17" />
      <polyline points="2 12 12 17 22 12" />
    </svg>
  )
}

function UserCheckIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="8.5" cy="7" r="4" />
      <polyline points="17 11 19 13 23 9" />
    </svg>
  )
}

function UploadIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  )
}

function ChartBarIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="20" x2="12" y2="10" />
      <line x1="18" y1="20" x2="18" y2="4" />
      <line x1="6" y1="20" x2="6" y2="16" />
    </svg>
  )
}

function BuildingIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="2" width="16" height="20" rx="1" />
      <line x1="9" y1="7" x2="9" y2="7" />
      <line x1="15" y1="7" x2="15" y2="7" />
      <line x1="9" y1="12" x2="9" y2="12" />
      <line x1="15" y1="12" x2="15" y2="12" />
      <line x1="9" y1="17" x2="15" y2="17" />
    </svg>
  )
}

function ToggleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="6" width="22" height="12" rx="6" />
      <circle cx="16" cy="12" r="4" fill="currentColor" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  )
}

function CoffeeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8h1a4 4 0 0 1 0 8h-1" />
      <path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z" />
      <line x1="6" y1="1" x2="6" y2="4" />
      <line x1="10" y1="1" x2="10" y2="4" />
      <line x1="14" y1="1" x2="14" y2="4" />
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

function SunIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" />
      <line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" />
      <line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  )
}
