import { useState } from 'react'
import { useAuth } from './AuthContext'
import Login from './Login'
import AdminDashboard from './AdminDashboard'
import DocenteDashboard from './DocenteDashboard'
import EstudianteDashboard from './EstudianteDashboard'
import LoadingBar from './LoadingBar'
import PortalPadres from './PortalPadres'
import MatriculaVerano from './MatriculaVerano'
import PromotorDashboard from './PromotorDashboard'
import CoordinadorDashboard from './CoordinadorDashboard'
import { PresenceProvider } from './PresenceContext'

function App() {
  const { session, role, loading } = useAuth()
  const [verPortalPadres, setVerPortalPadres] = useState(false)

  // Link directo para matrícula de verano — funciona sin necesidad de iniciar sesión
  if (typeof window !== 'undefined' && window.location.pathname === '/matricula-verano') {
    return (
      <>
        <LoadingBar />
        <MatriculaVerano />
      </>
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <p className="text-emerald-400">Cargando...</p>
      </div>
    )
  }

  if (!session) {
    if (verPortalPadres) {
      return (
        <>
          <LoadingBar />
          <PortalPadres onBack={function () { setVerPortalPadres(false) }} />
        </>
      )
    }
    return (
      <>
        <LoadingBar />
        <Login onVerPortalPadres={function () { setVerPortalPadres(true) }} />
      </>
    )
  }

  return (
    <PresenceProvider>
      <LoadingBar />
      {role === 'admin' && <AdminDashboard />}
      {role === 'docente' && <DocenteDashboard />}
      {role === 'estudiante' && <EstudianteDashboard />}
      {role === 'promotor' && <PromotorDashboard />}
      {role === 'coordinador' && <CoordinadorDashboard />}
      {role !== 'admin' && role !== 'docente' && role !== 'estudiante' && role !== 'promotor' && role !== 'coordinador' && role != null && (
        <div className="min-h-screen bg-slate-900 flex items-center justify-center">
          <p className="text-red-400">Rol no reconocido. Contacta al administrador.</p>
        </div>
      )}
    </PresenceProvider>
  )
}

export default App
