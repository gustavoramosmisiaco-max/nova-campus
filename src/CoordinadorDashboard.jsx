import { useEffect, useState, lazy, Suspense } from 'react'
import { supabase } from './supabaseClient'
import { useAuth } from './AuthContext'
import RegistroAuxiliarPorArea from './RegistroAuxiliarPorArea'
import ImportarEstudiantes from './ImportarEstudiantes'

const CoursesManager = lazy(function () { return import('./CoursesManager') })
const ImportarDocentes = lazy(function () { return import('./ImportarDocentes') })
const HabilitarCursos = lazy(function () { return import('./HabilitarCursos') })
const AsignaturasManager = lazy(function () { return import('./AsignaturasManager') })
const RecreosManager = lazy(function () { return import('./RecreosManager') })
const FeriadosManager = lazy(function () { return import('./FeriadosManager') })
const EnrollmentsManager = lazy(function () { return import('./EnrollmentsManager') })
const DocentesList = lazy(function () { return import('./DocentesList') })
const EstudiantesList = lazy(function () { return import('./EstudiantesList') })

const NAVY_DARK = '#0F172A'
const NAVY = '#2563EB'
const GREEN = '#22C55E'
const GREEN_DARK = '#16A34A'

function gradoLabel(g) {
  return g ? `${g}° Secundaria` : 'Sin grado'
}

export default function CoordinadorDashboard() {
  const { session, profile, logout } = useAuth()
  const [loading, setLoading] = useState(true)
  const [institucion, setInstitucion] = useState(null)
  const [cursos, setCursos] = useState([])
  const [conducta, setConducta] = useState([])
  const [tab, setTab] = useState('docentes')
  const [cursoSel, setCursoSel] = useState(null)
  const [gradosProp, setGradosProp] = useState([])
  const [seccionesProp, setSeccionesProp] = useState([])
  const [nuevoGradoNombre, setNuevoGradoNombre] = useState('')
  const [nuevoGradoNumero, setNuevoGradoNumero] = useState('')
  const [nuevaSeccionLetra, setNuevaSeccionLetra] = useState('')
  const [todosLosDocentes, setTodosLosDocentes] = useState([])
  const [docentesVinculadosIds, setDocentesVinculadosIds] = useState(new Set())
  const [docentesConAlgunVinculo, setDocentesConAlgunVinculo] = useState(new Set())
  const [buscarDocente, setBuscarDocente] = useState('')
  const [vinculandoId, setVinculandoId] = useState(null)
  const [areaAbierta, setAreaAbierta] = useState(null)
  const [docenteAbierto, setDocenteAbierto] = useState(null)
  const [gradoFiltroArea, setGradoFiltroArea] = useState(null)

  useEffect(function () {
    cargar()
  }, [])

  async function cargar() {
    setLoading(true)
    const instResult = await supabase.from('profiles').select('institucion_id, instituciones_educativas!profiles_institucion_id_fkey(id, nombre)').eq('id', session.user.id).single()
    const institucionId = instResult.data?.institucion_id
    setInstitucion(instResult.data?.instituciones_educativas || null)

    if (institucionId) {
      const cursosResult = await supabase
        .from('courses')
        .select('id, nombre, grado, grupo, docente:profiles(id, full_name), asignaturas(areas_curriculares(nombre)), enrollments(count)')
        .eq('institucion_id', institucionId)
        .order('grado')
        .order('grupo')
      if (!cursosResult.error) setCursos(cursosResult.data)

      const conductaResult = await supabase
        .from('conductas_registro')
        .select('id, descripcion, created_at, student_id, course_id')
        .in('course_id', (cursosResult.data || []).map(function (c) { return c.id }))
        .order('created_at', { ascending: false })
        .limit(50)
      if (!conductaResult.error) {
        const studentIds = [...new Set(conductaResult.data.map(function (r) { return r.student_id }))]
        const cursosPorId = {}
        ;(cursosResult.data || []).forEach(function (c) { cursosPorId[c.id] = c })
        let nombresMap = {}
        if (studentIds.length > 0) {
          const nombresResult = await supabase.from('profiles').select('id, full_name').in('id', studentIds)
          if (!nombresResult.error) nombresResult.data.forEach(function (p) { nombresMap[p.id] = p.full_name })
        }
        setConducta(conductaResult.data.map(function (r) {
          return { ...r, studentNombre: nombresMap[r.student_id] || 'Estudiante', curso: cursosPorId[r.course_id] }
        }))
      }

      const gradosResult = await supabase.from('grados_institucion').select('*').eq('institucion_id', institucionId).order('orden')
      if (!gradosResult.error) setGradosProp(gradosResult.data)

      const seccionesResult = await supabase.from('secciones_institucion').select('*').eq('institucion_id', institucionId).order('orden')
      if (!seccionesResult.error) setSeccionesProp(seccionesResult.data)

      const docentesResult = await supabase.from('profiles').select('id, full_name, email').eq('role', 'docente').order('full_name')
      if (!docentesResult.error) setTodosLosDocentes(docentesResult.data)

      const todosVinculosResult = await supabase.from('docente_instituciones').select('docente_id, institucion_id')
      if (!todosVinculosResult.error) {
        setDocentesVinculadosIds(new Set(todosVinculosResult.data.filter(function (v) { return v.institucion_id === institucionId }).map(function (v) { return v.docente_id })))
        setDocentesConAlgunVinculo(new Set(todosVinculosResult.data.map(function (v) { return v.docente_id })))
      }
    }
    setLoading(false)
  }

  async function toggleVinculoDocente(docenteId, yaVinculado) {
    if (!institucion?.id) return
    setVinculandoId(docenteId)
    if (yaVinculado) {
      await supabase.from('docente_instituciones').delete().eq('docente_id', docenteId).eq('institucion_id', institucion.id)
    } else {
      await supabase.from('docente_instituciones').insert({ docente_id: docenteId, institucion_id: institucion.id })
    }
    await cargar()
    setVinculandoId(null)
  }

  async function crearAsignaturasAutomaticas(combinaciones) {
    // combinaciones: [{grado, grupo}, ...] — crea 1 curso por cada Asignatura del catálogo compartido, por cada combinación
    if (!institucion?.id || combinaciones.length === 0) return

    const globalesResult = await supabase.from('asignaturas').select('id, nombre').is('institucion_id', null).eq('activo', true)
    const globales = globalesResult.data || []
    if (globales.length === 0) return

    const existentesResult = await supabase
      .from('courses')
      .select('asignatura_id, grado, grupo')
      .eq('institucion_id', institucion.id)
    const yaExisten = new Set((existentesResult.data || []).map(function (c) { return `${c.asignatura_id}__${c.grado}__${c.grupo}` }))

    const payloads = []
    combinaciones.forEach(function (comb) {
      globales.forEach(function (asig) {
        const key = `${asig.id}__${comb.grado}__${comb.grupo}`
        if (yaExisten.has(key)) return
        payloads.push({
          nombre: asig.nombre,
          asignatura_id: asig.id,
          grado: comb.grado,
          grupo: comb.grupo,
          institucion_id: institucion.id,
          activo: true,
        })
      })
    })
    if (payloads.length === 0) return

    const insertResult = await supabase.from('courses').insert(payloads).select('id, grado, grupo')
    if (insertResult.error || !insertResult.data) return

    // Matricular automáticamente a los estudiantes que correspondan a cada combinación
    await Promise.all(insertResult.data.map(async function (nuevoCurso) {
      const estudiantesResult = await supabase
        .from('profiles')
        .select('id')
        .eq('role', 'estudiante')
        .eq('grado', nuevoCurso.grado)
        .eq('grupo', nuevoCurso.grupo)
        .eq('institucion_id', institucion.id)
      const estudiantesDelAula = (estudiantesResult.data || []).map(function (s) { return s.id })
      if (estudiantesDelAula.length === 0) return
      const matriculas = estudiantesDelAula.map(function (studentId) { return { course_id: nuevoCurso.id, student_id: studentId, status: 'activo' } })
      await supabase.from('enrollments').insert(matriculas)
    }))
  }

  async function agregarGrado() {
    if (!nuevoGradoNombre.trim() || !nuevoGradoNumero || !institucion?.id) return
    const maxOrden = gradosProp.reduce(function (a, g) { return Math.max(a, g.orden) }, 0)
    const nuevoNumero = Number(nuevoGradoNumero)
    const result = await supabase.from('grados_institucion').insert({
      institucion_id: institucion.id,
      numero: nuevoNumero,
      nombre: nuevoGradoNombre.trim(),
      orden: maxOrden + 1,
    })
    if (result.error) { alert('No se pudo agregar: ' + result.error.message); return }
    setNuevoGradoNombre('')
    setNuevoGradoNumero('')

    // Crear las Asignaturas del catálogo compartido para este Grado nuevo, en cada Sección que ya exista
    const combinaciones = seccionesProp.map(function (s) { return { grado: nuevoNumero, grupo: s.letra } })
    await crearAsignaturasAutomaticas(combinaciones)
    cargar()
  }

  async function eliminarGrado(gradoId) {
    if (!confirm('¿Quitar este grado? Las aulas que ya lo usen no se ven afectadas.')) return
    await supabase.from('grados_institucion').delete().eq('id', gradoId)
    cargar()
  }

  async function agregarSeccion() {
    if (!nuevaSeccionLetra.trim() || !institucion?.id) return
    const maxOrden = seccionesProp.reduce(function (a, s) { return Math.max(a, s.orden) }, 0)
    const nuevaLetra = nuevaSeccionLetra.trim().toUpperCase()
    const result = await supabase.from('secciones_institucion').insert({
      institucion_id: institucion.id,
      letra: nuevaLetra,
      orden: maxOrden + 1,
    })
    if (result.error) { alert('No se pudo agregar: ' + result.error.message); return }
    setNuevaSeccionLetra('')

    // Crear las Asignaturas del catálogo compartido para esta Sección nueva, en cada Grado que ya exista
    const combinaciones = gradosProp.map(function (g) { return { grado: g.numero, grupo: nuevaLetra } })
    await crearAsignaturasAutomaticas(combinaciones)
    cargar()
  }

  async function eliminarSeccion(seccionId) {
    if (!confirm('¿Quitar esta sección? Las aulas que ya la usen no se ven afectadas.')) return
    await supabase.from('secciones_institucion').delete().eq('id', seccionId)
    cargar()
  }

  const [sincronizando, setSincronizando] = useState(false)
  const [sincronizarMsg, setSincronizarMsg] = useState('')

  async function sincronizarAsignaturas() {
    if (gradosProp.length === 0 || seccionesProp.length === 0) {
      setSincronizarMsg('Primero agrega al menos un Grado y una Sección.')
      return
    }
    setSincronizando(true)
    setSincronizarMsg('')

    const combinaciones = []
    gradosProp.forEach(function (g) {
      seccionesProp.forEach(function (s) {
        combinaciones.push({ grado: g.numero, grupo: s.letra })
      })
    })

    const antesResult = await supabase.from('courses').select('id', { count: 'exact', head: true }).eq('institucion_id', institucion.id)
    const totalAntes = antesResult.count || 0

    await crearAsignaturasAutomaticas(combinaciones)

    const despuesResult = await supabase.from('courses').select('id', { count: 'exact', head: true }).eq('institucion_id', institucion.id)
    const totalDespues = despuesResult.count || 0

    setSincronizarMsg(`Listo: se completaron ${totalDespues - totalAntes} Asignatura(s) que faltaban en tus Grados y Secciones existentes.`)
    setSincronizando(false)
    cargar()
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#F4F6F9' }}>
        <p className="text-slate-400 text-sm">Cargando...</p>
      </div>
    )
  }

  if (!institucion) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ backgroundColor: '#F4F6F9' }}>
        <div className="bg-white rounded-2xl p-8 max-w-md text-center" style={{ border: '1px solid #E5E9F0' }}>
          <p className="text-sm text-slate-500 mb-4">Tu cuenta de Coordinador todavía no tiene una institución asignada. Pídele al Admin que la configure.</p>
          <button onClick={logout} className="text-sm font-semibold px-4 py-2 rounded-lg text-white" style={{ backgroundColor: NAVY }}>Salir</button>
        </div>
      </div>
    )
  }

  // Agrupar cursos por Área curricular, y dentro de cada Área, por Docente
  const areasMap = {}
  cursos.forEach(function (c) {
    const areaNombre = c.asignaturas?.areas_curriculares?.nombre || 'Sin área'
    if (!areasMap[areaNombre]) areasMap[areaNombre] = { area: areaNombre, docentesMap: {}, sinDocente: [] }
    if (c.docente) {
      if (!areasMap[areaNombre].docentesMap[c.docente.id]) areasMap[areaNombre].docentesMap[c.docente.id] = { docente: c.docente, cursos: [] }
      areasMap[areaNombre].docentesMap[c.docente.id].cursos.push(c)
    } else {
      areasMap[areaNombre].sinDocente.push(c)
    }
  })
  const areasLista = Object.values(areasMap)
    .map(function (a) { return { area: a.area, docentesLista: Object.values(a.docentesMap), sinDocente: a.sinDocente } })
    .sort(function (a, b) { return a.area.localeCompare(b.area) })
  const sinDocente = cursos.filter(function (c) { return !c.docente })

  if (cursoSel) {
    return (
      <div className="min-h-screen" style={{ backgroundColor: '#F4F6F9' }}>
        <header className="flex items-center justify-between px-6 py-4 bg-white" style={{ borderBottom: '1px solid #E5E9F0' }}>
          <p className="font-bold text-sm" style={{ color: NAVY_DARK }}>Nexoris Academy — Coordinador</p>
          <button onClick={logout} className="text-xs font-semibold px-4 py-2 rounded-lg transition" style={{ backgroundColor: '#F4F6F9', color: NAVY_DARK, border: '1px solid #D6DCE5' }}>Salir</button>
        </header>
        <main className="p-6 max-w-5xl mx-auto">
          <button onClick={function () { setCursoSel(null) }} className="text-sm font-semibold mb-4 hover:underline" style={{ color: NAVY }}>← Volver</button>
          <div className="bg-white rounded-2xl p-6" style={{ border: '1px solid #E5E9F0' }}>
            <RegistroAuxiliarPorArea courseId={cursoSel.id} />
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#F4F6F9' }}>
      <header className="flex items-center justify-between px-6 py-4 bg-white" style={{ borderBottom: '1px solid #E5E9F0' }}>
        <div>
          <p className="font-bold text-sm" style={{ color: NAVY_DARK }}>Nexoris Academy — Coordinador</p>
          <p className="text-xs" style={{ color: GREEN_DARK }}>{institucion.nombre} · {profile?.full_name}</p>
        </div>
        <button onClick={logout} className="text-xs font-semibold px-4 py-2 rounded-lg transition" style={{ backgroundColor: '#F4F6F9', color: NAVY_DARK, border: '1px solid #D6DCE5' }}>Salir</button>
      </header>

      <main className="p-6 max-w-5xl mx-auto">
        <h2 className="text-2xl font-bold mb-1" style={{ color: NAVY_DARK }}>Panel de Supervisión</h2>
        <p className="text-sm text-slate-400 mb-6">Solo puedes ver información — cualquier edición de notas o asistencia la hace el docente correspondiente.</p>

        <div className="flex gap-2 mb-6 border-b overflow-x-auto" style={{ borderColor: '#E5E9F0' }}>
          {[
            { id: 'docentes', label: 'Docentes y Aulas' },
            { id: 'lista-docentes', label: 'Docentes' },
            { id: 'lista-estudiantes', label: 'Estudiantes' },
            { id: 'aulas', label: 'Gestión de Aulas' },
            { id: 'grados-secciones', label: 'Grados y Secciones' },
            { id: 'conducta', label: `Conducta ${conducta.length > 0 ? `(${conducta.length})` : ''}` },
            { id: 'importar', label: 'Importar Estudiantes' },
            { id: 'importar-docentes', label: 'Importar Docentes' },
            { id: 'habilitar-cursos', label: 'Habilitar Cursos' },
            { id: 'asignaturas', label: 'Asignaturas' },
            { id: 'recreos', label: 'Recreos' },
            { id: 'feriados', label: 'Feriados' },
            { id: 'matriculas', label: 'Matrículas' },
          ].map(function (t) {
            const active = tab === t.id
            return (
              <button key={t.id} onClick={function () { setTab(t.id) }} className="px-4 py-2.5 text-sm font-semibold border-b-2 transition whitespace-nowrap"
                style={active ? { borderColor: GREEN, color: NAVY_DARK } : { borderColor: 'transparent', color: '#94A3B8' }}>
                {t.label}
              </button>
            )
          })}
        </div>

        {tab === 'lista-docentes' && (
          <Suspense fallback={<p className="text-slate-400 text-sm">Cargando...</p>}>
            <DocentesList institucionFija={institucion.id} />
          </Suspense>
        )}

        {tab === 'lista-estudiantes' && (
          <Suspense fallback={<p className="text-slate-400 text-sm">Cargando...</p>}>
            <EstudiantesList institucionFija={institucion.id} institucionFijaNombre={institucion.nombre} />
          </Suspense>
        )}

        {tab === 'docentes' && (
          areasLista.length === 0 ? (
            <p className="text-slate-400 text-sm">Aún no hay Asignaturas creadas en esta institución.</p>
          ) : (
            <div className="space-y-3">
              {areasLista.map(function (grupoArea) {
                const totalCursos = grupoArea.docentesLista.reduce(function (a, d) { return a + d.cursos.length }, 0) + grupoArea.sinDocente.length
                const abierta = areaAbierta === grupoArea.area
                return (
                  <div key={grupoArea.area} className="bg-white rounded-2xl overflow-hidden" style={{ border: '1px solid #E5E9F0' }}>
                    <button
                      onClick={function () { setAreaAbierta(abierta ? null : grupoArea.area) }}
                      className="w-full flex items-center justify-between px-5 py-4 text-left"
                    >
                      <span className="text-sm font-bold" style={{ color: NAVY_DARK }}>{grupoArea.area}</span>
                      <span className="text-xs font-semibold px-2.5 py-1 rounded-full flex items-center gap-2" style={{ backgroundColor: '#E7F3E4', color: GREEN_DARK }}>
                        {totalCursos} asignatura(s) {abierta ? '▾' : '▸'}
                      </span>
                    </button>

                    {abierta && (
                      <div className="px-5 pb-5 space-y-4">
                        {(function () {
                          const gradosDeEstaArea = [...new Set(
                            grupoArea.docentesLista.flatMap(function (d) { return d.cursos.map(function (c) { return c.grado } ) })
                              .concat(grupoArea.sinDocente.map(function (c) { return c.grado }))
                          )].sort(function (a, b) { return a - b })
                          if (gradosDeEstaArea.length <= 1) return null
                          return (
                            <div className="flex gap-1.5 flex-wrap">
                              <button
                                onClick={function () { setGradoFiltroArea(null) }}
                                className="text-[11px] font-semibold px-2.5 py-1 rounded-full transition"
                                style={gradoFiltroArea == null ? { backgroundColor: NAVY_DARK, color: 'white' } : { backgroundColor: 'white', color: NAVY_DARK, border: '1px solid #D6DCE5' }}
                              >
                                Todos los grados
                              </button>
                              {gradosDeEstaArea.map(function (g) {
                                return (
                                  <button
                                    key={g}
                                    onClick={function () { setGradoFiltroArea(g) }}
                                    className="text-[11px] font-semibold px-2.5 py-1 rounded-full transition"
                                    style={gradoFiltroArea === g ? { backgroundColor: GREEN, color: 'white' } : { backgroundColor: 'white', color: NAVY_DARK, border: '1px solid #D6DCE5' }}
                                  >
                                    {gradoLabel(g)}
                                  </button>
                                )
                              })}
                            </div>
                          )
                        })()}

                        {grupoArea.docentesLista.map(function (grupoDoc) {
                          const cursosFiltrados = gradoFiltroArea == null ? grupoDoc.cursos : grupoDoc.cursos.filter(function (c) { return c.grado === gradoFiltroArea })
                          if (cursosFiltrados.length === 0) return null
                          const docenteEstaAbierto = docenteAbierto === grupoDoc.docente.id
                          return (
                            <div key={grupoDoc.docente.id} className="rounded-xl overflow-hidden" style={{ border: '1px solid #E5E9F0' }}>
                              <button
                                onClick={function () { setDocenteAbierto(docenteEstaAbierto ? null : grupoDoc.docente.id) }}
                                className="w-full flex items-center justify-between px-3 py-2.5 text-left"
                                style={{ backgroundColor: '#F4F6F9' }}
                              >
                                <span className="text-xs font-bold" style={{ color: NAVY }}>{grupoDoc.docente.full_name}</span>
                                <span className="text-[11px] text-slate-400">{cursosFiltrados.length} asignatura(s) {docenteEstaAbierto ? '▾' : '▸'}</span>
                              </button>
                              {docenteEstaAbierto && (
                                <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3 p-3">
                                  {cursosFiltrados.map(function (c) {
                                    return (
                                      <button
                                        key={c.id}
                                        onClick={function () { setCursoSel(c) }}
                                        className="text-left rounded-lg p-2.5 transition hover:-translate-y-0.5 bg-white"
                                        style={{ border: '1px solid #E5E9F0' }}
                                      >
                                        <p className="text-sm font-semibold" style={{ color: NAVY_DARK }}>{c.nombre}</p>
                                        <p className="text-xs text-slate-400">{gradoLabel(c.grado)} — Sección {c.grupo}</p>
                                        <p className="text-xs mt-1" style={{ color: GREEN_DARK }}>{c.enrollments?.[0]?.count ?? 0} estudiante(s)</p>
                                      </button>
                                    )
                                  })}
                                </div>
                              )}
                            </div>
                          )
                        })}

                        {grupoArea.sinDocente.length > 0 && (function () {
                          const sinDocenteFiltrado = gradoFiltroArea == null ? grupoArea.sinDocente : grupoArea.sinDocente.filter(function (c) { return c.grado === gradoFiltroArea })
                          if (sinDocenteFiltrado.length === 0) return null
                          return (
                            <div className="rounded-xl p-3" style={{ backgroundColor: '#FDECEC' }}>
                              <p className="text-xs font-bold mb-2" style={{ color: '#B91C1C' }}>Sin docente asignado</p>
                              <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
                                {sinDocenteFiltrado.map(function (c) {
                                  return (
                                    <button
                                      key={c.id}
                                      onClick={function () { setCursoSel(c) }}
                                      className="text-left rounded-lg p-2.5 transition hover:-translate-y-0.5 bg-white"
                                      style={{ border: '1px solid #F5C6C6' }}
                                    >
                                      <p className="text-sm font-semibold" style={{ color: NAVY_DARK }}>{c.nombre}</p>
                                      <p className="text-xs text-slate-400">{gradoLabel(c.grado)} — Sección {c.grupo}</p>
                                    </button>
                                  )
                                })}
                              </div>
                            </div>
                          )
                        })()}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )
        )}

        {tab === 'conducta' && (
          conducta.length === 0 ? (
            <p className="text-slate-400 text-sm">No hay registros de conducta en esta institución todavía.</p>
          ) : (
            <ul className="space-y-2">
              {conducta.map(function (r) {
                return (
                  <li key={r.id} className="bg-white rounded-xl p-4" style={{ border: '1px solid #E5E9F0' }}>
                    <div className="flex justify-between items-start gap-3 flex-wrap">
                      <div>
                        <p className="text-sm font-semibold" style={{ color: NAVY_DARK }}>{r.studentNombre}</p>
                        <p className="text-xs text-slate-400">{r.curso?.nombre} — {gradoLabel(r.curso?.grado)} Sección {r.curso?.grupo}</p>
                      </div>
                      <span className="text-xs text-slate-400">{new Date(r.created_at).toLocaleDateString('es-PE')}</span>
                    </div>
                    <p className="text-sm mt-2" style={{ color: NAVY_DARK }}>{r.descripcion}</p>
                  </li>
                )
              })}
            </ul>
          )
        )}

        {tab === 'importar' && <ImportarEstudiantes institucionFija={institucion.id} />}

        {tab === 'aulas' && (
          <Suspense fallback={<p className="text-slate-400 text-sm">Cargando...</p>}>
            <CoursesManager institucionFija={institucion.id} institucionFijaNombre={institucion.nombre} />
          </Suspense>
        )}

        {tab === 'importar-docentes' && (
          <Suspense fallback={<p className="text-slate-400 text-sm">Cargando...</p>}>
            <ImportarDocentes institucionFija={institucion.id} />
          </Suspense>
        )}

        {tab === 'habilitar-cursos' && (
          <Suspense fallback={<p className="text-slate-400 text-sm">Cargando...</p>}>
            <HabilitarCursos institucionFija={institucion.id} />
          </Suspense>
        )}

        {tab === 'asignaturas' && (
          <Suspense fallback={<p className="text-slate-400 text-sm">Cargando...</p>}>
            <AsignaturasManager institucionFija={institucion.id} />
          </Suspense>
        )}

        {tab === 'recreos' && (
          <Suspense fallback={<p className="text-slate-400 text-sm">Cargando...</p>}>
            <RecreosManager />
          </Suspense>
        )}

        {tab === 'feriados' && (
          <Suspense fallback={<p className="text-slate-400 text-sm">Cargando...</p>}>
            <FeriadosManager />
          </Suspense>
        )}

        {tab === 'matriculas' && (
          <Suspense fallback={<p className="text-slate-400 text-sm">Cargando...</p>}>
            <EnrollmentsManager />
          </Suspense>
        )}

        {tab === 'grados-secciones' && (
          <div>
            <div className="bg-white rounded-2xl p-4 mb-5" style={{ border: '1px solid #E5E9F0' }}>
              <p className="text-sm font-bold mb-1" style={{ color: NAVY_DARK }}>Completar Asignaturas en aulas ya existentes</p>
              <p className="text-xs text-slate-400 mb-3">Si tenías Grados/Secciones de antes, esto revisa todas las combinaciones y agrega las Asignaturas del catálogo compartido que les falten — sin duplicar nada.</p>
              <button
                onClick={sincronizarAsignaturas}
                disabled={sincronizando}
                className="text-sm font-semibold px-4 py-2 rounded-lg text-white transition hover:opacity-90 disabled:opacity-50"
                style={{ backgroundColor: GREEN }}
              >
                {sincronizando ? 'Sincronizando...' : 'Sincronizar ahora'}
              </button>
              {sincronizarMsg && <p className="text-xs mt-2" style={{ color: '#16A34A' }}>{sincronizarMsg}</p>}
            </div>

            <div className="grid sm:grid-cols-2 gap-5">
            <div className="bg-white rounded-2xl p-5" style={{ border: '1px solid #E5E9F0' }}>
              <p className="text-sm font-bold mb-3" style={{ color: NAVY_DARK }}>Grados de {institucion.nombre}</p>
              {gradosProp.length === 0 ? (
                <p className="text-xs text-slate-400 mb-3">Sin grados todavía.</p>
              ) : (
                <ul className="space-y-1 mb-3">
                  {gradosProp.map(function (g) {
                    return (
                      <li key={g.id} className="flex justify-between items-center text-xs rounded-lg px-2 py-1.5" style={{ backgroundColor: '#F4F6F9' }}>
                        <span style={{ color: NAVY_DARK }}>{g.nombre} (nº {g.numero})</span>
                        <button onClick={function () { eliminarGrado(g.id) }} className="text-[10px] font-semibold px-2 py-0.5 rounded text-white" style={{ backgroundColor: '#B91C1C' }}>Quitar</button>
                      </li>
                    )
                  })}
                </ul>
              )}
              <div className="flex gap-2">
                <input type="number" value={nuevoGradoNumero} onChange={function (e) { setNuevoGradoNumero(e.target.value) }} placeholder="Nº (ej: 6)" className="w-20 rounded-lg px-2 py-1.5 text-xs outline-none" style={{ backgroundColor: 'white', border: '1px solid #D6DCE5', color: NAVY_DARK }} />
                <input type="text" value={nuevoGradoNombre} onChange={function (e) { setNuevoGradoNombre(e.target.value) }} placeholder="Nombre (ej: 6°)" className="flex-1 rounded-lg px-2 py-1.5 text-xs outline-none" style={{ backgroundColor: 'white', border: '1px solid #D6DCE5', color: NAVY_DARK }} />
                <button onClick={agregarGrado} className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white transition hover:opacity-90" style={{ backgroundColor: GREEN }}>+ Agregar</button>
              </div>
            </div>

            <div className="bg-white rounded-2xl p-5" style={{ border: '1px solid #E5E9F0' }}>
              <p className="text-sm font-bold mb-3" style={{ color: NAVY_DARK }}>Secciones de {institucion.nombre}</p>
              {seccionesProp.length === 0 ? (
                <p className="text-xs text-slate-400 mb-3">Sin secciones todavía.</p>
              ) : (
                <ul className="space-y-1 mb-3">
                  {seccionesProp.map(function (s) {
                    return (
                      <li key={s.id} className="flex justify-between items-center text-xs rounded-lg px-2 py-1.5" style={{ backgroundColor: '#F4F6F9' }}>
                        <span style={{ color: NAVY_DARK }}>Sección {s.letra}</span>
                        <button onClick={function () { eliminarSeccion(s.id) }} className="text-[10px] font-semibold px-2 py-0.5 rounded text-white" style={{ backgroundColor: '#B91C1C' }}>Quitar</button>
                      </li>
                    )
                  })}
                </ul>
              )}
              <div className="flex gap-2">
                <input type="text" maxLength={1} value={nuevaSeccionLetra} onChange={function (e) { setNuevaSeccionLetra(e.target.value) }} placeholder="Letra (ej: F)" className="flex-1 rounded-lg px-2 py-1.5 text-xs outline-none" style={{ backgroundColor: 'white', border: '1px solid #D6DCE5', color: NAVY_DARK }} />
                <button onClick={agregarSeccion} className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white transition hover:opacity-90" style={{ backgroundColor: GREEN }}>+ Agregar</button>
              </div>
            </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
