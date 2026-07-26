import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import { useAuth } from './AuthContext'
import CourseMaterials from './CourseMaterials'
import CourseAssignmentsTeacher from './CourseAssignmentsTeacher'
import CourseZoomTeacher from './CourseZoomTeacher'

const DIAS = ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']
const GRADOS = [1, 2, 3, 4, 5]

const NAVY_DARK = '#0F2A4A'
const NAVY = '#1d5c8f'
const GREEN = '#5DAA47'
const GREEN_DARK = '#2f7a1f'

function gradoLabel(g) {
  return g ? `${g}° Secundaria` : 'Sin grado'
}

function scheduleText(schedules) {
  if (!schedules || schedules.length === 0) return 'Sin horario definido'
  const sorted = [...schedules].sort(function (a, b) { return a.dia_semana - b.dia_semana })
  return sorted
    .map(function (s) { return `${DIAS[s.dia_semana]} ${s.hora_inicio?.slice(0, 5)}-${s.hora_fin?.slice(0, 5)}` })
    .join(' · ')
}

function CourseDetailTeacher({ course, onBack }) {
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
        {tab === 'materiales' && <CourseMaterials courseId={course.id} canUpload={true} />}
        {tab === 'tareas' && <CourseAssignmentsTeacher courseId={course.id} />}
        {tab === 'zoom' && <CourseZoomTeacher courseId={course.id} />}
      </div>
    </div>
  )
}

export default function MyTeachingCourses() {
  const { session } = useAuth()
  const [courses, setCourses] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedCourse, setSelectedCourse] = useState(null)
  const [selectedGrado, setSelectedGrado] = useState('todos')

  useEffect(function () {
    loadMyCourses()
  }, [])

  async function loadMyCourses() {
    setLoading(true)
    const result = await supabase
      .from('courses')
      .select('id, nombre, grupo, grado, course_schedules(*), enrollments(count)')
      .eq('docente_id', session.user.id)
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

  if (loading) return <p className="text-slate-400">Cargando tus cursos...</p>
  if (error) return <p className="text-red-500">Error: {error}</p>

  if (selectedCourse) {
    return <CourseDetailTeacher course={selectedCourse} onBack={function () { setSelectedCourse(null) }} />
  }

  const gradosConCursos = GRADOS.filter(function (g) {
    return courses.some(function (c) { return c.grado === g })
  })

  const filteredCourses = selectedGrado === 'todos'
    ? courses
    : courses.filter(function (c) { return c.grado === Number(selectedGrado) })

  return (
    <div>
      <h2 className="text-2xl font-bold mb-2" style={{ color: NAVY_DARK }}>Mis Cursos</h2>
      <p className="text-sm text-slate-400 mb-5">Elige el aula (grado) a la que quieres ingresar</p>

      {gradosConCursos.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-6">
          <button
            onClick={function () { setSelectedGrado('todos') }}
            className="text-sm font-semibold px-4 py-2 rounded-xl transition"
            style={
              selectedGrado === 'todos'
                ? { background: `linear-gradient(90deg, ${NAVY}, ${GREEN})`, color: 'white' }
                : { backgroundColor: 'white', color: NAVY_DARK, border: '1px solid #D6DCE5' }
            }
          >
            Todas las aulas
          </button>
          {gradosConCursos.map(function (g) {
            const active = selectedGrado === String(g)
            return (
              <button
                key={g}
                onClick={function () { setSelectedGrado(String(g)) }}
                className="text-sm font-semibold px-4 py-2 rounded-xl transition"
                style={
                  active
                    ? { background: `linear-gradient(90deg, ${NAVY}, ${GREEN})`, color: 'white' }
                    : { backgroundColor: 'white', color: NAVY_DARK, border: '1px solid #D6DCE5' }
                }
              >
                {gradoLabel(g)}
              </button>
            )
          })}
        </div>
      )}

      {courses.length === 0 ? (
        <div className="bg-white rounded-2xl p-10 text-center" style={{ border: '1px dashed #D6DCE5' }}>
          <p className="text-slate-400 text-sm">
            Aún no tienes cursos asignados. Contacta al administrador.
          </p>
        </div>
      ) : filteredCourses.length === 0 ? (
        <div className="bg-white rounded-2xl p-10 text-center" style={{ border: '1px dashed #D6DCE5' }}>
          <p className="text-slate-400 text-sm">No tienes cursos en esta aula.</p>
        </div>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {filteredCourses.map(function (c) {
            return (
              <button
                key={c.id}
                onClick={function () { setSelectedCourse(c) }}
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
                  <span
                    className="text-xs font-semibold px-2.5 py-1 rounded-full"
                    style={{ backgroundColor: '#E7F3E4', color: GREEN_DARK }}
                  >
                    {gradoLabel(c.grado)}
                  </span>
                </div>

                <h3 className="text-lg font-bold" style={{ color: NAVY_DARK }}>
                  {c.nombre}{' '}
                  <span className="text-slate-400 text-sm font-medium">(Sección {c.grupo})</span>
                </h3>

                <p className="text-sm text-slate-500">
                  {scheduleText(c.course_schedules)}
                </p>

                <p className="text-sm font-medium" style={{ color: GREEN_DARK }}>
                  {c.enrollments?.[0]?.count ?? 0} alumno(s) matriculado(s)
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