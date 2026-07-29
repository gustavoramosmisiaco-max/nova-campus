import { useState } from 'react'
import { useAuth } from './AuthContext'

export default function Login({ onVerPortalPadres }) {
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const result = await login(email, password)
    setLoading(false)
    if (result.error) {
      setError('Correo o contraseña incorrectos.')
    }
  }

  return (
    <div className="min-h-screen w-full flex">

      <div
        className="hidden lg:flex lg:w-1/2 relative flex-col items-center justify-center text-center p-10"
        style={{
          backgroundImage: 'linear-gradient(rgba(10,25,48,0.25), rgba(10,25,48,0.45)), url(/hero-plant.jpg)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        <img
          src="/logo.png"
          alt="Nova Campus"
          className="w-40 h-40 object-contain rounded-full bg-white p-2 mb-8"
          style={{ boxShadow: '0 2px 10px rgba(0,0,0,0.35)' }}
        />
        <h1
          className="text-5xl font-bold text-white mb-2"
          style={{ textShadow: '0 1px 4px rgba(0,0,0,0.5)' }}
        >
          Nova Campus
        </h1>
        <p
          className="text-base font-semibold mb-6"
          style={{ color: '#2f7a1f', textShadow: '0 1px 4px rgba(0,0,0,0.4)' }}
        >
          Explora · Comprende · Transforma
        </p>
        <p
          className="text-base leading-relaxed max-w-sm"
          style={{ color: '#F0F4F8', textShadow: '0 1px 4px rgba(0,0,0,0.6)' }}
        >
          Cada día es una nueva oportunidad para descubrir el mundo que te rodea.
        </p>
      </div>

      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 sm:p-12" style={{ backgroundColor: 'white' }}>
        <div className="w-full max-w-sm">
          <div className="flex lg:hidden justify-center mb-6">
            <img src="/logo.png" alt="Nova Campus" className="w-24 h-24 object-contain rounded-full bg-white p-2 shadow-lg" />
          </div>

          <h2 className="text-2xl font-bold mb-1" style={{ color: '#0F2A4A' }}>
            Bienvenido de vuelta
          </h2>
          <p className="text-slate-500 text-sm mb-8">Ingresa tus credenciales</p>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Correo electrónico</label>
              <input
                type="email"
                value={email}
                onChange={function (e) { setEmail(e.target.value) }}
                required
                className="w-full rounded-xl border border-slate-300 px-4 py-3 text-slate-800 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 transition"
                placeholder="tu@correo.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Contraseña</label>
              <input
                type="password"
                value={password}
                onChange={function (e) { setPassword(e.target.value) }}
                required
                className="w-full rounded-xl border border-slate-300 px-4 py-3 text-slate-800 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 transition"
                placeholder="••••••••"
              />
            </div>

            {error ? <p className="text-red-500 text-sm text-center">{error}</p> : null}

            <button
              type="submit"
              disabled={loading}
              className="w-full text-white font-semibold rounded-xl py-3 transition disabled:opacity-50 hover:opacity-90"
              style={{ background: 'linear-gradient(90deg, #1d5c8f, #5DAA47)' }}
            >
              {loading ? 'Ingresando...' : 'Ingresar'}
            </button>

            {onVerPortalPadres && (
              <button
                type="button"
                onClick={onVerPortalPadres}
                className="w-full text-sm font-semibold py-2.5 rounded-xl transition hover:opacity-80"
                style={{ backgroundColor: '#F4F6F9', color: '#2f7a1f' }}
              >
                ¿Eres padre de familia? Ingresa aquí
              </button>
            )}
          </form>

          <p className="text-center text-slate-400 text-xs mt-10">
            Academia Nova Ciencias · Ica, Perú
          </p>
        </div>
      </div>
    </div>
  )
}
