import { useAuth } from './AuthContext'
import Login from './Login'
import AdminDashboard from './AdminDashboard'
import DocenteDashboard from './DocenteDashboard'
import EstudianteDashboard from './EstudianteDashboard'
import LoadingBar from './LoadingBar'

function App() {
  const { session, role, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <p className="text-emerald-400">Cargando...</p>
      </div>
    )
  }

  if (!session) {
    return (
      <>
        <LoadingBar />
        <Login />
      </>
    )
  }

  return (
    <>
      <LoadingBar />
      {role === 'admin' && <AdminDashboard />}
      {role === 'docente' && <DocenteDashboard />}
      {role === 'estudiante' && <EstudianteDashboard />}
      {role !== 'admin' && role !== 'docente' && role !== 'estudiante' && (
        <div className="min-h-screen bg-slate-900 flex items-center justify-center">
          <p className="text-red-400">Rol no reconocido. Contacta al administrador.</p>
        </div>
      )}
    </>
  )
}

export default App