import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'

const NAVY_DARK = '#0F2A4A'
const NAVY = '#1d5c8f'
const GREEN = '#5DAA47'

function gradoLabel(g) {
  return g ? `${g}° Secundaria` : 'Sin grado'
}

export default function HabilitarCursos() {
  const [loading, setLoading] = useState(true)
  const [courses, setCourses] = useState([])
  const [institucionSel, setInstitucionSel] = useState(null)
  const [aulaSel, setAulaSel] = useState(null)
  const [actualizandoId, setActualizandoId] = useState(null)

  useEffect(function () {
    cargarCursos()
  }, [])

  async function cargarCursos() {
    setLoading(true)
    const result = await supabase
      .from('courses')
      .select('id, nombre, grado, grupo, activo, institucion_id, instituciones_educativas(nombre), asignaturas(nombre, area_id, areas_curriculares(nombre))')
      .order('grado')
      .order('grupo')
    if (!result.error) setCourses(result.data)
    setLoading(false)
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
                    <span className="text-xs font-semibold px-2.5 py-1 rounded-full" style={{ backgroundColor: '#E7F3E4', color: '#2f7a1f' }}>
                      {cantidad} curso(s)
                    </span>
                  </div>
                  <h3 className="text-lg font-bold" style={{ color: NAVY_DARK }}>{nombre}</h3>
                </button>
              )
            })}
          </div>
        </>
      ) : aulaSel == null ? (
        <>
          <button onClick={function () { setInstitucionSel(null) }} className="text-sm font-semibold mb-4 hover:underline" style={{ color: NAVY }}>← Volver a Instituciones</button>
          <p className="text-sm text-slate-400 mb-4">Elige el Grado y Sección</p>
          {(function () {
            const cursosInst = courses.filter(function (c) { return (c.institucion_id || 'sin-institucion') === institucionSel })
            const aulasUnicas = [...new Map(cursosInst.map(function (c) { return [`${c.grado}__${c.grupo}`, { grado: c.grado, grupo: c.grupo }] })).values()]
            aulasUnicas.sort(function (a, b) { return a.grado - b.grado || a.grupo.localeCompare(b.grupo) })
            return (
              <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
                {aulasUnicas.map(function (a) {
                  const cursosDeAula = cursosInst.filter(function (c) { return c.grado === a.grado && c.grupo === a.grupo })
                  const activos = cursosDeAula.filter(function (c) { return c.activo }).length
                  return (
                    <button
                      key={`${a.grado}-${a.grupo}`}
                      onClick={function () { setAulaSel(`${a.grado}__${a.grupo}`) }}
                      className="text-left bg-white rounded-2xl p-5 space-y-2 transition hover:-translate-y-0.5"
                      style={{ border: '1px solid #E5E9F0', boxShadow: '0 1px 3px rgba(15,42,74,0.06)' }}
                    >
                      <div className="flex items-center justify-between">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg" style={{ background: `linear-gradient(135deg, ${NAVY}, ${GREEN})` }}>
                          🎓
                        </div>
                        <span className="text-xs font-semibold px-2.5 py-1 rounded-full" style={{ backgroundColor: '#E7F3E4', color: '#2f7a1f' }}>
                          {activos}/{cursosDeAula.length} activos
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
      ) : (
        <>
          <button onClick={function () { setAulaSel(null) }} className="text-sm font-semibold mb-4 hover:underline" style={{ color: NAVY }}>← Volver a Grados y Secciones</button>
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

            return (
              <div className="space-y-6">
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
