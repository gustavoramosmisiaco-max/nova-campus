import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'

const NAVY_DARK = '#0F172A'
const NAVY = '#2563EB'
const GREEN = '#22C55E'

const inputStyle = { backgroundColor: 'white', border: '1px solid #D6DCE5', color: NAVY_DARK }

const AULAS = [
  { grados: ['5º Primaria'], nombre: 'Aula 1 — 5º Primaria', par: 1 },
  { grados: ['6º Primaria'], nombre: 'Aula 2 — 6º Primaria', par: 1 },
  { grados: ['1º Secundaria'], nombre: 'Aula 3 — 1º Secundaria', par: 2 },
  { grados: ['2º Secundaria'], nombre: 'Aula 4 — 2º Secundaria', par: 2 },
  { grados: ['3º Secundaria'], nombre: 'Aula 5 — 3º Secundaria', par: 3 },
  { grados: ['4º Secundaria'], nombre: 'Aula 6 — 4º Secundaria', par: 3 },
  { grados: ['5º Secundaria / Pre-U'], nombre: 'Aula 7 — 5º Secundaria / Pre-U', par: null },
]

export default function AulasVerano() {
  const [loading, setLoading] = useState(true)
  const [matriculas, setMatriculas] = useState([])
  const [minimoAula, setMinimoAula] = useState(8)

  useEffect(function () {
    cargar()
  }, [])

  async function cargar() {
    setLoading(true)
    const result = await supabase
      .from('matriculas_verano')
      .select('edad_grado_estudiante, nombre_estudiante, estado')
      .eq('estado', 'pago_validado')
    if (!result.error) setMatriculas(result.data)
    setLoading(false)
  }

  function contarPorGrado(grado) {
    // Cuenta estudiantes únicos (un estudiante puede tener varias matrículas si eligió un paquete de varios talleres)
    const nombres = new Set(
      matriculas.filter(function (m) { return m.edad_grado_estudiante === grado }).map(function (m) { return m.nombre_estudiante.trim().toLowerCase() })
    )
    return nombres.size
  }

  if (loading) return <p className="text-slate-400 text-sm">Cargando...</p>

  // Agrupar por "par" (grados que se juntan entre sí si no llegan al mínimo)
  const pares = {}
  AULAS.forEach(function (a) {
    if (a.par == null) return
    if (!pares[a.par]) pares[a.par] = []
    pares[a.par].push(a)
  })

  return (
    <div>
      <h2 className="text-2xl font-bold mb-2" style={{ color: NAVY_DARK }}>Aulas — Cursos de Verano</h2>
      <p className="text-sm text-slate-400 mb-5">
        Estudiantes matriculados con pago validado, por grado. Si un grado no llega al mínimo, se sugiere juntarlo con su par — la oferta y el precio no cambian para el estudiante.
      </p>

      <div className="mb-6 max-w-xs">
        <label className="block text-xs font-medium mb-1" style={{ color: NAVY_DARK }}>Mínimo de estudiantes para que un aula quede sola</label>
        <input type="number" min={1} value={minimoAula} onChange={function (e) { setMinimoAula(Number(e.target.value) || 1) }} className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={inputStyle} />
      </div>

      <div className="space-y-4">
        {Object.keys(pares).map(function (parKey) {
          const [a1, a2] = pares[parKey]
          const c1 = contarPorGrado(a1.grados[0])
          const c2 = contarPorGrado(a2.grados[0])
          const total = c1 + c2
          const ambasLlegan = c1 >= minimoAula && c2 >= minimoAula
          const sugerenciaJuntar = !ambasLlegan

          return (
            <div key={parKey} className="bg-white rounded-2xl p-4" style={{ border: '1px solid #E5E9F0' }}>
              <div className="grid sm:grid-cols-2 gap-3 mb-3">
                <div className="rounded-xl p-3" style={{ backgroundColor: c1 >= minimoAula ? '#E7F3E4' : '#FDECEC' }}>
                  <p className="text-xs font-semibold" style={{ color: NAVY_DARK }}>{a1.nombre}</p>
                  <p className="text-xl font-bold mt-1" style={{ color: c1 >= minimoAula ? '#16A34A' : '#B91C1C' }}>{c1} estudiante(s)</p>
                </div>
                <div className="rounded-xl p-3" style={{ backgroundColor: c2 >= minimoAula ? '#E7F3E4' : '#FDECEC' }}>
                  <p className="text-xs font-semibold" style={{ color: NAVY_DARK }}>{a2.nombre}</p>
                  <p className="text-xl font-bold mt-1" style={{ color: c2 >= minimoAula ? '#16A34A' : '#B91C1C' }}>{c2} estudiante(s)</p>
                </div>
              </div>
              {sugerenciaJuntar ? (
                <p className="text-sm rounded-lg p-3" style={{ backgroundColor: '#FFF7E6', color: '#B45309' }}>
                  ⚠️ Sugerencia: junta estas 2 aulas en una sola de <strong>{total} estudiantes</strong>. La oferta y el precio no cambian para ningún estudiante.
                </p>
              ) : (
                <p className="text-sm rounded-lg p-3" style={{ backgroundColor: '#E7F3E4', color: '#16A34A' }}>
                  ✓ Ambas aulas llegan al mínimo — pueden quedar separadas.
                </p>
              )}
            </div>
          )
        })}

        {/* Aula sin par (5º Secundaria / Pre-U) */}
        {AULAS.filter(function (a) { return a.par == null }).map(function (a) {
          const c = contarPorGrado(a.grados[0])
          return (
            <div key={a.nombre} className="bg-white rounded-2xl p-4" style={{ border: '1px solid #E5E9F0' }}>
              <div className="rounded-xl p-3" style={{ backgroundColor: c >= minimoAula ? '#E7F3E4' : '#FDECEC' }}>
                <p className="text-xs font-semibold" style={{ color: NAVY_DARK }}>{a.nombre}</p>
                <p className="text-xl font-bold mt-1" style={{ color: c >= minimoAula ? '#16A34A' : '#B91C1C' }}>{c} estudiante(s)</p>
              </div>
              {c < minimoAula && (
                <p className="text-xs text-slate-400 mt-2">Sin par para juntar — evalúa si conviene abrir con menos estudiantes o esperar más inscripciones.</p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
