import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import { useAuth } from './AuthContext'
import { compararPorApellido } from './gradeUtils'

const NAVY_DARK = '#0F2A4A'
const NAVY = '#1d5c8f'
const GREEN = '#5DAA47'

const inputStyle = { backgroundColor: 'white', border: '1px solid #D6DCE5', color: NAVY_DARK }

export default function GruposTrabajo({ courseId }) {
  const { session } = useAuth()
  const [grupos, setGrupos] = useState([])
  const [estudiantes, setEstudiantes] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [nombre, setNombre] = useState('')
  const [miembrosSeleccionados, setMiembrosSeleccionados] = useState(new Set())

  useEffect(function () {
    cargarTodo()
  }, [courseId])

  async function cargarTodo() {
    setLoading(true)
    setError('')

    const enrollResult = await supabase
      .from('enrollments')
      .select('student:profiles(id, full_name)')
      .eq('course_id', courseId)
      .eq('status', 'activo')
    const lista = enrollResult.error ? [] : enrollResult.data.map(function (e) { return e.student }).filter(Boolean)
    lista.sort(function (a, b) { return compararPorApellido(a.full_name, b.full_name) })
    setEstudiantes(lista)

    const gruposResult = await supabase
      .from('grupos_trabajo')
      .select('*, grupos_trabajo_miembros(student_id, student:profiles(full_name))')
      .eq('course_id', courseId)
      .order('nombre')
    if (gruposResult.error) setError(gruposResult.error.message)
    else setGrupos(gruposResult.data)

    setLoading(false)
  }

  function resetForm() {
    setEditingId(null)
    setNombre('')
    setMiembrosSeleccionados(new Set())
  }

  function openNew() {
    resetForm()
    setShowForm(true)
  }

  function openEdit(g) {
    setEditingId(g.id)
    setNombre(g.nombre)
    setMiembrosSeleccionados(new Set(g.grupos_trabajo_miembros.map(function (m) { return m.student_id })))
    setShowForm(true)
  }

  // Estudiantes que ya pertenecen a OTRO grupo (no al que se está creando/editando)
  const estudiantesEnOtroGrupo = new Set()
  grupos.forEach(function (g) {
    if (g.id === editingId) return
    g.grupos_trabajo_miembros.forEach(function (m) { estudiantesEnOtroGrupo.add(m.student_id) })
  })
  const estudiantesDisponibles = estudiantes.filter(function (s) { return !estudiantesEnOtroGrupo.has(s.id) })

  function toggleMiembro(studentId) {
    setMiembrosSeleccionados(function (prev) {
      const next = new Set(prev)
      if (next.has(studentId)) next.delete(studentId); else next.add(studentId)
      return next
    })
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!nombre.trim()) { setError('Ponle un nombre al grupo.'); return }

    let grupoId = editingId
    if (editingId) {
      const result = await supabase.from('grupos_trabajo').update({ nombre: nombre }).eq('id', editingId)
      if (result.error) { setError(result.error.message); return }
      await supabase.from('grupos_trabajo_miembros').delete().eq('grupo_id', editingId)
    } else {
      const result = await supabase.from('grupos_trabajo').insert({ course_id: courseId, nombre: nombre, created_by: session.user.id }).select('id').single()
      if (result.error) { setError(result.error.message); return }
      grupoId = result.data.id
    }

    if (miembrosSeleccionados.size > 0) {
      const payload = [...miembrosSeleccionados].map(function (studentId) { return { grupo_id: grupoId, student_id: studentId } })
      const miembrosResult = await supabase.from('grupos_trabajo_miembros').insert(payload)
      if (miembrosResult.error) { setError(miembrosResult.error.message); return }
    }

    resetForm()
    setShowForm(false)
    cargarTodo()
  }

  async function handleDelete(id) {
    if (!confirm('¿Eliminar este grupo de trabajo? Se borra también su chat grupal.')) return
    const result = await supabase.from('grupos_trabajo').delete().eq('id', id)
    if (result.error) alert('Error: ' + result.error.message)
    else cargarTodo()
  }

  if (loading) return <p className="text-slate-400 text-sm">Cargando...</p>

  return (
    <div>
      <div className="flex justify-between items-center mb-1">
        <h3 className="text-lg font-bold" style={{ color: NAVY_DARK }}>Grupos de Trabajo</h3>
        <button
          onClick={function () { if (showForm) setShowForm(false); else openNew() }}
          className="text-xs font-semibold px-4 py-2 rounded-lg text-white transition hover:opacity-90"
          style={{ backgroundColor: GREEN }}
        >
          {showForm ? 'Cancelar' : '+ Nuevo grupo'}
        </button>
      </div>
      <p className="text-sm text-slate-400 mb-4">
        Organiza a tus estudiantes en grupos — cada uno tiene su propio chat grupal para coordinar trabajos.
      </p>

      {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl p-4 mb-6" style={{ border: '1px solid #E5E9F0' }}>
          <h4 className="text-sm font-bold mb-3" style={{ color: NAVY_DARK }}>{editingId ? 'Editar grupo' : 'Nuevo grupo'}</h4>
          <div className="mb-3">
            <label className="block text-xs font-medium mb-1" style={{ color: NAVY_DARK }}>Nombre del grupo</label>
            <input type="text" value={nombre} onChange={function (e) { setNombre(e.target.value) }} required
              placeholder="Ej: Grupo 1 - Ecosistemas" className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={inputStyle} />
          </div>
          <div className="mb-3">
            <label className="block text-xs font-medium mb-2" style={{ color: NAVY_DARK }}>Miembros ({miembrosSeleccionados.size})</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-56 overflow-y-auto p-1">
              {estudiantesDisponibles.map(function (s) {
                const checked = miembrosSeleccionados.has(s.id)
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={function () { toggleMiembro(s.id) }}
                    className="text-left text-xs font-medium px-3 py-2 rounded-lg transition"
                    style={checked ? { backgroundColor: GREEN, color: 'white' } : { backgroundColor: '#F4F6F9', color: NAVY_DARK }}
                  >
                    {checked ? '✓ ' : ''}{s.full_name}
                  </button>
                )
              })}
            </div>
            {estudiantesEnOtroGrupo.size > 0 && (
              <p className="text-xs text-slate-400 mt-2">
                {estudiantesEnOtroGrupo.size} estudiante(s) no aparecen aquí porque ya están en otro grupo de este curso.
              </p>
            )}
          </div>
          <button type="submit" className="text-sm font-semibold px-4 py-2 rounded-lg text-white transition hover:opacity-90" style={{ backgroundColor: GREEN }}>
            {editingId ? 'Guardar cambios' : 'Crear grupo'}
          </button>
        </form>
      )}

      {grupos.length === 0 ? (
        <p className="text-slate-400 text-sm">Aún no hay grupos de trabajo creados.</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {grupos.map(function (g) {
            return (
              <div key={g.id} className="bg-white rounded-2xl p-4" style={{ border: '1px solid #E5E9F0' }}>
                <div className="flex justify-between items-start mb-2">
                  <p className="text-sm font-bold" style={{ color: NAVY_DARK }}>{g.nombre}</p>
                  <div className="flex gap-2">
                    <button onClick={function () { openEdit(g) }} className="text-xs font-semibold px-2 py-1 rounded-lg transition" style={{ backgroundColor: 'white', color: NAVY, border: '1px solid #D6DCE5' }}>Editar</button>
                    <button onClick={function () { handleDelete(g.id) }} className="text-xs font-semibold px-2 py-1 rounded-lg text-white transition hover:opacity-90" style={{ backgroundColor: '#B91C1C' }}>Eliminar</button>
                  </div>
                </div>
                <p className="text-xs text-slate-500">
                  {g.grupos_trabajo_miembros.length === 0 ? 'Sin miembros aún' : g.grupos_trabajo_miembros.map(function (m) { return m.student?.full_name }).join(', ')}
                </p>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
