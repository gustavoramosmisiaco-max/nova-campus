import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'

const NAVY_DARK = '#0F2A4A'
const NAVY = '#1d5c8f'
const GREEN = '#5DAA47'

const DIAS = [
  { value: 1, label: 'Lunes' },
  { value: 2, label: 'Martes' },
  { value: 3, label: 'Miércoles' },
  { value: 4, label: 'Jueves' },
  { value: 5, label: 'Viernes' },
  { value: 6, label: 'Sábado' },
  { value: 7, label: 'Domingo' },
]
const GRADOS = [1, 2, 3, 4, 5]
const SECCIONES = ['A', 'B', 'C', 'D', 'E']

function gradoLabel(g) {
  return g ? `${g}° de Secundaria` : 'Sin grado'
}

function diaLabel(v) {
  return DIAS.find(function (d) { return d.value === v })?.label || '—'
}

function scheduleText(schedules) {
  if (!schedules || schedules.length === 0) return 'Sin horario definido'
  const sorted = [...schedules].sort(function (a, b) { return a.dia_semana - b.dia_semana })
  return sorted
    .map(function (s) {
      return `${diaLabel(s.dia_semana)} ${s.hora_inicio?.slice(0, 5)}-${s.hora_fin?.slice(0, 5)}`
    })
    .join(' · ')
}

const inputStyle = { backgroundColor: 'white', border: '1px solid #D6DCE5', color: NAVY_DARK }

const emptyBlock = { dia_semana: 1, hora_inicio: '', hora_fin: '' }

export default function CoursesManager() {
  const [courses, setCourses] = useState([])
  const [docentes, setDocentes] = useState([])
  const [areas, setAreas] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [error, setError] = useState('')

  const [form, setForm] = useState({
    asignatura_id: '',
    grupo: 'A',
    grado: 1,
    docente_id: '',
    descripcion: '',
  })
  const [schedules, setSchedules] = useState([{ ...emptyBlock }])

  useEffect(function () {
    loadCourses()
    loadDocentes()
    loadAreas()
  }, [])

  async function loadCourses() {
    setLoading(true)
    const result = await supabase
      .from('courses')
      .select('*, docente:profiles(full_name), course_schedules(*)')
      .order('grado', { ascending: true })
      .order('grupo', { ascending: true })
      .order('nombre', { ascending: true })

    if (result.error) {
      setError(result.error.message)
    } else {
      setCourses(result.data)
    }
    setLoading(false)
  }

  async function loadDocentes() {
    const result = await supabase
      .from('profiles')
      .select('id, full_name')
      .eq('role', 'docente')
      .order('full_name')

    if (!result.error) setDocentes(result.data)
  }

  async function loadAreas() {
    const result = await supabase
      .from('areas_curriculares')
      .select('*, asignaturas(id, nombre, activo)')
      .order('orden', { ascending: true })

    if (!result.error) {
      const sorted = result.data.map(function (area) {
        return {
          ...area,
          asignaturas: area.asignaturas
            .filter(function (a) { return a.activo })
            .sort(function (a, b) { return a.nombre.localeCompare(b.nombre) }),
        }
      }).filter(function (area) { return area.asignaturas.length > 0 })
      setAreas(sorted)
    }
  }

  function firstAsignaturaId() {
    return areas[0]?.asignaturas[0]?.id || ''
  }

  function openNewForm() {
    setEditingId(null)
    setForm({
      asignatura_id: firstAsignaturaId(),
      grupo: 'A',
      grado: 1,
      docente_id: '',
      descripcion: '',
    })
    setSchedules([{ ...emptyBlock }])
    setShowForm(true)
  }

  function openEditForm(course) {
    setEditingId(course.id)
    setForm({
      asignatura_id: course.asignatura_id || '',
      grupo: SECCIONES.includes(course.grupo) ? course.grupo : 'A',
      grado: course.grado || 1,
      docente_id: course.docente_id || '',
      descripcion: course.descripcion || '',
    })
    const existing = (course.course_schedules || []).map(function (s) {
      return { dia_semana: s.dia_semana, hora_inicio: s.hora_inicio?.slice(0, 5) || '', hora_fin: s.hora_fin?.slice(0, 5) || '' }
    })
    setSchedules(existing.length > 0 ? existing : [{ ...emptyBlock }])
    setShowForm(true)
  }

  function addScheduleBlock() {
    setSchedules(function (prev) { return [...prev, { ...emptyBlock }] })
  }

  function removeScheduleBlock(index) {
    setSchedules(function (prev) { return prev.filter(function (_, i) { return i !== index }) })
  }

  function updateScheduleBlock(index, field, value) {
    setSchedules(function (prev) {
      return prev.map(function (s, i) {
        return i === index ? { ...s, [field]: value } : s
      })
    })
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (!form.asignatura_id) {
      setError('Selecciona una asignatura.')
      return
    }

    const validSchedules = schedules.filter(function (s) { return s.hora_inicio && s.hora_fin })
    if (validSchedules.length === 0) {
      setError('Agrega al menos un bloque de horario válido.')
      return
    }

    const asignaturaSeleccionada = areas
      .flatMap(function (a) { return a.asignaturas })
      .find(function (a) { return a.id === form.asignatura_id })

    const payload = {
      nombre: asignaturaSeleccionada?.nombre || '',
      asignatura_id: form.asignatura_id,
      grupo: form.grupo,
      grado: form.grado,
      docente_id: form.docente_id || null,
      descripcion: form.descripcion,
    }

    let courseId = editingId
    let result
    if (editingId) {
      result = await supabase.from('courses').update(payload).eq('id', editingId)
    } else {
      result = await supabase.from('courses').insert(payload).select('id').single()
      if (!result.error) courseId = result.data.id
    }

    if (result.error) {
      setError(result.error.message)
      return
    }

    if (editingId) {
      const delResult = await supabase.from('course_schedules').delete().eq('course_id', courseId)
      if (delResult.error) {
        setError(delResult.error.message)
        return
      }
    }

    const schedulesPayload = validSchedules.map(function (s) {
      return { course_id: courseId, dia_semana: s.dia_semana, hora_inicio: s.hora_inicio, hora_fin: s.hora_fin }
    })
    const insertSchedulesResult = await supabase.from('course_schedules').insert(schedulesPayload)

    if (insertSchedulesResult.error) {
      setError(insertSchedulesResult.error.message)
      return
    }

    setShowForm(false)
    loadCourses()
  }

  async function handleDelete(id) {
    if (!confirm('¿Seguro que quieres eliminar este curso? Esto también borrará matrículas, materiales, tareas y horarios asociados.')) return
    const result = await supabase.from('courses').delete().eq('id', id)
    if (result.error) {
      alert('Error al eliminar: ' + result.error.message)
    } else {
      loadCourses()
    }
  }

  const coursesByGrado = GRADOS.map(function (g) {
    return { grado: g, items: courses.filter(function (c) { return c.grado === g }) }
  })
  const sinGrado = courses.filter(function (c) { return !c.grado })

  function renderCourseCard(c) {
    return (
      <div
        key={c.id}
        className="bg-white rounded-2xl p-5 space-y-1"
        style={{ border: '1px solid #E5E9F0', boxShadow: '0 1px 3px rgba(15,42,74,0.06)' }}
      >
        <div className="flex justify-between items-start">
          <h3 className="text-lg font-bold" style={{ color: NAVY_DARK }}>
            {c.nombre} <span className="text-slate-400 text-sm font-medium">(Sección {c.grupo})</span>
          </h3>
          <div className="flex gap-2">
            <button
              onClick={function () { openEditForm(c) }}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg transition"
              style={{ backgroundColor: 'white', color: NAVY, border: '1px solid #D6DCE5' }}
            >
              Editar
            </button>
            <button
              onClick={function () { handleDelete(c.id) }}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white transition hover:opacity-90"
              style={{ backgroundColor: '#B91C1C' }}
            >
              Eliminar
            </button>
          </div>
        </div>
        <p className="text-sm text-slate-500">
          Docente: {c.docente?.full_name || 'Sin asignar'}
        </p>
        <p className="text-sm font-medium" style={{ color: '#2f7a1f' }}>
          {scheduleText(c.course_schedules)}
        </p>
      </div>
    )
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold" style={{ color: NAVY_DARK }}>Gestión de Cursos</h2>
        <button
          onClick={openNewForm}
          className="font-semibold px-4 py-2 rounded-lg transition text-white hover:opacity-90"
          style={{ backgroundColor: GREEN }}
        >
          + Nuevo curso
        </button>
      </div>

      {loading ? (
        <p className="text-slate-400">Cargando cursos...</p>
      ) : courses.length === 0 ? (
        <p className="text-slate-400">Aún no hay cursos creados.</p>
      ) : (
        <div className="space-y-8">
          {coursesByGrado.map(function (group) {
            if (group.items.length === 0) return null
            return (
              <div key={group.grado}>
                <h3
                  className="text-sm font-bold uppercase tracking-wide mb-3 px-3 py-1.5 rounded-lg inline-block"
                  style={{ backgroundColor: '#E7F3E4', color: '#2f7a1f' }}
                >
                  {gradoLabel(group.grado)}
                </h3>
                <div className="grid gap-4 md:grid-cols-2">
                  {group.items.map(renderCourseCard)}
                </div>
              </div>
            )
          })}

          {sinGrado.length > 0 && (
            <div>
              <h3
                className="text-sm font-bold uppercase tracking-wide mb-3 px-3 py-1.5 rounded-lg inline-block"
                style={{ backgroundColor: '#FDECEC', color: '#B91C1C' }}
              >
                Sin grado asignado
              </h3>
              <div className="grid gap-4 md:grid-cols-2">
                {sinGrado.map(renderCourseCard)}
              </div>
            </div>
          )}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <form
            onSubmit={handleSubmit}
            className="bg-white rounded-2xl p-6 w-full max-w-md space-y-4 max-h-[90vh] overflow-y-auto"
            style={{ border: '1px solid #E5E9F0' }}
          >
            <h3 className="text-xl font-bold" style={{ color: NAVY_DARK }}>
              {editingId ? 'Editar curso' : 'Nuevo curso'}
            </h3>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: NAVY_DARK }}>Grado</label>
                <select
                  value={form.grado}
                  onChange={function (e) { setForm({ ...form, grado: Number(e.target.value) }) }}
                  className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                  style={inputStyle}
                >
                  {GRADOS.map(function (g) {
                    return <option key={g} value={g}>{g}°</option>
                  })}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: NAVY_DARK }}>Sección</label>
                <select
                  value={form.grupo}
                  onChange={function (e) { setForm({ ...form, grupo: e.target.value }) }}
                  className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                  style={inputStyle}
                >
                  {SECCIONES.map(function (s) {
                    return <option key={s} value={s}>Sección {s}</option>
                  })}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: NAVY_DARK }}>Asignatura</label>
              <select
                value={form.asignatura_id}
                onChange={function (e) { setForm({ ...form, asignatura_id: e.target.value }) }}
                required
                className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                style={inputStyle}
              >
                <option value="">-- Selecciona una asignatura --</option>
                {areas.map(function (area) {
                  return (
                    <optgroup key={area.id} label={area.nombre}>
                      {area.asignaturas.map(function (a) {
                        return <option key={a.id} value={a.id}>{a.nombre}</option>
                      })}
                    </optgroup>
                  )
                })}
              </select>
              {areas.length === 0 && (
                <p className="text-xs mt-1" style={{ color: '#B91C1C' }}>
                  No hay asignaturas activas. Actívalas primero en la pestaña "Asignaturas".
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: NAVY_DARK }}>Docente asignado</label>
              <select
                value={form.docente_id}
                onChange={function (e) { setForm({ ...form, docente_id: e.target.value }) }}
                className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                style={inputStyle}
              >
                <option value="">Sin asignar</option>
                {docentes.map(function (d) {
                  return <option key={d.id} value={d.id}>{d.full_name}</option>
                })}
              </select>
            </div>

            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="block text-sm font-medium" style={{ color: NAVY_DARK }}>
                  Horarios (puedes agregar varios días)
                </label>
                <button
                  type="button"
                  onClick={addScheduleBlock}
                  className="text-xs font-semibold px-3 py-1 rounded-lg transition"
                  style={{ backgroundColor: 'white', color: NAVY, border: '1px solid #D6DCE5' }}
                >
                  + Agregar día
                </button>
              </div>

              <div className="space-y-2">
                {schedules.map(function (block, index) {
                  return (
                    <div
                      key={index}
                      className="rounded-lg p-3 space-y-2"
                      style={{ backgroundColor: '#F4F6F9', border: '1px solid #E5E9F0' }}
                    >
                      <div className="flex justify-between items-center">
                        <select
                          value={block.dia_semana}
                          onChange={function (e) { updateScheduleBlock(index, 'dia_semana', Number(e.target.value)) }}
                          className="rounded-lg px-2 py-1.5 text-sm outline-none flex-1 mr-2"
                          style={inputStyle}
                        >
                          {DIAS.map(function (d) {
                            return <option key={d.value} value={d.value}>{d.label}</option>
                          })}
                        </select>
                        {schedules.length > 1 && (
                          <button
                            type="button"
                            onClick={function () { removeScheduleBlock(index) }}
                            className="text-xs font-semibold px-2 py-1.5 rounded-lg text-white transition hover:opacity-90"
                            style={{ backgroundColor: '#B91C1C' }}
                          >
                            Quitar
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="time"
                          value={block.hora_inicio}
                          onChange={function (e) { updateScheduleBlock(index, 'hora_inicio', e.target.value) }}
                          required
                          className="w-full rounded-lg px-2 py-1.5 text-sm outline-none"
                          style={inputStyle}
                        />
                        <input
                          type="time"
                          value={block.hora_fin}
                          onChange={function (e) { updateScheduleBlock(index, 'hora_fin', e.target.value) }}
                          required
                          className="w-full rounded-lg px-2 py-1.5 text-sm outline-none"
                          style={inputStyle}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: NAVY_DARK }}>Descripción (opcional)</label>
              <textarea
                value={form.descripcion}
                onChange={function (e) { setForm({ ...form, descripcion: e.target.value }) }}
                className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                style={inputStyle}
                rows={2}
              />
            </div>

            {error && <p className="text-red-500 text-sm">{error}</p>}

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={function () { setShowForm(false) }}
                className="flex-1 py-2 rounded-lg transition font-medium"
                style={{ backgroundColor: '#F4F6F9', color: NAVY_DARK, border: '1px solid #D6DCE5' }}
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="flex-1 font-semibold py-2 rounded-lg transition text-white hover:opacity-90"
                style={{ backgroundColor: GREEN }}
              >
                Guardar
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}