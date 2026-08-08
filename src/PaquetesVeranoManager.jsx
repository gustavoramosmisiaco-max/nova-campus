import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'

const NAVY_DARK = '#0F172A'
const NAVY = '#2563EB'
const GREEN = '#22C55E'

const inputStyle = { backgroundColor: 'white', border: '1px solid #D6DCE5', color: NAVY_DARK }

export default function PaquetesVeranoManager() {
  const [loading, setLoading] = useState(true)
  const [paquetes, setPaquetes] = useState([])
  const [talleres, setTalleres] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)

  const [nombre, setNombre] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [precioSugerido, setPrecioSugerido] = useState('')
  const [talleresSel, setTalleresSel] = useState(new Set())
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  useEffect(function () {
    cargar()
  }, [])

  async function cargar() {
    setLoading(true)
    const [paqResult, talResult] = await Promise.all([
      supabase.from('paquetes_verano').select('*, paquete_talleres(taller_id, taller:talleres_verano(nombre, precio))').order('created_at', { ascending: false }),
      supabase.from('talleres_verano').select('id, nombre, precio').eq('activo', true).order('nombre'),
    ])
    if (!paqResult.error) setPaquetes(paqResult.data)
    if (!talResult.error) setTalleres(talResult.data)
    setLoading(false)
  }

  function resetForm() {
    setEditingId(null)
    setNombre('')
    setDescripcion('')
    setPrecioSugerido('')
    setTalleresSel(new Set())
    setError('')
  }

  function toggleTaller(id) {
    setTalleresSel(function (prev) {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function openEdit(p) {
    setEditingId(p.id)
    setNombre(p.nombre)
    setDescripcion(p.descripcion || '')
    setPrecioSugerido(p.precio_sugerido != null ? String(p.precio_sugerido) : '')
    setTalleresSel(new Set(p.paquete_talleres.map(function (pt) { return pt.taller_id })))
    setShowForm(true)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!nombre.trim()) { setError('Ponle un nombre al paquete.'); return }
    if (talleresSel.size < 2) { setError('Elige al menos 2 talleres para armar un paquete.'); return }
    setGuardando(true)

    const payload = {
      nombre: nombre.trim(),
      descripcion: descripcion.trim() || null,
      precio_sugerido: precioSugerido ? Number(precioSugerido) : null,
    }

    let paqueteId = editingId
    let result
    if (editingId) {
      result = await supabase.from('paquetes_verano').update(payload).eq('id', editingId)
      await supabase.from('paquete_talleres').delete().eq('paquete_id', editingId)
    } else {
      result = await supabase.from('paquetes_verano').insert(payload).select('id').single()
      if (!result.error) paqueteId = result.data.id
    }

    if (result.error) {
      setError(result.error.message)
      setGuardando(false)
      return
    }

    const filas = [...talleresSel].map(function (tallerId) { return { paquete_id: paqueteId, taller_id: tallerId } })
    const insertResult = await supabase.from('paquete_talleres').insert(filas)
    if (insertResult.error) {
      setError(insertResult.error.message)
      setGuardando(false)
      return
    }

    resetForm()
    setShowForm(false)
    cargar()
    setGuardando(false)
  }

  async function handleToggleActivo(p) {
    await supabase.from('paquetes_verano').update({ activo: !p.activo }).eq('id', p.id)
    cargar()
  }

  const sumaIndividual = [...talleresSel].reduce(function (a, id) {
    const t = talleres.find(function (t) { return t.id === id })
    return a + (t?.precio || 0)
  }, 0)

  if (loading) return <p className="text-slate-400 text-sm">Cargando...</p>

  return (
    <div>
      <div className="flex justify-between items-center flex-wrap gap-3 mb-2">
        <h2 className="text-2xl font-bold" style={{ color: NAVY_DARK }}>Paquetes — Cursos de Verano</h2>
        <button
          onClick={function () { if (showForm) { setShowForm(false) } else { resetForm(); setShowForm(true) } }}
          className="text-xs font-semibold px-4 py-2 rounded-lg text-white transition hover:opacity-90"
          style={{ background: `linear-gradient(90deg, ${NAVY}, ${GREEN})`, boxShadow: '0 8px 20px rgba(37,99,235,0.3)' }}
        >
          {showForm ? 'Cancelar' : '+ Nuevo paquete'}
        </button>
      </div>
      <p className="text-sm text-slate-400 mb-6">Combina varios talleres en un solo precio. El Promotor podrá ajustar el monto final al validar cada pago (por ejemplo, para descuentos de hermanos).</p>

      {talleres.length < 2 && (
        <p className="text-sm rounded-lg p-3 mb-6" style={{ backgroundColor: '#FFF7E6', color: '#B45309' }}>
          Necesitas al menos 2 talleres/cursos activos creados en "Cursos de Verano" antes de poder armar un paquete.
        </p>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl p-5 mb-6 space-y-3" style={{ border: '1px solid #E5E9F0' }}>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: NAVY_DARK }}>Nombre del paquete</label>
            <input type="text" value={nombre} onChange={function (e) { setNombre(e.target.value) }} placeholder="Ej: Ciclo Completo — Verano 2026" className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={inputStyle} />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: NAVY_DARK }}>Descripción (opcional)</label>
            <textarea value={descripcion} onChange={function (e) { setDescripcion(e.target.value) }} rows={2} className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={inputStyle} />
          </div>

          <div>
            <label className="block text-xs font-medium mb-2" style={{ color: NAVY_DARK }}>Talleres incluidos (elige 2 o más)</label>
            <div className="grid sm:grid-cols-2 gap-2">
              {talleres.map(function (t) {
                const marcado = talleresSel.has(t.id)
                return (
                  <button
                    type="button"
                    key={t.id}
                    onClick={function () { toggleTaller(t.id) }}
                    className="text-left px-3 py-2 rounded-lg text-sm transition"
                    style={marcado ? { backgroundColor: '#E7F3E4', border: '1px solid #22C55E', color: NAVY_DARK } : { backgroundColor: '#F4F6F9', border: '1px solid #E5E9F0', color: '#5F5E5A' }}
                  >
                    {marcado ? '✓ ' : ''}{t.nombre}{t.precio != null ? ` (S/ ${t.precio})` : ''}
                  </button>
                )
              })}
            </div>
          </div>

          {talleresSel.size >= 2 && sumaIndividual > 0 && (
            <p className="text-xs text-slate-500">Suma pagando cada uno por separado: <strong>S/ {sumaIndividual.toFixed(2)}</strong></p>
          )}

          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: NAVY_DARK }}>Precio sugerido del paquete completo S/</label>
            <input type="number" min={0} step="0.01" value={precioSugerido} onChange={function (e) { setPrecioSugerido(e.target.value) }} className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={inputStyle} />
          </div>

          {error && <p className="text-red-500 text-sm">{error}</p>}
          <button type="submit" disabled={guardando} className="text-sm font-semibold px-5 py-2.5 rounded-xl text-white transition hover:opacity-90 disabled:opacity-50" style={{ background: `linear-gradient(90deg, ${NAVY}, ${GREEN})`, boxShadow: '0 8px 20px rgba(37,99,235,0.3)' }}>
            {guardando ? 'Guardando...' : editingId ? 'Guardar cambios' : 'Crear paquete'}
          </button>
        </form>
      )}

      {paquetes.length === 0 ? (
        <p className="text-slate-400 text-sm">Aún no has creado ningún paquete.</p>
      ) : (
        <ul className="space-y-3">
          {paquetes.map(function (p) {
            return (
              <li key={p.id} className="bg-white rounded-2xl p-4" style={{ border: '1px solid #E5E9F0' }}>
                <div className="flex justify-between items-start gap-3 flex-wrap">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-bold" style={{ color: NAVY_DARK }}>{p.nombre}</p>
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: p.activo ? '#E7F3E4' : '#FDECEC', color: p.activo ? '#16A34A' : '#B91C1C' }}>
                        {p.activo ? 'Publicado' : 'Oculto'}
                      </span>
                    </div>
                    {p.precio_sugerido != null && <p className="text-sm font-bold mt-1" style={{ color: GREEN }}>S/ {p.precio_sugerido}</p>}
                    <p className="text-xs text-slate-400 mt-1">Incluye: {p.paquete_talleres.map(function (pt) { return pt.taller?.nombre }).join(', ')}</p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={function () { openEdit(p) }} className="text-xs font-semibold px-3 py-1.5 rounded-lg transition" style={{ backgroundColor: '#F4F6F9', color: NAVY_DARK, border: '1px solid #D6DCE5' }}>
                      Editar
                    </button>
                    <button onClick={function () { handleToggleActivo(p) }} className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white transition hover:opacity-90" style={{ backgroundColor: p.activo ? '#B45309' : GREEN }}>
                      {p.activo ? 'Ocultar' : 'Publicar'}
                    </button>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
