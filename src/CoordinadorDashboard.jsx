import { useEffect, useState, lazy, Suspense } from 'react'
import { supabase } from './supabaseClient'
import { useAuth } from './AuthContext'
import RegistroAuxiliarPorArea from './RegistroAuxiliarPorArea'
import ImportarEstudiantes from './ImportarEstudiantes'

const CoursesManager = lazy(function () { return import('./CoursesManager') })
const ImportarDocentes = lazy(function () { return import('./ImportarDocentes') })
const HabilitarCursos = lazy(function () { return import('./HabilitarCursos') })
const RecreosManager = lazy(function () { return import('./RecreosManager') })
const FeriadosManager = lazy(function () { return import('./FeriadosManager') })
const EnrollmentsManager = lazy(function () { return import('./EnrollmentsManager') })

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

  async function agregarGrado() {
    if (!nuevoGradoNombre.trim() || !nuevoGradoNumero || !institucion?.id) return
    const maxOrden = gradosProp.reduce(function (a, g) { return Math.max(a, g.orden) }, 0)
    const result = await supabase.from('grados_institucion').insert({
      institucion_id: institucion.id,
      numero: Number(nuevoGradoNumero),
      nombre: nuevoGradoNombre.trim(),
      orden: maxOrden + 1,
    })
    if (result.error) { alert('No se pudo agregar: ' + result.error.message); return }
    setNuevoGradoNombre('')
    setNuevoGradoNumero('')
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
    const result = await supabase.from('secciones_institucion').insert({
      institucion_id: institucion.id,
      letra: nuevaSeccionLetra.trim().toUpperCase(),
      orden: maxOrden + 1,
    })
    if (result.error) { alert('No se pudo agregar: ' + result.error.message); return }
    setNuevaSeccionLetra('')
    cargar()
  }

  async function eliminarSeccion(seccionId) {
    if (!confirm('¿Quitar esta sección? Las aulas que ya la usen no se ven afectadas.')) return
    await supabase.from('secciones_institucion').delete().eq('id', seccionId)
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

  // Agrupar cursos por Área curricular
  const areasMap = {}
  cursos.forEach(function (c) {
    const areaNombre = c.asignaturas?.areas_curriculares?.nombre || 'Sin área'
    if (!areasMap[areaNombre]) areasMap[areaNombre] = { area: areaNombre, cursos: [] }
    areasMap[areaNombre].cursos.push(c)
  })
  const areasLista = Object.values(areasMap).sort(function (a, b) { return a.area.localeCompare(b.area) })
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
            { id: 'vincular-docentes', label: 'Vincular Docentes' },
            { id: 'aulas', label: 'Gestión de Aulas' },
            { id: 'grados-secciones', label: 'Grados y Secciones' },
            { id: 'conducta', label: `Conducta ${conducta.length > 0 ? `(${conducta.length})` : ''}` },
            { id: 'importar', label: 'Importar Estudiantes' },
            { id: 'importar-docentes', label: 'Importar Docentes' },
            { id: 'habilitar-cursos', label: 'Habilitar Cursos' },
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

        {tab === 'vincular-docentes' && (
          <div>
            <p className="text-xs text-slate-400 mb-3">
              Aquí solo aparecen los docentes que ya creaste, o que todavía no pertenecen a ninguna institución. Marca a quiénes pueden dar clases en {institucion.nombre}.
            </p>
            <input
              type="text"
              value={buscarDocente}
              onChange={function (e) { setBuscarDocente(e.target.value) }}
              placeholder="Buscar docente por nombre..."
              className="w-full max-w-sm rounded-lg px-3 py-2 text-sm outline-none mb-4"
              style={{ backgroundColor: 'white', border: '1px solid #D6DCE5', color: NAVY_DARK }}
            />
            <div className="bg-white rounded-2xl overflow-hidden" style={{ border: '1px solid #E5E9F0' }}>
              {todosLosDocentes
                .filter(function (d) { return docentesVinculadosIds.has(d.id) || !docentesConAlgunVinculo.has(d.id) })
                .filter(function (d) { return d.full_name.toLowerCase().includes(buscarDocente.toLowerCase()) })
                .map(function (d) {
                  const vinculado = docentesVinculadosIds.has(d.id)
                  return (
                    <div key={d.id} className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid #F4F6F9' }}>
                      <div>
                        <p className="text-sm font-medium" style={{ color: NAVY_DARK }}>{d.full_name}</p>
                        <p className="text-xs text-slate-400">{d.email}</p>
                      </div>
                      <button
                        onClick={function () { toggleVinculoDocente(d.id, vinculado) }}
                        disabled={vinculandoId === d.id}
                        className="text-xs font-semibold px-3 py-1.5 rounded-lg transition disabled:opacity-50"
                        style={vinculado ? { backgroundColor: '#FDECEC', color: '#B91C1C' } : { backgroundColor: GREEN, color: 'white' }}
                      >
                        {vinculandoId === d.id ? '...' : vinculado ? 'Quitar' : 'Vincular'}
                      </button>
                    </div>
                  )
                })}
              {todosLosDocentes.length === 0 && (
                <p className="text-slate-400 text-sm p-4">No hay docentes registrados todavía.</p>
              )}
            </div>
          </div>
        )}

        {tab === 'docentes' && (
          areasLista.length === 0 ? (
            <p className="text-slate-400 text-sm">Aún no hay Asignaturas creadas en esta institución.</p>
          ) : (
            <div className="space-y-6">
              {areasLista.map(function (grupo) {
                return (
                  <div key={grupo.area} className="bg-white rounded-2xl p-5" style={{ border: '1px solid #E5E9F0' }}>
                    <h3 className="text-sm font-bold mb-3 px-3 py-1 rounded-lg inline-block" style={{ backgroundColor: '#E7F3E4', color: GREEN_DARK }}>{grupo.area} ({grupo.cursos.length})</h3>
                    <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
                      {grupo.cursos.map(function (c) {
                        return (
                          <button
                            key={c.id}
                            onClick={function () { setCursoSel(c) }}
                            className="text-left rounded-xl p-3 transition hover:-translate-y-0.5"
                            style={{ backgroundColor: '#F4F6F9', border: '1px solid #E5E9F0' }}
                          >
                            <p className="text-sm font-semibold" style={{ color: NAVY_DARK }}>{c.nombre}</p>
                            <p className="text-xs text-slate-400">{gradoLabel(c.grado)} — Sección {c.grupo}</p>
                            <p className="text-xs mt-1" style={{ color: c.docente ? NAVY : '#B91C1C' }}>{c.docente?.full_name || 'Sin docente'}</p>
                            <p className="text-xs mt-1" style={{ color: GREEN_DARK }}>{c.enrollments?.[0]?.count ?? 0} estudiante(s)</p>
                          </button>
                        )
                      })}
                    </div>
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

        {tab === 'importar' && <ImportarEstudiantes />}

        {tab === 'aulas' && (
          <Suspense fallback={<p className="text-slate-400 text-sm">Cargando...</p>}>
            <CoursesManager institucionFija={institucion.id} institucionFijaNombre={institucion.nombre} />
          </Suspense>
        )}

        {tab === 'importar-docentes' && (
          <Suspense fallback={<p className="text-slate-400 text-sm">Cargando...</p>}>
            <ImportarDocentes />
          </Suspense>
        )}

        {tab === 'habilitar-cursos' && (
          <Suspense fallback={<p className="text-slate-400 text-sm">Cargando...</p>}>
            <HabilitarCursos />
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
        )}
      </main>
    </div>
  )
}
