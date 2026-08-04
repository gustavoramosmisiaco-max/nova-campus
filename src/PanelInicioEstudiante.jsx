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

export default function PanelInicioEstudiante({ onIrACurso }) {
  const { session, profile } = useAuth()
  const [loading, setLoading] = useState(true)
  const [courses, setCourses] = useState([])
  const [tareasPendientes, setTareasPendientes] = useState(0)
  const [notifNoLeidas, setNotifNoLeidas] = useState(0)
  const [examenesProgramados, setExamenesProgramados] = useState(0)

  useEffect(function () {
    cargar()
  }, [])

  async function cargar() {
    setLoading(true)

    const enrollResult = await supabase
      .from('enrollments')
      .select('course:courses(id, nombre, grado, grupo, asignaturas(areas_curriculares(nombre)))')
      .eq('student_id', session.user.id)
      .eq('status', 'activo')

    const enrolls = enrollResult.data || []
    const coursesData = enrolls.map(function (e) { return e.course }).filter(Boolean)
    const courseIds = coursesData.map(function (c) { return c.id })

    let totalPendientes = 0
    if (courseIds.length > 0) {
      const assignResult = await supabase.from('assignments').select('id, course_id').in('course_id', courseIds)
      const assignments = assignResult.data || []
      const assignmentIds = assignments.map(function (a) { return a.id })

      let entregadosIds = new Set()
      if (assignmentIds.length > 0) {
        const subsResult = await supabase
          .from('submissions')
          .select('assignment_id, file_url')
          .eq('student_id', session.user.id)
          .in('assignment_id', assignmentIds)
        ;(subsResult.data || []).forEach(function (s) { if (s.file_url) entregadosIds.add(s.assignment_id) })
      }
      totalPendientes = assignments.filter(function (a) { return !entregadosIds.has(a.id) }).length

      const promedios = await Promise.all(
        coursesData.map(async function (c) {
          const assignmentsDelCurso = assignments.filter(function (a) { return a.course_id === c.id })
          if (assignmentsDelCurso.length === 0) return { ...c, progreso: 0 }
          const entregadasDelCurso = assignmentsDelCurso.filter(function (a) { return entregadosIds.has(a.id) }).length
          return { ...c, progreso: Math.round((entregadasDelCurso / assignmentsDelCurso.length) * 100) }
        })
      )
      setCourses(promedios)
    } else {
      setCourses([])
    }
    setTareasPendientes(totalPendientes)

    const notifResult = await supabase
      .from('notificaciones')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', session.user.id)
      .eq('leido', false)
    setNotifNoLeidas(notifResult.count || 0)

    const areaIds = [...new Set(coursesData.map(function (c) { return c.asignaturas?.areas_curriculares?.nombre }).filter(Boolean))]
    if (courseIds.length > 0) {
      const unidResult = await supabase
        .from('unidades')
        .select('id, evaluaciones_unidad(publicado)')
        .in('grado', [...new Set(coursesData.map(function (c) { return c.grado }))])
      const publicados = (unidResult.data || []).filter(function (u) {
        return (u.evaluaciones_unidad || []).some(function (e) { return e.publicado })
      }).length
      setExamenesProgramados(publicados)
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
        {tareasPendientes > 0 ? `Tienes ${tareasPendientes} tarea(s) pendiente(s).` : '¡Estás al día con tus tareas!'}
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8">
        <div className="bg-white rounded-2xl p-4 transition duration-200 hover:-translate-y-0.5" style={{ border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(15,23,42,0.04)' }}>
          <div className="w-11 h-11 rounded-xl flex items-center justify-center mb-3" style={{ background: `linear-gradient(135deg, ${NAVY}, #1E40AF)` }}>
            <IconoTareas />
          </div>
          <p className="text-2xl font-semibold" style={{ color: NAVY_DARK }}>{tareasPendientes}</p>
          <p className="text-xs text-slate-400">Tareas pendientes</p>
        </div>
        <div className="bg-white rounded-2xl p-4 transition duration-200 hover:-translate-y-0.5" style={{ border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(15,23,42,0.04)' }}>
          <div className="w-11 h-11 rounded-xl flex items-center justify-center mb-3" style={{ background: `linear-gradient(135deg, ${GREEN}, #15803D)` }}>
            <IconoCampana />
          </div>
          <p className="text-2xl font-semibold" style={{ color: NAVY_DARK }}>{notifNoLeidas}</p>
          <p className="text-xs text-slate-400">Notificaciones nuevas</p>
        </div>
        <div className="bg-white rounded-2xl p-4 transition duration-200 hover:-translate-y-0.5" style={{ border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(15,23,42,0.04)' }}>
          <div className="w-11 h-11 rounded-xl flex items-center justify-center mb-3" style={{ background: 'linear-gradient(135deg, #FACC15, #CA8A04)' }}>
            <IconoExamen />
          </div>
          <p className="text-2xl font-semibold" style={{ color: NAVY_DARK }}>{examenesProgramados}</p>
          <p className="text-xs text-slate-400">Exámenes disponibles</p>
        </div>
      </div>

      <p className="text-sm font-semibold mb-3" style={{ color: NAVY_DARK }}>Mis asignaturas</p>

      {courses.length === 0 ? (
        <div className="bg-white rounded-2xl p-10 text-center" style={{ border: '1px dashed #D6DCE5' }}>
          <p className="text-slate-400 text-sm">Aún no estás matriculado en ningún curso.</p>
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
                <div className="h-11 flex items-center px-4" style={{ background: `linear-gradient(135deg, ${NAVY}, ${idx % 2 === 0 ? GREEN : NAVY_DARK})` }}>
                  <IconoLibro />
                </div>
                <div className="p-4">
                  <p className="text-sm font-semibold" style={{ color: NAVY_DARK }}>{c.nombre}</p>
                  <p className="text-xs text-slate-400 mb-3">{gradoLabel(c.grado)} — Sección {c.grupo}{areaNombre ? ` · ${areaNombre}` : ''}</p>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs text-slate-400">Progreso de tareas</span>
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

function IconoExamen() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 11l3 3L22 4" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
    </svg>
  )
}

function IconoLibro() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.9">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  )
}
