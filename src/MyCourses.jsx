import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import { useAuth } from './AuthContext'
import CourseMaterials from './CourseMaterials'
import CourseAssignmentsStudent from './CourseAssignmentsStudent'
import CourseZoomStudent from './CourseZoomStudent'

const DIAS = ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']

const NAVY_DARK = '#0F2A4A'
const NAVY = '#1d5c8f'
const GREEN = '#5DAA47'
const GREEN_DARK = '#2f7a1f'

function gradoLabel(g) {
  return g ? `${g}° de Secundaria` : 'Sin grado'
}

function scheduleText(schedules) {
  if (!schedules || schedules.length === 0) return 'Sin horario definido'
  const sorted = [...schedules].sort(function (a, b) { return a.dia_semana - b.dia_semana })
  return sorted
    .map(function (s) { return `${DIAS[s.dia_semana]} ${s.hora_inicio?.slice(0, 5)}-${s.hora_fin?.slice(0, 5)}` })
    .join(' · ')
}

function CourseDetailStudent({ course, onBack }) {
  const [tab, setTab] = useState('materiales')

  const tabs = [
    { id: 'materiales', label: 'Materiales' },
    { id: 'tareas', label: 'Tareas' },
    { id: 'zoom', label: 'Videoclases' },
  ]

  return (
    <div>
      <button
        onClick={onBack}
        className="text-sm font-semibold mb-4 hover:underline flex items-center gap-1"
        style={{ color: NAVY }}
      >
        ← Volver a mis cursos
      </button>

      <div className="flex items-center gap-3 mb-1 flex-wrap">
        <h2 className="text-2xl font-bold" style={{ color: NAVY_DARK }}>
          {course.nombre} <span className="text-slate-400 text-lg font-medium">(Sección {course.grupo})</span>
        </h2>
        <span
          className="text-xs font-semibold px-3 py-1 rounded-full"
          style={{ backgroundColor: '#E7F3E4', color: GREEN_DARK }}
        >
          {gradoLabel(course.grado)}
        </span>
      </div>
      <p className="text-sm font-medium mb-4" style={{ color: GREEN_DARK }}>
        {scheduleText(course.course_schedules)}
      </p>

      <div className="flex gap-2 mb-6 border-b" style={{ borderColor: '#E5E9F0' }}>
        {tabs.map(function (t) {
          const active = tab === t.id
          return (
            <button
              key={t.id}
              onClick={function () { setTab(t.id) }}
              className="px-4 py-2.5 text-sm font-semibold border-b-2 transition"
              style={
                active
                  ? { borderColor: GREEN, color: NAVY_DARK }
                  : { borderColor: 'transparent', color: '#94A3B8' }
              }
            >
              {t.label}
            </button>
          )
        })}
      </div>

      <div className="bg-white rounded-2xl p-6" style={{ border: '1px solid #E5E9F0' }}>
        {tab === 'materiales' && <CourseMaterials courseId={course.id} canUpload={false} />}
        {tab === 'tareas' && <CourseAssignmentsStudent courseId={course.id} />}
        {tab === 'zoom' && <CourseZoomStudent courseId={course.id} />}
      </div>
    </div>
  )
}

export default function MyCourses() {
  const { session } = useAuth()
  const [courses, setCourses] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedCourse, setSelectedCourse] = useState(null)

  useEffect(function () {
    loadMyCourses()
  }, [])

  async function loadMyCourses() {
    setLoading(true)
    const result = await supabase
      .from('enrollments')
      .select('id, status, course:courses(id, nombre, grupo, grado, course_schedules(*), docente:profiles(full_name))')
      .eq('student_id', session.user.id)
      .eq('status', 'activo')

    if (result.error) {
      setError(result.error.message)
    } else {
      setCourses(result.data)
    }
    setLoading(false)
  }

  if (loading) return <p className="text-slate-400">Cargando tus cursos...</p>
  if (error) return <p className="text-red-500">Error: {error}</p>

  if (selectedCourse) {
    return <CourseDetailStudent course={selectedCourse} onBack={function () { setSelectedCourse(null) }} />
  }

  const miCurso = courses.find(function (e) { return e.course.grado })
  const miGrado = miCurso?.course.grado
  const miSeccion = miCurso?.course.grupo

  return (
    <div>
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <h2 className="text-2xl font-bold" style={{ color: NAVY_DARK }}>Mis Cursos</h2>
        {miGrado && (
          <span
            className="text-xs font-semibold px-3 py-1.5 rounded-full"
            style={{ backgroundColor: '#E7F3E4', color: GREEN_DARK }}
          >
            {gradoLabel(miGrado)} · Sección {miSeccion}
          </span>
        )}
      </div>

      {courses.length === 0 ? (
        <div className="bg-white rounded-2xl p-10 text-center" style={{ border: '1px dashed #D6DCE5' }}>
          <p className="text-slate-400 text-sm">
            Aún no estás matriculado en ningún curso. Contacta al administrador de la academia.
          </p>
        </div>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {courses.map(function (e) {
            return (
              <button
                key={e.id}
                onClick={function () { setSelectedCourse(e.course) }}
                className="text-left bg-white rounded-2xl p-5 space-y-2 transition hover:-translate-y-0.5"
                style={{
                  border: '1px solid #E5E9F0',
                  boxShadow: '0 1px 3px rgba(15,42,74,0.06)',
                }}
              >
                <div className="flex items-center justify-between">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center"
                    style={{ background: `linear-gradient(135deg, ${NAVY}, ${GREEN})` }}
                  >
                    <BookIcon />
                  </div>
                  {e.course.grado && (
                    <span
                      className="text-xs font-semibold px-2.5 py-1 rounded-full"
                      style={{ backgroundColor: '#E7F3E4', color: GREEN_DARK }}
                    >
                      {gradoLabel(e.course.grado)}
                    </span>
                  )}
                </div>

                <h3 className="text-lg font-bold" style={{ color: NAVY_DARK }}>
                  {e.course.nombre}{' '}
                  <span className="text-slate-400 text-sm font-medium">(Sección {e.course.grupo})</span>
                </h3>

                <p className="text-sm text-slate-500">
                  Docente: {e.course.docente?.full_name || 'Sin asignar'}
                </p>

                <p className="text-sm font-medium" style={{ color: GREEN_DARK }}>
                  {scheduleText(e.course.course_schedules)}
                </p>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function BookIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  )
}