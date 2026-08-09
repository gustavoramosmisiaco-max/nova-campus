import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'

const NAVY_DARK = '#0F172A'
const NAVY = '#2563EB'
const GREEN = '#22C55E'

const inputStyle = { backgroundColor: 'white', border: '1px solid #D6DCE5', color: NAVY_DARK }

export default function InstitucionesManager() {
  const [instituciones, setInstituciones] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)

  const [nombre, setNombre] = useState('')
  const [ugel, setUgel] = useState('')
  const [dre, setDre] = useState('')
  const [director, setDirector] = useState('')

  const [gradosAbiertoPara, setGradosAbiertoPara] = useState(null) // id de la institución
  const [gradosDeInstitucion, setGradosDeInstitucion] = useState([])
  const [nuevoGradoNombre, setNuevoGradoNombre] = useState('')
  const [nuevoGradoNumero, setNuevoGradoNumero] = useState('')

  useEffect(function () {
    loadInstituciones()
  }, [])

  async function loadInstituciones() {
    setLoading(true)
    const result = await supabase
      .from('instituciones_educativas')
      .select('*')
      .order('nombre', { ascending: true })
    if (result.error) setError(result.error.message)
    else setInstituciones(result.data)
    setLoading(false)
  }

  function resetForm() {
    setEditingId(null)
    setNombre('')
    setUgel('')
    setDre('')
    setDirector('')
  }

  function openNew() {
    resetForm()
    setShowForm(true)
  }

  function openEdit(inst) {
    setEditingId(inst.id)
    setNombre(inst.nombre)
    setUgel(inst.ugel || '')
    setDre(inst.dre || '')
    setDirector(inst.director || '')
    setShowForm(true)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    const payload = { nombre: nombre, ugel: ugel, dre: dre, director: director }

    let result
    if (editingId) {
      result = await supabase.from('instituciones_educativas').update(payload).eq('id', editingId)
    } else {
      result = await supabase.from('instituciones_educativas').insert(payload)
    }

    if (result.error) {
      setError(result.error.message)
      return
    }
    resetForm()
    setShowForm(false)
    loadInstituciones()
  }

  async function handleDelete(id) {
    if (!confirm('¿Eliminar esta institución? Los cursos que la tengan asignada quedarán sin institución.')) return
    const result = await supabase.from('instituciones_educativas').delete().eq('id', id)
    if (result.error) alert('Error: ' + result.error.message)
    else loadInstituciones()
  }

  async function abrirGrados(institucionId) {
    if (gradosAbiertoPara === institucionId) {
      setGradosAbiertoPara(null)
      return
    }
    setGradosAbiertoPara(institucionId)
    setNuevoGradoNombre('')
    setNuevoGradoNumero('')
    const result = await supabase.from('grados_institucion').select('*').eq('institucion_id', institucionId).order('orden')
    if (!result.error) setGradosDeInstitucion(result.data)
  }

  async function agregarGrado(institucionId) {
    if (!nuevoGradoNombre.trim() || !nuevoGradoNumero) return
    const maxOrden = gradosDeInstitucion.reduce(function (a, g) { return Math.max(a, g.orden) }, 0)
    const result = await supabase.from('grados_institucion').insert({
      institucion_id: institucionId,
      numero: Number(nuevoGradoNumero),
      nombre: nuevoGradoNombre.trim(),
      orden: maxOrden + 1,
    })
    if (result.error) {
      alert('No se pudo agregar: ' + result.error.message)
      return
    }
    setNuevoGradoNombre('')
    setNuevoGradoNumero('')
    abrirGrados(institucionId)
    setGradosAbiertoPara(institucionId)
  }

  async function eliminarGrado(gradoId, institucionId) {
    if (!confirm('¿Quitar este grado de la institución? Las aulas que ya lo usen no se ven afectadas.')) return
    await supabase.from('grados_institucion').delete().eq('id', gradoId)
    const result = await supabase.from('grados_institucion').select('*').eq('institucion_id', institucionId).order('orden')
    if (!result.error) setGradosDeInstitucion(result.data)
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-2">
        <h2 className="text-2xl font-bold" style={{ color: NAVY_DARK }}>Instituciones Educativas</h2>
        <button
          onClick={function () { if (showForm) setShowForm(false); else openNew() }}
          className="font-semibold px-4 py-2 rounded-lg transition text-white hover:opacity-90"
          style={{ backgroundColor: GREEN }}
        >
          {showForm ? 'Cancelar' : '+ Nueva institución'}
        </button>
      </div>
      <p className="text-sm text-slate-400 mb-6">
        Estos datos se usan automáticamente en el Registro Auxiliar y otros reportes oficiales.
      </p>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl p-5 mb-6 space-y-3" style={{ border: '1px solid #E5E9F0' }}>
          <h3 className="text-sm font-bold" style={{ color: NAVY_DARK }}>{editingId ? 'Editar institución' : 'Nueva institución'}</h3>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: NAVY_DARK }}>Nombre de la institución</label>
            <input type="text" value={nombre} onChange={function (e) { setNombre(e.target.value) }} required
              placeholder="Ej: I.E.P. Señor de Luren" className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={inputStyle} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: NAVY_DARK }}>UGEL</label>
              <input type="text" value={ugel} onChange={function (e) { setUgel(e.target.value) }}
                className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={inputStyle} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: NAVY_DARK }}>DRE</label>
              <input type="text" value={dre} onChange={function (e) { setDre(e.target.value) }}
                className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={inputStyle} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: NAVY_DARK }}>Director(a)</label>
            <input type="text" value={director} onChange={function (e) { setDirector(e.target.value) }}
              className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={inputStyle} />
          </div>
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <button type="submit" className="font-semibold px-4 py-2 rounded-lg text-white transition hover:opacity-90" style={{ background: `linear-gradient(90deg, ${NAVY}, ${GREEN})`, boxShadow: '0 8px 20px rgba(37,99,235,0.3)' }}>
            {editingId ? 'Guardar cambios' : 'Crear institución'}
          </button>
        </form>
      )}

      {loading ? (
        <p className="text-slate-400 text-sm">Cargando...</p>
      ) : instituciones.length === 0 ? (
        <p className="text-slate-400 text-sm">Aún no hay instituciones registradas.</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {instituciones.map(function (inst) {
            return (
              <div key={inst.id} className="bg-white rounded-2xl p-4" style={{ border: '1px solid #E5E9F0' }}>
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-sm font-bold" style={{ color: NAVY_DARK }}>{inst.nombre}</p>
                    <p className="text-xs text-slate-500 mt-1">UGEL: {inst.ugel || '—'} · DRE: {inst.dre || '—'}</p>
                    <p className="text-xs text-slate-500">Director(a): {inst.director || '—'}</p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={function () { abrirGrados(inst.id) }} className="text-xs font-semibold px-2 py-1 rounded-lg transition" style={{ backgroundColor: 'white', color: '#B45309', border: '1px solid #D6DCE5' }}>Grados</button>
                    <button onClick={function () { openEdit(inst) }} className="text-xs font-semibold px-2 py-1 rounded-lg transition" style={{ backgroundColor: 'white', color: NAVY, border: '1px solid #D6DCE5' }}>Editar</button>
                    <button onClick={function () { handleDelete(inst.id) }} className="text-xs font-semibold px-2 py-1 rounded-lg text-white transition hover:opacity-90" style={{ backgroundColor: '#B91C1C' }}>Eliminar</button>
                  </div>
                </div>

                {gradosAbiertoPara === inst.id && (
                  <div className="mt-3 pt-3" style={{ borderTop: '1px solid #F4F6F9' }}>
                    <p className="text-xs font-bold mb-2" style={{ color: NAVY_DARK }}>Grados de esta institución</p>
                    {gradosDeInstitucion.length === 0 ? (
                      <p className="text-xs text-slate-400 mb-2">Sin grados todavía.</p>
                    ) : (
                      <ul className="space-y-1 mb-3">
                        {gradosDeInstitucion.map(function (g) {
                          return (
                            <li key={g.id} className="flex justify-between items-center text-xs rounded-lg px-2 py-1" style={{ backgroundColor: '#F4F6F9' }}>
                              <span style={{ color: NAVY_DARK }}>{g.nombre} (nº {g.numero})</span>
                              <button onClick={function () { eliminarGrado(g.id, inst.id) }} className="text-[10px] font-semibold px-2 py-0.5 rounded text-white" style={{ backgroundColor: '#B91C1C' }}>Quitar</button>
                            </li>
                          )
                        })}
                      </ul>
                    )}
                    <div className="flex gap-2">
                      <input type="number" value={nuevoGradoNumero} onChange={function (e) { setNuevoGradoNumero(e.target.value) }} placeholder="Nº (ej: 6)" className="w-20 rounded-lg px-2 py-1.5 text-xs outline-none" style={inputStyle} />
                      <input type="text" value={nuevoGradoNombre} onChange={function (e) { setNuevoGradoNombre(e.target.value) }} placeholder="Nombre (ej: 6°)" className="flex-1 rounded-lg px-2 py-1.5 text-xs outline-none" style={inputStyle} />
                      <button onClick={function () { agregarGrado(inst.id) }} className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white transition hover:opacity-90" style={{ backgroundColor: GREEN }}>+ Agregar</button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
