import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'

const NAVY_DARK = '#0F172A'
const NAVY = '#2563EB'
const GREEN = '#22C55E'

const inputStyle = { backgroundColor: 'white', border: '1px solid #D6DCE5', color: NAVY_DARK }

export default function TalleresVeranoManager() {
  const [loading, setLoading] = useState(true)
  const [talleres, setTalleres] = useState([])
  const [instituciones, setInstituciones] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)

  const [nombre, setNombre] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [tipo, setTipo] = useState('taller')
  const [modalidad, setModalidad] = useState('presencial')
  const [cupoMaximo, setCupoMaximo] = useState('')
  const [precio, setPrecio] = useState('')
  const [fechaInicio, setFechaInicio] = useState('')
  const [fechaFin, setFechaFin] = useState('')
  const [horario, setHorario] = useState('')
  const [institucionId, setInstitucionId] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  useEffect(function () {
    cargar()
  }, [])

  async function cargar() {
    setLoading(true)
    const [talleresResult, instResult] = await Promise.all([
      supabase.from('talleres_verano').select('*').order('created_at', { ascending: false }),
      supabase.from('instituciones_educativas').select('id, nombre').order('nombre'),
    ])
    if (!talleresResult.error) setTalleres(talleresResult.data)
    if (!instResult.error) {
      setInstituciones(instResult.data)
      if (instResult.data.length === 1) setInstitucionId(instResult.data[0].id)
    }
    setLoading(false)
  }

  function resetForm() {
    setEditingId(null)
    setNombre('')
    setDescripcion('')
    setTipo('taller')
    setModalidad('presencial')
    setCupoMaximo('')
    setPrecio('')
    setFechaInicio('')
    setFechaFin('')
    setHorario('')
    setError('')
  }

  function openEdit(t) {
    setEditingId(t.id)
    setNombre(t.nombre)
    setDescripcion(t.descripcion || '')
    setTipo(t.tipo)
    setModalidad(t.modalidad)
    setCupoMaximo(t.cupo_maximo != null ? String(t.cupo_maximo) : '')
    setPrecio(t.precio != null ? String(t.precio) : '')
    setFechaInicio(t.fecha_inicio || '')
    setFechaFin(t.fecha_fin || '')
    setHorario(t.horario || '')
    setInstitucionId(t.institucion_id || '')
    setShowForm(true)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!nombre.trim()) { setError('Ponle un nombre al curso/taller.'); return }
    setGuardando(true)

    const payload = {
      institucion_id: institucionId || null,
      nombre: nombre.trim(),
      descripcion: descripcion.trim() || null,
      tipo: tipo,
      modalidad: modalidad,
      cupo_maximo: cupoMaximo ? Number(cupoMaximo) : null,
      precio: precio ? Number(precio) : null,
      fecha_inicio: fechaInicio || null,
      fecha_fin: fechaFin || null,
      horario: horario.trim() || null,
    }

    let result
    if (editingId) {
      result = await supabase.from('talleres_verano').update(payload).eq('id', editingId)
    } else {
      result = await supabase.from('talleres_verano').insert(payload)
    }

    if (result.error) {
      setError(result.error.message)
    } else {
      resetForm()
      setShowForm(false)
      cargar()
    }
    setGuardando(false)
  }

  async function handleToggleActivo(t) {
    await supabase.from('talleres_verano').update({ activo: !t.activo }).eq('id', t.id)
    cargar()
  }

  if (loading) return <p className="text-slate-400 text-sm">Cargando...</p>

  return (
    <div>
      <div className="flex justify-between items-center flex-wrap gap-3 mb-2">
        <h2 className="text-2xl font-bold" style={{ color: NAVY_DARK }}>Cursos y Talleres de Verano</h2>
        <button
          onClick={function () { if (showForm) { setShowForm(false) } else { resetForm(); setShowForm(true) } }}
          className="text-xs font-semibold px-4 py-2 rounded-lg text-white transition hover:opacity-90"
          style={{ background: `linear-gradient(90deg, ${NAVY}, ${GREEN})`, boxShadow: '0 8px 20px rgba(37,99,235,0.3)' }}
        >
          {showForm ? 'Cancelar' : '+ Nuevo curso/taller'}
        </button>
      </div>
      <p className="text-sm text-slate-400 mb-6">Estos son los cursos que verán los padres en la página pública de matrícula.</p>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl p-5 mb-6 space-y-3" style={{ border: '1px solid #E5E9F0' }}>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: NAVY_DARK }}>Nombre</label>
            <input type="text" value={nombre} onChange={function (e) { setNombre(e.target.value) }} placeholder="Ej: Taller de Robótica" className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={inputStyle} />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: NAVY_DARK }}>Descripción (opcional)</label>
            <textarea value={descripcion} onChange={function (e) { setDescripcion(e.target.value) }} rows={2} className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={inputStyle} />
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: NAVY_DARK }}>Tipo</label>
              <select value={tipo} onChange={function (e) { setTipo(e.target.value) }} className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={inputStyle}>
                <option value="taller">Taller (arte, deporte, creativo)</option>
                <option value="academico">Académico (refuerzo de área)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: NAVY_DARK }}>Modalidad</label>
              <select value={modalidad} onChange={function (e) { setModalidad(e.target.value) }} className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={inputStyle}>
                <option value="presencial">Presencial</option>
                <option value="virtual">Virtual</option>
              </select>
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: NAVY_DARK }}>Cupo máximo (opcional)</label>
              <input type="number" min={0} value={cupoMaximo} onChange={function (e) { setCupoMaximo(e.target.value) }} className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={inputStyle} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: NAVY_DARK }}>Precio S/ (opcional)</label>
              <input type="number" min={0} step="0.01" value={precio} onChange={function (e) { setPrecio(e.target.value) }} className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={inputStyle} />
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: NAVY_DARK }}>Fecha de inicio</label>
              <input type="date" value={fechaInicio} onChange={function (e) { setFechaInicio(e.target.value) }} className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={inputStyle} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: NAVY_DARK }}>Fecha de fin</label>
              <input type="date" value={fechaFin} onChange={function (e) { setFechaFin(e.target.value) }} className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={inputStyle} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: NAVY_DARK }}>Horario (opcional)</label>
            <input type="text" value={horario} onChange={function (e) { setHorario(e.target.value) }} placeholder="Ej: Lunes a viernes, 9:00 - 11:00 am" className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={inputStyle} />
          </div>
          {instituciones.length > 1 && (
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: NAVY_DARK }}>Institución</label>
              <select value={institucionId} onChange={function (e) { setInstitucionId(e.target.value) }} className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={inputStyle}>
                <option value="">-- Elige --</option>
                {instituciones.map(function (i) { return <option key={i.id} value={i.id}>{i.nombre}</option> })}
              </select>
            </div>
          )}
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <button type="submit" disabled={guardando} className="text-sm font-semibold px-5 py-2.5 rounded-xl text-white transition hover:opacity-90 disabled:opacity-50" style={{ background: `linear-gradient(90deg, ${NAVY}, ${GREEN})`, boxShadow: '0 8px 20px rgba(37,99,235,0.3)' }}>
            {guardando ? 'Guardando...' : editingId ? 'Guardar cambios' : 'Crear curso/taller'}
          </button>
        </form>
      )}

      {talleres.length === 0 ? (
        <p className="text-slate-400 text-sm">Aún no has creado ningún curso o taller.</p>
      ) : (
        <ul className="space-y-3">
          {talleres.map(function (t) {
            return (
              <li key={t.id} className="bg-white rounded-2xl p-4" style={{ border: '1px solid #E5E9F0' }}>
                <div className="flex justify-between items-start gap-3 flex-wrap">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-bold" style={{ color: NAVY_DARK }}>{t.nombre}</p>
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: t.activo ? '#E7F3E4' : '#FDECEC', color: t.activo ? '#16A34A' : '#B91C1C' }}>
                        {t.activo ? 'Publicado' : 'Oculto'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {t.tipo === 'academico' ? 'Académico' : 'Taller'} · {t.modalidad === 'virtual' ? 'Virtual' : 'Presencial'}
                      {t.precio != null ? ` · S/ ${t.precio}` : ''}
                      {t.cupo_maximo != null ? ` · Cupo: ${t.cupo_maximo}` : ''}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={function () { openEdit(t) }} className="text-xs font-semibold px-3 py-1.5 rounded-lg transition" style={{ backgroundColor: '#F4F6F9', color: NAVY_DARK, border: '1px solid #D6DCE5' }}>
                      Editar
                    </button>
                    <button onClick={function () { handleToggleActivo(t) }} className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white transition hover:opacity-90" style={{ backgroundColor: t.activo ? '#B45309' : GREEN }}>
                      {t.activo ? 'Ocultar' : 'Publicar'}
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
