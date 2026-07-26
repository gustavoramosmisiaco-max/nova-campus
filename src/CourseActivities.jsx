import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import { useAuth } from './AuthContext'

const NAVY_DARK = '#0F2A4A'
const NAVY = '#1d5c8f'
const GREEN = '#5DAA47'
const GREEN_DARK = '#2f7a1f'

const inputStyle = { backgroundColor: 'white', border: '1px solid #D6DCE5', color: NAVY_DARK }
const TIPOS_UNIDAD = ['Unidad', 'Experiencia de aprendizaje']
const NUMEROS_UNIDAD = [1, 2, 3, 4, 5, 6]

function getArea(nombreCurso) {
  return nombreCurso === 'Matematica' ? 'Matematica' : 'Ciencia y Tecnologia'
}

export default function CourseActivities({ courseId }) {
  const { session } = useAuth()
  const [courseNombre, setCourseNombre] = useState('')
  const [activities, setActivities] = useState([])
  const [competencias, setCompetencias] = useState([])
  const [capacidadesDisponibles, setCapacidadesDisponibles] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)

  const [tipoUnidad, setTipoUnidad] = useState('Unidad')
  const [numeroUnidad, setNumeroUnidad] = useState(1)
  const [nombre, setNombre] = useState('')
  const [proposito, setProposito] = useState('')
  const [competenciaId, setCompetenciaId] = useState('')
  const [detalles, setDetalles] = useState({})

  useEffect(function () {
    init()
  }, [courseId])

  async function init() {
    setLoading(true)
    const courseResult = await supabase.from('courses').select('nombre').eq('id', courseId).single()
    const nombreCurso = courseResult.data?.nombre || ''
    setCourseNombre(nombreCurso)

    const area = getArea(nombreCurso)
    const compResult = await supabase.from('competencias').select('*').eq('area', area).order('codigo')
    setCompetencias(compResult.data || [])

    await loadActivities()
    setLoading(false)
  }

  async function loadActivities() {
    const result = await supabase
      .from('actividades')
      .select('*, competencia:competencias(nombre, codigo), actividad_capacidades(criterio, desempeno, capacidad:capacidades(id, nombre, orden))')
      .eq('course_id', courseId)
      .order('created_at', { ascending: false })

    if (result.error) {
      setError(result.error.message)
    } else {
      setActivities(result.data)
    }
  }

  async function loadCapacidadesFor(compId) {
    if (!compId) {
      setCapacidadesDisponibles([])
      return
    }
    const result = await supabase.from('capacidades').select('*').eq('competencia_id', compId).order('orden')
    setCapacidadesDisponibles(result.data || [])
  }

  function resetForm() {
    setEditingId(null)
    setTipoUnidad('Unidad')
    setNumeroUnidad(1)
    setNombre('')
    setProposito('')
    setCompetenciaId('')
    setDetalles({})
    setCapacidadesDisponibles([])
  }

  function openNewForm() {
    resetForm()
    setShowForm(true)
  }

  async function openEditForm(a) {
    setEditingId(a.id)
    setTipoUnidad(a.tipo_unidad || 'Unidad')
    setNumeroUnidad(a.numero_unidad ? Number(a.numero_unidad) : 1)
    setNombre(a.nombre)
    setProposito(a.proposito || '')
    const compId = a.competencia ? competencias.find(function (c) { return c.nombre === a.competencia.nombre })?.id : ''
    setCompetenciaId(compId || '')
    if (compId) await loadCapacidadesFor(compId)

    const newDetalles = {}
    ;(a.actividad_capacidades || []).forEach(function (ac) {
      newDetalles[ac.capacidad.id] = { checked: true, criterio: ac.criterio || '', desempeno: ac.desempeno || '' }
    })
    setDetalles(newDetalles)
    setShowForm(true)
  }

  function toggleCapacidad(id) {
    setDetalles(function (prev) {
      const existing = prev[id]
      if (existing && existing.checked) {
        return { ...prev, [id]: { ...existing, checked: false } }
      }
      return { ...prev, [id]: { checked: true, criterio: existing?.criterio || '', desempeno: existing?.desempeno || '' } }
    })
  }

  function updateDetalle(id, field, value) {
    setDetalles(function (prev) {
      return { ...prev, [id]: { ...prev[id], [field]: value } }
    })
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    const payload = {
      course_id: courseId,
      tipo_unidad: tipoUnidad,
      numero_unidad: String(numeroUnidad),
      nombre: nombre,
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

    if (result.error) {
      setError(result.error.message)
      return
    }

    if (editingId) {
      await supabase.from('actividad_capacidades').delete().eq('actividad_id', actividadId)
    }

    const selectedIds = Object.keys(detalles).filter(function (id) { return detalles[id].checked })
    if (selectedIds.length > 0) {
      const capsPayload = selectedIds.map(function (capId) {
        return {
          actividad_id: actividadId,
          capacidad_id: capId,
          criterio: detalles[capId].criterio || '',
          desempeno: detalles[capId].desempeno || '',
        }
      })
      const capsResult = await supabase.from('actividad_capacidades').insert(capsPayload)
      if (capsResult.error) {
        setError(capsResult.error.message)
        return
      }
    }

    resetForm()
    setShowForm(false)
    loadActivities()
  }

  async function handleDelete(id) {
    if (!confirm('¿Eliminar esta actividad? Las tareas ligadas a ella no se borrarán, pero perderán la referencia.')) return
    const result = await supabase.from('actividades').delete().eq('id', id)
    if (result.error) {
      alert('Error: ' + result.error.message)
    } else {
      loadActivities()
    }
  }

  if (loading) return <p className="text-slate-400 text-sm">Cargando actividades...</p>

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <div>
          <h3 className="text-lg font-bold" style={{ color: NAVY_DARK }}>Actividades de aprendizaje</h3>
          <p className="text-xs text-slate-400">Área: {getArea(courseNombre)}</p>
        </div>
        <button
          onClick={function () {
            if (showForm) { setShowForm(false) } else { openNewForm() }
          }}
          className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white transition hover:opacity-90"
          style={{ backgroundColor: GREEN }}
        >
          {showForm ? 'Cancelar' : '+ Nueva actividad'}
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="rounded-xl p-4 mb-5 space-y-3"
          style={{ backgroundColor: '#F4F6F9', border: '1px solid #E5E9F0' }}
        >
          <h4 className="text-sm font-semibold" style={{ color: NAVY_DARK }}>
            {editingId ? 'Editar actividad' : 'Nueva actividad'}
          </h4>

          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: NAVY_DARK }}>Tipo</label>
            <div className="flex gap-2 mb-2">
              {TIPOS_UNIDAD.map(function (t) {
                const active = tipoUnidad === t
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={function () { setTipoUnidad(t) }}
                    className="text-xs font-semibold px-3 py-1.5 rounded-lg transition"
                    style={
                      active
                        ? { backgroundColor: GREEN, color: 'white' }
                        : { backgroundColor: 'white', color: NAVY_DARK, border: '1px solid #D6DCE5' }
                    }
                  >
                    {t}
                  </button>
                )
              })}
            </div>
            <label className="block text-xs font-medium mb-1" style={{ color: NAVY_DARK }}>Número</label>
            <div className="flex gap-2 flex-wrap">
              {NUMEROS_UNIDAD.map(function (n) {
                const active = numeroUnidad === n
                return (
                  <button
                    key={n}
                    type="button"
                    onClick={function () { setNumeroUnidad(n) }}
                    className="w-9 h-9 rounded-lg text-sm font-semibold transition"
                    style={
                      active
                        ? { backgroundColor: NAVY, color: 'white' }
                        : { backgroundColor: 'white', color: NAVY_DARK, border: '1px solid #D6DCE5' }
                    }
                  >
                    {n}
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: NAVY_DARK }}>Nombre de la actividad</label>
            <input
              type="text"
              value={nombre}
              onChange={function (e) { setNombre(e.target.value) }}
              required
              placeholder="Ej: La célula y sus funciones"
              className="w-full rounded-lg px-3 py-2 text-sm outline-none"
              style={inputStyle}
            />
          </div>

          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: NAVY_DARK }}>Propósito</label>
            <textarea
              value={proposito}
              onChange={function (e) { setProposito(e.target.value) }}
              rows={2}
              placeholder="Propósito de aprendizaje de esta actividad"
              className="w-full rounded-lg px-3 py-2 text-sm outline-none"
              style={inputStyle}
            />
          </div>

          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: NAVY_DARK }}>Competencia</label>
            <select
              value={competenciaId}
              onChange={async function (e) {
                setCompetenciaId(e.target.value)
                setDetalles({})
                await loadCapacidadesFor(e.target.value)
              }}
              className="w-full rounded-lg px-3 py-2 text-sm outline-none"
              style={inputStyle}
            >
              <option value="">-- Selecciona una competencia --</option>
              {competencias.map(function (c) {
                return <option key={c.id} value={c.id}>{c.codigo} — {c.nombre}</option>
              })}
            </select>
          </div>

          {capacidadesDisponibles.length > 0 && (
            <div>
              <label className="block text-xs font-medium mb-2" style={{ color: NAVY_DARK }}>
                Capacidades a evaluar (marca una o varias — cada una con su propio criterio y desempeño)
              </label>
              <div className="space-y-2">
                {capacidadesDisponibles.map(function (cap) {
                  const det = detalles[cap.id]
                  const checked = det?.checked || false
                  return (
                    <div key={cap.id} className="rounded-lg p-3" style={{ backgroundColor: 'white', border: '1px solid #D6DCE5' }}>
                      <label className="flex items-start gap-2 text-sm cursor-pointer">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={function () { toggleCapacidad(cap.id) }}
                          className="mt-0.5"
                        />
                        <span style={{ color: NAVY_DARK }}>{cap.nombre}</span>
                      </label>
                      {checked && (
                        <div className="mt-2 pl-6 space-y-2">
                          <input
                            type="text"
                            value={det?.criterio || ''}
                            onChange={function (e) { updateDetalle(cap.id, 'criterio', e.target.value) }}
                            placeholder="Criterio de evaluación para esta capacidad"
                            className="w-full rounded-lg px-3 py-1.5 text-xs outline-none"
                            style={{ backgroundColor: '#F4F6F9', border: '1px solid #D6DCE5', color: NAVY_DARK }}
                          />
                          <input
                            type="text"
                            value={det?.desempeno || ''}
                            onChange={function (e) { updateDetalle(cap.id, 'desempeno', e.target.value) }}
                            placeholder="Desempeño para esta capacidad (opcional)"
                            className="w-full rounded-lg px-3 py-1.5 text-xs outline-none"
                            style={{ backgroundColor: '#F4F6F9', border: '1px solid #D6DCE5', color: NAVY_DARK }}
                          />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {error && <p className="text-red-500 text-sm">{error}</p>}

          <button
            type="submit"
            className="font-semibold px-4 py-2 rounded-lg text-white transition hover:opacity-90"
            style={{ backgroundColor: GREEN }}
          >
            {editingId ? 'Guardar cambios' : 'Crear actividad'}
          </button>
        </form>
      )}

      {activities.length === 0 ? (
        <p className="text-slate-400 text-sm">Aún no hay actividades registradas para este curso.</p>
      ) : (
        <ul className="space-y-3">
          {activities.map(function (a) {
            return (
              <li
                key={a.id}
                className="rounded-xl p-4"
                style={{ backgroundColor: '#F4F6F9', border: '1px solid #E5E9F0' }}
              >
                <div className="flex justify-between items-start flex-wrap gap-3">
                  <div>
                    <p className="text-xs font-semibold" style={{ color: GREEN_DARK }}>
                      {a.tipo_unidad || 'Unidad'} {a.numero_unidad}
                    </p>
                    <p className="text-sm font-semibold" style={{ color: NAVY_DARK }}>{a.nombre}</p>
                    {a.proposito && <p className="text-xs text-slate-500 mt-1">Propósito: {a.proposito}</p>}
                    {a.competencia && (
                      <p className="text-xs text-slate-500 mt-1">{a.competencia.codigo} — {a.competencia.nombre}</p>
                    )}
                    {a.actividad_capacidades && a.actividad_capacidades.length > 0 && (
                      <div className="mt-2 space-y-1.5">
                        {a.actividad_capacidades
                          .slice()
                          .sort(function (x, y) { return (x.capacidad.orden || 0) - (y.capacidad.orden || 0) })
                          .map(function (ac, i) {
                            return (
                              <div key={i} className="text-xs rounded-lg px-2 py-1.5" style={{ backgroundColor: 'white', border: '1px solid #E5E9F0' }}>
                                <p className="font-medium" style={{ color: NAVY }}>{ac.capacidad.nombre}</p>
                                {ac.criterio && <p className="text-slate-500">Criterio: {ac.criterio}</p>}
                                {ac.desempeno && <p className="text-slate-500">Desempeño: {ac.desempeno}</p>}
                              </div>
                            )
                          })}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={function () { openEditForm(a) }}
                      className="text-xs font-semibold px-3 py-1.5 rounded-lg transition"
                      style={{ backgroundColor: 'white', color: NAVY, border: '1px solid #D6DCE5' }}
                    >
                      Editar
                    </button>
                    <button
                      onClick={function () { handleDelete(a.id) }}
                      className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white transition hover:opacity-90"
                      style={{ backgroundColor: '#B91C1C' }}
                    >
                      Eliminar
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