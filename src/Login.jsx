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

function saludoSegunHora() {
  const hora = new Date().getHours()
  if (hora < 12) return { texto: 'Buenos días', icono: 'sol' }
  if (hora < 19) return { texto: 'Buenas tardes', icono: 'sol' }
  return { texto: 'Buenas noches', icono: 'luna' }
}

export default function Login({ onVerPortalPadres }) {
  const { login } = useAuth()
  const [email, setEmail] = useState(function () {
    return localStorage.getItem('nexoris_recordar_email') || ''
  })
  const [password, setPassword] = useState('')
  const [verPassword, setVerPassword] = useState(false)
  const [recordarme, setRecordarme] = useState(function () {
    return !!localStorage.getItem('nexoris_recordar_email')
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [fraseIndex, setFraseIndex] = useState(0)
  const [fraseVisible, setFraseVisible] = useState(true)
  const saludo = saludoSegunHora()

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
      return
    }
    if (recordarme) {
      localStorage.setItem('nexoris_recordar_email', email)
    } else {
      localStorage.removeItem('nexoris_recordar_email')
    }
  }

  return (
    <div className="min-h-screen w-full flex flex-col lg:flex-row">

      {/* Panel de imagen — identidad institucional */}
      <div className="relative flex flex-col justify-between p-6 lg:p-10 overflow-hidden w-full lg:w-1/2 h-[380px] lg:h-screen flex-shrink-0">
        <div
          className="absolute inset-0"
          style={{ backgroundImage: 'url(/hero-estudiantes.jpg)', backgroundSize: 'cover', backgroundPosition: 'center' }}
        />
        <div
          className="absolute inset-0"
          style={{ background: `linear-gradient(0deg, rgba(15,42,74,0.9), rgba(15,42,74,0.1) 60%)` }}
        />

        {/* Badge superior */}
        <div className="relative z-10">
          <span
            className="inline-block text-xs lg:text-sm font-semibold px-4 py-2 rounded-full text-white"
            style={{ background: `linear-gradient(90deg, ${NAVY}, ${GREEN})` }}
          >
            ✨ Ciencia que transforma
          </span>
        </div>

        {/* Bloque inferior: logo + título + frases */}
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-4">
            <img
              src="/logo.png"
              alt="Nexoris Academy"
              className="w-12 h-12 lg:w-14 lg:h-14 object-contain rounded-full bg-white p-1"
              style={{ boxShadow: '0 2px 10px rgba(0,0,0,0.35)' }}
            />
            <span className="text-white font-semibold text-sm lg:text-base tracking-wide">NEXORIS ACADEMY</span>
          </div>

          <p className="text-white text-xl lg:text-3xl font-bold mb-2">NEXORIS ACADEMY</p>
          <p className="text-white text-base lg:text-xl font-medium mb-1">Explora · Comprende · Transforma</p>
          <p className="text-sm lg:text-lg mb-4" style={{ color: '#c7e6b8' }}>
            Biología · Química · Física en un solo lugar.
          </p>

          <div className="pl-4 mb-4" style={{ borderLeft: `3px solid ${GREEN}`, minHeight: 40 }}>
            <p
              className="text-white text-base lg:text-xl italic leading-snug transition-opacity duration-500"
              style={{ opacity: fraseVisible ? 1 : 0 }}
            >
              "{FRASES[fraseIndex]}"
            </p>
          </div>

          <div className="flex gap-1.5">
            {FRASES.map(function (_, i) {
              return (
                <span
                  key={i}
                  className="rounded-full transition-colors duration-300"
                  style={{ width: 6, height: 6, backgroundColor: i === fraseIndex ? GREEN : 'rgba(255,255,255,0.4)' }}
                />
              )
            })}
          </div>
        </div>
      </div>

      {/* Panel del formulario */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 sm:p-12 relative overflow-hidden" style={{ backgroundColor: 'white' }}>

        {/* Decoración científica tenue de fondo */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ opacity: 0.04 }} viewBox="0 0 400 600" preserveAspectRatio="xMidYMid slice">
          <circle cx="60" cy="80" r="30" fill="none" stroke={NAVY} strokeWidth="2" />
          <circle cx="60" cy="80" r="46" fill="none" stroke={GREEN} strokeWidth="2" />
          <path d="M320 60 Q340 90 320 120 Q300 150 320 180" fill="none" stroke={NAVY} strokeWidth="3" />
          <path d="M340 60 Q320 90 340 120 Q360 150 340 180" fill="none" stroke={GREEN} strokeWidth="3" />
          <polygon points="60,480 100,500 100,540 60,560 20,540 20,500" fill="none" stroke={NAVY} strokeWidth="2" />
          <path d="M330 470 L330 500 L310 540 L350 540 L330 500 Z" fill="none" stroke={GREEN} strokeWidth="2" />
        </svg>

        <div className="w-full max-w-sm relative z-10">
          <div className="flex justify-center mb-6">
            <img src="/logo.png" alt="Nexoris Academy" className="w-28 h-28 object-contain" />
          </div>

          <div className="flex items-center gap-2 mb-1">
            <span style={{ fontSize: 18 }}>{saludo.icono === 'sol' ? '☀️' : '🌙'}</span>
            <p className="text-sm font-medium" style={{ color: GREEN_DARK }}>{saludo.texto}</p>
          </div>
          <h2 className="text-2xl font-bold mb-1" style={{ color: NAVY_DARK }}>
            Bienvenido nuevamente
          </h2>
          <p className="text-slate-500 text-sm mb-8">Accede a tu aula virtual y continúa aprendiendo.</p>

          <div className="bg-white rounded-2xl p-6 sm:p-7" style={{ border: '1px solid #EEF1F5', boxShadow: '0 4px 24px rgba(15,42,74,0.06)' }}>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Correo electrónico</label>
                <div className="relative">
                  <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
                    type={verPassword ? 'text' : 'password'}
                    value={password}
                    onChange={function (e) { setPassword(e.target.value) }}
                    required
                    className="w-full rounded-xl border border-slate-300 pl-10 pr-11 py-3 text-slate-800 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 transition"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={function () { setVerPassword(!verPassword) }}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition"
                  >
                    {verPassword ? (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17.94 17.94A10.94 10.94 0 0112 20c-7 0-11-8-11-8a18.5 18.5 0 015.06-5.94M9.9 4.24A10.94 10.94 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" />
                        <line x1="1" y1="1" x2="23" y2="23" />
                      </svg>
                    ) : (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={recordarme}
                  onChange={function (e) { setRecordarme(e.target.checked) }}
                  className="w-4 h-4 rounded"
                  style={{ accentColor: GREEN }}
                />
                <span className="text-sm text-slate-600">Recordarme</span>
              </label>

              {error ? <p className="text-red-500 text-sm text-center">{error}</p> : null}

              <button
                type="submit"
                disabled={loading}
                className="w-full text-white font-semibold rounded-xl py-3 transition disabled:opacity-50 hover:brightness-110 flex items-center justify-center gap-2"
                style={{ background: `linear-gradient(90deg, ${NAVY}, ${GREEN})` }}
              >
                {loading ? 'Ingresando...' : 'Iniciar sesión'}
                {!loading && (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="5" y1="12" x2="19" y2="12" />
                    <polyline points="12 5 19 12 12 19" />
                  </svg>
                )}
              </button>

              {onVerPortalPadres && (
                <>
                  <div className="flex items-center gap-3 py-1">
                    <div className="flex-1 h-px bg-slate-200" />
                    <span className="text-xs text-slate-400">o</span>
                    <div className="flex-1 h-px bg-slate-200" />
                  </div>

                  <button
                    type="button"
                    onClick={onVerPortalPadres}
                    className="w-full flex items-center justify-center gap-2 text-sm font-semibold py-2.5 rounded-xl border transition hover:border-blue-400 hover:text-blue-600"
                    style={{ backgroundColor: 'white', color: '#475569', borderColor: '#E2E8F0' }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                      <circle cx="9" cy="7" r="4" />
                      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                    </svg>
                    ¿Eres padre de familia? Ingresa aquí
                  </button>
                </>
              )}
            </form>
          </div>

          {/* Accesos rápidos (decorativos) */}
          <div className="grid grid-cols-3 gap-3 mt-6">
            {[
              { icono: 'book', texto: 'Materiales', desc: 'Recursos por curso' },
              { icono: 'check', texto: 'Evaluaciones', desc: 'Tareas y exámenes' },
              { icono: 'award', texto: 'Certificados', desc: 'Logros obtenidos' },
            ].map(function (item) {
              return (
                <div key={item.texto} className="flex flex-col items-center text-center gap-1.5 p-2">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ backgroundColor: '#F4F6F9' }}>
                    <AccesoIcon nombre={item.icono} />
                  </div>
                  <p className="text-xs font-semibold" style={{ color: NAVY_DARK }}>{item.texto}</p>
                  <p className="text-[10px] text-slate-400 leading-tight">{item.desc}</p>
                </div>
              )
            })}
          </div>

          <p className="text-center text-slate-400 text-xs mt-8">
            © 2026 NEXORIS Academy · Ica, Perú
          </p>
        </div>
      </div>
    </div>
  )
}

function AccesoIcon({ nombre }) {
  if (nombre === 'book') {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={NAVY} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
      </svg>
    )
  }
  if (nombre === 'check') {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={GREEN} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 11l3 3L22 4" />
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      </svg>
    )
  }
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#B45309" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="6" />
      <path d="M15.5 13.5L17 22l-5-3-5 3 1.5-8.5" />
    </svg>
  )
}
