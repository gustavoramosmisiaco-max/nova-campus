import { useEffect, useState } from 'react'

const NAVY_DARK = '#0F172A'
const NAVY = '#2563EB'
const GREEN = '#22C55E'

const CONFIG_POR_ROL = {
  admin: {
    icono: 'admin',
    color: NAVY,
    titulo: 'Bienvenido, Administrador',
    subtitulo: 'Todo el colegio en tus manos, listo para gestionar.',
  },
  coordinador: {
    icono: 'admin',
    color: '#7C3AED',
    titulo: 'Bienvenido, Coordinador',
    subtitulo: 'Tu institución está lista para que la supervises hoy.',
  },
  docente: {
    icono: 'docente',
    color: GREEN,
    titulo: 'Bienvenido, Profe',
    subtitulo: 'Tus estudiantes te esperan. ¡A seguir formando futuro!',
  },
  estudiante: {
    icono: 'estudiante',
    color: '#8a5cb0',
    titulo: '¡Hola de nuevo!',
    subtitulo: 'Listo para aprender algo nuevo hoy.',
  },
  padre: {
    icono: 'padre',
    color: '#B45309',
    titulo: 'Bienvenido, familia Nexoris',
    subtitulo: 'Aquí puedes ver el progreso de tu hijo(a).',
  },
}

function IconoAdmin({ color }) {
  return (
    <svg width="72" height="72" viewBox="0 0 24 24" fill="none">
      <g style={{ transformOrigin: '12px 12px', animation: 'nova-spin 3s linear infinite' }}>
        <path d="M12 2l1.5 3.5L17 4l-1 3.5L20 9l-3.5 1.5L18 14l-3.5-1L13 17l-1-3.5L10.5 17 9 13.5 5.5 15 7 11.5 4 10l3.5-1.5L6 5l3.5 1.5L11 3z" fill={color} opacity="0.15" />
      </g>
      <circle cx="12" cy="12" r="4.5" fill={color} />
      <circle cx="12" cy="12" r="2" fill="white" />
    </svg>
  )
}

function IconoDocente({ color }) {
  return (
    <svg width="72" height="72" viewBox="0 0 24 24" fill="none">
      <g style={{ transformOrigin: '12px 14px', animation: 'nova-bounce 1.4s ease-in-out infinite' }}>
        <path d="M12 3L2 8l10 5 8-4v6" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill={color} fillOpacity="0.15" />
        <path d="M6 10.5V15c0 1.5 2.7 3 6 3s6-1.5 6-3v-4.5" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </svg>
  )
}

function IconoEstudiante({ color }) {
  return (
    <svg width="72" height="72" viewBox="0 0 24 24" fill="none">
      <g style={{ transformOrigin: '12px 12px', animation: 'nova-float 2s ease-in-out infinite' }}>
        <path d="M12 2l2.5 6.5L21 11l-6.5 2.5L12 20l-2.5-6.5L3 11l6.5-2.5z" fill={color} />
      </g>
      <circle cx="19" cy="5" r="1.3" fill={color} opacity="0.6" style={{ animation: 'nova-twinkle 1.5s ease-in-out infinite' }} />
      <circle cx="4" cy="18" r="1" fill={color} opacity="0.5" style={{ animation: 'nova-twinkle 1.8s ease-in-out infinite 0.3s' }} />
    </svg>
  )
}

function IconoPadre({ color }) {
  return (
    <svg width="72" height="72" viewBox="0 0 24 24" fill="none">
      <g style={{ transformOrigin: '12px 12px', animation: 'nova-bounce 1.1s ease-in-out infinite' }}>
        <path d="M12 21s-7.5-4.6-10-9.3C0.3 8.4 2 5 5.5 5c2 0 3.5 1.2 4.5 2.8C11 6.2 12.5 5 14.5 5 18 5 19.7 8.4 22 11.7 19.5 16.4 12 21 12 21z" fill={color} />
      </g>
    </svg>
  )
}

const ICONOS = { admin: IconoAdmin, docente: IconoDocente, estudiante: IconoEstudiante, padre: IconoPadre }

export default function WelcomeAnimation({ role, nombre, institucionNombre }) {
  const [visible, setVisible] = useState(false)

  useEffect(function () {
    if (role) {
      setVisible(true)
      const timer = setTimeout(function () { setVisible(false) }, 2800)
      return function () { clearTimeout(timer) }
    }
  }, [role])

  if (!visible || !CONFIG_POR_ROL[role]) return null

  const config = CONFIG_POR_ROL[role]
  const Icono = ICONOS[config.icono]
  const primerNombre = nombre ? nombre.split(' ')[0] : ''

  // Para el rol "padre", el título se personaliza con el nombre de la institución del estudiante
  const titulo = role === 'padre' && institucionNombre ? `Bienvenido, familia ${institucionNombre}` : config.titulo

  return (
    <div
      className="fixed inset-0 z-[10001] flex items-center justify-center"
      style={{ backgroundColor: 'rgba(15,42,74,0.85)', animation: 'nova-fadein 0.3s ease' }}
      onClick={function () { setVisible(false) }}
    >
      <div className="text-center px-6" style={{ animation: 'nova-popin 0.4s ease' }}>
        <div className="w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: 'white' }}>
          <Icono color={config.color} />
        </div>
        <h2 className="text-2xl font-bold text-white mb-1">
          {titulo}{primerNombre ? `, ${primerNombre}` : ''}
        </h2>
        <p className="text-sm" style={{ color: '#B9C4D3' }}>{config.subtitulo}</p>
      </div>

      <style>{`
        @keyframes nova-fadein { from { opacity: 0; } to { opacity: 1; } }
        @keyframes nova-popin { from { opacity: 0; transform: scale(0.85); } to { opacity: 1; transform: scale(1); } }
        @keyframes nova-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes nova-bounce { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
        @keyframes nova-float { 0%, 100% { transform: translateY(0) rotate(0deg); } 50% { transform: translateY(-5px) rotate(8deg); } }
        @keyframes nova-twinkle { 0%, 100% { opacity: 0.3; transform: scale(0.8); } 50% { opacity: 1; transform: scale(1.2); } }
      `}</style>
    </div>
  )
}
