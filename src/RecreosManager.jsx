import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'

const NAVY_DARK = '#0F172A'
const NAVY = '#2563EB'
const GREEN = '#22C55E'

const inputStyle = { backgroundColor: 'white', border: '1px solid #D6DCE5', color: NAVY_DARK }

export default function RecreosManager({ institucionFija } = {}) {
  const [loading, setLoading] = useState(true)
  const [instituciones, setInstituciones] = useState([])
  const [institucionSel, setInstitucionSel] = useState(institucionFija || '')
  const [recreos, setRecreos] = useState([])

  const [nombre, setNombre] = useState('Recreo')
  const [horaInicio, setHoraInicio] = useState('')
  const [horaFin, setHoraFin] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  useEffect(function () {
    cargarInstituciones()
  }, [])

  useEffect(function () {
    if (institucionSel) cargarRecreos()
    else setRecreos([])
  }, [institucionSel])

  async function cargarInstituciones() {
    setLoading(true)
    const result = await supabase.from('instituciones_educativas').select('id, nombre').order('nombre')
    if (!result.error) {
      setInstituciones(result.data)
      if (result.data.length === 1 && !institucionSel) setInstitucionSel(result.data[0].id)
    }
    setLoading(false)
  }

  async function cargarRecreos() {
    const result = await supabase
      .from('recreos')
      .select('*')
      .eq('institucion_id', institucionSel)
      .order('hora_inicio')
    if (!result.error) setRecreos(result.data)
  }

  async function handleAgregar(e) {
    e.preventDefault()
    setError('')
    if (!horaInicio || !horaFin) { setError('Completa la hora de inicio y fin.'); return }
    setGuardando(true)
    const result = await supabase.from('recreos').insert({
      institucion_id: institucionSel,
      nombre: nombre.trim() || 'Recreo',
      hora_inicio: horaInicio,
      hora_fin: horaFin,
    })
    if (result.error) {
      setError(result.error.message)
    } else {
      setNombre('Recreo')
      setHoraInicio('')
      setHoraFin('')
      cargarRecreos()
    }
    setGuardando(false)
  }

  async function handleEliminar(id) {
    if (!confirm('¿Eliminar este recreo?')) return
    await supabase.from('recreos').delete().eq('id', id)
    cargarRecreos()
  }

  if (loading) return <p className="text-slate-400 text-sm">Cargando...</p>

  return (
    <div>
      <h2 className="text-2xl font-bold mb-2" style={{ color: NAVY_DARK }}>Recreos</h2>
      <p className="text-sm text-slate-400 mb-6">
        {institucionFija
          ? 'Configura los recreos de tu institución — aparecerán marcados en el Horario de estudiantes y docentes.'
          : 'Configura los recreos de cada institución — aparecerán marcados en el Horario de estudiantes y docentes.'}
      </p>

      {!institucionFija && (
        <div className="mb-5 max-w-sm">
          <label className="block text-xs font-medium mb-1" style={{ color: NAVY_DARK }}>Institución</label>
          <select value={institucionSel} onChange={function (e) { setInstitucionSel(e.target.value) }} className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={inputStyle}>
            <option value="">-- Elige --</option>
            {instituciones.map(function (i) { return <option key={i.id} value={i.id}>{i.nombre}</option> })}
          </select>
        </div>
      )}

      {institucionSel && (
        <>
          <form onSubmit={handleAgregar} className="bg-white rounded-2xl p-4 mb-6 space-y-3" style={{ border: '1px solid #E5E9F0' }}>
            <p className="text-sm font-bold" style={{ color: NAVY_DARK }}>Nuevo recreo</p>
            <div className="grid sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: NAVY_DARK }}>Nombre</label>
                <input type="text" value={nombre} onChange={function (e) { setNombre(e.target.value) }} placeholder="Ej: Recreo 1" className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={inputStyle} />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: NAVY_DARK }}>Hora inicio</label>
                <input type="time" value={horaInicio} onChange={function (e) { setHoraInicio(e.target.value) }} className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={inputStyle} />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: NAVY_DARK }}>Hora fin</label>
                <input type="time" value={horaFin} onChange={function (e) { setHoraFin(e.target.value) }} className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={inputStyle} />
              </div>
            </div>
            {error && <p className="text-red-500 text-sm">{error}</p>}
            <button type="submit" disabled={guardando} className="text-sm font-semibold px-4 py-2 rounded-lg text-white transition hover:opacity-90 disabled:opacity-50" style={{ background: `linear-gradient(90deg, ${NAVY}, ${GREEN})`, boxShadow: '0 8px 20px rgba(37,99,235,0.3)' }}>
              {guardando ? 'Guardando...' : '+ Agregar recreo'}
            </button>
          </form>

          <p className="text-sm font-bold mb-3" style={{ color: NAVY_DARK }}>Recreos configurados ({recreos.length})</p>
          {recreos.length === 0 ? (
            <p className="text-xs text-slate-400">Sin recreos todavía para esta institución.</p>
          ) : (
            <ul className="space-y-2">
              {recreos.map(function (r) {
                return (
                  <li key={r.id} className="bg-white rounded-xl p-4 flex justify-between items-center" style={{ border: '1px solid #E5E9F0' }}>
                    <div>
                      <p className="text-sm font-semibold" style={{ color: NAVY_DARK }}>{r.nombre}</p>
                      <p className="text-xs text-slate-400">{r.hora_inicio.slice(0, 5)} — {r.hora_fin.slice(0, 5)}</p>
                    </div>
                    <button onClick={function () { handleEliminar(r.id) }} className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white transition hover:opacity-90" style={{ backgroundColor: '#B91C1C' }}>
                      Eliminar
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </>
      )}
    </div>
  )
}
