import { useState } from 'react'
import { useAuth } from './AuthContext'
import CoursesManager from './CoursesManager'
import EnrollmentsManager from './EnrollmentsManager'
import AsignaturasManager from './AsignaturasManager'
import CierrePeriodo from './CierrePeriodo'
import ImportarEstudiantes from './ImportarEstudiantes'
import ImportarDocentes from './ImportarDocentes'
import EstudiantesList from './EstudiantesList'
import DocentesList from './DocentesList'

const NAVY_DARK = '#0F2A4A'
const NAVY = '#1d5c8f'
const GREEN = '#5DAA47'
const GREEN_DARK = '#2f7a1f'

export default function AdminDashboard() {
  const { profile, logout } = useAuth()
  const [tab, setTab] = useState('cursos')

  const menuItems = [
    { id: 'cursos', label: 'Cursos', icon: BookIcon },
    { id: 'matriculas', label: 'Matrículas', icon: UsersIcon },
    { id: 'asignaturas', label: 'Asignaturas', icon: BookIcon },
    { id: 'estudiantes', label: 'Estudiantes', icon: UsersIcon },
    { id: 'docentes', label: 'Docentes', icon: UsersIcon },
    { id: 'importar', label: 'Importar Estudiantes', icon: UsersIcon },
    { id: 'importar-docentes', label: 'Importar Docentes', icon: UsersIcon },
    { id: 'periodo', label: 'Cierre de Periodo', icon: BookIcon },
  ]

  const initials = (profile?.full_name || 'AD')
    .split(' ')
    .map(function (w) { return w[0] })
    .slice(0, 2)
    .join('')
    .toUpperCase()

  return (
    <div className="min-h-screen flex" style={{ backgroundColor: '#F4F6F9' }}>

      {/* Sidebar */}
      <aside
        className="w-64 flex-shrink-0 flex-col hidden md:flex"
        style={{ background: `linear-gradient(180deg, ${NAVY_DARK}, #08182c)` }}
      >
        <div className="flex items-center gap-3 px-6 py-6 border-b border-white/10">
          <img
            src="/logo.png"
            alt="Nova Campus"
            className="w-10 h-10 object-contain rounded-full bg-white p-1"
          />
          <div>
            <p className="text-white font-bold leading-tight">Nova Campus</p>
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
                style={
                  active
                    ? { background: `linear-gradient(90deg, ${NAVY}, ${GREEN})`, color: 'white' }
                    : { color: '#B9C4D3' }
                }
              >
                <Icon />
                {item.label}
              </button>
            )
          })}
        </nav>

        <div className="px-4 py-5 border-t border-white/10">
          <button
            onClick={logout}
            className="w-full flex items-center justify-center gap-2 text-sm font-semibold rounded-xl py-2.5 transition hover:opacity-90"
            style={{ backgroundColor: 'rgba(255,255,255,0.08)', color: 'white' }}
          >
            Cerrar sesión
          </button>
        </div>
      </aside>

      {/* Contenido principal */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* Header */}
        <header
          className="flex items-center justify-between px-6 md:px-10 py-5 bg-white"
          style={{ borderBottom: '1px solid #E5E9F0' }}
        >
          <div className="flex items-center gap-3 md:hidden">
            <img src="/logo.png" alt="Nova Campus" className="w-8 h-8 object-contain rounded-full" />
            <span className="font-bold" style={{ color: NAVY_DARK }}>Nova Campus</span>
          </div>

          <div className="hidden md:block">
            <h2 className="text-lg font-bold" style={{ color: NAVY_DARK }}>
              Hola, {profile?.full_name?.split(' ')[0] || 'Admin'} 👋
            </h2>
            <p className="text-sm text-slate-400">Panel de administración de Nova Campus</p>
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
              onClick={logout}
              className="md:hidden text-xs font-semibold px-3 py-2 rounded-lg"
              style={{ backgroundColor: '#F4F6F9', color: NAVY_DARK }}
            >
              Salir
            </button>
          </div>
        </header>

        {/* Contenido */}
        <main className="flex-1 p-6 md:p-10">
          {tab === 'cursos' && <CoursesManager />}
          {tab === 'matriculas' && <EnrollmentsManager />}
          {tab === 'asignaturas' && <AsignaturasManager />}
          {tab === 'estudiantes' && <EstudiantesList />}
          {tab === 'docentes' && <DocentesList />}
          {tab === 'importar' && <ImportarEstudiantes />}
          {tab === 'importar-docentes' && <ImportarDocentes />}
          {tab === 'periodo' && <CierrePeriodo />}
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
