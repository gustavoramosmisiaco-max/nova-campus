import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import { useAuth } from './AuthContext'

const NAVY_DARK = '#0F172A'
const NAVY = '#2563EB'
const GREEN = '#22C55E'

const inputStyle = { backgroundColor: 'white', border: '1px solid #D6DCE5', color: NAVY_DARK }

export default function PromotorDashboard() {
  const { session, profile, logout } = useAuth()
  const [loading, setLoading] = useState(true)
  const [matriculas, setMatriculas] = useState([])
  const [tab, setTab] = useState('pendiente_pago')
  const [validandoId, setValidandoId] = useState(null)
  const [montoInput, setMontoInput] = useState({})

  useEffect(function () {
    cargar()
  }, [])

  async function cargar() {
    setLoading(true)
    const result = await supabase
      .from('matriculas_verano')
      .select('*, taller:talleres_verano(nombre, precio, modalidad)')
      .order('created_at', { ascending: false })
    if (!result.error) setMatriculas(result.data)
    setLoading(false)
  }

  async function handleValidar(id, aprobar) {
    setValidandoId(id)
    const result = await supabase
      .from('matriculas_verano')
      .update({
        estado: aprobar ? 'pago_validado' : 'rechazado',
        monto_pagado: aprobar ? (montoInput[id] ? Number(montoInput[id]) : null) : null,
        validado_por: session.user.id,
        validado_en: new Date().toISOString(),
      })
      .eq('id', id)
    if (!result.error) cargar()
    setValidandoId(null)
  }

  const filtradas = matriculas.filter(function (m) { return m.estado === tab })

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#F4F6F9' }}>
      <header className="flex items-center justify-between px-6 py-4 bg-white" style={{ borderBottom: '1px solid #E5E9F0' }}>
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="Nexoris Academy" className="w-9 h-9 object-contain rounded-full" style={{ border: '1px solid #E5E9F0' }} />
          <div>
            <p className="font-bold text-sm" style={{ color: NAVY_DARK }}>Nexoris Academy</p>
            <p className="text-xs" style={{ color: GREEN }}>Panel Promotor — {profile?.full_name}</p>
          </div>
        </div>
        <button onClick={logout} className="text-xs font-semibold px-4 py-2 rounded-lg transition" style={{ backgroundColor: '#F4F6F9', color: NAVY_DARK, border: '1px solid #D6DCE5' }}>
          Salir
        </button>
      </header>

      <main className="p-6 max-w-3xl mx-auto">
        <h2 className="text-2xl font-bold mb-2" style={{ color: NAVY_DARK }}>Matrículas de Verano</h2>
        <p className="text-sm text-slate-400 mb-6">Valida los pagos recibidos para habilitar cada matrícula.</p>

        <div className="flex gap-2 mb-5 border-b" style={{ borderColor: '#E5E9F0' }}>
          {[
            { id: 'pendiente_pago', label: 'Pendientes' },
            { id: 'pago_validado', label: 'Validadas' },
            { id: 'rechazado', label: 'Rechazadas' },
          ].map(function (t) {
            const active = tab === t.id
            const cantidad = matriculas.filter(function (m) { return m.estado === t.id }).length
            return (
              <button key={t.id} onClick={function () { setTab(t.id) }} className="px-4 py-2.5 text-sm font-semibold border-b-2 transition"
                style={active ? { borderColor: GREEN, color: NAVY_DARK } : { borderColor: 'transparent', color: '#94A3B8' }}>
                {t.label} {cantidad > 0 ? `(${cantidad})` : ''}
              </button>
            )
          })}
        </div>

        {loading ? (
          <p className="text-slate-400 text-sm">Cargando...</p>
        ) : filtradas.length === 0 ? (
          <div className="bg-white rounded-2xl p-10 text-center" style={{ border: '1px dashed #D6DCE5' }}>
            <p className="text-slate-400 text-sm">No hay matrículas en esta categoría.</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {filtradas.map(function (m) {
              return (
                <li key={m.id} className="bg-white rounded-2xl p-4" style={{ border: '1px solid #E5E9F0' }}>
                  <div className="flex justify-between items-start gap-3 flex-wrap">
                    <div>
                      <p className="text-sm font-bold" style={{ color: NAVY_DARK }}>{m.nombre_estudiante}</p>
                      <p className="text-xs text-slate-400">{m.edad_grado_estudiante || 'Sin edad/grado especificado'}</p>
                      <p className="text-xs mt-1" style={{ color: NAVY }}>{m.taller?.nombre}{m.taller?.precio != null ? ` · S/ ${m.taller.precio}` : ''}</p>
                    </div>
                    <span className="text-xs text-slate-400">{new Date(m.created_at).toLocaleDateString('es-PE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                  </div>

                  <div className="mt-3 pt-3 text-xs space-y-0.5" style={{ borderTop: '1px solid #F4F6F9', color: '#5F5E5A' }}>
                    <p><strong>Apoderado:</strong> {m.nombre_apoderado} · DNI {m.dni_apoderado}</p>
                    <p><strong>Contacto:</strong> {m.telefono_apoderado}{m.email_apoderado ? ` · ${m.email_apoderado}` : ''}</p>
                    {m.monto_pagado != null && <p><strong>Monto validado:</strong> S/ {m.monto_pagado}</p>}
                  </div>

                  {m.estado === 'pendiente_pago' && (
                    <div className="mt-3 flex gap-2 items-center flex-wrap">
                      <input
                        type="number"
                        placeholder="Monto recibido (S/)"
                        value={montoInput[m.id] || ''}
                        onChange={function (e) { setMontoInput(function (prev) { return { ...prev, [m.id]: e.target.value } }) }}
                        className="w-40 rounded-lg px-3 py-2 text-sm outline-none"
                        style={inputStyle}
                      />
                      <button
                        onClick={function () { handleValidar(m.id, true) }}
                        disabled={validandoId === m.id}
                        className="text-xs font-semibold px-4 py-2 rounded-lg text-white transition hover:opacity-90 disabled:opacity-50"
                        style={{ background: `linear-gradient(90deg, ${NAVY}, ${GREEN})` }}
                      >
                        Validar pago
                      </button>
                      <button
                        onClick={function () { handleValidar(m.id, false) }}
                        disabled={validandoId === m.id}
                        className="text-xs font-semibold px-4 py-2 rounded-lg text-white transition hover:opacity-90 disabled:opacity-50"
                        style={{ backgroundColor: '#B91C1C' }}
                      >
                        Rechazar
                      </button>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </main>
    </div>
  )
}
