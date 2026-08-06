import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import { useAuth } from './AuthContext'
import CourseMaterials from './CourseMaterials'
import CourseAssignmentsStudent from './CourseAssignmentsStudent'
import CourseZoomStudent from './CourseZoomStudent'
import { getLetterGrade, getLetterColor } from './gradeUtils'
import GruposEstudiante from './GruposEstudiante'
import IconoAsignatura from './IconoAsignatura'

const DIAS = ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']

const NAVY_DARK = '#0F172A'
const NAVY = '#2563EB'
const GREEN = '#22C55E'
const GREEN_DARK = '#16A34A'

function scheduleText(schedules) {
  if (!schedules || schedules.length === 0) return 'Sin horario definido'
  const sorted = [...schedules].sort(function (a, b) { return a.dia_semana - b.dia_semana })
  return sorted
    .map(function (s) { return `${DIAS[s.dia_semana]} ${s.hora_inicio?.slice(0, 5)}-${s.hora_fin?.slice(0, 5)}` })
    .join(' · ')
}

function gradoLabel(g) {
  return g ? `${g}° de Secundaria` : 'Sin grado'
}

function CourseDetailStudent({ course, onBack }) {
  const [tab, setTab] = useState('actividades')
  const [selectedUnidad, setSelectedUnidad] = useState(null)
  const [selectedActividad, setSelectedActividad] = useState(null)

  return (
    <div>
      <button
        onClick={onBack}
        className="text-sm font-semibold mb-4 hover:underline flex items-center gap-1"
        style={{ color: NAVY }}
      >
        ← Volver a mis asignaturas
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

      {!selectedUnidad && !selectedActividad && (
        <div className="flex gap-2 mb-6 border-b" style={{ borderColor: '#E5E9F0' }}>
          {[{ id: 'actividades', label: 'Actividades' }, { id: 'notas', label: 'Mis Notas' }, { id: 'grupos', label: 'Grupos de Trabajo' }, { id: 'zoom', label: 'Videoclases' }].map(function (t) {
            const active = tab === t.id
            return (
              <button
                key={t.id}
                onClick={function () { setTab(t.id) }}
                className="px-4 py-2.5 text-sm font-semibold border-b-2 transition"
                style={active ? { borderColor: GREEN, color: NAVY_DARK } : { borderColor: 'transparent', color: '#94A3B8' }}
              >
                {t.label}
              </button>
            )
          })}
        </div>
      )}

      <div className="bg-white rounded-2xl p-6" style={{ border: '1px solid #E5E9F0' }}>
        {tab === 'zoom' && !selectedUnidad && !selectedActividad && (
          <CourseZoomStudent courseId={course.id} />
        )}

        {tab === 'notas' && !selectedUnidad && !selectedActividad && (
          <NotasDeAsignatura courseId={course.id} />
        )}

        {tab === 'grupos' && !selectedUnidad && !selectedActividad && (
          <GruposEstudiante courseId={course.id} />
        )}

        {tab === 'actividades' && (
          <>
            {selectedActividad ? (
              <ActividadContenidoStudent
                actividad={selectedActividad}
                onBack={function () { setSelectedActividad(null) }}
              />
            ) : selectedUnidad ? (
              <UnidadActividadesStudent
                unidad={selectedUnidad}
                courseId={course.id}
                onBack={function () { setSelectedUnidad(null) }}
                onSelectActividad={setSelectedActividad}
              />
            ) : (
              <UnidadesListStudent courseId={course.id} onSelectUnidad={setSelectedUnidad} />
            )}
          </>
        )}
      </div>
    </div>
  )
}

function UnidadesListStudent({ courseId, onSelectUnidad }) {
  const [unidades, setUnidades] = useState([])
  const [conteoPropio, setConteoPropio] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(function () {
    loadUnidades()
  }, [courseId])

  async function loadUnidades() {
    setLoading(true)
    const courseResult = await supabase
      .from('courses')
      .select('grado, grupo, asignaturas(area_id)')
      .eq('id', courseId)
      .single()

    if (courseResult.error || !courseResult.data?.asignaturas) {
      setError('No se pudo determinar el Área de este curso.')
      setLoading(false)
      return
    }

    const result = await supabase
      .from('unidades')
      .select('*')
      .eq('area_id', courseResult.data.asignaturas.area_id)
      .eq('grado', courseResult.data.grado)
      .eq('grupo', courseResult.data.grupo)
      .order('numero', { ascending: true })
    if (result.error) {
      setError(result.error.message)
      setLoading(false)
      return
    }
    setUnidades(result.data)

    const unidadIds = result.data.map(function (u) { return u.id })
    if (unidadIds.length > 0) {
      const actResult = await supabase
        .from('actividades')
        .select('unidad_id')
        .eq('course_id', courseId)
        .in('unidad_id', unidadIds)
      if (!actResult.error) {
        const conteo = {}
        actResult.data.forEach(function (a) { conteo[a.unidad_id] = (conteo[a.unidad_id] || 0) + 1 })
        setConteoPropio(conteo)
      }
    }
    setLoading(false)
  }

  if (loading) return <p className="text-slate-400 text-sm">Cargando...</p>
  if (error) return <p className="text-red-500 text-sm">{error}</p>

  return (
    <div>
      <h3 className="text-lg font-bold mb-4" style={{ color: NAVY_DARK }}>Unidades y Experiencias de Aprendizaje</h3>
      {unidades.length === 0 ? (
        <p className="text-slate-400 text-sm">Aún no hay carpetas creadas por tu docente.</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {unidades.map(function (u) {
            return (
              <button
                key={u.id}
                onClick={function () { onSelectUnidad(u) }}
                className="text-left rounded-xl p-4 transition hover:-translate-y-0.5"
                style={{ backgroundColor: '#F4F6F9', border: '1px solid #E5E9F0' }}
              >
                <div className="flex items-center gap-2 mb-1">
                  <FolderIcon />
                  <span className="text-xs font-semibold" style={{ color: GREEN_DARK }}>{u.tipo} {u.numero}</span>
                </div>
                <p className="text-sm font-bold" style={{ color: NAVY_DARK }}>{u.nombre || `${u.tipo} ${u.numero}`}</p>
                <p className="text-xs text-slate-400 mt-1">{conteoPropio[u.id] || 0} actividad(es)</p>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function UnidadActividadesStudent({ unidad, courseId, onBack, onSelectActividad }) {
  const [subTab, setSubTab] = useState('actividades')
  const [activities, setActivities] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(function () {
    loadActivities()
  }, [unidad.id])

  async function loadActivities() {
    setLoading(true)
    const result = await supabase
      .from('actividades')
      .select('*, competencia:competencias(nombre, codigo)')
      .eq('unidad_id', unidad.id)
      .eq('course_id', courseId)
      .order('created_at', { ascending: true })
    if (result.error) setError(result.error.message)
    else setActivities(result.data)
    setLoading(false)
  }

  if (loading) return <p className="text-slate-400 text-sm">Cargando...</p>
  if (error) return <p className="text-red-500 text-sm">{error}</p>

  return (
    <div>
      <button onClick={onBack} className="text-sm font-semibold mb-4 hover:underline flex items-center gap-1" style={{ color: NAVY }}>
        ← Volver a carpetas
      </button>

      <div className="flex items-center gap-2 mb-4">
        <FolderIcon big />
        <div>
          <p className="text-xs font-semibold" style={{ color: GREEN_DARK }}>{unidad.tipo} {unidad.numero}</p>
          <h3 className="text-lg font-bold" style={{ color: NAVY_DARK }}>{unidad.nombre || `${unidad.tipo} ${unidad.numero}`}</h3>
        </div>
      </div>

      <div className="flex gap-2 mb-5 border-b" style={{ borderColor: '#E5E9F0' }}>
        {[
          { id: 'actividades', label: 'Actividades' },
          { id: 'notas-tareas', label: 'Notas de Tareas' },
        ].map(function (t) {
          const active = subTab === t.id
          return (
            <button key={t.id} onClick={function () { setSubTab(t.id) }}
              className="px-3 py-2.5 text-sm font-semibold border-b-2 transition"
              style={active ? { borderColor: GREEN, color: NAVY_DARK } : { borderColor: 'transparent', color: '#94A3B8' }}>
              {t.label}
            </button>
          )
        })}
      </div>

      {subTab === 'notas-tareas' && <NotasDeTareasUnidad unidad={unidad} courseId={courseId} />}

      {subTab === 'actividades' && (
      activities.length === 0 ? (
        <p className="text-slate-400 text-sm">Aún no hay actividades en esta carpeta.</p>
      ) : (
        <ul className="space-y-3">
          {activities.map(function (a) {
            return (
              <li key={a.id} style={{ backgroundColor: '#F4F6F9', border: '1px solid #E5E9F0' }} className="rounded-xl p-4">
                <button onClick={function () { onSelectActividad(a) }} className="text-left w-full">
                  <p className="text-sm font-bold" style={{ color: NAVY_DARK }}>Actividad {a.numero_actividad} · {a.nombre}</p>
                  {a.competencia && <p className="text-xs text-slate-500 mt-1">{a.competencia.codigo} — {a.competencia.nombre}</p>}
                  <p className="text-xs mt-1" style={{ color: GREEN_DARK }}>Ver materiales y tareas →</p>
                </button>
              </li>
            )
          })}
        </ul>
      )
      )}
    </div>
  )
}

function ActividadContenidoStudent({ actividad, onBack }) {
  const [tab, setTab] = useState('materiales')

  return (
    <div>
      <button onClick={onBack} className="text-sm font-semibold mb-4 hover:underline flex items-center gap-1" style={{ color: NAVY }}>
        ← Volver a la carpeta
      </button>

      <h3 className="text-lg font-bold mb-4" style={{ color: NAVY_DARK }}>
        Actividad {actividad.numero_actividad} · {actividad.nombre}
      </h3>

      <div className="flex gap-2 mb-6 border-b" style={{ borderColor: '#E5E9F0' }}>
        {[{ id: 'materiales', label: 'Materiales' }, { id: 'tareas', label: 'Tareas' }].map(function (t) {
          const active = tab === t.id
          return (
            <button key={t.id} onClick={function () { setTab(t.id) }}
              className="px-4 py-2.5 text-sm font-semibold border-b-2 transition"
              style={active ? { borderColor: GREEN, color: NAVY_DARK } : { borderColor: 'transparent', color: '#94A3B8' }}>
              {t.label}
            </button>
          )
        })}
      </div>

      {tab === 'materiales' && <CourseMaterials courseId={actividad.course_id} actividadId={actividad.id} canUpload={false} />}
      {tab === 'tareas' && <CourseAssignmentsStudent courseId={actividad.course_id} actividadId={actividad.id} />}
    </div>
  )
}

function FolderIcon({ big }) {
  const size = big ? 28 : 18
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={GREEN} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  )
}

export default function MyCourses() {
  const { session } = useAuth()
  const [courses, setCourses] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedCourse, setSelectedCourse] = useState(null)
  const [institucionSel, setInstitucionSel] = useState(null)
  const [areaSel, setAreaSel] = useState(null)

  useEffect(function () {
    loadMyCourses()
  }, [])

  async function loadMyCourses() {
    setLoading(true)
    const result = await supabase
      .from('enrollments')
      .select('id, status, course:courses!inner(id, nombre, grupo, grado, institucion_id, course_schedules(*), docente:profiles(full_name), asignaturas!inner(activo, areas_curriculares(nombre)), instituciones_educativas(nombre))')
      .eq('student_id', session.user.id)
      .eq('status', 'activo')
      .eq('course.asignaturas.activo', true)
      .eq('course.activo', true)

    if (result.error) {
      setError(result.error.message)
    } else {
      setCourses(result.data)
      const institucionesIds = [...new Set(result.data.map(function (e) { return e.course.institucion_id || 'sin-institucion' }))]
      if (institucionesIds.length === 1) setInstitucionSel(institucionesIds[0])
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

  const institucionesUnicas = [...new Map(
    courses.map(function (e) { return [e.course.institucion_id || 'sin-institucion', e.course.instituciones_educativas?.nombre || 'Sin institución asignada'] })
  ).entries()]

  return (
    <div>
      <style>{`
        @keyframes nexoris-flotar { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-5px); } }
        @keyframes nexoris-hoja { 0%,100% { transform: translateY(0) rotate(0deg); } 50% { transform: translateY(-3px) rotate(-3deg); } }
        @media (prefers-reduced-motion: reduce) { [style*="nexoris-"] { animation: none !important; } }
      `}</style>
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <h2 className="text-2xl font-bold" style={{ color: NAVY_DARK }}>Mis Asignaturas</h2>
        {miGrado && (
          <span className="text-xs font-semibold px-3 py-1.5 rounded-full" style={{ backgroundColor: '#E7F3E4', color: GREEN_DARK }}>
            {gradoLabel(miGrado)} · Sección {miSeccion}
          </span>
        )}
      </div>

      {courses.length === 0 ? (
        <div className="bg-white rounded-2xl p-10 text-center" style={{ border: '1px dashed #D6DCE5' }}>
          <p className="text-slate-400 text-sm">Aún no estás matriculado en ningún curso. Contacta al administrador de la academia.</p>
        </div>
      ) : institucionSel == null ? (
        <>
          <p className="text-sm text-slate-400 mb-5">Elige la institución educativa</p>
          <div className="grid gap-4 sm:grid-cols-2">
            {institucionesUnicas.map(function ([id, nombre]) {
              const cantidad = courses.filter(function (e) { return (e.course.institucion_id || 'sin-institucion') === id }).length
              return (
                <button
                  key={id}
                  onClick={function () { setInstitucionSel(id) }}
                  className="text-left bg-white rounded-2xl p-5 space-y-2 transition hover:-translate-y-0.5"
                  style={{ border: '1px solid #E5E9F0', boxShadow: '0 1px 3px rgba(15,42,74,0.06)' }}
                >
                  <div className="flex items-center justify-between">
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: '#EAF2FB' }}>
                      <div style={{ animation: 'nexoris-flotar 3s ease-in-out infinite' }}>
                        <svg width="30" height="30" viewBox="0 0 60 60">
                          <rect x="10" y="20" width="40" height="30" fill="#0C447C" />
                          <rect x="8" y="18" width="40" height="30" fill="#378ADD" />
                          <polygon points="6,20 28,6 50,20" fill="#0C447C" />
                          <polygon points="6,18 28,4 50,18" fill="#185FA5" />
                          <rect x="24" y="34" width="8" height="14" fill="#E6F1FB" />
                          <rect x="12" y="26" width="6" height="6" fill="#B5D4F4" />
                          <rect x="22" y="26" width="6" height="6" fill="#B5D4F4" />
                          <rect x="32" y="26" width="6" height="6" fill="#B5D4F4" />
                          <rect x="40" y="26" width="6" height="6" fill="#B5D4F4" />
                        </svg>
                      </div>
                    </div>
                    <span className="text-xs font-semibold px-2.5 py-1 rounded-full" style={{ backgroundColor: '#E7F3E4', color: GREEN_DARK }}>
                      {cantidad} asignatura(s)
                    </span>
                  </div>
                  <h3 className="text-lg font-bold" style={{ color: NAVY_DARK }}>{nombre}</h3>
                </button>
              )
            })}
          </div>
        </>
      ) : areaSel == null ? (
        <>
          {institucionesUnicas.length > 1 && (
            <button onClick={function () { setInstitucionSel(null) }} className="text-sm font-semibold mb-4 hover:underline" style={{ color: NAVY }}>← Volver a Instituciones</button>
          )}
          <p className="text-sm text-slate-400 mb-5">Elige el Área</p>
          {(function () {
            const cursosInst = courses.filter(function (e) { return (e.course.institucion_id || 'sin-institucion') === institucionSel })
            const areasUnicas = [...new Set(cursosInst.map(function (e) { return e.course.asignaturas?.areas_curriculares?.nombre || 'Otras' }))]
            return (
              <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
                {areasUnicas.map(function (areaNombre) {
                  const cantidad = cursosInst.filter(function (e) { return (e.course.asignaturas?.areas_curriculares?.nombre || 'Otras') === areaNombre }).length
                  return (
                    <button
                      key={areaNombre}
                      onClick={function () { setAreaSel(areaNombre) }}
                      className="text-left bg-white rounded-2xl p-5 space-y-2 transition hover:-translate-y-0.5"
                      style={{ border: '1px solid #E5E9F0', boxShadow: '0 1px 3px rgba(15,42,74,0.06)' }}
                    >
                      <div className="flex items-center justify-between">
                        <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: '#FAEEDA' }}>
                          <div style={{ animation: 'nexoris-hoja 2.6s ease-in-out infinite' }}>
                            <svg width="30" height="30" viewBox="0 0 60 60">
                              <path d="M10 20h14l4 5h22a3 3 0 0 1 3 3v20a3 3 0 0 1-3 3H10a3 3 0 0 1-3-3V23a3 3 0 0 1 3-3z" fill="#854F0B" />
                              <path d="M8 18h14l4 5h22a3 3 0 0 1 3 3v18a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3V21a3 3 0 0 1 3-3z" fill="#EF9F27" />
                              <rect x="13" y="30" width="18" height="3" rx="1.5" fill="#FAEEDA" opacity="0.8" />
                              <rect x="13" y="36" width="24" height="3" rx="1.5" fill="#FAEEDA" opacity="0.6" />
                            </svg>
                          </div>
                        </div>
                        <span className="text-xs font-semibold px-2.5 py-1 rounded-full" style={{ backgroundColor: '#E7F3E4', color: GREEN_DARK }}>
                          {cantidad} asignatura(s)
                        </span>
                      </div>
                      <h3 className="text-lg font-bold" style={{ color: NAVY_DARK }}>{areaNombre}</h3>
                    </button>
                  )
                })}
              </div>
            )
          })()}
        </>
      ) : (
        <>
          <button onClick={function () { setAreaSel(null) }} className="text-sm font-semibold mb-4 hover:underline" style={{ color: NAVY }}>← Volver a Áreas</button>
          <p className="text-sm text-slate-400 mb-5">{areaSel}</p>
          {(function () {
            const cursosFinal = courses.filter(function (e) {
              return (e.course.institucion_id || 'sin-institucion') === institucionSel
                && (e.course.asignaturas?.areas_curriculares?.nombre || 'Otras') === areaSel
            })
            return (
              <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
                {cursosFinal.map(function (e) {
                  return (
                    <button
                      key={e.id}
                      onClick={function () { setSelectedCourse(e.course) }}
                      className="text-left bg-white rounded-2xl p-5 space-y-2 transition hover:-translate-y-0.5"
                      style={{ border: '1px solid #E5E9F0', boxShadow: '0 1px 3px rgba(15,42,74,0.06)' }}
                    >
                      <div className="flex items-center justify-between">
                        <IconoAsignatura nombre={e.course.nombre} size={34} />
                        {e.course.grado && (
                          <span className="text-xs font-semibold px-2.5 py-1 rounded-full" style={{ backgroundColor: '#E7F3E4', color: GREEN_DARK }}>
                            {gradoLabel(e.course.grado)}
                          </span>
                        )}
                      </div>
                      <h3 className="text-lg font-bold" style={{ color: NAVY_DARK }}>
                        {e.course.nombre} <span className="text-slate-400 text-sm font-medium">(Sección {e.course.grupo})</span>
                      </h3>
                      <p className="text-sm text-slate-500">Docente: {e.course.docente?.full_name || 'Sin asignar'}</p>
                      <p className="text-sm font-medium" style={{ color: GREEN_DARK }}>{scheduleText(e.course.course_schedules)}</p>
                    </button>
                  )
                })}
              </div>
            )
          })()}
        </>
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

// ============================================================
// Notas de Tareas de una Unidad específica (estudiante, solo lectura)
// ============================================================
function NotasDeTareasUnidad({ unidad, courseId }) {
  const { session } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [competenciasData, setCompetenciasData] = useState([])
  const [abierto, setAbierto] = useState(null)

  useEffect(function () {
    cargar()
  }, [unidad.id, courseId])

  function average(numbers) {
    const validos = numbers.filter(function (n) { return n != null })
    if (validos.length === 0) return null
    return validos.reduce(function (a, b) { return a + b }, 0) / validos.length
  }

  async function cargar() {
    setLoading(true)
    setError('')

    const courseResult = await supabase
      .from('courses')
      .select('asignaturas(areas_curriculares(nombre))')
      .eq('id', courseId)
      .single()
    const areaNombre = courseResult.data?.asignaturas?.areas_curriculares?.nombre
    if (!areaNombre) {
      setError('No se pudo determinar el Área de este curso.')
      setLoading(false)
      return
    }

    const compResult = await supabase.from('competencias').select('*').eq('area', areaNombre).order('codigo')
    const competencias = compResult.error ? [] : compResult.data
    const competenciaIds = competencias.map(function (c) { return c.id })

    const capResult = await supabase.from('capacidades').select('*').in('competencia_id', competenciaIds).order('orden')
    const capacidades = capResult.error ? [] : capResult.data

    const actResult = await supabase
      .from('actividades')
      .select('id, nombre, numero_actividad, actividad_capacidades(capacidad_id, criterio, desempeno)')
      .eq('unidad_id', unidad.id)
      .eq('course_id', courseId)
    const actividades = actResult.error ? [] : actResult.data
    const actIds = actividades.map(function (a) { return a.id })

    let assignments = []
    if (actIds.length > 0) {
      const assignResult = await supabase
        .from('assignments')
        .select('id, titulo, actividad_id, assignment_capacidades(capacidad_id)')
        .in('actividad_id', actIds)
      assignments = assignResult.error ? [] : assignResult.data
    }

    const assignmentIds = assignments.map(function (a) { return a.id })
    let notaMap = {}
    if (assignmentIds.length > 0) {
      const subsResult = await supabase
        .from('submissions')
        .select('id, assignment_id, publicado')
        .eq('student_id', session.user.id)
        .in('assignment_id', assignmentIds)
      const submissionsData = subsResult.error ? [] : subsResult.data
      const submissionIds = submissionsData.map(function (s) { return s.id })
      const subMap = {}
      submissionsData.forEach(function (s) { subMap[s.id] = s })

      if (submissionIds.length > 0) {
        const scoresResult = await supabase
          .from('submission_scores')
          .select('submission_id, capacidad_id, score')
          .in('submission_id', submissionIds)
        if (!scoresResult.error) {
          scoresResult.data.forEach(function (row) {
            const sub = subMap[row.submission_id]
            if (!sub || !sub.publicado) return
            notaMap[`${row.capacidad_id}__${sub.assignment_id}`] = row.score
          })
        }
      }
    }

    const estructura = competencias.map(function (comp) {
      const caps = capacidades.filter(function (c) { return c.competencia_id === comp.id }).map(function (cap) {
        const instancias = []
        assignments.forEach(function (a) {
          const tiene = (a.assignment_capacidades || []).some(function (ac) { return ac.capacidad_id === cap.id })
          if (!tiene) return
          const actividad = actividades.find(function (act) { return act.id === a.actividad_id })
          const detalle = (actividad?.actividad_capacidades || []).find(function (ac) { return ac.capacidad_id === cap.id })
          instancias.push({
            assignmentId: a.id,
            tituloTarea: a.titulo,
            actividadNumero: actividad?.numero_actividad,
            criterio: detalle?.criterio || '',
            desempeno: detalle?.desempeno || '',
            nota: notaMap[`${cap.id}__${a.id}`] != null ? notaMap[`${cap.id}__${a.id}`] : null,
          })
        })
        return { ...cap, instancias: instancias, promedioCapacidad: average(instancias.map(function (i) { return i.nota })) }
      }).filter(function (c) { return c.instancias.length > 0 })
      return { ...comp, capacidades: caps }
    }).filter(function (c) { return c.capacidades.length > 0 })

    setCompetenciasData(estructura)
    setLoading(false)
  }

  function toggle(key) {
    setAbierto(function (prev) { return prev === key ? null : key })
  }

  if (loading) return <p className="text-slate-400 text-sm">Cargando...</p>
  if (error) return <p className="text-red-500 text-sm">{error}</p>
  if (competenciasData.length === 0) return <p className="text-slate-400 text-sm">Aún no hay tareas calificadas en esta unidad.</p>

  return (
    <div className="space-y-4">
      {competenciasData.map(function (comp) {
        return (
          <div key={comp.id} className="rounded-xl p-4" style={{ backgroundColor: '#F4F6F9' }}>
            <p className="text-sm font-semibold mb-3" style={{ color: GREEN_DARK }}>{comp.nombre}</p>
            <div className="space-y-3">
              {comp.capacidades.map(function (cap) {
                return (
                  <div key={cap.id} className="bg-white rounded-lg p-3" style={{ border: '1px solid #E5E9F0' }}>
                    <div className="flex justify-between items-center mb-2">
                      <p className="text-xs font-semibold" style={{ color: NAVY_DARK }}>{cap.nombre}</p>
                      <p className={'text-xs font-bold ' + getLetterColor(cap.promedioCapacidad)}>
                        {cap.promedioCapacidad != null ? getLetterGrade(cap.promedioCapacidad) : '—'}
                      </p>
                    </div>
                    <ul className="space-y-1.5">
                      {cap.instancias.map(function (inst) {
                        const keyC = 'c_' + inst.assignmentId + '_' + cap.id
                        const keyD = 'd_' + inst.assignmentId + '_' + cap.id
                        return (
                          <li key={inst.assignmentId + '_' + cap.id} className="text-xs">
                            <div className="flex justify-between items-center gap-2">
                              <span style={{ color: '#5F5E5A' }}>
                                Act.{inst.actividadNumero} · {inst.tituloTarea}{' '}
                                <button className="underline decoration-dotted" style={{ color: NAVY }} onClick={function () { toggle(keyC) }}>Criterio</button>
                                {' · '}
                                <button className="underline decoration-dotted" style={{ color: '#8a5cb0' }} onClick={function () { toggle(keyD) }}>Desempeño</button>
                              </span>
                              <span className={'font-bold ' + getLetterColor(inst.nota)}>
                                {inst.nota != null ? getLetterGrade(inst.nota) : '—'}
                              </span>
                            </div>
                            {abierto === keyC && (
                              <div className="mt-1 p-2 rounded" style={{ backgroundColor: '#DEEBF7', color: NAVY_DARK }}>{inst.criterio || 'Sin criterio registrado.'}</div>
                            )}
                            {abierto === keyD && (
                              <div className="mt-1 p-2 rounded" style={{ backgroundColor: '#f0e7f7', color: '#4a2e63' }}>{inst.desempeno || 'Sin desempeño registrado.'}</div>
                            )}
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ============================================================
// Evaluación Final (Cierre) de una Unidad específica (estudiante, solo lectura)
// ============================================================
function NotasCierreUnidad({ unidad }) {
  const { session } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notas, setNotas] = useState([])

  useEffect(function () {
    cargar()
  }, [unidad.id])

  async function cargar() {
    setLoading(true)
    const result = await supabase
      .from('evaluacion_cierre')
      .select('nota_numerica, competencia:competencias(nombre)')
      .eq('unidad_id', unidad.id)
      .eq('student_id', session.user.id)
    if (result.error) setError(result.error.message)
    else setNotas(result.data)
    setLoading(false)
  }

  if (loading) return <p className="text-slate-400 text-sm">Cargando...</p>
  if (error) return <p className="text-red-500 text-sm">{error}</p>
  if (notas.length === 0) return <p className="text-slate-400 text-sm">Tu docente aún no ha registrado la evaluación final de esta unidad.</p>

  return (
    <ul className="space-y-3">
      {notas.map(function (n, i) {
        const letra = getLetterGrade(n.nota_numerica)
        return (
          <li key={i} className="flex justify-between items-center rounded-xl p-4" style={{ backgroundColor: '#F4F6F9', border: '1px solid #E5E9F0' }}>
            <span className="text-sm" style={{ color: NAVY_DARK }}>{n.competencia?.nombre}</span>
            <div className="text-right">
              <p className={'text-lg font-bold ' + getLetterColor(n.nota_numerica)}>{n.nota_numerica.toFixed(1)}</p>
              <p className="text-xs text-slate-500">{letra}</p>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

// ============================================================
// Mis Notas de una Asignatura completa (todas sus Unidades), estudiante
// ============================================================
function NotasDeAsignatura({ courseId }) {
  const { session } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [gruposUnidad, setGruposUnidad] = useState([])
  const [abierto, setAbierto] = useState(null)

  useEffect(function () {
    cargar()
  }, [courseId])

  function average(numbers) {
    const validos = numbers.filter(function (n) { return n != null })
    if (validos.length === 0) return null
    return validos.reduce(function (a, b) { return a + b }, 0) / validos.length
  }

  async function cargar() {
    setLoading(true)
    setError('')

    const courseResult = await supabase
      .from('courses')
      .select('asignaturas(areas_curriculares(nombre))')
      .eq('id', courseId)
      .single()
    const areaNombre = courseResult.data?.asignaturas?.areas_curriculares?.nombre
    if (!areaNombre) {
      setError('No se pudo determinar el Área de este curso.')
      setLoading(false)
      return
    }

    const compResult = await supabase.from('competencias').select('*').eq('area', areaNombre).order('codigo')
    const competencias = compResult.error ? [] : compResult.data
    const competenciaIds = competencias.map(function (c) { return c.id })

    const capResult = await supabase.from('capacidades').select('*').in('competencia_id', competenciaIds).order('orden')
    const capacidades = capResult.error ? [] : capResult.data

    const actResult = await supabase
      .from('actividades')
      .select('id, nombre, numero_actividad, unidad_id, actividad_capacidades(capacidad_id, criterio, desempeno)')
      .eq('course_id', courseId)
    const actividades = actResult.error ? [] : actResult.data
    const actIds = actividades.map(function (a) { return a.id })

    const unidadIdsUnicos = [...new Set(actividades.map(function (a) { return a.unidad_id }).filter(Boolean))]
    let unidadesInfo = []
    if (unidadIdsUnicos.length > 0) {
      const unidResult = await supabase.from('unidades').select('id, tipo, numero, nombre').in('id', unidadIdsUnicos)
      unidadesInfo = unidResult.error ? [] : unidResult.data
    }
    unidadesInfo.sort(function (a, b) { return a.numero - b.numero })

    let assignments = []
    if (actIds.length > 0) {
      const assignResult = await supabase
        .from('assignments')
        .select('id, titulo, actividad_id, assignment_capacidades(capacidad_id)')
        .in('actividad_id', actIds)
      assignments = assignResult.error ? [] : assignResult.data
    }

    const assignmentIds = assignments.map(function (a) { return a.id })
    let notaMap = {}
    if (assignmentIds.length > 0) {
      const subsResult = await supabase
        .from('submissions')
        .select('id, assignment_id, publicado')
        .eq('student_id', session.user.id)
        .in('assignment_id', assignmentIds)
      const submissionsData = subsResult.error ? [] : subsResult.data
      const submissionIds = submissionsData.map(function (s) { return s.id })
      const subMap = {}
      submissionsData.forEach(function (s) { subMap[s.id] = s })

      if (submissionIds.length > 0) {
        const scoresResult = await supabase
          .from('submission_scores')
          .select('submission_id, capacidad_id, score')
          .in('submission_id', submissionIds)
        if (!scoresResult.error) {
          scoresResult.data.forEach(function (row) {
            const sub = subMap[row.submission_id]
            if (!sub || !sub.publicado) return
            notaMap[`${row.capacidad_id}__${sub.assignment_id}`] = row.score
          })
        }
      }
    }

    function estructuraParaActividades(actividadesDeUnidad) {
      return competencias.map(function (comp) {
        const caps = capacidades.filter(function (c) { return c.competencia_id === comp.id }).map(function (cap) {
          const instancias = []
          assignments.forEach(function (a) {
            const actividad = actividadesDeUnidad.find(function (act) { return act.id === a.actividad_id })
            if (!actividad) return
            const tiene = (a.assignment_capacidades || []).some(function (ac) { return ac.capacidad_id === cap.id })
            if (!tiene) return
            const detalle = (actividad.actividad_capacidades || []).find(function (ac) { return ac.capacidad_id === cap.id })
            instancias.push({
              assignmentId: a.id,
              tituloTarea: a.titulo,
              actividadNumero: actividad.numero_actividad,
              criterio: detalle?.criterio || '',
              desempeno: detalle?.desempeno || '',
              nota: notaMap[`${cap.id}__${a.id}`] != null ? notaMap[`${cap.id}__${a.id}`] : null,
            })
          })
          return { ...cap, instancias: instancias, promedioCapacidad: average(instancias.map(function (i) { return i.nota })) }
        }).filter(function (c) { return c.instancias.length > 0 })
        return { ...comp, capacidades: caps }
      }).filter(function (c) { return c.capacidades.length > 0 })
    }

    const grupos = unidadesInfo.map(function (u) {
      const actividadesDeUnidad = actividades.filter(function (a) { return a.unidad_id === u.id })
      return { unidad: u, competenciasData: estructuraParaActividades(actividadesDeUnidad) }
    }).filter(function (g) { return g.competenciasData.length > 0 })

    setGruposUnidad(grupos)
    setLoading(false)
  }

  function toggle(key) {
    setAbierto(function (prev) { return prev === key ? null : key })
  }

  if (loading) return <p className="text-slate-400 text-sm">Cargando...</p>
  if (error) return <p className="text-red-500 text-sm">{error}</p>
  if (gruposUnidad.length === 0) return <p className="text-slate-400 text-sm">Aún no hay tareas calificadas en esta asignatura.</p>

  return (
    <div className="space-y-6">
      {gruposUnidad.map(function (grupo) {
        return (
          <div key={grupo.unidad.id}>
            <p className="text-xs font-bold uppercase tracking-wide mb-2 px-3 py-1 rounded-lg inline-block" style={{ backgroundColor: '#E7F3E4', color: GREEN_DARK }}>
              {grupo.unidad.tipo} {grupo.unidad.numero}{grupo.unidad.nombre ? ' · ' + grupo.unidad.nombre : ''}
            </p>
            <div className="space-y-3">
              {grupo.competenciasData.map(function (comp) {
                return (
                  <div key={comp.id} className="rounded-xl p-4" style={{ backgroundColor: '#F4F6F9' }}>
                    <p className="text-sm font-semibold mb-3" style={{ color: GREEN_DARK }}>{comp.nombre}</p>
                    <div className="space-y-3">
                      {comp.capacidades.map(function (cap) {
                        return (
                          <div key={cap.id} className="bg-white rounded-lg p-3" style={{ border: '1px solid #E5E9F0' }}>
                            <div className="flex justify-between items-center mb-2">
                              <p className="text-xs font-semibold" style={{ color: NAVY_DARK }}>{cap.nombre}</p>
                              <p className={'text-xs font-bold ' + getLetterColor(cap.promedioCapacidad)}>
                                {cap.promedioCapacidad != null ? getLetterGrade(cap.promedioCapacidad) : '—'}
                              </p>
                            </div>
                            <ul className="space-y-1.5">
                              {cap.instancias.map(function (inst) {
                                const keyC = 'c_' + inst.assignmentId + '_' + cap.id
                                const keyD = 'd_' + inst.assignmentId + '_' + cap.id
                                return (
                                  <li key={inst.assignmentId + '_' + cap.id} className="text-xs">
                                    <div className="flex justify-between items-center gap-2">
                                      <span style={{ color: '#5F5E5A' }}>
                                        Act.{inst.actividadNumero} · {inst.tituloTarea}{' '}
                                        <button className="underline decoration-dotted" style={{ color: NAVY }} onClick={function () { toggle(keyC) }}>Criterio</button>
                                        {' · '}
                                        <button className="underline decoration-dotted" style={{ color: '#8a5cb0' }} onClick={function () { toggle(keyD) }}>Desempeño</button>
                                      </span>
                                      <span className={'font-bold ' + getLetterColor(inst.nota)}>
                                        {inst.nota != null ? getLetterGrade(inst.nota) : '—'}
                                      </span>
                                    </div>
                                    {abierto === keyC && (
                                      <div className="mt-1 p-2 rounded" style={{ backgroundColor: '#DEEBF7', color: NAVY_DARK }}>{inst.criterio || 'Sin criterio registrado.'}</div>
                                    )}
                                    {abierto === keyD && (
                                      <div className="mt-1 p-2 rounded" style={{ backgroundColor: '#f0e7f7', color: '#4a2e63' }}>{inst.desempeno || 'Sin desempeño registrado.'}</div>
                                    )}
                                  </li>
                                )
                              })}
                            </ul>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
