import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import { useAuth } from './AuthContext'

const NAVY_DARK = '#0F2A4A'
const NAVY = '#1d5c8f'
const GREEN = '#5DAA47'
const GREEN_DARK = '#2f7a1f'

const inputStyle = { backgroundColor: 'white', border: '1px solid #D6DCE5', color: NAVY_DARK }

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

  const [numeroUnidad, setNumeroUnidad] = useState('')
  const [nombre, setNombre] = useState('')
  const [competenciaId, setCompetenciaId] = useState('')
  const [selectedCapacidades, setSelectedCapacidades] = useState([])
  const [criterio, setCriterio] = useState('')
  const [desempeno, setDesempeno] = useState('')

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
      .select('*, competencia:competencias(nombre, codigo), actividad_capacidades(capacidad:capacidades(id, nombre))')
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
    const result = await supabase.from('capacidades').select('*').eq('competencia_id', compId).order('nombre')
    setCapacidadesDisponibles(result.data || [])
  }

  function resetForm() {
    setEditingId(null)
    setNumeroUnidad('')
    setNombre('')
    setCompetenciaId('')
    setSelectedCapacidades([])
    setCriterio('')
    setDesempeno('')
    setCapacidadesDisponibles([])
  }

  function openNewForm() {
    resetForm()
    setShowForm(true)
  }

  async function openEditForm(a) {
    setEditingId(a.id)
    setNumeroUnidad(a.numero_unidad || '')
    setNombre(a.nombre)
    setCriterio(a.criterio || '')
    setDesempeno(a.desempeno || '')
    const compId = a.competencia ? competencias.find(function (c) { return c.nombre === a.competencia.nombre })?.id : ''
    setCompetenciaId(compId || '')
    if (compId) await loadCapacidadesFor(compId)
    const capIds = (a.actividad_capacidades || []).map(function (ac) { return ac.capacidad.id })
    setSelectedCapacidades(capIds)
    setShowForm(true)
  }

  function toggleCapacidad(id) {
    setSelectedCapacidades(function (prev) {
      return prev.includes(id) ? prev.filter(function (c) { return c !== id }) : [...prev, id]
    })
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    const payload = {
      course_id: courseId,
      numero_unidad: numeroUnidad,
      nombre: nombre,
      competencia_id: competenciaId || null,
      criterio: criterio,
      desempeno: desempeno,
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
    if (selectedCapacidades.length > 0) {
      const capsPayload = selectedCapacidades.map(function (capId) {
        return { actividad_id: actividadId, capacidad_id: capId }
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

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: NAVY_DARK }}>
                Unidad / Experiencia de aprendizaje
              </label>
              <input
                type="text"
                value={numeroUnidad}
                onChange={function (e) { setNumeroUnidad(e.target.value) }}
                placeholder="Ej: Unidad 3"
                className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                style={inputStyle}
              />
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
          </div>

          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: NAVY_DARK }}>Competencia</label>
            <select
              value={competenciaId}
              onChange={async function (e) {
                setCompetenciaId(e.target.value)
                setSelectedCapacidades([])
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
              <label className="block text-xs font-medium mb-1" style={{ color: NAVY_DARK }}>
                Capacidades (elige una o varias)
              </label>
              <div className="space-y-1.5">
                {capacidadesDisponibles.map(function (cap) {
                  const checked = selectedCapacidades.includes(cap.id)
                  return (
                    <label
                      key={cap.id}
                      className="flex items-start gap-2 text-sm rounded-lg px-3 py-2 cursor-pointer"
                      style={{ backgroundColor: 'white', border: '1px solid #D6DCE5' }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={function () { toggleCapacidad(cap.id) }}
                        className="mt-0.5"
                      />
                      <span style={{ color: NAVY_DARK }}>{cap.nombre}</span>
                    </label>
                  )
                })}
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: NAVY_DARK }}>Criterio de evaluación</label>
            <textarea
              value={criterio}
              onChange={function (e) { setCriterio(e.target.value) }}
              rows={2}
              placeholder="Ej: Registra datos con precisión usando instrumentos adecuados"
              className="w-full rounded-lg px-3 py-2 text-sm outline-none"
              style={inputStyle}
            />
          </div>

          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: NAVY_DARK }}>Desempeño (opcional)</label>
            <textarea
              value={desempeno}
              onChange={function (e) { setDesempeno(e.target.value) }}
              rows={2}
              placeholder="Desempeño precisado de la sesión"
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
                      {a.numero_unidad || 'Sin unidad'}
                    </p>
                    <p className="text-sm font-semibold" style={{ color: NAVY_DARK }}>{a.nombre}</p>
                    {a.competencia && (
                      <p className="text-xs text-slate-500 mt-1">{a.competencia.codigo} — {a.competencia.nombre}</p>
                    )}
                    {a.actividad_capacidades && a.actividad_capacidades.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {a.actividad_capacidades.map(function (ac) {
                          return (
                            <span
                              key={ac.capacidad.id}
                              className="text-xs px-2 py-0.5 rounded-full"
                              style={{ backgroundColor: 'white', color: NAVY, border: '1px solid #D6DCE5' }}
                            >
                              {ac.capacidad.nombre}
                            </span>
                          )
                        })}
                      </div>
                    )}
                    {a.criterio && <p className="text-xs text-slate-500 mt-2">Criterio: {a.criterio}</p>}
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