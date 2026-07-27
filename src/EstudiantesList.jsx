import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'

const NAVY_DARK = '#0F2A4A'
const GREEN_DARK = '#2f7a1f'

const GRADOS = [1, 2, 3, 4, 5]
const SECCIONES = ['A', 'B', 'C', 'D', 'E']

export default function EstudiantesList() {
  const [students, setStudents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [deletingId, setDeletingId] = useState(null)

  useEffect(function () {
    loadStudents()
  }, [])

  async function loadStudents() {
    setLoading(true)
    setError('')

    const profilesResult = await supabase
      .from('profiles')
      .select('id, full_name')
      .eq('role', 'estudiante')
      .order('full_name', { ascending: true })

    if (profilesResult.error) {
      setError(profilesResult.error.message)
      setLoading(false)
      return
    }

    const enrollResult = await supabase
      .from('enrollments')
      .select('student_id, course:courses(grado, grupo)')
      .eq('status', 'activo')

    const aulaMap = {}
    if (!enrollResult.error) {
      enrollResult.data.forEach(function (e) {
        if (!aulaMap[e.student_id] && e.course) {
          aulaMap[e.student_id] = { grado: e.course.grado, grupo: e.course.grupo }
        }
      })
    }

    const enriched = profilesResult.data.map(function (s) {
      return { ...s, aula: aulaMap[s.id] || null }
    })

    setStudents(enriched)
    setLoading(false)
  }

  async function handleDelete(id, nombre) {
    if (!confirm(`¿Eliminar la cuenta de "${nombre}"? Esta acción no se puede deshacer.`)) return
    setDeletingId(id)
    const { data, error: fnError } = await supabase.functions.invoke('delete-user', {
      body: { userId: id },
    })

    if (fnError) {
      alert('Error al eliminar: ' + fnError.message)
    } else if (data.error) {
      alert('Error al eliminar: ' + data.error)
    } else {
      setStudents(function (prev) { return prev.filter(function (s) { return s.id !== id }) })
    }
    setDeletingId(null)
  }

  if (loading) return <p className="text-slate-400 text-sm">Cargando estudiantes...</p>
  if (error) return <p className="text-red-500 text-sm">Error: {error}</p>

  const grupos = []
  GRADOS.forEach(function (g) {
    SECCIONES.forEach(function (s) {
      const items = students.filter(function (st) { return st.aula?.grado === g && st.aula?.grupo === s })
      if (items.length > 0) grupos.push({ grado: g, grupo: s, items: items })
    })
  })
  const sinAula = students.filter(function (st) { return !st.aula })

  function renderTable(items) {
    return (
      <table className="w-full text-sm">
        <thead>
          <tr style={{ borderBottom: '1px solid #E5E9F0' }}>
            <th className="text-left py-2 pr-3 font-semibold" style={{ color: NAVY_DARK }}>Nombre</th>
            <th className="text-right py-2 font-semibold" style={{ color: NAVY_DARK }}></th>
          </tr>
        </thead>
        <tbody>
          {items.map(function (s) {
            return (
              <tr key={s.id} style={{ borderBottom: '1px solid #F4F6F9' }}>
                <td className="py-2 pr-3" style={{ color: NAVY_DARK }}>{s.full_name}</td>
                <td className="py-2 text-right">
                  <button
                    onClick={function () { handleDelete(s.id, s.full_name) }}
                    disabled={deletingId === s.id}
                    className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white transition hover:opacity-90 disabled:opacity-50"
                    style={{ backgroundColor: '#B91C1C' }}
                  >
                    {deletingId === s.id ? 'Eliminando...' : 'Eliminar'}
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    )
  }

  return (
    <div>
      <h2 className="text-2xl font-bold mb-2" style={{ color: NAVY_DARK }}>Estudiantes</h2>
      <p className="text-sm text-slate-400 mb-6">{students.length} estudiante(s) registrado(s) en total.</p>

      {students.length === 0 ? (
        <p className="text-slate-400 text-sm">Aún no hay estudiantes registrados.</p>
      ) : (
        <div className="space-y-6">
          {grupos.map(function (grupo) {
            return (
              <div key={`${grupo.grado}${grupo.grupo}`} className="bg-white rounded-2xl p-5" style={{ border: '1px solid #E5E9F0' }}>
                <h3
                  className="text-xs font-bold uppercase tracking-wide mb-3 px-3 py-1.5 rounded-lg inline-block"
                  style={{ backgroundColor: '#E7F3E4', color: GREEN_DARK }}
                >
                  {grupo.grado}° Secundaria — Sección {grupo.grupo} ({grupo.items.length})
                </h3>
                {renderTable(grupo.items)}
              </div>
            )
          })}

          {sinAula.length > 0 && (
            <div className="bg-white rounded-2xl p-5" style={{ border: '1px solid #E5E9F0' }}>
              <h3
                className="text-xs font-bold uppercase tracking-wide mb-3 px-3 py-1.5 rounded-lg inline-block"
                style={{ backgroundColor: '#FDECEC', color: '#B91C1C' }}
              >
                Sin aula asignada ({sinAula.length})
              </h3>
              {renderTable(sinAula)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
