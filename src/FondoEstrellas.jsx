const ESTRELLAS_OSCURO = [
  { top: 12, left: 18, dur: 2.2, delay: 0 },
  { top: 30, left: 55, dur: 2.8, delay: 0.5 },
  { top: 60, left: 25, dur: 2.4, delay: 1 },
  { top: 75, left: 70, dur: 3, delay: 0.3 },
  { top: 20, left: 85, dur: 2.6, delay: 1.2 },
  { top: 88, left: 40, dur: 2.3, delay: 0.8 },
]

const ESTRELLAS_CLARO = [
  { top: 10, left: 15, dur: 2.4, delay: 0, color: '#2563EB' },
  { top: 25, left: 40, dur: 2.9, delay: 0.6, color: '#22C55E' },
  { top: 50, left: 20, dur: 2.5, delay: 1.1, color: '#7A5CFF' },
  { top: 70, left: 60, dur: 3.1, delay: 0.4, color: '#2563EB' },
  { top: 35, left: 80, dur: 2.7, delay: 1.4, color: '#22C55E' },
  { top: 85, left: 35, dur: 2.6, delay: 0.9, color: '#7A5CFF' },
  { top: 15, left: 65, dur: 2.3, delay: 0.2, color: '#2563EB' },
  { top: 60, left: 90, dur: 3, delay: 1.6, color: '#7A5CFF' },
]

export default function FondoEstrellas({ variante = 'claro' }) {
  const oscuro = variante === 'oscuro'
  const estrellas = oscuro ? ESTRELLAS_OSCURO : ESTRELLAS_CLARO

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" style={{ zIndex: 0 }}>
      <style>{`
        @keyframes nexoris-titila { 0%,100% { opacity: 0.2; transform: scale(0.8); } 50% { opacity: 1; transform: scale(1.3); } }
        @keyframes nexoris-deriva1 { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(30px,20px) scale(1.15); } }
        @keyframes nexoris-deriva2 { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(-25px,-15px) scale(1.1); } }
        @media (prefers-reduced-motion: reduce) {
          .nexoris-estrella, .nexoris-glow { animation: none !important; }
        }
      `}</style>

      <div
        className="nexoris-glow absolute rounded-full"
        style={{
          top: -60, left: -40, width: 220, height: 220,
          backgroundColor: oscuro ? 'rgba(37,99,235,0.18)' : 'rgba(37,99,235,0.08)',
          filter: 'blur(60px)',
          animation: 'nexoris-deriva1 18s ease-in-out infinite',
        }}
      />
      <div
        className="nexoris-glow absolute rounded-full"
        style={{
          bottom: -60, right: 0, width: 220, height: 180,
          backgroundColor: oscuro ? 'rgba(34,197,94,0.12)' : 'rgba(34,197,94,0.07)',
          filter: 'blur(60px)',
          animation: 'nexoris-deriva2 20s ease-in-out infinite',
        }}
      />

      {estrellas.map(function (e, i) {
        return (
          <div
            key={i}
            className="nexoris-estrella absolute rounded-full"
            style={{
              top: `${e.top}%`,
              left: `${e.left}%`,
              width: 3,
              height: 3,
              backgroundColor: oscuro ? '#FFFFFF' : e.color,
              animation: `nexoris-titila ${e.dur}s ease-in-out infinite ${e.delay}s`,
            }}
          />
        )
      })}
    </div>
  )
}
