import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'

const NAVY_DARK = '#0F172A'
const NAVY = '#2563EB'
const GREEN = '#22C55E'

const inputStyle = { backgroundColor: 'white', border: '1px solid #D6DCE5', color: NAVY_DARK }

const CATEGORIAS = [
  { id: 'alquiler', label: 'Alquiler de local' },
  { id: 'materiales', label: 'Materiales / Kits' },
  { id: 'publicidad', label: 'Publicidad' },
  { id: 'docentes', label: 'Pago a docentes (manual)' },
  { id: 'otro', label: 'Otro' },
]

export default function FinancieroVerano() {
  const [loading, setLoading] = useState(true)
  const [matriculas, setMatriculas] = useState([])
  const [talleres, setTalleres] = useState([])
  const [egresos, setEgresos] = useState([])

  const [categoria, setCategoria] = useState('alquiler')
  const [descripcion, setDescripcion] = useState('')
  const [monto, setMonto] = useState('')
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10))
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  useEffect(function () {
    cargar()
  }, [])

  async function cargar() {
    setLoading(true)
    const [matResult, talResult, egResult] = await Promise.all([
      supabase.from('matriculas_verano').select('taller_id, monto_pagado, estado'),
      supabase.from('talleres_verano').select('id, nombre, pago_por_hora, horas_totales, docente:profiles!talleres_verano_docente_id_fkey(full_name)'),
      supabase.from('egresos_verano').select('*').order('fecha', { ascending: false }),
    ])
    if (!matResult.error) setMatriculas(matResult.data)
    if (!talResult.error) setTalleres(talResult.data)
    if (!egResult.error) setEgresos(egResult.data)
    setLoading(false)
  }

  async function handleAgregarEgreso(e) {
    e.preventDefault()
    setError('')
    if (!descripcion.trim() || !monto) { setError('Completa la descripción y el monto.'); return }
    setGuardando(true)
    const result = await supabase.from('egresos_verano').insert({
      categoria: categoria,
      descripcion: descripcion.trim(),
      monto: Number(monto),
      fecha: fecha,
    })
    if (result.error) {
      setError(result.error.message)
    } else {
      setDescripcion('')
      setMonto('')
      cargar()
    }
    setGuardando(false)
  }

  async function handleEliminarEgreso(id) {
    if (!confirm('¿Eliminar este egreso?')) return
    await supabase.from('egresos_verano').delete().eq('id', id)
    cargar()
  }

  if (loading) return <p className="text-slate-400 text-sm">Cargando...</p>

  // Ingresos: suma de matrículas con pago validado
  const matriculasValidadas = matriculas.filter(function (m) { return m.estado === 'pago_validado' })
  const ingresosTotales = matriculasValidadas.reduce(function (a, m) { return a + (m.monto_pagado || 0) }, 0)

  // Costo automático de docentes (según lo configurado en cada taller)
  const costoDocentesAuto = talleres.reduce(function (a, t) {
    if (t.pago_por_hora != null && t.horas_totales != null) return a + (t.pago_por_hora * t.horas_totales)
    return a
  }, 0)

  const egresosManualTotal = egresos.reduce(function (a, e) { return a + Number(e.monto) }, 0)
  const egresosTotales = egresosManualTotal + costoDocentesAuto
  const gananciaNeta = ingresosTotales - egresosTotales

  // Ingresos por taller
  const ingresosPorTaller = talleres.map(function (t) {
    const matsDeTaller = matriculasValidadas.filter(function (m) { return m.taller_id === t.id })
    const total = matsDeTaller.reduce(function (a, m) { return a + (m.monto_pagado || 0) }, 0)
    const costoDocente = (t.pago_por_hora != null && t.horas_totales != null) ? t.pago_por_hora * t.horas_totales : 0
    return { nombre: t.nombre, docente: t.docente?.full_name, cantidad: matsDeTaller.length, ingresos: total, costoDocente: costoDocente }
  }).filter(function (t) { return t.cantidad > 0 || t.costoDocente > 0 })

  return (
    <div>
      <h2 className="text-2xl font-bold mb-2" style={{ color: NAVY_DARK }}>Panel Financiero — Cursos de Verano</h2>
      <p className="text-sm text-slate-400 mb-6">Los ingresos se calculan automáticamente de las matrículas con pago validado. El costo de docentes viene de lo configurado en cada taller.</p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <div className="rounded-2xl p-5" style={{ backgroundColor: '#E7F3E4' }}>
          <p className="text-xs font-semibold" style={{ color: '#16A34A' }}>Ingresos totales</p>
          <p className="text-2xl font-bold mt-1" style={{ color: NAVY_DARK }}>S/ {ingresosTotales.toFixed(2)}</p>
          <p className="text-xs text-slate-500 mt-1">{matriculasValidadas.length} matrícula(s) validada(s)</p>
        </div>
        <div className="rounded-2xl p-5" style={{ backgroundColor: '#FDECEC' }}>
          <p className="text-xs font-semibold" style={{ color: '#B91C1C' }}>Egresos totales</p>
          <p className="text-2xl font-bold mt-1" style={{ color: NAVY_DARK }}>S/ {egresosTotales.toFixed(2)}</p>
          <p className="text-xs text-slate-500 mt-1">Incluye S/ {costoDocentesAuto.toFixed(2)} de docentes (automático)</p>
        </div>
        <div className="rounded-2xl p-5" style={{ backgroundColor: gananciaNeta >= 0 ? '#EAF2FB' : '#FDECEC' }}>
          <p className="text-xs font-semibold" style={{ color: gananciaNeta >= 0 ? '#185FA5' : '#B91C1C' }}>Ganancia neta</p>
          <p className="text-2xl font-bold mt-1" style={{ color: NAVY_DARK }}>{gananciaNeta >= 0 ? '+' : ''}S/ {gananciaNeta.toFixed(2)}</p>
        </div>
      </div>

      {ingresosPorTaller.length > 0 && (
        <div className="bg-white rounded-2xl p-5 mb-8" style={{ border: '1px solid #E5E9F0' }}>
          <p className="text-sm font-bold mb-4" style={{ color: NAVY_DARK }}>Ingresos por taller</p>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid #E5E9F0' }}>
                <th className="text-left py-2 font-semibold" style={{ color: NAVY_DARK }}>Taller</th>
                <th className="text-left py-2 font-semibold" style={{ color: NAVY_DARK }}>Docente</th>
                <th className="text-center py-2 font-semibold" style={{ color: NAVY_DARK }}>Matriculados</th>
                <th className="text-right py-2 font-semibold" style={{ color: '#16A34A' }}>Ingresos</th>
                <th className="text-right py-2 font-semibold" style={{ color: '#B91C1C' }}>Costo docente</th>
              </tr>
            </thead>
            <tbody>
              {ingresosPorTaller.map(function (t, i) {
                return (
                  <tr key={i} style={{ borderBottom: '1px solid #F4F6F9' }}>
                    <td className="py-2" style={{ color: NAVY_DARK }}>{t.nombre}</td>
                    <td className="py-2 text-slate-500">{t.docente || '—'}</td>
                    <td className="py-2 text-center">{t.cantidad}</td>
                    <td className="py-2 text-right font-semibold" style={{ color: '#16A34A' }}>S/ {t.ingresos.toFixed(2)}</td>
                    <td className="py-2 text-right" style={{ color: '#B91C1C' }}>S/ {t.costoDocente.toFixed(2)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="bg-white rounded-2xl p-5 mb-6" style={{ border: '1px solid #E5E9F0' }}>
        <p className="text-sm font-bold mb-3" style={{ color: NAVY_DARK }}>Registrar egreso manual</p>
        <form onSubmit={handleAgregarEgreso} className="space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: NAVY_DARK }}>Categoría</label>
              <select value={categoria} onChange={function (e) { setCategoria(e.target.value) }} className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={inputStyle}>
                {CATEGORIAS.map(function (c) { return <option key={c.id} value={c.id}>{c.label}</option> })}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: NAVY_DARK }}>Fecha</label>
              <input type="date" value={fecha} onChange={function (e) { setFecha(e.target.value) }} className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={inputStyle} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: NAVY_DARK }}>Descripción</label>
            <input type="text" value={descripcion} onChange={function (e) { setDescripcion(e.target.value) }} placeholder="Ej: Alquiler de aulas - enero" className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={inputStyle} />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: NAVY_DARK }}>Monto S/</label>
            <input type="number" min={0} step="0.01" value={monto} onChange={function (e) { setMonto(e.target.value) }} className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={inputStyle} />
          </div>
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <button type="submit" disabled={guardando} className="text-sm font-semibold px-5 py-2.5 rounded-xl text-white transition hover:opacity-90 disabled:opacity-50" style={{ background: `linear-gradient(90deg, ${NAVY}, ${GREEN})`, boxShadow: '0 8px 20px rgba(37,99,235,0.3)' }}>
            {guardando ? 'Guardando...' : '+ Agregar egreso'}
          </button>
        </form>
      </div>

      <p className="text-sm font-bold mb-3" style={{ color: NAVY_DARK }}>Egresos registrados ({egresos.length})</p>
      {egresos.length === 0 ? (
        <p className="text-xs text-slate-400">Todavía no has registrado ningún egreso manual.</p>
      ) : (
        <ul className="space-y-2">
          {egresos.map(function (e) {
            const cat = CATEGORIAS.find(function (c) { return c.id === e.categoria })
            return (
              <li key={e.id} className="bg-white rounded-xl p-3 flex justify-between items-center gap-3" style={{ border: '1px solid #E5E9F0' }}>
                <div>
                  <p className="text-sm font-medium" style={{ color: NAVY_DARK }}>{e.descripcion}</p>
                  <p className="text-xs text-slate-400">{cat?.label || e.categoria} · {new Date(e.fecha + 'T00:00:00').toLocaleDateString('es-PE')}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-bold" style={{ color: '#B91C1C' }}>S/ {Number(e.monto).toFixed(2)}</span>
                  <button onClick={function () { handleEliminarEgreso(e.id) }} className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white transition hover:opacity-90" style={{ backgroundColor: '#B91C1C' }}>
                    Eliminar
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
