import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import { useAuth } from './AuthContext'
import IconoAsignatura from './IconoAsignatura'

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

export default function PanelInicioDocente({ onNavegar }) {
  const { session, profile } = useAuth()
  const [loading, setLoading] = useState(true)
  const [courses, setCourses] = useState([])
  const [tareasPorRevisar, setTareasPorRevisar] = useState(0)
  const [mensajesNoLeidos, setMensajesNoLeidos] = useState(0)
  const [gruposActivos, setGruposActivos] = useState(0)
  const [error, setError] = useState('')

  useEffect(function () {
    cargar()
  }, [])

  async function cargar() {
    setLoading(true)
    setError('')
    try {
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
    } catch (err) {
      console.error('Error cargando Inicio del docente:', err)
      setError('No se pudo cargar toda la información. Intenta recargar la página.')
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <p className="text-slate-400 text-sm">Cargando...</p>
  if (error) return <p className="text-red-500 text-sm">{error}</p>

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
        <button onClick={function () { if (onNavegar) onNavegar('tareas') }} className="text-left bg-white rounded-2xl p-4 transition duration-200 hover:-translate-y-0.5" style={{ border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(15,23,42,0.04)' }}>
          <div className="w-11 h-11 rounded-xl flex items-center justify-center mb-3" style={{ background: `linear-gradient(135deg, ${NAVY}, #1E40AF)` }}>
            <IconoTareas />
          </div>
          <p className="text-2xl font-semibold" style={{ color: NAVY_DARK }}>{tareasPorRevisar}</p>
          <p className="text-xs text-slate-400">Tareas por revisar</p>
        </button>
        <button onClick={function () { if (onNavegar) onNavegar('mensajes') }} className="text-left bg-white rounded-2xl p-4 transition duration-200 hover:-translate-y-0.5" style={{ border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(15,23,42,0.04)' }}>
          <div className="w-11 h-11 rounded-xl flex items-center justify-center mb-3" style={{ background: `linear-gradient(135deg, ${GREEN}, #15803D)` }}>
            <IconoCampana />
          </div>
          <p className="text-2xl font-semibold" style={{ color: NAVY_DARK }}>{mensajesNoLeidos}</p>
          <p className="text-xs text-slate-400">Notificaciones nuevas</p>
        </button>
        <button onClick={function () { if (onNavegar) onNavegar('cursos') }} className="text-left bg-white rounded-2xl p-4 transition duration-200 hover:-translate-y-0.5" style={{ border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(15,23,42,0.04)' }}>
          <div className="w-11 h-11 rounded-xl flex items-center justify-center mb-3" style={{ background: 'linear-gradient(135deg, #FACC15, #CA8A04)' }}>
            <IconoGrupos />
          </div>
          <p className="text-2xl font-semibold" style={{ color: NAVY_DARK }}>{gruposActivos}</p>
          <p className="text-xs text-slate-400">Grupos de trabajo</p>
        </button>
      </div>

      <p className="text-sm font-semibold mb-3" style={{ color: NAVY_DARK }}>Mis asignaturas</p>

      {courses.length === 0 ? (
        <div className="bg-white rounded-2xl p-10 text-center" style={{ border: '1px dashed #D6DCE5' }}>
          <p className="text-slate-400 text-sm">Aún no tienes cursos asignados.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {courses.map(function (c) {
            const areaNombre = c.asignaturas?.areas_curriculares?.nombre || ''
            return (
              <button
                key={c.id}
                onClick={function () { if (onNavegar) onNavegar('cursos') }}
                className="text-left bg-white rounded-2xl overflow-hidden transition hover:-translate-y-0.5 flex gap-3 p-3"
                style={{ border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(15,23,42,0.05)' }}
              >
                <IconoAsignatura nombre={c.nombre} size={40} />
                <div className="flex-1 min-w-0">
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

function IconoTareas() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 11l3 3L22 4" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
  )
}

function IconoCampana() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  )
}

function IconoGrupos() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  )
}
