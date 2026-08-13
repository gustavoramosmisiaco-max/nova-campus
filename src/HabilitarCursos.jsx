import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'

const NAVY_DARK = '#0F172A'
const NAVY = '#2563EB'
const GREEN = '#22C55E'

function gradoLabel(g) {
  return g ? `${g}° Secundaria` : 'Sin grado'
}

export default function HabilitarCursos({ institucionFija } = {}) {
  const [loading, setLoading] = useState(true)
  const [courses, setCourses] = useState([])
  const [areas, setAreas] = useState([])
  const [institucionSel, setInstitucionSel] = useState(institucionFija || null)
  const [gradoSel, setGradoSel] = useState(null)
  const [aulaSel, setAulaSel] = useState(null)
  const [actualizandoId, setActualizandoId] = useState(null)
  const [agregandoAsig, setAgregandoAsig] = useState(false)
  const [asigParaAgregar, setAsigParaAgregar] = useState('')
  const [mostrarPorArea, setMostrarPorArea] = useState(false)

  useEffect(function () {
    cargarCursos()
    cargarAreas()
  }, [])

  async function cargarCursos() {
    setLoading(true)
    const result = await supabase
      .from('courses')
      .select('id, nombre, grado, grupo, activo, asignatura_id, institucion_id, instituciones_educativas(nombre), asignaturas(nombre, area_id, areas_curriculares(nombre))')
      .order('grado')
      .order('grupo')
    if (!result.error) {
      setCourses(result.data)
      const institucionesIds = [...new Set(result.data.map(function (c) { return c.institucion_id || 'sin-institucion' }))]
      if (institucionesIds.length === 1 && !institucionSel) {
        setInstitucionSel(institucionesIds[0])
      }
    }
    setLoading(false)
  }

  async function cargarAreas() {
    const result = await supabase.from('areas_curriculares').select('*, asignaturas(id, nombre, activo)').order('orden')
    if (!result.error) {
      setAreas(result.data.map(function (a) {
        return { ...a, asignaturas: a.asignaturas.filter(function (s) { return s.activo }).sort(function (x, y) { return x.nombre.localeCompare(y.nombre) }) }
      }))
    }
  }

  async function toggleActivo(course) {
    setActualizandoId(course.id)
    const result = await supabase.from('courses').update({ activo: !course.activo }).eq('id', course.id)
    if (result.error) {
      alert('Error: ' + result.error.message)
    } else {
      setCourses(function (prev) { return prev.map(function (c) { return c.id === course.id ? { ...c, activo: !c.activo } : c }) })
    }
    setActualizandoId(null)
  }

  async function toggleAsignaturaEnInstitucion(asignaturaId, activarATodas) {
    setActualizandoId('masivo_' + asignaturaId)
    const cursosDeEstaAsig = courses.filter(function (c) {
      return c.asignatura_id === asignaturaId && (c.institucion_id || 'sin-institucion') === institucionSel
    })
    const ids = cursosDeEstaAsig.map(function (c) { return c.id })
    if (ids.length === 0) { setActualizandoId(null); return }

    const result = await supabase.from('courses').update({ activo: activarATodas }).in('id', ids)
    if (result.error) {
      alert('Error: ' + result.error.message)
    } else {
      setCourses(function (prev) { return prev.map(function (c) { return ids.includes(c.id) ? { ...c, activo: activarATodas } : c }) })
    }
    setActualizandoId(null)
  }

  async function agregarAsignatura(grado, grupo) {
    if (!asigParaAgregar) return
    setAgregandoAsig(true)
    const asigObj = areas.flatMap(function (a) { return a.asignaturas }).find(function (s) { return s.id === asigParaAgregar })
    const payload = {
      nombre: asigObj?.nombre || '',
      asignatura_id: asigParaAgregar,
      grado: grado,
      grupo: grupo,
      institucion_id: institucionSel === 'sin-institucion' ? null : institucionSel,
      activo: true,
    }
    const insertResult = await supabase.from('courses').insert(payload).select('id').single()
    if (insertResult.error) {
      alert('Error al agregar: ' + insertResult.error.message)
      setAgregandoAsig(false)
      return
    }

    // Matricular automáticamente a los estudiantes que correspondan a esta aula
    let estudiantesQuery = supabase.from('profiles').select('id').eq('role', 'estudiante').eq('grado', grado).eq('grupo', grupo)
    if (institucionSel !== 'sin-institucion') {
      estudiantesQuery = estudiantesQuery.eq('institucion_id', institucionSel)
    } else {
      estudiantesQuery = estudiantesQuery.is('institucion_id', null)
    }
    const estudiantesResult = await estudiantesQuery
    const estudiantesDelAula = (estudiantesResult.data || []).map(function (s) { return s.id })
    if (estudiantesDelAula.length > 0) {
      const matriculas = estudiantesDelAula.map(function (studentId) { return { course_id: insertResult.data.id, student_id: studentId, status: 'activo' } })
      await supabase.from('enrollments').insert(matriculas)
    }

    setAsigParaAgregar('')
    cargarCursos()
    setAgregandoAsig(false)
  }

  if (loading) return <p className="text-slate-400 text-sm">Cargando...</p>

  const institucionesUnicas = [...new Map(
    courses.map(function (c) { return [c.institucion_id || 'sin-institucion', c.instituciones_educativas?.nombre || 'Sin institución asignada'] })
  ).entries()]

  return (
    <div>
      <h2 className="text-2xl font-bold mb-2" style={{ color: NAVY_DARK }}>Habilitar / Deshabilitar Cursos</h2>
      <p className="text-sm text-slate-400 mb-6">
        Activa o desactiva áreas y asignaturas para un Grado y Sección específico. Al desactivar, esa asignatura desaparece por completo del panel de su docente y de sus estudiantes.
      </p>

      {courses.length === 0 ? (
        <p className="text-slate-400 text-sm">No hay cursos creados todavía.</p>
      ) : institucionSel == null ? (
        <>
          <p className="text-sm text-slate-400 mb-4">Elige la institución educativa</p>
          <div className="grid gap-4 sm:grid-cols-2">
            {institucionesUnicas.map(function ([id, nombre]) {
              const cantidad = courses.filter(function (c) { return (c.institucion_id || 'sin-institucion') === id }).length
              return (
                <button
                  key={id}
                  onClick={function () { setInstitucionSel(id) }}
                  className="text-left bg-white rounded-2xl p-5 space-y-2 transition hover:-translate-y-0.5"
                  style={{ border: '1px solid #E5E9F0', boxShadow: '0 1px 3px rgba(15,42,74,0.06)' }}
                >
                  <div className="flex items-center justify-between">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg" style={{ background: `linear-gradient(135deg, ${NAVY}, ${GREEN})` }}>
                      🏫
                    </div>
                    <span className="text-xs font-semibold px-2.5 py-1 rounded-full" style={{ backgroundColor: '#E7F3E4', color: '#16A34A' }}>
                      {cantidad} curso(s)
                    </span>
                  </div>
                  <h3 className="text-lg font-bold" style={{ color: NAVY_DARK }}>{nombre}</h3>
                </button>
              )
            })}
          </div>
        </>
      ) : gradoSel == null ? (
        <>
          {!institucionFija && (
            <button onClick={function () { setInstitucionSel(null) }} className="text-sm font-semibold mb-4 hover:underline" style={{ color: NAVY }}>← Volver a Instituciones</button>
          )}

          <div className="bg-white rounded-2xl overflow-hidden mb-6" style={{ border: '1px solid #E5E9F0' }}>
            <button
              onClick={function () { setMostrarPorArea(!mostrarPorArea) }}
              className="w-full flex items-center justify-between px-5 py-4 text-left"
            >
              <div>
                <p className="text-sm font-bold" style={{ color: NAVY_DARK }}>Habilitar por Área (todos los grados y secciones)</p>
                <p className="text-xs text-slate-400 mt-0.5">Como todos los grados suelen usar las mismas Áreas y Asignaturas, actívalas o desactívalas todas de golpe aquí, sin entrar grado por grado.</p>
              </div>
              <span className="text-sm flex-shrink-0 ml-3">{mostrarPorArea ? '▾' : '▸'}</span>
            </button>

            {mostrarPorArea && (
              <div className="px-5 pb-5 space-y-4">
                {areas.map(function (area) {
                  return (
                    <div key={area.id}>
                      <p className="text-xs font-bold uppercase tracking-wide mb-2 px-3 py-1 rounded-lg inline-block" style={{ backgroundColor: '#E7F3E4', color: '#16A34A' }}>{area.nombre}</p>
                      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #F4F6F9' }}>
                        {area.asignaturas.map(function (asig, i) {
                          const cursosDeEsta = courses.filter(function (c) {
                            return c.asignatura_id === asig.id && (c.institucion_id || 'sin-institucion') === institucionSel
                          })
                          if (cursosDeEsta.length === 0) return null
                          const activosCount = cursosDeEsta.filter(function (c) { return c.activo }).length
                          const estado = activosCount === cursosDeEsta.length ? 'todas' : activosCount === 0 ? 'ninguna' : 'parcial'
                          const actualizando = actualizandoId === 'masivo_' + asig.id
                          return (
                            <div key={asig.id} className="flex items-center justify-between px-3 py-2.5" style={{ backgroundColor: '#FAFBFC', borderBottom: i < area.asignaturas.length - 1 ? '1px solid #F4F6F9' : 'none' }}>
                              <div>
                                <p className="text-sm font-medium" style={{ color: NAVY_DARK }}>{asig.nombre}</p>
                                <p className="text-xs" style={{ color: estado === 'todas' ? '#16A34A' : estado === 'ninguna' ? '#94A3B8' : '#B45309' }}>
                                  {activosCount}/{cursosDeEsta.length} aula(s) activa(s){estado === 'parcial' ? ' (mixto)' : ''}
                                </p>
                              </div>
                              <button
                                onClick={function () { toggleAsignaturaEnInstitucion(asig.id, estado !== 'todas') }}
                                disabled={actualizando}
                                className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white transition hover:opacity-90 disabled:opacity-50"
                                style={{ backgroundColor: estado === 'todas' ? '#B91C1C' : GREEN }}
                              >
                                {actualizando ? '...' : estado === 'todas' ? 'Desactivar todas' : 'Activar todas'}
                              </button>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <p className="text-sm text-slate-400 mb-4">O elige el Grado para verlo con más detalle</p>
          {(function () {
            const cursosInst = courses.filter(function (c) { return (c.institucion_id || 'sin-institucion') === institucionSel })
            const gradosUnicos = [...new Set(cursosInst.map(function (c) { return c.grado }))].sort(function (a, b) { return a - b })
            return (
              <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
                {gradosUnicos.map(function (g) {
                  const cursosDelGrado = cursosInst.filter(function (c) { return c.grado === g })
                  const activos = cursosDelGrado.filter(function (c) { return c.activo }).length
                  const secciones = new Set(cursosDelGrado.map(function (c) { return c.grupo })).size
                  return (
                    <button
                      key={g}
                      onClick={function () { setGradoSel(g) }}
                      className="text-left bg-white rounded-2xl p-5 space-y-2 transition hover:-translate-y-0.5"
                      style={{ border: '1px solid #E5E9F0', boxShadow: '0 1px 3px rgba(15,42,74,0.06)' }}
                    >
                      <div className="flex items-center justify-between">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg" style={{ background: `linear-gradient(135deg, ${NAVY}, ${GREEN})` }}>
                          🎓
                        </div>
                        <span className="text-xs font-semibold px-2.5 py-1 rounded-full" style={{ backgroundColor: '#E7F3E4', color: '#16A34A' }}>
                          {activos}/{cursosDelGrado.length} activos
                        </span>
                      </div>
                      <h3 className="text-lg font-bold" style={{ color: NAVY_DARK }}>{gradoLabel(g)}</h3>
                      <p className="text-sm text-slate-500">{secciones} sección(es)</p>
                    </button>
                  )
                })}
              </div>
            )
          })()}
        </>
      ) : aulaSel == null ? (
        <>
          <button onClick={function () { setGradoSel(null) }} className="text-sm font-semibold mb-4 hover:underline" style={{ color: NAVY }}>← Volver a Grados</button>
          <p className="text-sm text-slate-400 mb-4">Elige la Sección de {gradoLabel(gradoSel)}</p>
          {(function () {
            const cursosGrado = courses.filter(function (c) { return (c.institucion_id || 'sin-institucion') === institucionSel && c.grado === gradoSel })
            const seccionesUnicas = [...new Set(cursosGrado.map(function (c) { return c.grupo }))].sort()
            return (
              <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
                {seccionesUnicas.map(function (sec) {
                  const cursosDeAula = cursosGrado.filter(function (c) { return c.grupo === sec })
                  const activos = cursosDeAula.filter(function (c) { return c.activo }).length
                  return (
                    <button
                      key={sec}
                      onClick={function () { setAulaSel(`${gradoSel}__${sec}`) }}
                      className="text-left bg-white rounded-2xl p-5 space-y-2 transition hover:-translate-y-0.5"
                      style={{ border: '1px solid #E5E9F0', boxShadow: '0 1px 3px rgba(15,42,74,0.06)' }}
                    >
                      <div className="flex items-center justify-between">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg" style={{ background: `linear-gradient(135deg, ${NAVY}, ${GREEN})` }}>
                          🎓
                        </div>
                        <span className="text-xs font-semibold px-2.5 py-1 rounded-full" style={{ backgroundColor: '#E7F3E4', color: '#16A34A' }}>
                          {activos}/{cursosDeAula.length} activos
                        </span>
                      </div>
                      <h3 className="text-lg font-bold" style={{ color: NAVY_DARK }}>{gradoLabel(gradoSel)}</h3>
                      <p className="text-sm text-slate-500">Sección {sec}</p>
                    </button>
                  )
                })}
              </div>
            )
          })()}
        </>
      ) : (
        <>
          <button onClick={function () { setAulaSel(null) }} className="text-sm font-semibold mb-4 hover:underline" style={{ color: NAVY }}>← Volver a Secciones</button>
          {(function () {
            const [grado, grupo] = aulaSel.split('__')
            const cursosFinal = courses.filter(function (c) {
              return (c.institucion_id || 'sin-institucion') === institucionSel && String(c.grado) === grado && c.grupo === grupo
            })

            const porArea = {}
            cursosFinal.forEach(function (c) {
              const areaNombre = c.asignaturas?.areas_curriculares?.nombre || 'Otras'
              if (!porArea[areaNombre]) porArea[areaNombre] = []
              porArea[areaNombre].push(c)
            })

            const asignaturaIdsYaEnAula = new Set(cursosFinal.map(function (c) { return c.asignatura_id }))
            const asignaturasDisponibles = areas.flatMap(function (a) { return a.asignaturas }).filter(function (s) { return !asignaturaIdsYaEnAula.has(s.id) })

            return (
              <div className="space-y-6">
                <div className="bg-white rounded-2xl p-4" style={{ border: '1px solid #E5E9F0' }}>
                  <p className="text-sm font-bold mb-2" style={{ color: NAVY_DARK }}>Agregar una Asignatura nueva a esta aula</p>
                  {asignaturasDisponibles.length === 0 ? (
                    <p className="text-xs text-slate-400">Ya están todas las Asignaturas del catálogo en esta aula.</p>
                  ) : (
                    <div className="flex gap-2 flex-wrap">
                      <select value={asigParaAgregar} onChange={function (e) { setAsigParaAgregar(e.target.value) }} className="rounded-lg px-3 py-2 text-sm outline-none" style={{ backgroundColor: 'white', border: '1px solid #D6DCE5', color: NAVY_DARK, minWidth: 220 }}>
                        <option value="">-- Selecciona una Asignatura --</option>
                        {asignaturasDisponibles.map(function (s) { return <option key={s.id} value={s.id}>{s.nombre}</option> })}
                      </select>
                      <button
                        onClick={function () { agregarAsignatura(Number(grado), grupo) }}
                        disabled={agregandoAsig || !asigParaAgregar}
                        className="text-sm font-semibold px-4 py-2 rounded-lg text-white transition hover:opacity-90 disabled:opacity-50"
                        style={{ backgroundColor: GREEN }}
                      >
                        {agregandoAsig ? 'Agregando...' : '+ Agregar'}
                      </button>
                    </div>
                  )}
                </div>

                {Object.keys(porArea).map(function (areaNombre) {
                  return (
                    <div key={areaNombre}>
                      <h3 className="text-sm font-bold mb-3" style={{ color: NAVY_DARK }}>{areaNombre}</h3>
                      <div className="bg-white rounded-2xl overflow-hidden" style={{ border: '1px solid #E5E9F0' }}>
                        {porArea[areaNombre].map(function (c, i) {
                          const actualizando = actualizandoId === c.id
                          return (
                            <div
                              key={c.id}
                              className="flex items-center justify-between px-4 py-3"
                              style={{ borderBottom: i < porArea[areaNombre].length - 1 ? '1px solid #F4F6F9' : 'none' }}
                            >
                              <div>
                                <p className="text-sm font-semibold" style={{ color: NAVY_DARK }}>{c.nombre}</p>
                                <p className="text-xs text-slate-400">{c.activo ? 'Activo — visible para docente y estudiantes' : 'Desactivado — oculto por completo'}</p>
                              </div>
                              <button
                                onClick={function () { toggleActivo(c) }}
                                disabled={actualizando}
                                className="relative rounded-full transition disabled:opacity-50"
                                style={{ width: 44, height: 24, backgroundColor: c.activo ? GREEN : '#D6DCE5' }}
                              >
                                <span
                                  className="absolute top-0.5 rounded-full bg-white transition-all"
                                  style={{ width: 20, height: 20, left: c.activo ? 22 : 2 }}
                                />
                              </button>
                            </div>
                          )
                        })}
                      </div>
                    </div>
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
