import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'

const NAVY_DARK = '#0F172A'
const NAVY = '#2563EB'
const GREEN = '#22C55E'

const inputStyle = { backgroundColor: 'white', border: '1px solid #D6DCE5', color: NAVY_DARK }

export default function FeriadosManager({ institucionFija } = {}) {
  const [loading, setLoading] = useState(true)
  const [instituciones, setInstituciones] = useState([])
  const [institucionSel, setInstitucionSel] = useState(institucionFija || '')
  const [feriados, setFeriados] = useState([])

  const [nombre, setNombre] = useState('')
  const [fecha, setFecha] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  useEffect(function () {
    cargarInstituciones()
  }, [])

  useEffect(function () {
    if (institucionSel) cargarFeriados()
    else setFeriados([])
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

  async function cargarFeriados() {
    const result = await supabase
      .from('feriados')
      .select('*')
      .eq('institucion_id', institucionSel)
      .order('fecha')
    if (!result.error) setFeriados(result.data)
  }

  async function handleAgregar(e) {
    e.preventDefault()
    setError('')
    if (!nombre.trim() || !fecha) { setError('Completa el nombre y la fecha.'); return }
    setGuardando(true)
    const result = await supabase.from('feriados').insert({
      institucion_id: institucionSel,
      nombre: nombre.trim(),
      fecha: fecha,
    })
    if (result.error) {
      setError(result.error.message)
    } else {
      setNombre('')
      setFecha('')
      cargarFeriados()
    }
    setGuardando(false)
  }

  async function handleEliminar(id) {
    if (!confirm('¿Eliminar este feriado?')) return
    await supabase.from('feriados').delete().eq('id', id)
    cargarFeriados()
  }

  if (loading) return <p className="text-slate-400 text-sm">Cargando...</p>

  return (
    <div>
      <h2 className="text-2xl font-bold mb-2" style={{ color: NAVY_DARK }}>Feriados</h2>
      <p className="text-sm text-slate-400 mb-6">
        {institucionFija
          ? 'Configura los feriados de tu institución — se usarán para calcular correctamente los días de clase al registrar asistencia.'
          : 'Configura los feriados de cada institución — se usarán para calcular correctamente los días de clase al registrar asistencia.'}
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
            <p className="text-sm font-bold" style={{ color: NAVY_DARK }}>Nuevo feriado</p>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: NAVY_DARK }}>Nombre</label>
                <input type="text" value={nombre} onChange={function (e) { setNombre(e.target.value) }} placeholder="Ej: Día de la Independencia" className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={inputStyle} />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: NAVY_DARK }}>Fecha</label>
                <input type="date" value={fecha} onChange={function (e) { setFecha(e.target.value) }} className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={inputStyle} />
              </div>
            </div>
            {error && <p className="text-red-500 text-sm">{error}</p>}
            <button type="submit" disabled={guardando} className="text-sm font-semibold px-4 py-2 rounded-lg text-white transition hover:opacity-90 disabled:opacity-50" style={{ background: `linear-gradient(90deg, ${NAVY}, ${GREEN})`, boxShadow: '0 8px 20px rgba(37,99,235,0.3)' }}>
              {guardando ? 'Guardando...' : '+ Agregar feriado'}
            </button>
          </form>

          <p className="text-sm font-bold mb-3" style={{ color: NAVY_DARK }}>Feriados configurados ({feriados.length})</p>
          {feriados.length === 0 ? (
            <p className="text-xs text-slate-400">Sin feriados todavía para esta institución.</p>
          ) : (
            <ul className="space-y-2">
              {feriados.map(function (f) {
                return (
                  <li key={f.id} className="bg-white rounded-xl p-4 flex justify-between items-center" style={{ border: '1px solid #E5E9F0' }}>
                    <div>
                      <p className="text-sm font-semibold" style={{ color: NAVY_DARK }}>{f.nombre}</p>
                      <p className="text-xs text-slate-400">{new Date(f.fecha + 'T00:00:00').toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
                    </div>
                    <button onClick={function () { handleEliminar(f.id) }} className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white transition hover:opacity-90" style={{ backgroundColor: '#B91C1C' }}>
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
