import { useState, useEffect } from 'react'
import { useAuth } from './AuthContext'

const NAVY_DARK = '#0F2A4A'
const NAVY = '#1d5c8f'
const GREEN = '#5DAA47'
const GREEN_DARK = '#2f7a1f'

const FRASES = [
  'Cada experimento es un paso hacia el futuro.',
  'La curiosidad es el primer paso del descubrimiento.',
  'Aprender ciencia es aprender a pensar.',
  'Hoy un estudiante, mañana un científico.',
]

export default function Login({ onVerPortalPadres }) {
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [fraseIndex, setFraseIndex] = useState(0)
  const [fraseVisible, setFraseVisible] = useState(true)

  useEffect(function () {
    const intervalo = setInterval(function () {
      setFraseVisible(false)
      setTimeout(function () {
        setFraseIndex(function (i) { return (i + 1) % FRASES.length })
        setFraseVisible(true)
      }, 500)
    }, 4500)
    return function () { clearInterval(intervalo) }
  }, [])

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
    <div className="min-h-screen w-full flex flex-col lg:flex-row">

      {/* Panel de imagen — elegante, con frases rotativas e íconos de materias */}
      <div className="relative flex flex-col justify-end p-6 lg:p-10 overflow-hidden w-full lg:w-[42%] h-[380px] lg:h-screen flex-shrink-0">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: 'url(/hero-estudiantes.jpg)',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        />
        <div
          className="absolute inset-0"
          style={{ background: `linear-gradient(0deg, rgba(15,42,74,0.88), rgba(15,42,74,0.15) 60%)` }}
        />
        <svg className="absolute inset-0 w-full h-full opacity-10 pointer-events-none" preserveAspectRatio="xMidYMid slice">
          <circle cx="8%" cy="15%" r="70" fill="white" />
          <circle cx="85%" cy="60%" r="110" fill="white" />
          <circle cx="20%" cy="85%" r="50" fill="white" />
        </svg>

        {/* Iconos de materias */}
        <div className="absolute top-6 left-6 lg:top-10 lg:left-10 flex gap-3 z-10">
          {['flask', 'atom-2', 'atom'].map(function (icon) {
            return (
              <div
                key={icon}
                className="w-10 h-10 lg:w-12 lg:h-12 rounded-xl flex items-center justify-center"
                style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}
              >
                <MateriaIcon nombre={icon} />
              </div>
            )
          })}
        </div>

        {/* Logo + nombre */}
        <div className="relative z-10 flex items-center gap-4 mb-5">
          <img
            src="/logo.png"
            alt="Nexoris Academy"
            className="w-14 h-14 lg:w-20 lg:h-20 object-contain rounded-full bg-white p-1.5"
            style={{ boxShadow: '0 2px 10px rgba(0,0,0,0.35)' }}
          />
          <span className="text-white font-semibold text-2xl lg:text-4xl tracking-wide">NEXORIS ACADEMY</span>
        </div>

        <p className="relative z-10 text-white text-xl lg:text-3xl font-medium mb-2">
          Explora · Comprende · Transforma
        </p>
        <p className="relative z-10 text-base lg:text-xl mb-5" style={{ color: '#c7e6b8' }}>
          Biología · Química · Física en un solo lugar.
        </p>

        <div
          className="relative z-10 pl-4 mb-4"
          style={{ borderLeft: `3px solid ${GREEN}`, minHeight: 56 }}
        >
          <p
            className="text-white text-lg lg:text-2xl italic leading-snug transition-opacity duration-500"
            style={{ opacity: fraseVisible ? 1 : 0 }}
          >
            "{FRASES[fraseIndex]}"
          </p>
        </div>

        <div className="relative z-10 flex gap-1.5">
          {FRASES.map(function (_, i) {
            return (
              <span
                key={i}
                className="rounded-full transition-colors duration-300"
                style={{ width: 5, height: 5, backgroundColor: i === fraseIndex ? GREEN : 'rgba(255,255,255,0.4)' }}
              />
            )
          })}
        </div>
      </div>

      {/* Panel del formulario */}
      <div className="flex-1 flex items-center justify-center p-8 sm:p-12" style={{ backgroundColor: 'white' }}>
        <div className="w-full max-w-sm">
          <h2 className="text-2xl font-bold mb-1" style={{ color: NAVY_DARK }}>
            Bienvenido de vuelta
          </h2>
          <p className="text-slate-500 text-sm mb-8">Ingresa tus credenciales</p>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Correo electrónico</label>
              <div className="relative">
                <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 4h16v16H4z" opacity="0" />
                  <path d="M22 6l-10 7L2 6" />
                  <path d="M2 6h20v12H2z" />
                </svg>
                <input
                  type="email"
                  value={email}
                  onChange={function (e) { setEmail(e.target.value) }}
                  required
                  className="w-full rounded-xl border border-slate-300 pl-10 pr-4 py-3 text-slate-800 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 transition"
                  placeholder="tu@correo.com"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Contraseña</label>
              <div className="relative">
                <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                <input
                  type="password"
                  value={password}
                  onChange={function (e) { setPassword(e.target.value) }}
                  required
                  className="w-full rounded-xl border border-slate-300 pl-10 pr-4 py-3 text-slate-800 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 transition"
                  placeholder="••••••••"
                />
              </div>
            </div>

            {error ? <p className="text-red-500 text-sm text-center">{error}</p> : null}

            <button
              type="submit"
              disabled={loading}
              className="w-full text-white font-semibold rounded-xl py-3 transition disabled:opacity-50 hover:opacity-90"
              style={{ background: `linear-gradient(90deg, ${NAVY}, ${GREEN})` }}
            >
              {loading ? 'Ingresando...' : 'Ingresar'}
            </button>

            {onVerPortalPadres && (
              <button
                type="button"
                onClick={onVerPortalPadres}
                className="w-full text-sm font-semibold py-2.5 rounded-xl transition hover:opacity-80"
                style={{ backgroundColor: '#F4F6F9', color: GREEN_DARK }}
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

function MateriaIcon({ nombre }) {
  if (nombre === 'flask') {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 3h6" />
        <path d="M10 3v6l-6 10a1 1 0 0 0 1 2h14a1 1 0 0 0 1-2l-6-10V3" />
      </svg>
    )
  }
  if (nombre === 'atom-2') {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="1" />
        <ellipse cx="12" cy="12" rx="9" ry="4.5" />
        <ellipse cx="12" cy="12" rx="9" ry="4.5" transform="rotate(60 12 12)" />
        <ellipse cx="12" cy="12" rx="9" ry="4.5" transform="rotate(120 12 12)" />
      </svg>
    )
  }
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="1" />
      <ellipse cx="12" cy="12" rx="10" ry="4" />
      <ellipse cx="12" cy="12" rx="4" ry="10" />
    </svg>
  )
}
