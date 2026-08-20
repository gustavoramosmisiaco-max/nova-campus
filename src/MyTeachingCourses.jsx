import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import { useAuth } from './AuthContext'
import { useDocenteContextoActivo } from './DocenteContextoActivo'
import IconoAsignatura from './IconoAsignatura'
import InstrumentoEvaluacion from './InstrumentoEvaluacion'
import CourseActivities from './CourseActivities'
import CourseZoomTeacher from './CourseZoomTeacher'
import GruposTrabajo from './GruposTrabajo'
import RegistroAuxiliarPorArea from './RegistroAuxiliarPorArea'
import EvaluacionCierre from './EvaluacionCierre'

const NAVY_DARK = '#0F172A'
const NAVY = '#2563EB'
const GREEN = '#22C55E'
const GREEN_DARK = '#16A34A'

function gradoLabel(g) {
  return g ? `${g}° Secundaria` : 'Sin grado'
}

function scheduleText(schedules) {
  if (!schedules || schedules.length === 0) return 'Sin horario asignado'
  const DIAS = [null, 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
  return schedules.map(function (s) { return `${DIAS[s.dia_semana]} ${s.hora_inicio.slice(0, 5)}-${s.hora_fin.slice(0, 5)}` }).join(' · ')
}

// ============================================================
// Vista de un Área completa para el Docente — Actividades combinadas de todas
// sus asignaturas (ej. Biología + Física y Química). Videoclases, Grupos de
// Trabajo y el Instrumento completo siguen siendo por asignatura, con selector.
// ============================================================
function CourseDetailTeacherArea({ areaNombre, grado, grupo, cursos, onBack }) {
  const [tab, setTab] = useState('actividades')
  const [cursoParaTab, setCursoParaTab] = useState(null)
  const [verInstrumento, setVerInstrumento] = useState(false)

  const tabs = [
    { id: 'actividades', label: 'Actividades' },
    { id: 'zoom', label: 'Videoclases' },
    { id: 'grupos', label: 'Grupos de Trabajo' },
  ]

  function cambiarTab(id) {
    setTab(id)
    setCursoParaTab(null)
    setVerInstrumento(false)
  }

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
        <h2 className="text-2xl font-bold" style={{ color: NAVY_DARK }}>{areaNombre}</h2>
        <span
          className="text-xs font-semibold px-3 py-1 rounded-full"
          style={{ backgroundColor: '#E7F3E4', color: GREEN_DARK }}
        >
          {gradoLabel(grado)} · Sección {grupo}
        </span>
      </div>
      <p className="text-sm font-medium mb-4" style={{ color: GREEN_DARK }}>
        {cursos.map(function (c) { return c.nombre }).join(' · ')}
      </p>

      <div className="flex justify-between items-center flex-wrap gap-3 mb-6 border-b" style={{ borderColor: '#E5E9F0' }}>
        <div className="flex gap-2 flex-wrap">
          {tabs.map(function (t) {
            const active = tab === t.id
            return (
              <button
                key={t.id}
                onClick={function () { cambiarTab(t.id) }}
                className="px-4 py-2.5 text-sm font-semibold border-b-2 transition"
                style={
                  active && !verInstrumento
                    ? { borderColor: GREEN, color: NAVY_DARK }
                    : { borderColor: 'transparent', color: '#94A3B8' }
                }
              >
                {t.label}
              </button>
            )
          })}
        </div>
        {tab === 'actividades' && (
          <button
            onClick={function () { setVerInstrumento(!verInstrumento); setCursoParaTab(null) }}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg mb-1 transition hover:opacity-90"
            style={{ backgroundColor: verInstrumento ? NAVY : '#F4F6F9', color: verInstrumento ? 'white' : NAVY }}
          >
            📋 Ver instrumento completo
          </button>
        )}
      </div>

      <div className="bg-white rounded-2xl p-6" style={{ border: '1px solid #E5E9F0' }}>
        {tab === 'actividades' && !verInstrumento && <CourseActivities cursos={cursos} />}

        {(tab === 'zoom' || tab === 'grupos' || (tab === 'actividades' && verInstrumento)) && !cursoParaTab && (
          <div>
            <p className="text-sm text-slate-400 mb-4">Elige la asignatura</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {cursos.map(function (c) {
                return (
                  <button
                    key={c.id}
                    onClick={function () { setCursoParaTab(c) }}
                    className="text-left rounded-xl p-4 transition hover:-translate-y-0.5"
                    style={{ backgroundColor: '#F4F6F9', border: '1px solid #E5E9F0' }}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <IconoAsignatura nombre={c.nombre} size={24} />
                      <span className="text-sm font-bold" style={{ color: NAVY_DARK }}>{c.nombre}</span>
                    </div>
                    <p className="text-xs text-slate-500">{c.enrollments?.[0]?.count ?? 0} alumno(s) matriculado(s)</p>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {tab === 'actividades' && verInstrumento && cursoParaTab && (
          <div>
            <button onClick={function () { setCursoParaTab(null) }} className="text-sm font-semibold mb-4 hover:underline flex items-center gap-1" style={{ color: NAVY }}>
              ← Cambiar de asignatura
            </button>
            <InstrumentoEvaluacion
              courseId={cursoParaTab.id}
              courseNombre={cursoParaTab.nombre}
              courseGrado={grado}
              courseGrupo={grupo}
            />
          </div>
        )}

        {tab === 'zoom' && cursoParaTab && (
          <div>
            <button onClick={function () { setCursoParaTab(null) }} className="text-sm font-semibold mb-4 hover:underline flex items-center gap-1" style={{ color: NAVY }}>
              ← Cambiar de asignatura
            </button>
            <CourseZoomTeacher courseId={cursoParaTab.id} />
          </div>
        )}

        {tab === 'grupos' && cursoParaTab && (
          <div>
            <button onClick={function () { setCursoParaTab(null) }} className="text-sm font-semibold mb-4 hover:underline flex items-center gap-1" style={{ color: NAVY }}>
              ← Cambiar de asignatura
            </button>
            <GruposTrabajo courseId={cursoParaTab.id} />
          </div>
        )}
      </div>
    </div>
  )
}

export default function MyTeachingCourses() {
  const { session } = useAuth()
  const { institucionSel, aulaSel, areaId, areaNombre, elegirInstitucion, elegirAula, elegirArea } = useDocenteContextoActivo()
  const [courses, setCourses] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [verRegistroDirecto, setVerRegistroDirecto] = useState(false)
  const [verUnidadesArea, setVerUnidadesArea] = useState(false)
  const [unidadesArea, setUnidadesArea] = useState([])
  const [unidadEvaluacionSel, setUnidadEvaluacionSel] = useState(null)

  useEffect(function () {
    loadMyCourses()
  }, [])

  async function loadMyCourses() {
    setLoading(true)
    const result = await supabase
      .from('courses')
      .select('id, nombre, grupo, grado, institucion_id, course_schedules(*), enrollments(count), asignaturas!inner(activo, area_id, areas_curriculares(nombre)), instituciones_educativas(nombre)')
      .eq('docente_id', session.user.id)
      .eq('asignaturas.activo', true)
      .eq('activo', true)
      .order('grado', { ascending: true })
      .order('grupo', { ascending: true })
      .order('nombre', { ascending: true })

    if (result.error) {
      setError(result.error.message)
    } else {
      setCourses(result.data)
      const institucionesIds = [...new Set(result.data.map(function (c) { return c.institucion_id || 'sin-institucion' }))]
      if (institucionesIds.length === 1 && !institucionSel) {
        elegirInstitucion(institucionesIds[0])
      }
    }
    setLoading(false)
  }

  async function handleAbrirUnidadesArea() {
    const [grado, grupo] = aulaSel.split('__')
    const cursoRef = courses.find(function (c) {
      return String(c.grado) === grado && c.grupo === grupo
        && (c.institucion_id || 'sin-institucion') === institucionSel
        && c.asignaturas?.area_id === areaId
    })
    if (!cursoRef) return

    const result = await supabase
      .from('unidades')
      .select('id, tipo, numero, nombre, finalizada')
      .eq('area_id', areaId)
      .eq('grado', grado)
      .eq('grupo', grupo)
      .order('numero')
    if (!result.error) setUnidadesArea(result.data)
    setUnidadEvaluacionSel(null)
    setVerUnidadesArea(true)
  }

  if (loading) return <p className="text-slate-400">Cargando tus cursos...</p>
  if (error) return <p className="text-red-500">Error: {error}</p>

  if (verRegistroDirecto && aulaSel && areaId) {
    const [gradoReg, grupoReg] = aulaSel.split('__')
    const cursoDeReferencia = courses.find(function (c) {
      return String(c.grado) === gradoReg && c.grupo === grupoReg
        && (c.institucion_id || 'sin-institucion') === institucionSel
        && c.asignaturas?.area_id === areaId
    })
    return (
      <div>
        <button onClick={function () { setVerRegistroDirecto(false) }} className="text-sm font-semibold mb-4 hover:underline flex items-center gap-1" style={{ color: NAVY }}>
          ← Volver a {areaNombre}
        </button>
        {cursoDeReferencia ? (
          <RegistroAuxiliarPorArea courseId={cursoDeReferencia.id} />
        ) : (
          <p className="text-slate-400 text-sm">No se encontró ningún curso para generar el Registro.</p>
        )}
      </div>
    )
  }

  if (verUnidadesArea && aulaSel && areaId) {
    const [gradoU, grupoU] = aulaSel.split('__')
    const cursoDeReferencia = courses.find(function (c) {
      return String(c.grado) === gradoU && c.grupo === grupoU
        && (c.institucion_id || 'sin-institucion') === institucionSel
        && c.asignaturas?.area_id === areaId
    })

    if (unidadEvaluacionSel) {
      return (
        <div>
          <EvaluacionCierre
            unidad={{ ...unidadEvaluacionSel, course_id: cursoDeReferencia?.id }}
            onFinalizada={function () { setUnidadEvaluacionSel(null) }}
          />
          <button onClick={function () { setUnidadEvaluacionSel(null) }} className="text-sm font-semibold mt-4 hover:underline block" style={{ color: NAVY }}>
            ← Volver a la lista de Unidades
          </button>
        </div>
      )
    }

    return (
      <div>
        <button onClick={function () { setVerUnidadesArea(false); setUnidadesArea([]) }} className="text-sm font-semibold mb-4 hover:underline" style={{ color: NAVY }}>
          ← Volver a {areaNombre}
        </button>
        <h3 className="text-lg font-bold mb-4" style={{ color: NAVY_DARK }}>Evaluación de Cierre por Unidad — {areaNombre}</h3>
        {unidadesArea.length === 0 ? (
          <p className="text-slate-400 text-sm">No hay Unidades/Experiencias creadas todavía para esta aula.</p>
        ) : (
          <ul className="space-y-2">
            {unidadesArea.map(function (u) {
              return (
                <li key={u.id}>
                  <button
                    onClick={function () { setUnidadEvaluacionSel(u) }}
                    className="w-full text-left bg-white rounded-xl p-4 transition hover:-translate-y-0.5"
                    style={{ border: '1px solid #E5E9F0' }}
                  >
                    <p className="text-sm font-semibold" style={{ color: NAVY_DARK }}>{u.tipo} {u.numero}{u.nombre ? ' — ' + u.nombre : ''}</p>
                    <p className="text-xs text-slate-400 mt-0.5">Bimestre {Math.ceil(u.numero / 2)}{u.finalizada ? ' · ✓ Finalizada' : ''}</p>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    )
  }

  const institucionesUnicas = [...new Map(
    courses.map(function (c) { return [c.institucion_id || 'sin-institucion', c.instituciones_educativas?.nombre || 'Sin institución asignada'] })
  ).entries()]

  if (aulaSel && areaId) {
    const [grado, grupo] = aulaSel.split('__')
    const cursosFinal = courses.filter(function (c) {
      return String(c.grado) === grado && c.grupo === grupo
        && (c.institucion_id || 'sin-institucion') === institucionSel
        && c.asignaturas?.area_id === areaId
    })

    if (cursosFinal.length > 0) {
      return (
        <div>
          <div className="flex gap-2 flex-wrap mb-3">
            <button
              onClick={function () { handleAbrirUnidadesArea() }}
              className="text-xs font-semibold px-4 py-2 rounded-lg text-white transition hover:opacity-90"
              style={{ backgroundColor: '#B45309' }}
            >
              📝 Evaluación de Cierre / Examen por Unidad
            </button>
            <button
              onClick={function () { setVerRegistroDirecto(true) }}
              className="text-xs font-semibold px-4 py-2 rounded-lg text-white transition hover:opacity-90"
              style={{ backgroundColor: NAVY }}
            >
              📋 Ver Registro Auxiliar de esta Área
            </button>
          </div>
          <CourseDetailTeacherArea
            areaNombre={areaNombre}
            grado={cursosFinal[0].grado}
            grupo={cursosFinal[0].grupo}
            cursos={cursosFinal}
            onBack={function () { elegirArea('', '') }}
          />
        </div>
      )
    }
  }

  return (
    <div>
      <style>{`
        @keyframes nexoris-flotar { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-5px); } }
        @keyframes nexoris-borla { 0%,100% { transform: rotate(-8deg); } 50% { transform: rotate(8deg); } }
        @keyframes nexoris-hoja { 0%,100% { transform: translateY(0) rotate(0deg); } 50% { transform: translateY(-3px) rotate(-3deg); } }
        @media (prefers-reduced-motion: reduce) { [style*="nexoris-"] { animation: none !important; } }
      `}</style>
      <h2 className="text-2xl font-bold mb-2" style={{ color: NAVY_DARK }}>Mis Asignaturas</h2>

      {courses.length === 0 ? (
        <div className="bg-white rounded-2xl p-10 text-center" style={{ border: '1px dashed #D6DCE5' }}>
          <p className="text-slate-400 text-sm">Aún no tienes cursos asignados. Contacta al administrador.</p>
        </div>
      ) : !institucionSel ? (
        <>
          <p className="text-sm text-slate-400 mb-5">Elige la institución educativa</p>
          <div className="grid gap-4 sm:grid-cols-2">
            {institucionesUnicas.map(function ([id, nombre]) {
              const cantidad = courses.filter(function (c) { return (c.institucion_id || 'sin-institucion') === id }).length
              return (
                <button
                  key={id}
                  onClick={function () { elegirInstitucion(id) }}
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
                      {cantidad} curso(s)
                    </span>
                  </div>
                  <h3 className="text-lg font-bold" style={{ color: NAVY_DARK }}>{nombre}</h3>
                </button>
              )
            })}
          </div>
        </>
      ) : !aulaSel ? (
        <>
          {institucionesUnicas.length > 1 && (
            <button onClick={function () { elegirInstitucion('') }} className="text-sm font-semibold mb-2 hover:underline" style={{ color: NAVY }}>← Volver a Instituciones</button>
          )}
          <p className="text-xs font-bold uppercase tracking-wide mb-1" style={{ color: GREEN_DARK }}>
            {institucionesUnicas.find(function (i) { return i[0] === institucionSel })?.[1] || ''}
          </p>
          <p className="text-sm text-slate-400 mb-5">Elige el Grado y Sección</p>
          {(function () {
            const cursosInst = courses.filter(function (c) { return (c.institucion_id || 'sin-institucion') === institucionSel })
            const aulasUnicas = [...new Map(cursosInst.map(function (c) { return [`${c.grado}__${c.grupo}`, { grado: c.grado, grupo: c.grupo }] })).values()]
            aulasUnicas.sort(function (a, b) { return a.grado - b.grado || a.grupo.localeCompare(b.grupo) })
            return (
              <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
                {aulasUnicas.map(function (a) {
                  const cantidad = cursosInst.filter(function (c) { return c.grado === a.grado && c.grupo === a.grupo }).length
                  return (
                    <button
                      key={`${a.grado}-${a.grupo}`}
                      onClick={function () { elegirAula(`${a.grado}__${a.grupo}`) }}
                      className="text-left bg-white rounded-2xl p-5 space-y-2 transition hover:-translate-y-0.5"
                      style={{ border: '1px solid #E5E9F0', boxShadow: '0 1px 3px rgba(15,42,74,0.06)' }}
                    >
                      <div className="flex items-center justify-between">
                        <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: '#F2F0FE' }}>
                          <svg width="30" height="30" viewBox="0 0 60 60">
                            <ellipse cx="30" cy="24" rx="22" ry="7" fill="#3C3489" />
                            <ellipse cx="30" cy="22" rx="22" ry="7" fill="#7F77DD" />
                            <path d="M30 22l-14-5v10c0 3 6 6 14 6s14-3 14-6V17z" fill="#534AB7" />
                            <g style={{ animation: 'nexoris-borla 2.2s ease-in-out infinite', transformOrigin: '46px 22px' }}>
                              <line x1="46" y1="20" x2="46" y2="38" stroke="#3C3489" strokeWidth="1.5" />
                              <circle cx="46" cy="40" r="3" fill="#EF9F27" />
                            </g>
                          </svg>
                        </div>
                        <span className="text-xs font-semibold px-2.5 py-1 rounded-full" style={{ backgroundColor: '#E7F3E4', color: GREEN_DARK }}>
                          {cantidad} asignatura(s)
                        </span>
                      </div>
                      <h3 className="text-lg font-bold" style={{ color: NAVY_DARK }}>{gradoLabel(a.grado)}</h3>
                      <p className="text-sm text-slate-500">Sección {a.grupo}</p>
                    </button>
                  )
                })}
              </div>
            )
          })()}
        </>
      ) : !areaId ? (
        <>
          <button onClick={function () { elegirAula('') }} className="text-sm font-semibold mb-2 hover:underline" style={{ color: NAVY }}>← Volver a Grados y Secciones</button>
          <p className="text-xs font-bold uppercase tracking-wide mb-1" style={{ color: GREEN_DARK }}>
            {institucionesUnicas.find(function (i) { return i[0] === institucionSel })?.[1] || ''}
          </p>
          <p className="text-sm text-slate-400 mb-5">Elige el Área</p>
          {(function () {
            const [grado, grupo] = aulaSel.split('__')
            const cursosAula = courses.filter(function (c) { return String(c.grado) === grado && c.grupo === grupo && (c.institucion_id || 'sin-institucion') === institucionSel })
            const areasUnicas = [...new Map(cursosAula.map(function (c) { return [c.asignaturas?.area_id, c.asignaturas?.areas_curriculares?.nombre || 'Otras'] })).entries()]
            return (
              <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
                {areasUnicas.map(function ([id, nombre]) {
                  const itemsDelArea = cursosAula.filter(function (c) { return c.asignaturas?.area_id === id })
                  const nombresAsignaturas = [...new Set(itemsDelArea.map(function (c) { return c.nombre }))]
                  return (
                    <button
                      key={id}
                      onClick={function () { elegirArea(id, nombre) }}
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
                          {itemsDelArea.length} asignatura(s)
                        </span>
                      </div>
                      <h3 className="text-lg font-bold" style={{ color: NAVY_DARK }}>{nombre}</h3>
                      <p className="text-xs text-slate-500">{nombresAsignaturas.join(' · ')}</p>
                    </button>
                  )
                })}
              </div>
            )
          })()}
        </>
      ) : null}
    </div>
  )
}
