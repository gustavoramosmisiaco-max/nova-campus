import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import { useAuth } from './AuthContext'

const NAVY_DARK = '#0F172A'
const NAVY = '#2563EB'
const GREEN = '#22C55E'

function gradoLabel(g) {
  return g ? `${g}° Secundaria` : 'Sin grado'
}

function saludoSegunHora() {
  const hora = new Date().getHours()
  if (hora < 12) return 'Buenos días'
  if (hora < 19) return 'Buenas tardes'
  return 'Buenas noches'
}

export default function PanelInicioDocente({ onIrACurso }) {
  const { session, profile } = useAuth()
  const [loading, setLoading] = useState(true)
  const [courses, setCourses] = useState([])
  const [tareasPorRevisar, setTareasPorRevisar] = useState(0)
  const [mensajesNoLeidos, setMensajesNoLeidos] = useState(0)
  const [gruposActivos, setGruposActivos] = useState(0)

  useEffect(function () {
    cargar()
  }, [])

  async function cargar() {
    setLoading(true)

    const coursesResult = await supabase
      .from('courses')
      .select('id, nombre, grado, grupo, enrollments(count), asignaturas(areas_curriculares(nombre))')
      .eq('docente_id', session.user.id)
      .eq('activo', true)
      .order('grado')
      .order('grupo')

    const coursesData = coursesResult.data || []

    const promedios = await Promise.all(
      coursesData.map(async function (c) {
        const totalEstudiantes = c.enrollments?.[0]?.count || 0

        const assignResult = await supabase.from('assignments').select('id').eq('course_id', c.id)
        const assignmentIds = (assignResult.data || []).map(function (a) { return a.id })

        if (assignmentIds.length === 0 || totalEstudiantes === 0) {
          return { ...c, totalEstudiantes: totalEstudiantes, progreso: 0 }
        }

        const subsResult = await supabase
          .from('submissions')
          .select('id', { count: 'exact', head: true })
          .in('assignment_id', assignmentIds)

        const totalPosibles = assignmentIds.length * totalEstudiantes
        const entregadas = subsResult.count || 0
        const progreso = totalPosibles > 0 ? Math.round((entregadas / totalPosibles) * 100) : 0

        return { ...c, totalEstudiantes: totalEstudiantes, progreso: progreso }
      })
    )
    setCourses(promedios)

    const courseIds = coursesData.map(function (c) { return c.id })
    let totalPorRevisar = 0
    if (courseIds.length > 0) {
      const assignResult2 = await supabase.from('assignments').select('id').in('course_id', courseIds)
      const allAssignmentIds = (assignResult2.data || []).map(function (a) { return a.id })
      if (allAssignmentIds.length > 0) {
        const sinRevisarResult = await supabase
          .from('submissions')
          .select('id', { count: 'exact', head: true })
          .in('assignment_id', allAssignmentIds)
          .eq('publicado', false)
          .not('file_url', 'is', null)
        totalPorRevisar = sinRevisarResult.count || 0
      }
    }
    setTareasPorRevisar(totalPorRevisar)

    const notifResult = await supabase
      .from('notificaciones')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', session.user.id)
      .eq('leido', false)
    setMensajesNoLeidos(notifResult.count || 0)

    if (courseIds.length > 0) {
      const gruposResult = await supabase
        .from('grupos_trabajo')
        .select('id', { count: 'exact', head: true })
        .in('course_id', courseIds)
      setGruposActivos(gruposResult.count || 0)
    }

    setLoading(false)
  }

  if (loading) return <p className="text-slate-400 text-sm">Cargando...</p>

  const primerNombre = profile?.full_name ? profile.full_name.split(' ')[0] : ''

  return (
    <div>
      <p className="text-lg font-medium mb-1" style={{ color: NAVY_DARK }}>
        {saludoSegunHora()}, {primerNombre} 👋
      </p>
      <p className="text-sm text-slate-400 mb-6">
        Tienes {courses.length} curso(s) activo(s){tareasPorRevisar > 0 ? `, ${tareasPorRevisar} tarea(s) por revisar` : ''}.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8">
        <div className="bg-white rounded-2xl p-4" style={{ border: '1px solid #E2E8F0' }}>
          <div className="w-9 h-9 rounded-xl flex items-center justify-center mb-2" style={{ backgroundColor: '#EFF6FF' }}>
            <span style={{ color: NAVY }}>📋</span>
          </div>
          <p className="text-2xl font-semibold" style={{ color: NAVY_DARK }}>{tareasPorRevisar}</p>
          <p className="text-xs text-slate-400">Tareas por revisar</p>
        </div>
        <div className="bg-white rounded-2xl p-4" style={{ border: '1px solid #E2E8F0' }}>
          <div className="w-9 h-9 rounded-xl flex items-center justify-center mb-2" style={{ backgroundColor: '#F0FDF4' }}>
            <span style={{ color: GREEN }}>💬</span>
          </div>
          <p className="text-2xl font-semibold" style={{ color: NAVY_DARK }}>{mensajesNoLeidos}</p>
          <p className="text-xs text-slate-400">Notificaciones nuevas</p>
        </div>
        <div className="bg-white rounded-2xl p-4" style={{ border: '1px solid #E2E8F0' }}>
          <div className="w-9 h-9 rounded-xl flex items-center justify-center mb-2" style={{ backgroundColor: '#FEFCE8' }}>
            <span style={{ color: '#CA8A04' }}>👥</span>
          </div>
          <p className="text-2xl font-semibold" style={{ color: NAVY_DARK }}>{gruposActivos}</p>
          <p className="text-xs text-slate-400">Grupos de trabajo</p>
        </div>
      </div>

      <p className="text-sm font-semibold mb-3" style={{ color: NAVY_DARK }}>Mis asignaturas</p>

      {courses.length === 0 ? (
        <div className="bg-white rounded-2xl p-10 text-center" style={{ border: '1px dashed #D6DCE5' }}>
          <p className="text-slate-400 text-sm">Aún no tienes cursos asignados.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {courses.map(function (c, idx) {
            const areaNombre = c.asignaturas?.areas_curriculares?.nombre || ''
            return (
              <button
                key={c.id}
                onClick={function () { if (onIrACurso) onIrACurso() }}
                className="text-left bg-white rounded-2xl overflow-hidden transition hover:-translate-y-0.5"
                style={{ border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(15,23,42,0.05)' }}
              >
                <div className="h-11" style={{ background: `linear-gradient(135deg, ${NAVY}, ${idx % 2 === 0 ? GREEN : NAVY_DARK})` }} />
                <div className="p-4">
                  <p className="text-sm font-semibold" style={{ color: NAVY_DARK }}>{c.nombre}</p>
                  <p className="text-xs text-slate-400 mb-3">{gradoLabel(c.grado)} — Sección {c.grupo}{areaNombre ? ` · ${areaNombre}` : ''}</p>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs text-slate-400">{c.totalEstudiantes} estudiante(s)</span>
                    <span className="text-xs font-semibold" style={{ color: GREEN }}>{c.progreso}%</span>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: '#E2E8F0' }}>
                    <div className="h-full rounded-full" style={{ width: `${c.progreso}%`, backgroundColor: GREEN }} />
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
