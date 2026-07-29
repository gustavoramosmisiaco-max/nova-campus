import { useEffect } from 'react'

const CONFIG_POR_ROL = {
  admin: { color: '#1d5c8f', mensaje: 'Hasta pronto, Administrador' },
  docente: { color: '#5DAA47', mensaje: 'Hasta pronto, Profe' },
  estudiante: { color: '#8a5cb0', mensaje: '¡Nos vemos pronto!' },
  padre: { color: '#B45309', mensaje: 'Gracias por tu visita' },
}

export default function FarewellAnimation({ visible, role, nombre, onComplete }) {
  useEffect(function () {
    if (visible) {
      const timer = setTimeout(function () { onComplete && onComplete() }, 1500)
      return function () { clearTimeout(timer) }
    }
  }, [visible])

  if (!visible) return null

  const config = CONFIG_POR_ROL[role] || CONFIG_POR_ROL.estudiante
  const primerNombre = nombre ? nombre.split(' ')[0] : ''

  return (
    <div
      className="fixed inset-0 z-[10002] flex items-center justify-center"
      style={{ backgroundColor: 'rgba(15,42,74,0.9)', animation: 'nova-fadein 0.25s ease' }}
    >
      <div className="text-center px-6" style={{ animation: 'nova-popin 0.35s ease' }}>
        <div className="w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: 'white' }}>
          <svg width="56" height="56" viewBox="0 0 24 24" fill="none">
            <g style={{ transformOrigin: '18px 6px', animation: 'nova-wave 0.6s ease-in-out infinite' }}>
              <path
                d="M18 6c1.5 0 2.5 1.2 2.5 2.5S19.5 11 18 11c-.3 0-.6 0-.8-.1"
                stroke={config.color}
                strokeWidth="2"
                strokeLinecap="round"
                fill="none"
              />
            </g>
            <circle cx="12" cy="12" r="9" stroke={config.color} strokeWidth="1.6" fill="none" opacity="0.3" />
            <path d="M9 8l6 4-6 4z" fill={config.color} />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-white mb-1">
          {config.mensaje}{primerNombre ? `, ${primerNombre}` : ''}
        </h2>
        <p className="text-sm" style={{ color: '#B9C4D3' }}>Cerrando sesión...</p>
      </div>

      <style>{`
        @keyframes nova-fadein { from { opacity: 0; } to { opacity: 1; } }
        @keyframes nova-popin { from { opacity: 0; transform: scale(0.85); } to { opacity: 1; transform: scale(1); } }
        @keyframes nova-wave { 0%, 100% { transform: rotate(0deg); } 50% { transform: rotate(-20deg); } }
      `}</style>
    </div>
  )
}
