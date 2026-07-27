import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import { useAuth } from './AuthContext'
import { getLetterGrade, getLetterColor } from './gradeUtils'
import PreviewModal from './PreviewModal'
import CourseMaterials from './CourseMaterials'

const NAVY_DARK = '#0F2A4A'
const NAVY = '#1d5c8f'
const GREEN = '#5DAA47'
const GREEN_DARK = '#2f7a1f'

const inputStyle = { backgroundColor: 'white', border: '1px solid #D6DCE5', color: NAVY_DARK }
const TIPOS_UNIDAD = ['Unidad', 'Experiencia de aprendizaje']
const NUMEROS_UNIDAD = [1, 2, 3, 4, 5, 6, 7, 8]

function getArea(nombreCurso) {
  return nombreCurso === 'Matematica' ? 'Matematica' : 'Ciencia y Tecnologia'
}

export default function CourseActivities({ courseId }) {
  const [courseNombre, setCourseNombre] = useState('')
  const [selectedUnidad, setSelectedUnidad] = useState(null)
  const [selectedActividad, setSelectedActividad] = useState(null)

  useEffect(function () {
    supabase.from('courses').select('nombre').eq('id', courseId).single().then(function (r) {
      if (!r.error) setCourseNombre(r.data.nombre)
    })
  }, [courseId])

  if (selectedActividad) {
    return (
      <ActividadContenido
        actividad={selectedActividad}
        onBack={function () { setSelectedActividad(null) }}
      />
    )
  }

  if (selectedUnidad) {
    return (
      <UnidadActividades
        unidad={selectedUnidad}
        courseId={courseId}
        courseNombre={courseNombre}
        onBack={function () { setSelectedUnidad(null) }}
        onSelectActividad={setSelectedActividad}
      />
    )
  }

  return <UnidadesList courseId={courseId} onSelectUnidad={setSelectedUnidad} />
}

// ============================================================
// NIVEL 1: Lista de carpetas (Unidades / Experiencias)
// ============================================================
function UnidadesList({ courseId, onSelectUnidad }) {
  const { session } = useAuth()
  const [unidades, setUnidades] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [tipo, setTipo] = useState('Unidad')
  const [numero, setNumero] = useState(1)
  const [nombre, setNombre] = useState('')

  useEffect(function () {
    loadUnidades()
  }, [courseId])

  async function loadUnidades() {
    setLoading(true)
    const result = await supabase
      .from('unidades')
      .select('*, actividades(count)')
      .eq('course_id', courseId)
      .order('numero', { ascending: true })
    if (result.error) setError(result.error.message)
    else setUnidades(result.data)
    setLoading(false)
  }

  function resetForm() {
    setEditingId(null)
    setTipo('Unidad')
    setNumero(1)
    setNombre('')
  }

  function openNew() {
    resetForm()
    setShowForm(true)
  }

  function openEdit(u) {
    setEditingId(u.id)
    setTipo(u.tipo)
    setNumero(u.numero)
    setNombre(u.nombre || '')
    setShowForm(true)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    const payload = { course_id: courseId, tipo: tipo, numero: numero, nombre: nombre || null }

    let result
    if (editingId) {
      result = await supabase.from('unidades').update(payload).eq('id', editingId)
    } else {
      payload.created_by = session.user.id
      result = await supabase.from('unidades').insert(payload)
    }

    if (result.error) {
      setError(result.error.message)
      return
    }
    resetForm()
    setShowForm(false)
    loadUnidades()
  }

  async function handleDelete(id) {
    if (!confirm('¿Eliminar esta carpeta? Se eliminarán también sus actividades, materiales y tareas.')) return
    const result = await supabase.from('unidades').delete().eq('id', id)
    if (result.error) alert('Error: ' + result.error.message)
    else loadUnidades()
  }

  if (loading) return <p className="text-slate-400 text-sm">Cargando carpetas...</p>

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-bold" style={{ color: NAVY_DARK }}>Unidades y Experiencias de Aprendizaje</h3>
        <button
          onClick={function () { if (showForm) setShowForm(false); else openNew() }}
          className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white transition hover:opacity-90"
          style={{ backgroundColor: GREEN }}
        >
          {showForm ? 'Cancelar' : '+ Nueva carpeta'}
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="rounded-xl p-4 mb-5 space-y-3"
          style={{ backgroundColor: '#F4F6F9', border: '1px solid #E5E9F0' }}
        >
          <h4 className="text-sm font-semibold" style={{ color: NAVY_DARK }}>
            {editingId ? 'Editar carpeta' : 'Nueva carpeta'}
          </h4>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: NAVY_DARK }}>Tipo</label>
            <div className="flex gap-2 mb-2">
              {TIPOS_UNIDAD.map(function (t) {
                const active = tipo === t
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={function () { setTipo(t) }}
                    className="text-xs font-semibold px-3 py-1.5 rounded-lg transition"
                    style={active ? { backgroundColor: GREEN, color: 'white' } : { backgroundColor: 'white', color: NAVY_DARK, border: '1px solid #D6DCE5' }}
                  >
                    {t}
                  </button>
                )
              })}
            </div>
            <label className="block text-xs font-medium mb-1" style={{ color: NAVY_DARK }}>Número</label>
            <div className="flex gap-2 flex-wrap">
              {NUMEROS_UNIDAD.map(function (n) {
                const active = numero === n
                return (
                  <button
                    key={n}
                    type="button"
                    onClick={function () { setNumero(n) }}
                    className="w-9 h-9 rounded-lg text-sm font-semibold transition"
                    style={active ? { backgroundColor: NAVY, color: 'white' } : { backgroundColor: 'white', color: NAVY_DARK, border: '1px solid #D6DCE5' }}
                  >
                    {n}
                  </button>
                )
              })}
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: NAVY_DARK }}>Nombre de la carpeta (opcional)</label>
            <input
              type="text"
              value={nombre}
              onChange={function (e) { setNombre(e.target.value) }}
              placeholder="Ej: Los seres vivos y su entorno"
              className="w-full rounded-lg px-3 py-2 text-sm outline-none"
              style={inputStyle}
            />
          </div>
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <button
            type="submit"
            className="font-semibold px-4 py-2 rounded-lg text-white transition hover:opacity-90"
            style={{ backgroundColor: GREEN }}
          >
            {editingId ? 'Guardar cambios' : 'Crear carpeta'}
          </button>
        </form>
      )}

      {unidades.length === 0 ? (
        <p className="text-slate-400 text-sm">Aún no hay carpetas creadas.</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {unidades.map(function (u) {
            return (
              <div
                key={u.id}
                className="rounded-xl p-4"
                style={{ backgroundColor: '#F4F6F9', border: '1px solid #E5E9F0' }}
              >
                <button
                  onClick={function () { onSelectUnidad(u) }}
                  className="text-left w-full mb-2"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <FolderIcon />
                    <span className="text-xs font-semibold" style={{ color: GREEN_DARK }}>{u.tipo} {u.numero}</span>
                  </div>
                  <p className="text-sm font-bold" style={{ color: NAVY_DARK }}>{u.nombre || `${u.tipo} ${u.numero}`}</p>
                  <p className="text-xs text-slate-400 mt-1">
                    {u.actividades?.[0]?.count ?? 0} actividad(es)
                  </p>
                </button>
                <div className="flex gap-2">
                  <button
                    onClick={function () { openEdit(u) }}
                    className="text-xs font-semibold px-3 py-1 rounded-lg transition"
                    style={{ backgroundColor: 'white', color: NAVY, border: '1px solid #D6DCE5' }}
                  >
                    Editar
                  </button>
                  <button
                    onClick={function () { handleDelete(u.id) }}
                    className="text-xs font-semibold px-3 py-1 rounded-lg text-white transition hover:opacity-90"
                    style={{ backgroundColor: '#B91C1C' }}
                  >
                    Eliminar
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ============================================================
// NIVEL 2: Actividades dentro de una carpeta (Unidad)
// ============================================================
function UnidadActividades({ unidad, courseId, courseNombre, onBack, onSelectActividad }) {
  const { session } = useAuth()
  const [activities, setActivities] = useState([])
  const [competencias, setCompetencias] = useState([])
  const [capacidadesDisponibles, setCapacidadesDisponibles] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)

  const [nombre, setNombre] = useState('')
  const [tipoInstrumento, setTipoInstrumento] = useState('Lista de cotejo')
  const [proposito, setProposito] = useState('')
  const [competenciaId, setCompetenciaId] = useState('')
  const [detalles, setDetalles] = useState({})

  useEffect(function () {
    init()
  }, [unidad.id])

  async function init() {
    setLoading(true)
    const area = getArea(courseNombre)
    const compResult = await supabase.from('competencias').select('*').eq('area', area).order('codigo')
    setCompetencias(compResult.data || [])
    await loadActivities()
    setLoading(false)
  }

  async function loadActivities() {
    const result = await supabase
      .from('actividades')
      .select('*, competencia:competencias(nombre, codigo), actividad_capacidades(criterio, desempeno, desc_ad, desc_a, desc_b, desc_c, capacidad:capacidades(id, nombre, orden))')
      .eq('unidad_id', unidad.id)
      .order('created_at', { ascending: true })
    if (result.error) setError(result.error.message)
    else setActivities(result.data)
  }

  async function loadCapacidadesFor(compId) {
    if (!compId) { setCapacidadesDisponibles([]); return }
    const result = await supabase.from('capacidades').select('*').eq('competencia_id', compId).order('orden')
    setCapacidadesDisponibles(result.data || [])
  }

  function resetForm() {
    setEditingId(null)
    setNombre('')
    setTipoInstrumento('Lista de cotejo')
    setProposito('')
    setCompetenciaId('')
    setDetalles({})
    setCapacidadesDisponibles([])
  }

  function openNew() {
    resetForm()
    setShowForm(true)
  }

  async function openEdit(a) {
    setEditingId(a.id)
    setNombre(a.nombre)
    setTipoInstrumento(a.tipo_instrumento || 'Lista de cotejo')
    setProposito(a.proposito || '')
    const compId = a.competencia ? competencias.find(function (c) { return c.nombre === a.competencia.nombre })?.id : ''
    setCompetenciaId(compId || '')
    if (compId) await loadCapacidadesFor(compId)
    const newDetalles = {}
    ;(a.actividad_capacidades || []).forEach(function (ac) {
      newDetalles[ac.capacidad.id] = {
        checked: true, criterio: ac.criterio || '', desempeno: ac.desempeno || '',
        desc_ad: ac.desc_ad || '', desc_a: ac.desc_a || '', desc_b: ac.desc_b || '', desc_c: ac.desc_c || '',
      }
    })
    setDetalles(newDetalles)
    setShowForm(true)
  }

  function toggleCapacidad(id) {
    setDetalles(function (prev) {
      const existing = prev[id]
      if (existing && existing.checked) return { ...prev, [id]: { ...existing, checked: false } }
      return { ...prev, [id]: { checked: true, criterio: existing?.criterio || '', desempeno: existing?.desempeno || '', desc_ad: existing?.desc_ad || '', desc_a: existing?.desc_a || '', desc_b: existing?.desc_b || '', desc_c: existing?.desc_c || '' } }
    })
  }

  function updateDetalle(id, field, value) {
    setDetalles(function (prev) { return { ...prev, [id]: { ...prev[id], [field]: value } } })
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    const existing = editingId ? activities.find(function (a) { return a.id === editingId }) : null
    const numeroActividad = existing ? existing.numero_actividad : (activities.length + 1)

    const payload = {
      course_id: courseId,
      unidad_id: unidad.id,
      tipo_unidad: unidad.tipo,
      numero_unidad: String(unidad.numero),
      numero_actividad: numeroActividad,
      nombre: nombre,
      tipo_instrumento: tipoInstrumento,
      proposito: proposito,
      competencia_id: competenciaId || null,
    }

    let actividadId = editingId
    let result
    if (editingId) {
      result = await supabase.from('actividades').update(payload).eq('id', editingId)
    } else {
      payload.created_by = session.user.id
      result = await supabase.from('actividades').insert(payload).select('id').single()
      if (!result.error) actividadId = result.data.id
    }
    if (result.error) { setError(result.error.message); return }

    if (editingId) {
      await supabase.from('actividad_capacidades').delete().eq('actividad_id', actividadId)
    }
    const selectedIds = Object.keys(detalles).filter(function (id) { return detalles[id].checked })
    if (selectedIds.length > 0) {
      const capsPayload = selectedIds.map(function (capId) {
        return {
          actividad_id: actividadId, capacidad_id: capId,
          criterio: detalles[capId].criterio || '', desempeno: detalles[capId].desempeno || '',
          desc_ad: detalles[capId].desc_ad || '', desc_a: detalles[capId].desc_a || '',
          desc_b: detalles[capId].desc_b || '', desc_c: detalles[capId].desc_c || '',
        }
      })
      const capsResult = await supabase.from('actividad_capacidades').insert(capsPayload)
      if (capsResult.error) { setError(capsResult.error.message); return }
    }

    resetForm()
    setShowForm(false)
    loadActivities()
  }

  async function handleDelete(id) {
    if (!confirm('¿Eliminar esta actividad? También se borrarán sus materiales y tareas.')) return
    const result = await supabase.from('actividades').delete().eq('id', id)
    if (result.error) alert('Error: ' + result.error.message)
    else loadActivities()
  }

  if (loading) return <p className="text-slate-400 text-sm">Cargando...</p>

  return (
    <div>
      <button onClick={onBack} className="text-sm font-semibold mb-4 hover:underline flex items-center gap-1" style={{ color: NAVY }}>
        ← Volver a carpetas
      </button>

      <div className="flex items-center gap-2 mb-4">
        <FolderIcon big />
        <div>
          <p className="text-xs font-semibold" style={{ color: GREEN_DARK }}>{unidad.tipo} {unidad.numero}</p>
          <h3 className="text-lg font-bold" style={{ color: NAVY_DARK }}>{unidad.nombre || `${unidad.tipo} ${unidad.numero}`}</h3>
        </div>
      </div>

      <div className="flex justify-end mb-3">
        <button
          onClick={function () { if (showForm) setShowForm(false); else openNew() }}
          className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white transition hover:opacity-90"
          style={{ backgroundColor: GREEN }}
        >
          {showForm ? 'Cancelar' : '+ Nueva actividad'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="rounded-xl p-4 mb-5 space-y-3" style={{ backgroundColor: '#F4F6F9', border: '1px solid #E5E9F0' }}>
          <h4 className="text-sm font-semibold" style={{ color: NAVY_DARK }}>{editingId ? 'Editar actividad' : 'Nueva actividad'}</h4>
          {!editingId && (
            <p className="text-xs font-semibold" style={{ color: GREEN_DARK }}>Esta será la Actividad N.° {activities.length + 1} de esta carpeta</p>
          )}
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: NAVY_DARK }}>Nombre de la actividad</label>
            <input type="text" value={nombre} onChange={function (e) { setNombre(e.target.value) }} required
              placeholder="Ej: La célula y sus funciones" className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={inputStyle} />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: NAVY_DARK }}>Instrumento de evaluación</label>
            <div className="flex gap-2">
              {['Lista de cotejo', 'Rúbrica'].map(function (t) {
                const active = tipoInstrumento === t
                return (
                  <button key={t} type="button" onClick={function () { setTipoInstrumento(t) }}
                    className="text-xs font-semibold px-3 py-1.5 rounded-lg transition"
                    style={active ? { backgroundColor: GREEN, color: 'white' } : { backgroundColor: 'white', color: NAVY_DARK, border: '1px solid #D6DCE5' }}>
                    {t}
                  </button>
                )
              })}
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: NAVY_DARK }}>Propósito</label>
            <textarea value={proposito} onChange={function (e) { setProposito(e.target.value) }} rows={2}
              placeholder="Propósito de aprendizaje de esta actividad" className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={inputStyle} />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: NAVY_DARK }}>Competencia</label>
            <select value={competenciaId} onChange={async function (e) { setCompetenciaId(e.target.value); setDetalles({}); await loadCapacidadesFor(e.target.value) }}
              className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={inputStyle}>
              <option value="">-- Selecciona una competencia --</option>
              {competencias.map(function (c) { return <option key={c.id} value={c.id}>{c.codigo} — {c.nombre}</option> })}
            </select>
          </div>
          {capacidadesDisponibles.length > 0 && (
            <div>
              <label className="block text-xs font-medium mb-2" style={{ color: NAVY_DARK }}>Capacidades a evaluar</label>
              <div className="space-y-2">
                {capacidadesDisponibles.map(function (cap) {
                  const det = detalles[cap.id]
                  const checked = det?.checked || false
                  return (
                    <div key={cap.id} className="rounded-lg p-3" style={{ backgroundColor: 'white', border: '1px solid #D6DCE5' }}>
                      <label className="flex items-start gap-2 text-sm cursor-pointer">
                        <input type="checkbox" checked={checked} onChange={function () { toggleCapacidad(cap.id) }} className="mt-0.5" />
                        <span style={{ color: NAVY_DARK }}>{cap.nombre}</span>
                      </label>
                      {checked && (
                        <div className="mt-2 pl-6 space-y-2">
                          {tipoInstrumento === 'Rúbrica' ? (
                            <>
                              <textarea value={det?.desc_ad || ''} onChange={function (e) { updateDetalle(cap.id, 'desc_ad', e.target.value) }} placeholder="Descripción nivel AD" rows={2} className="w-full rounded-lg px-3 py-1.5 text-xs outline-none" style={{ backgroundColor: '#F4F6F9', border: '1px solid #D6DCE5', color: NAVY_DARK }} />
                              <textarea value={det?.desc_a || ''} onChange={function (e) { updateDetalle(cap.id, 'desc_a', e.target.value) }} placeholder="Descripción nivel A" rows={2} className="w-full rounded-lg px-3 py-1.5 text-xs outline-none" style={{ backgroundColor: '#F4F6F9', border: '1px solid #D6DCE5', color: NAVY_DARK }} />
                              <textarea value={det?.desc_b || ''} onChange={function (e) { updateDetalle(cap.id, 'desc_b', e.target.value) }} placeholder="Descripción nivel B" rows={2} className="w-full rounded-lg px-3 py-1.5 text-xs outline-none" style={{ backgroundColor: '#F4F6F9', border: '1px solid #D6DCE5', color: NAVY_DARK }} />
                              <textarea value={det?.desc_c || ''} onChange={function (e) { updateDetalle(cap.id, 'desc_c', e.target.value) }} placeholder="Descripción nivel C" rows={2} className="w-full rounded-lg px-3 py-1.5 text-xs outline-none" style={{ backgroundColor: '#F4F6F9', border: '1px solid #D6DCE5', color: NAVY_DARK }} />
                            </>
                          ) : (
                            <>
                              <input type="text" value={det?.criterio || ''} onChange={function (e) { updateDetalle(cap.id, 'criterio', e.target.value) }} placeholder="Criterio de evaluación" className="w-full rounded-lg px-3 py-1.5 text-xs outline-none" style={{ backgroundColor: '#F4F6F9', border: '1px solid #D6DCE5', color: NAVY_DARK }} />
                              <input type="text" value={det?.desempeno || ''} onChange={function (e) { updateDetalle(cap.id, 'desempeno', e.target.value) }} placeholder="Desempeño (opcional)" className="w-full rounded-lg px-3 py-1.5 text-xs outline-none" style={{ backgroundColor: '#F4F6F9', border: '1px solid #D6DCE5', color: NAVY_DARK }} />
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <button type="submit" className="font-semibold px-4 py-2 rounded-lg text-white transition hover:opacity-90" style={{ backgroundColor: GREEN }}>
            {editingId ? 'Guardar cambios' : 'Crear actividad'}
          </button>
        </form>
      )}

      {activities.length === 0 ? (
        <p className="text-slate-400 text-sm">Aún no hay actividades en esta carpeta.</p>
      ) : (
        <ul className="space-y-3">
          {activities.map(function (a) {
            return (
              <li key={a.id} className="rounded-xl p-4" style={{ backgroundColor: '#F4F6F9', border: '1px solid #E5E9F0' }}>
                <div className="flex justify-between items-start flex-wrap gap-3">
                  <button onClick={function () { onSelectActividad(a) }} className="text-left flex-1">
                    <p className="text-sm font-bold" style={{ color: NAVY_DARK }}>Actividad {a.numero_actividad} · {a.nombre}</p>
                    {a.competencia && <p className="text-xs text-slate-500 mt-1">{a.competencia.codigo} — {a.competencia.nombre}</p>}
                    <p className="text-xs mt-1" style={{ color: GREEN_DARK }}>Ver materiales y tareas →</p>
                  </button>
                  <div className="flex gap-2">
                    <button onClick={function () { openEdit(a) }} className="text-xs font-semibold px-3 py-1.5 rounded-lg transition" style={{ backgroundColor: 'white', color: NAVY, border: '1px solid #D6DCE5' }}>Editar</button>
                    <button onClick={function () { handleDelete(a.id) }} className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white transition hover:opacity-90" style={{ backgroundColor: '#B91C1C' }}>Eliminar</button>
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

// ============================================================
// NIVEL 3: Contenido de una Actividad (Materiales + Tareas)
// ============================================================
function ActividadContenido({ actividad, onBack }) {
  const [tab, setTab] = useState('materiales')

  return (
    <div>
      <button onClick={onBack} className="text-sm font-semibold mb-4 hover:underline flex items-center gap-1" style={{ color: NAVY }}>
        ← Volver a la carpeta
      </button>

      <h3 className="text-lg font-bold mb-4" style={{ color: NAVY_DARK }}>
        Actividad {actividad.numero_actividad} · {actividad.nombre}
      </h3>

      <div className="flex gap-2 mb-6 border-b" style={{ borderColor: '#E5E9F0' }}>
        {[{ id: 'materiales', label: 'Materiales' }, { id: 'tareas', label: 'Tareas' }].map(function (t) {
          const active = tab === t.id
          return (
            <button key={t.id} onClick={function () { setTab(t.id) }}
              className="px-4 py-2.5 text-sm font-semibold border-b-2 transition"
              style={active ? { borderColor: GREEN, color: NAVY_DARK } : { borderColor: 'transparent', color: '#94A3B8' }}>
              {t.label}
            </button>
          )
        })}
      </div>

      {tab === 'materiales' && <CourseMaterials courseId={actividad.course_id} actividadId={actividad.id} canUpload={true} />}
      {tab === 'tareas' && <ActividadTareas actividad={actividad} />}
    </div>
  )
}

// ============================================================
// Tareas de una Actividad específica (sin selector, ya está en contexto)
// ============================================================
function ActividadTareas({ actividad }) {
  const { session } = useAuth()
  const [assignments, setAssignments] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)

  const capacidadesDeActividad = actividad.actividad_capacidades || []

  const [selectedCapacidades, setSelectedCapacidades] = useState([])
  const [titulo, setTitulo] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [fechaEntrega, setFechaEntrega] = useState('')
  const [puntajeMax, setPuntajeMax] = useState(20)
  const [instrumento, setInstrumento] = useState('')

  const [selectedAssignment, setSelectedAssignment] = useState(null)
  const [assignmentCapacidades, setAssignmentCapacidades] = useState([])
  const [submissions, setSubmissions] = useState([])
  const [submissionScoresMap, setSubmissionScoresMap] = useState({})
  const [loadingSubs, setLoadingSubs] = useState(false)
  const [preview, setPreview] = useState(null)

  useEffect(function () {
    loadAssignments()
  }, [actividad.id])

  async function loadAssignments() {
    setLoading(true)
    const result = await supabase
      .from('assignments')
      .select('*, assignment_capacidades(capacidad:capacidades(nombre))')
      .eq('actividad_id', actividad.id)
      .order('fecha_entrega', { ascending: false })
    if (result.error) setError(result.error.message)
    else setAssignments(result.data)
    setLoading(false)
  }

  function resetForm() {
    setEditingId(null)
    setSelectedCapacidades([])
    setTitulo('')
    setDescripcion('')
    setFechaEntrega('')
    setPuntajeMax(20)
    setInstrumento('')
  }

  function openNew() {
    resetForm()
    setShowForm(true)
  }

  async function openEdit(a) {
    setEditingId(a.id)
    setTitulo(a.titulo)
    setDescripcion(a.descripcion || '')
    const d = new Date(a.fecha_entrega)
    const pad = function (n) { return String(n).padStart(2, '0') }
    setFechaEntrega(d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()))
    setPuntajeMax(a.puntaje_maximo)
    setInstrumento(a.instrumento_evaluacion || '')
    const acResult = await supabase.from('assignment_capacidades').select('capacidad_id').eq('assignment_id', a.id)
    setSelectedCapacidades(!acResult.error ? acResult.data.map(function (x) { return x.capacidad_id }) : [])
    setShowForm(true)
  }

  function toggleCapacidad(capId) {
    setSelectedCapacidades(function (prev) {
      return prev.includes(capId) ? prev.filter(function (id) { return id !== capId }) : [...prev, capId]
    })
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (selectedCapacidades.length === 0) {
      setError('Selecciona al menos una capacidad a evaluar.')
      return
    }

    const acs = capacidadesDeActividad.filter(function (ac) { return selectedCapacidades.includes(ac.capacidad.id) })
    const capacidadTexto = acs.map(function (ac) { return ac.capacidad.nombre }).join('; ')
    const criterioTexto = acs.map(function (ac) { return ac.criterio }).filter(Boolean).join(' | ')
    const desempenoTexto = acs.map(function (ac) { return ac.desempeno }).filter(Boolean).join(' | ')

    const payload = {
      course_id: actividad.course_id,
      actividad_id: actividad.id,
      titulo: titulo,
      descripcion: descripcion,
      fecha_entrega: fechaEntrega ? `${fechaEntrega}:00-05:00` : fechaEntrega,
      puntaje_maximo: puntajeMax,
      instrumento_evaluacion: instrumento,
      competencia: actividad.competencia?.nombre || '',
      capacidad: capacidadTexto,
      criterio: criterioTexto,
      tema: actividad.nombre,
      desempeno: desempenoTexto,
    }

    let assignmentId = editingId
    let result
    if (editingId) {
      result = await supabase.from('assignments').update(payload).eq('id', editingId)
    } else {
      payload.created_by = session.user.id
      result = await supabase.from('assignments').insert(payload).select('id').single()
      if (!result.error) assignmentId = result.data.id
    }
    if (result.error) { setError(result.error.message); return }

    if (editingId) {
      await supabase.from('assignment_capacidades').delete().eq('assignment_id', assignmentId)
    }
    const acsPayload = selectedCapacidades.map(function (capId) { return { assignment_id: assignmentId, capacidad_id: capId } })
    const acsResult = await supabase.from('assignment_capacidades').insert(acsPayload)
    if (acsResult.error) { setError(acsResult.error.message); return }

    resetForm()
    setShowForm(false)
    loadAssignments()
  }

  async function handleDeleteAssignment(id) {
    if (!confirm('¿Eliminar esta tarea? También se borrarán las entregas.')) return
    const result = await supabase.from('assignments').delete().eq('id', id)
    if (result.error) alert('Error: ' + result.error.message)
    else { loadAssignments(); setSelectedAssignment(null) }
  }

  async function openSubmissions(a) {
    setSelectedAssignment(a)
    setLoadingSubs(true)

    const acResult = await supabase.from('assignment_capacidades').select('capacidad:capacidades(id, nombre, orden)').eq('assignment_id', a.id)
    const caps = !acResult.error
      ? acResult.data.map(function (x) { return x.capacidad }).sort(function (x, y) { return (x.orden || 0) - (y.orden || 0) })
      : []
    setAssignmentCapacidades(caps)

    const result = await supabase.from('submissions').select('*, student:profiles!submissions_student_id_fkey(full_name, email)').eq('assignment_id', a.id).order('submitted_at', { ascending: false })
    if (result.error) { setSubmissions([]); setLoadingSubs(false); return }
    setSubmissions(result.data)

    const submissionIds = result.data.map(function (s) { return s.id })
    let scoresMap = {}
    if (submissionIds.length > 0) {
      const scoresResult = await supabase.from('submission_scores').select('submission_id, capacidad_id, score').in('submission_id', submissionIds)
      if (!scoresResult.error) scoresResult.data.forEach(function (s) { scoresMap[`${s.submission_id}__${s.capacidad_id}`] = s.score })
    }
    setSubmissionScoresMap(scoresMap)
    setLoadingSubs(false)
  }

  async function handlePreview(path) {
    const result = await supabase.storage.from('entregas').createSignedUrl(path, 300)
    if (result.error) { alert('Error: ' + result.error.message); return }
    const parts = path.split('/')
    const name = parts[parts.length - 1]
    const ext = name.split('.').pop().toLowerCase()
    setPreview({ url: result.data.signedUrl, type: ext, name: name })
  }

  async function handleGradeCapacidad(submissionId, capacidadId, scoreStr) {
    const numScore = Number(scoreStr)
    if (isNaN(numScore) || numScore < 0 || numScore > 20) { alert('La nota debe ser un número entre 0 y 20.'); return }

    await supabase.from('submission_scores').upsert(
      { submission_id: submissionId, capacidad_id: capacidadId, score: numScore, graded_by: session.user.id, graded_at: new Date().toISOString() },
      { onConflict: 'submission_id,capacidad_id' }
    )

    const allScoresResult = await supabase.from('submission_scores').select('score').eq('submission_id', submissionId)
    const values = (allScoresResult.data || []).map(function (s) { return s.score }).filter(function (s) { return s != null })
    const avg = values.length > 0 ? values.reduce(function (a, b) { return a + b }, 0) / values.length : null

    await supabase.from('submissions').update({ score: avg, graded_by: session.user.id, graded_at: new Date().toISOString() }).eq('id', submissionId)
    openSubmissions(selectedAssignment)
  }

  if (selectedAssignment) {
    return (
      <div>
        <button onClick={function () { setSelectedAssignment(null) }} className="text-sm font-semibold mb-4 hover:underline" style={{ color: NAVY }}>← Volver a tareas</button>
        <h3 className="text-lg font-bold mb-1" style={{ color: NAVY_DARK }}>{selectedAssignment.titulo}</h3>
        <p className="text-slate-500 text-sm mb-4">Entrega: {new Date(selectedAssignment.fecha_entrega).toLocaleString('es-PE')}</p>

        {loadingSubs ? <p className="text-slate-400 text-sm">Cargando...</p> : submissions.length === 0 ? (
          <p className="text-slate-400 text-sm">Ningún alumno ha entregado aún.</p>
        ) : (
          <ul className="space-y-3">
            {submissions.map(function (s) {
              return (
                <li key={s.id} className="rounded-xl p-4" style={{ backgroundColor: '#F4F6F9', border: '1px solid #E5E9F0' }}>
                  <div className="flex justify-between items-start flex-wrap gap-3 mb-3">
                    <div>
                      <p className="text-sm font-semibold" style={{ color: NAVY_DARK }}>{s.student?.full_name}</p>
                      {s.score != null && <p className={'text-xs font-semibold ' + getLetterColor(s.score)}>Promedio: {getLetterGrade(s.score)}</p>}
                    </div>
                    <button onClick={function () { handlePreview(s.file_url) }} className="text-xs font-semibold px-3 py-1.5 rounded-lg transition" style={{ backgroundColor: 'white', color: NAVY, border: '1px solid #D6DCE5' }}>Ver archivo</button>
                  </div>
                  <div className="space-y-2">
                    {assignmentCapacidades.map(function (cap) {
                      const key = `${s.id}__${cap.id}`
                      const currentScore = submissionScoresMap[key]
                      return (
                        <div key={cap.id} className="flex justify-between items-center rounded-lg px-3 py-2" style={{ backgroundColor: 'white', border: '1px solid #E5E9F0' }}>
                          <span className="text-xs" style={{ color: NAVY_DARK }}>{cap.nombre}</span>
                          <input type="number" min="0" max="20" step="0.5" defaultValue={currentScore != null ? currentScore : ''} placeholder="Nota"
                            className="w-16 rounded-lg text-sm px-2 py-1 outline-none" style={inputStyle}
                            onBlur={function (e) { if (e.target.value) handleGradeCapacidad(s.id, cap.id, e.target.value) }} />
                        </div>
                      )
                    })}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
        <PreviewModal preview={preview} onClose={function () { setPreview(null) }} />
      </div>
    )
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h4 className="text-sm font-semibold" style={{ color: NAVY_DARK }}>Tareas de esta actividad</h4>
        <button onClick={function () { if (showForm) setShowForm(false); else openNew() }}
          className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white transition hover:opacity-90" style={{ backgroundColor: GREEN }}>
          {showForm ? 'Cancelar' : '+ Nueva tarea'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="rounded-xl p-4 mb-5 space-y-3" style={{ backgroundColor: '#F4F6F9', border: '1px solid #E5E9F0' }}>
          {capacidadesDeActividad.length > 0 && (
            <div>
              <label className="block text-xs font-medium mb-2" style={{ color: NAVY_DARK }}>¿Qué capacidad(es) evalúa esta tarea?</label>
              <div className="space-y-1.5">
                {capacidadesDeActividad.map(function (ac) {
                  const checked = selectedCapacidades.includes(ac.capacidad.id)
                  return (
                    <label key={ac.capacidad.id} className="flex items-start gap-2 text-sm rounded-lg px-3 py-2 cursor-pointer" style={{ backgroundColor: 'white', border: '1px solid #D6DCE5' }}>
                      <input type="checkbox" checked={checked} onChange={function () { toggleCapacidad(ac.capacidad.id) }} className="mt-0.5" />
                      <span style={{ color: NAVY_DARK }}>{ac.capacidad.nombre}</span>
                    </label>
                  )
                })}
              </div>
            </div>
          )}
          <input type="text" value={titulo} onChange={function (e) { setTitulo(e.target.value) }} required placeholder="Título de la tarea" className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={inputStyle} />
          <textarea value={descripcion} onChange={function (e) { setDescripcion(e.target.value) }} placeholder="Descripción (opcional)" rows={2} className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={inputStyle} />
          <input type="text" value={instrumento} onChange={function (e) { setInstrumento(e.target.value) }} placeholder="Instrumento de evaluación" className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={inputStyle} />
          <div className="grid grid-cols-2 gap-3">
            <input type="datetime-local" value={fechaEntrega} onChange={function (e) { setFechaEntrega(e.target.value) }} required className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={inputStyle} />
            <input type="number" value={puntajeMax} onChange={function (e) { setPuntajeMax(e.target.value) }} max={20} min={0} className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={inputStyle} />
          </div>
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <button type="submit" className="font-semibold px-4 py-2 rounded-lg text-white transition hover:opacity-90" style={{ backgroundColor: GREEN }}>
            {editingId ? 'Guardar cambios' : 'Crear tarea'}
          </button>
        </form>
      )}

      {loading ? <p className="text-slate-400 text-sm">Cargando...</p> : assignments.length === 0 ? (
        <p className="text-slate-400 text-sm">Aún no hay tareas en esta actividad.</p>
      ) : (
        <ul className="space-y-3">
          {assignments.map(function (a) {
            return (
              <li key={a.id} className="rounded-xl p-4" style={{ backgroundColor: '#F4F6F9', border: '1px solid #E5E9F0' }}>
                <div className="flex justify-between items-start flex-wrap gap-3">
                  <div>
                    <p className="text-sm font-semibold" style={{ color: NAVY_DARK }}>{a.titulo}</p>
                    <p className="text-xs text-slate-500">Entrega: {new Date(a.fecha_entrega).toLocaleString('es-PE')}</p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={function () { openSubmissions(a) }} className="text-xs font-semibold px-3 py-1.5 rounded-lg transition" style={{ backgroundColor: 'white', color: NAVY, border: '1px solid #D6DCE5' }}>Ver entregas</button>
                    <button onClick={function () { openEdit(a) }} className="text-xs font-semibold px-3 py-1.5 rounded-lg transition" style={{ backgroundColor: 'white', color: NAVY, border: '1px solid #D6DCE5' }}>Editar</button>
                    <button onClick={function () { handleDeleteAssignment(a.id) }} className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white transition hover:opacity-90" style={{ backgroundColor: '#B91C1C' }}>Eliminar</button>
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

function FolderIcon({ big }) {
  const size = big ? 28 : 18
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={GREEN} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  )
}