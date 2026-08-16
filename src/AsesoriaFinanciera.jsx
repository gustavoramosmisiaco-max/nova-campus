import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import { llamarIA } from './aiClient'

const NAVY_DARK = '#0F172A'
const NAVY = '#2563EB'
const GREEN = '#22C55E'

const inputStyle = { backgroundColor: 'white', border: '1px solid #D6DCE5', color: NAVY_DARK }

// ============================================================
// Función 6a del plan de IA — asesoría financiera para el Administrador.
// Junta datos reales de uso de la plataforma (instituciones, estudiantes,
// docentes, IA habilitada), y le pide a la IA una propuesta de precios y planes.
// Los costos de infraestructura son opcionales — si no se llenan, la IA usa
// estimaciones generales y lo deja explícito.
// ============================================================
export default function AsesoriaFinanciera() {
  const [instituciones, setInstituciones] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [costoSupabase, setCostoSupabase] = useState('')
  const [costoVercel, setCostoVercel] = useState('')
  const [costoAnthropic, setCostoAnthropic] = useState('')

  const [asesoria, setAsesoria] = useState('')
  const [generando, setGenerando] = useState(false)

  useEffect(function () {
    cargar()
  }, [])

  async function cargar() {
    setLoading(true)
    setError('')

    const instResult = await supabase.from('instituciones_educativas').select('id, nombre, ia_habilitada').order('nombre')
    if (instResult.error) {
      setError(instResult.error.message)
      setLoading(false)
      return
    }

    const conDatos = await Promise.all(instResult.data.map(async function (inst) {
      const estResult = await supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'estudiante').eq('institucion_id', inst.id)
      const docResult = await supabase.from('docente_instituciones').select('docente_id', { count: 'exact', head: true }).eq('institucion_id', inst.id)
      return {
        id: inst.id,
        nombre: inst.nombre,
        iaHabilitada: inst.ia_habilitada,
        estudiantes: estResult.count || 0,
        docentes: docResult.count || 0,
      }
    }))

    setInstituciones(conDatos)
    setLoading(false)
  }

  async function generarAsesoria() {
    setGenerando(true)
    try {
      const costosConocidos = {}
      if (costoSupabase.trim()) costosConocidos['Supabase (mensual)'] = costoSupabase.trim()
      if (costoVercel.trim()) costosConocidos['Vercel (mensual)'] = costoVercel.trim()
      if (costoAnthropic.trim()) costosConocidos['API de Anthropic (mensual, estimado)'] = costoAnthropic.trim()

      const resultado = await llamarIA('asesoria_financiera', {
        instituciones: instituciones.map(function (i) { return { nombre: i.nombre, estudiantes: i.estudiantes, docentes: i.docentes, iaHabilitada: i.iaHabilitada } }),
        costosConocidos: costosConocidos,
      })

      if (resultado.error) {
        alert('Error al generar la asesoría: ' + resultado.error)
      } else {
        setAsesoria(resultado.data.asesoria)
      }
    } catch (err) {
      alert('Error al generar la asesoría: ' + err.message)
    }
    setGenerando(false)
  }

  if (loading) return <p className="text-slate-400 text-sm">Cargando datos de uso...</p>
  if (error) return <p className="text-red-500 text-sm">Error: {error}</p>

  const totalEstudiantes = instituciones.reduce(function (acc, i) { return acc + i.estudiantes }, 0)

  return (
    <div>
      <h2 className="text-2xl font-bold mb-2" style={{ color: NAVY_DARK }}>Asesoría Financiera con IA</h2>
      <p className="text-sm text-slate-400 mb-6">
        Basado en el uso real de la plataforma, la IA propone cuánto cobrar a cada institución y qué planes ofrecer. Son sugerencias de punto de partida, no una tarifa exacta.
      </p>

      <div className="bg-white rounded-2xl p-5 mb-6" style={{ border: '1px solid #E5E9F0' }}>
        <p className="text-sm font-bold mb-3" style={{ color: NAVY_DARK }}>Instituciones activas ({instituciones.length}) — {totalEstudiantes} estudiante(s) en total</p>
        <div className="space-y-2">
          {instituciones.map(function (inst) {
            return (
              <div key={inst.id} className="flex justify-between items-center rounded-lg px-3 py-2" style={{ backgroundColor: '#F4F6F9' }}>
                <span className="text-sm" style={{ color: NAVY_DARK }}>{inst.nombre}</span>
                <span className="text-xs text-slate-500">
                  {inst.estudiantes} estudiante(s) · {inst.docentes} docente(s) · IA {inst.iaHabilitada ? '✓ habilitada' : '— deshabilitada'}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      <div className="bg-white rounded-2xl p-5 mb-6 max-w-lg" style={{ border: '1px solid #E5E9F0' }}>
        <p className="text-sm font-bold mb-1" style={{ color: NAVY_DARK }}>Costos reales de infraestructura (opcional)</p>
        <p className="text-xs text-slate-400 mb-3">Si los dejas vacíos, la IA usa estimaciones generales de mercado y lo deja explícito en la respuesta.</p>
        <div className="space-y-2">
          <input type="text" value={costoSupabase} onChange={function (e) { setCostoSupabase(e.target.value) }} placeholder="Ej: Supabase, S/ 100/mes" className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={inputStyle} />
          <input type="text" value={costoVercel} onChange={function (e) { setCostoVercel(e.target.value) }} placeholder="Ej: Vercel, S/ 80/mes" className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={inputStyle} />
          <input type="text" value={costoAnthropic} onChange={function (e) { setCostoAnthropic(e.target.value) }} placeholder="Ej: API de Anthropic, S/ 50/mes estimado" className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={inputStyle} />
        </div>
      </div>

      <button
        onClick={generarAsesoria}
        disabled={generando || instituciones.length === 0}
        className="text-sm font-semibold px-5 py-2.5 rounded-xl text-white transition hover:opacity-90 disabled:opacity-50"
        style={{ background: `linear-gradient(90deg, ${NAVY}, ${GREEN})`, boxShadow: '0 8px 20px rgba(37,99,235,0.3)' }}
      >
        {generando ? 'Analizando...' : '🤖 Generar asesoría con IA'}
      </button>

      {asesoria && (
        <div className="mt-6 rounded-2xl p-5 whitespace-pre-line text-sm max-w-2xl" style={{ backgroundColor: '#F0F0FF', border: '1px solid #D6D0FA', color: '#4A2E9E' }}>
          {asesoria}
        </div>
      )}
    </div>
  )
}
