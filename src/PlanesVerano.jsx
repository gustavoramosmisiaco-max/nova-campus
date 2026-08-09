import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'

const NAVY_DARK = '#0F172A'
const NAVY = '#2563EB'
const GREEN = '#22C55E'

const PLANES = [
  {
    codigo: 'A', nombre: 'Completo (4 aulas, 1 por grado)', modalidad: 'Presencial',
    aforoMax: 40, pisoAlquiler: 1200, breakeven525: 28, breakeven600: 24, metaModerada: 37,
    egresos: { planilla: 9000, materiales: 1200, operativos: 800 },
  },
  {
    codigo: 'B', nombre: 'Combinado (1º+2º / 3º+4º)', modalidad: 'Presencial',
    aforoMax: 20, pisoAlquiler: 600, breakeven525: 14, breakeven600: 13, metaModerada: 16,
    egresos: { planilla: 4500, materiales: 600, operativos: 500 },
  },
  {
    codigo: 'C', nombre: 'Un solo grupo (todos los grados)', modalidad: 'Presencial',
    aforoMax: 10, pisoAlquiler: 300, breakeven525: 8, breakeven600: 7, metaModerada: 9,
    egresos: { planilla: 2250, materiales: 300, operativos: 400 },
  },
  {
    codigo: 'D', nombre: 'Virtual, turno tarde', modalidad: 'Virtual',
    aforoMax: 60, pisoAlquiler: 0, breakeven525: 23, breakeven600: 20, metaModerada: 42,
    egresos: { planilla: 9000, materiales: 300, operativos: 300, plataforma: 194 },
  },
]

const REGLAS = [
  { min: 1, max: 8, plan: 'C', comentario: 'Por debajo de 7-8 alumnos el ciclo pierde dinero. Evalúa posponer o buscar más matrículas.' },
  { min: 9, max: 20, plan: 'B', comentario: 'Zona más común si la matrícula es despareja entre grados.' },
  { min: 21, max: 23, plan: null, comentario: 'Zona de transición: supera el aforo de B (20) pero aún no cubre cómodo el breakeven de A. Evalúa caso a caso.' },
  { min: 24, max: 999, plan: 'A', comentario: 'Cubre gastos desde 24-28 alumnos. El margen mejora conforme te acercas a 37-40.' },
]

export default function PlanesVerano() {
  const [loading, setLoading] = useState(true)
  const [totalMatriculados, setTotalMatriculados] = useState(0)
  const [precio, setPrecio] = useState(525)

  useEffect(function () {
    cargar()
  }, [])

  async function cargar() {
    setLoading(true)
    const result = await supabase.from('matriculas_verano').select('nombre_estudiante, estado').eq('estado', 'pago_validado')
    if (!result.error) {
      const unicos = new Set(result.data.map(function (m) { return m.nombre_estudiante.trim().toLowerCase() }))
      setTotalMatriculados(unicos.size)
    }
    setLoading(false)
  }

  if (loading) return <p className="text-slate-400 text-sm">Cargando...</p>

  const regla = REGLAS.find(function (r) { return totalMatriculados >= r.min && totalMatriculados <= r.max })
  const planActivo = regla?.plan ? PLANES.find(function (p) { return p.codigo === regla.plan }) : null
  const breakeven = planActivo ? (precio === 525 ? planActivo.breakeven525 : planActivo.breakeven600) : null
  const ingresoBruto = totalMatriculados * precio
  const totalEgresos = planActivo ? Object.values(planActivo.egresos).reduce(function (a, b) { return a + b }, 0) + planActivo.pisoAlquiler : 0
  const utilidadEstimada = planActivo ? ingresoBruto - totalEgresos : null

  return (
    <div>
      <h2 className="text-2xl font-bold mb-2" style={{ color: NAVY_DARK }}>Planes de Verano — Decisión Automática</h2>
      <p className="text-sm text-slate-400 mb-6">Según cuántos estudiantes tengas matriculados con pago validado, el sistema te dice qué Plan corresponde activar.</p>

      <div className="grid sm:grid-cols-2 gap-4 mb-6 max-w-2xl">
        <div className="bg-white rounded-2xl p-5" style={{ border: '1px solid #E5E9F0' }}>
          <p className="text-xs font-semibold text-slate-400">Estudiantes matriculados (pago validado)</p>
          <p className="text-3xl font-bold mt-1" style={{ color: NAVY_DARK }}>{totalMatriculados}</p>
        </div>
        <div className="bg-white rounded-2xl p-5" style={{ border: '1px solid #E5E9F0' }}>
          <p className="text-xs font-semibold text-slate-400 mb-2">Precio por estudiante</p>
          <div className="flex gap-2">
            <button onClick={function () { setPrecio(525) }} className="text-xs font-semibold px-3 py-1.5 rounded-lg transition" style={precio === 525 ? { backgroundColor: NAVY, color: 'white' } : { backgroundColor: '#F4F6F9', color: NAVY_DARK }}>
              S/ 525 (preventa)
            </button>
            <button onClick={function () { setPrecio(600) }} className="text-xs font-semibold px-3 py-1.5 rounded-lg transition" style={precio === 600 ? { backgroundColor: NAVY, color: 'white' } : { backgroundColor: '#F4F6F9', color: NAVY_DARK }}>
              S/ 600 (regular)
            </button>
          </div>
        </div>
      </div>

      {!regla?.plan ? (
        <div className="rounded-2xl p-5" style={{ backgroundColor: '#FFF7E6', border: '1px solid #F5D8A0' }}>
          <p className="text-sm font-bold" style={{ color: '#B45309' }}>⚠️ Zona de transición ({totalMatriculados} matriculados)</p>
          <p className="text-sm mt-1" style={{ color: '#92400E' }}>{regla.comentario}</p>
        </div>
      ) : (
        <div className="rounded-2xl p-5 mb-4" style={{ background: `linear-gradient(135deg, ${NAVY}, ${GREEN})`, boxShadow: '0 4px 14px rgba(37,99,235,0.25)' }}>
          <p className="text-xs font-semibold text-white/80">PLAN RECOMENDADO</p>
          <p className="text-2xl font-bold text-white mt-1">Plan {planActivo.codigo} — {planActivo.nombre}</p>
          <p className="text-sm text-white/90 mt-1">{planActivo.modalidad} · Aforo máximo: {planActivo.aforoMax} estudiantes</p>
          <p className="text-xs text-white/70 mt-2">{regla.comentario}</p>
        </div>
      )}

      {planActivo && (
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="bg-white rounded-2xl p-5" style={{ border: '1px solid #E5E9F0' }}>
            <p className="text-sm font-bold mb-3" style={{ color: NAVY_DARK }}>Punto de equilibrio (breakeven)</p>
            <p className="text-2xl font-bold" style={{ color: totalMatriculados >= breakeven ? '#16A34A' : '#B91C1C' }}>{breakeven} estudiantes</p>
            <p className="text-xs text-slate-400 mt-1">
              {totalMatriculados >= breakeven ? `✓ Ya lo superaste (llevas ${totalMatriculados})` : `Te faltan ${breakeven - totalMatriculados} para cubrir gastos`}
            </p>
          </div>
          <div className="bg-white rounded-2xl p-5" style={{ border: '1px solid #E5E9F0' }}>
            <p className="text-sm font-bold mb-3" style={{ color: NAVY_DARK }}>Estimado con matrícula actual</p>
            <p className="text-xs text-slate-400">Ingreso bruto: <strong style={{ color: NAVY_DARK }}>S/ {ingresoBruto.toLocaleString()}</strong></p>
            <p className="text-xs text-slate-400">Egresos totales (incl. alquiler): <strong style={{ color: NAVY_DARK }}>S/ {totalEgresos.toLocaleString()}</strong></p>
            <p className="text-sm font-bold mt-2" style={{ color: utilidadEstimada >= 0 ? '#16A34A' : '#B91C1C' }}>
              {utilidadEstimada >= 0 ? '+' : ''}S/ {utilidadEstimada.toLocaleString()} de utilidad estimada
            </p>
          </div>
        </div>
      )}

      <p className="text-xs text-slate-400 mt-6">
        Nota: esta es una estimación de referencia según tu propia propuesta financiera. El alquiler variable exacto (piso + 20-35%) y el régimen tributario (IGV, RER) se calculan con más precisión al cierre real del ciclo — consúltalo con tu contador antes de decisiones finales.
      </p>
    </div>
  )
}
