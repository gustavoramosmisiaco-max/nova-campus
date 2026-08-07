const ESTILOS = [
  { claves: ['quimica', 'química'], bg: '#FFF8ED', color: '#412402' },
  { claves: ['biologia', 'biología', 'ciencia'], bg: '#EDF9F1', color: '#173404' },
  { claves: ['fisica', 'física'], bg: '#EAF2FB', color: '#042C53' },
  { claves: ['matematica', 'matemática', 'algebra', 'geometria'], bg: '#FBEEE8', color: '#4A1B0C' },
  { claves: ['comunicacion', 'comunicación', 'lenguaje', 'ingles', 'inglés'], bg: '#F2F0FE', color: '#26215C' },
  { claves: ['arte', 'musica', 'música'], bg: '#FCEDF3', color: '#4B1528' },
  { claves: ['educacion fisica', 'educación física', 'deporte'], bg: '#F0F6E4', color: '#173404' },
  { claves: ['computacion', 'computación', 'tecnologia', 'tecnología'], bg: '#F1EFE8', color: '#2C2C2A' },
]

function detectarEstilo(nombre) {
  const n = (nombre || '').toLowerCase()
  const match = ESTILOS.find(function (e) { return e.claves.some(function (c) { return n.includes(c) }) })
  return match || { bg: '#F1EFE8', color: '#2C2C2A' }
}

function normalizar(nombre) {
  return (nombre || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

export default function IconoAsignatura({ nombre, size = 60 }) {
  const n = normalizar(nombre)
  const estilo = detectarEstilo(n)

  let Icono = IconoLibro
  if (n.includes('quimica')) Icono = IconoQuimica
  else if (n.includes('biologia') || n.includes('ciencia')) Icono = IconoBiologia
  else if (n.includes('fisica')) Icono = IconoFisica
  else if (n.includes('matematica') || n.includes('algebra') || n.includes('geometria')) Icono = IconoMatematica
  else if (n.includes('comunicacion') || n.includes('lenguaje') || n.includes('ingles')) Icono = IconoComunicacion
  else if (n.includes('arte') || n.includes('musica')) Icono = IconoArte
  else if (n.includes('educacion fisica') || n.includes('deporte')) Icono = IconoEducacionFisica
  else if (n.includes('computacion') || n.includes('tecnologia')) Icono = IconoComputacion

  return (
    <div
      className="flex items-center justify-center rounded-2xl"
      style={{ width: size + 20, height: size + 20, backgroundColor: estilo.bg }}
    >
      <Icono size={size} />
    </div>
  )
}

function IconoQuimica({ size }) {
  return (
    <>
      <style>{`
        @keyframes nexoris-flotar { 0%,100% { transform: translateY(0) rotate(-2deg); } 50% { transform: translateY(-6px) rotate(2deg); } }
        @keyframes nexoris-burbuja { 0% { transform: translateY(0); opacity: 0.9; } 100% { transform: translateY(-18px); opacity: 0; } }
        @media (prefers-reduced-motion: reduce) { .nexoris-flotar, .nexoris-burbuja { animation: none !important; } }
      `}</style>
      <div className="nexoris-flotar" style={{ animation: 'nexoris-flotar 3s ease-in-out infinite' }}>
        <svg width={size} height={size} viewBox="0 0 60 60">
          <path d="M25 9h11v13l9 20a2.5 2.5 0 0 1-2.5 3.5H18.5A2.5 2.5 0 0 1 16 42l9-20z" fill="#D97A0F" />
          <path d="M24 8h12v14l10 22a3 3 0 0 1-3 4H17a3 3 0 0 1-3-4l10-22z" fill="#FDE9C8" />
          <path d="M17 33h26l4.5 11a3 3 0 0 1-3 4H15.5a3 3 0 0 1-3-4z" fill="#EF9F27" />
          <circle style={{ animation: 'nexoris-burbuja 2s ease-in infinite' }} cx="26" cy="42" r="2" fill="#FEF3DA" />
          <circle style={{ animation: 'nexoris-burbuja 2s ease-in infinite 0.7s' }} cx="34" cy="44" r="1.4" fill="#FEF3DA" />
          <circle style={{ animation: 'nexoris-burbuja 2s ease-in infinite 1.3s' }} cx="30" cy="40" r="1" fill="#FEF3DA" />
          <rect x="23" y="6" width="14" height="3" rx="1.5" fill="#854F0B" />
        </svg>
      </div>
    </>
  )
}

function IconoBiologia({ size }) {
  return (
    <div style={{ animation: 'nexoris-flotar 3s ease-in-out infinite 0.4s' }}>
      <svg width={size} height={size} viewBox="0 0 60 60">
        <path d="M30 52V22" stroke="#2A5A0C" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M31 30c0-9 8-15 16-14-1 9-8 15-16 14z" fill="#7CA83E" />
        <path d="M30 30c0-9 8-15 16-14-1 9-8 15-16 14z" fill="#97C459" />
        <path d="M31 38c0-8-7-13-14-12 1 8 7 13 14 12z" fill="#AACB7A" />
        <path d="M30 38c0-8-7-13-14-12 1 8 7 13 14 12z" fill="#C0DD97" />
        <ellipse cx="30" cy="53" rx="10" ry="2.5" fill="#639922" opacity="0.25" />
      </svg>
    </div>
  )
}

function IconoFisica({ size }) {
  return (
    <>
      <style>{`
        @keyframes nexoris-girar { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @media (prefers-reduced-motion: reduce) { .nexoris-girar { animation: none !important; } }
      `}</style>
      <svg width={size} height={size} viewBox="0 0 60 60">
        <defs>
          <radialGradient id="nexoris-planeta" cx="35%" cy="30%">
            <stop offset="0%" stopColor="#B5D4F4" />
            <stop offset="100%" stopColor="#0C447C" />
          </radialGradient>
        </defs>
        <g className="nexoris-girar" style={{ animation: 'nexoris-girar 12s linear infinite', transformOrigin: '30px 30px' }}>
          <ellipse cx="30" cy="30" rx="24" ry="7" fill="none" stroke="#0C447C" strokeWidth="1.5" opacity="0.5" />
        </g>
        <circle cx="30" cy="30" r="14" fill="url(#nexoris-planeta)" />
        <circle style={{ animation: 'nexoris-flotar 3s ease-in-out infinite' }} cx="10" cy="12" r="1.3" fill="#B5D4F4" />
        <circle style={{ animation: 'nexoris-flotar 3s ease-in-out infinite 1s' }} cx="50" cy="14" r="1" fill="#B5D4F4" />
        <circle style={{ animation: 'nexoris-flotar 3s ease-in-out infinite 2s' }} cx="48" cy="46" r="1.5" fill="#B5D4F4" />
      </svg>
    </>
  )
}

function IconoMatematica({ size }) {
  return (
    <div style={{ animation: 'nexoris-flotar 3s ease-in-out infinite 0.8s' }}>
      <svg width={size} height={size} viewBox="0 0 60 60">
        <rect x="18" y="9" width="28" height="44" rx="3" fill="#C24A22" />
        <rect x="16" y="8" width="28" height="44" rx="3" fill="#F5C4B3" />
        <rect x="20" y="12" width="20" height="8" rx="1.5" fill="#4A1B0C" />
        <circle cx="23" cy="27" r="2.3" fill="#993C1D" /><circle cx="30" cy="27" r="2.3" fill="#993C1D" /><circle cx="37" cy="27" r="2.3" fill="#993C1D" />
        <circle cx="23" cy="34" r="2.3" fill="#D85A30" /><circle cx="30" cy="34" r="2.3" fill="#D85A30" /><circle cx="37" cy="34" r="2.3" fill="#D85A30" />
        <circle cx="23" cy="41" r="2.3" fill="#D85A30" /><circle cx="30" cy="41" r="2.3" fill="#D85A30" /><circle cx="37" cy="41" r="2.3" fill="#D85A30" />
      </svg>
    </div>
  )
}

function IconoComunicacion({ size }) {
  return (
    <div style={{ animation: 'nexoris-flotar 3s ease-in-out infinite 0.2s' }}>
      <svg width={size} height={size} viewBox="0 0 60 60">
        <path d="M11 15h32v22a3 3 0 0 1-3 3H20l-9 7V15z" fill="#3C3489" />
        <path d="M9 13h32v22a3 3 0 0 1-3 3H18l-9 7V13z" fill="#7F77DD" />
        <rect x="15" y="20" width="20" height="2.5" rx="1.2" fill="#EEEDFE" opacity="0.85" />
        <rect x="15" y="26" width="20" height="2.5" rx="1.2" fill="#EEEDFE" opacity="0.7" />
        <rect x="15" y="32" width="12" height="2.5" rx="1.2" fill="#EEEDFE" opacity="0.55" />
      </svg>
    </div>
  )
}

function IconoArte({ size }) {
  return (
    <>
      <style>{`
        @keyframes nexoris-gota { 0% { transform: translateY(0); opacity: 0.9; } 100% { transform: translateY(14px); opacity: 0; } }
        @media (prefers-reduced-motion: reduce) { .nexoris-gota-cls { animation: none !important; } }
      `}</style>
      <svg width={size} height={size} viewBox="0 0 60 60">
        <path d="M30 10c-13 0-22 9-22 20 0 8 6 13 13 13 4 0 5-2 5-4s-2-3-2-6c0-3 3-5 6-5h6c7 0 12-5 12-11 0-9-8-16-18-16z" fill="#993C1D" />
        <path d="M30 8c-13 0-22 9-22 20 0 8 6 13 13 13 4 0 5-2 5-4s-2-3-2-6c0-3 3-5 6-5h6c7 0 12-5 12-11 0-9-8-16-18-16z" fill="#D85A30" />
        <circle cx="20" cy="20" r="3" fill="#4F8CFF" />
        <circle cx="30" cy="16" r="3" fill="#32D296" />
        <circle cx="20" cy="30" r="3" fill="#FFB547" />
        <circle className="nexoris-gota-cls" style={{ animation: 'nexoris-gota 2.4s ease-in infinite' }} cx="38" cy="20" r="2.4" fill="#7A5CFF" />
      </svg>
    </>
  )
}

function IconoEducacionFisica({ size }) {
  return (
    <>
      <style>{`
        @keyframes nexoris-rebota { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
        @media (prefers-reduced-motion: reduce) { .nexoris-rebota-cls { animation: none !important; } }
      `}</style>
      <svg width={size} height={size} viewBox="0 0 60 60">
        <ellipse cx="30" cy="50" rx="14" ry="3" fill="#3B6D11" opacity="0.2" />
        <circle className="nexoris-rebota-cls" style={{ animation: 'nexoris-rebota 1.4s ease-in-out infinite' }} cx="30" cy="26" r="14" fill="#639922" />
        <circle cx="27" cy="23" r="12" fill="#97C459" opacity="0" />
        <path style={{ animation: 'nexoris-rebota 1.4s ease-in-out infinite' }} d="M16 26a14 14 0 0 1 28 0" stroke="#3B6D11" strokeWidth="1.5" fill="none" />
        <path style={{ animation: 'nexoris-rebota 1.4s ease-in-out infinite' }} d="M30 12v28M16 26h28" stroke="#3B6D11" strokeWidth="1.3" opacity="0.5" />
      </svg>
    </>
  )
}

function IconoComputacion({ size }) {
  return (
    <>
      <style>{`
        @keyframes nexoris-parpadeo { 0%,45% { opacity: 1; } 50%,95% { opacity: 0; } 100% { opacity: 1; } }
        @media (prefers-reduced-motion: reduce) { .nexoris-cursor-cls { animation: none !important; } }
      `}</style>
      <svg width={size} height={size} viewBox="0 0 60 60">
        <rect x="9" y="12" width="42" height="28" rx="3" fill="#3F3E3B" />
        <rect x="8" y="11" width="42" height="28" rx="3" fill="#5F5E5A" />
        <rect x="13" y="16" width="32" height="18" rx="1.5" fill="#1F1E1C" />
        <rect x="16" y="20" width="14" height="2" rx="1" fill="#639922" />
        <rect className="nexoris-cursor-cls" style={{ animation: 'nexoris-parpadeo 1.1s steps(1) infinite' }} x="16" y="25" width="6" height="2.2" rx="1" fill="#EEEDFE" />
        <rect x="24" y="41" width="12" height="4" fill="#3F3E3B" />
        <rect x="18" y="45" width="24" height="3" rx="1.5" fill="#5F5E5A" />
      </svg>
    </>
  )
}

function IconoLibro({ size }) {
  return (
    <svg width={size} height={size} viewBox="0 0 60 60">
      <rect x="14" y="10" width="32" height="40" rx="3" fill="#D3D1C7" />
      <rect x="12" y="9" width="32" height="40" rx="3" fill="#F1EFE8" stroke="#888780" strokeWidth="1" />
      <line x1="18" y1="20" x2="38" y2="20" stroke="#888780" strokeWidth="1.5" />
      <line x1="18" y1="27" x2="38" y2="27" stroke="#888780" strokeWidth="1.5" />
      <line x1="18" y1="34" x2="32" y2="34" stroke="#888780" strokeWidth="1.5" />
    </svg>
  )
}
