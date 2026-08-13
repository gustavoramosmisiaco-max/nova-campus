import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'

const NAVY_DARK = '#0F172A'
const NAVY = '#2563EB'
const GREEN = '#22C55E'

export default function HabilitarCursos({ institucionFija } = {}) {
  const [loading, setLoading] = useState(true)
  const [courses, setCourses] = useState([])
  const [areas, setAreas] = useState([])
  const [institucionSel, setInstitucionSel] = useState(institucionFija || null)
  const [actualizandoId, setActualizandoId] = useState(null)

  useEffect(function () {
    cargarCursos()
    cargarAreas()
  }, [])

  async function cargarCursos() {
    setLoading(true)
    const result = await supabase
      .from('courses')
      .select('id, nombre, grado, grupo, activo, asignatura_id, institucion_id, instituciones_educativas(nombre)')
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
    const result = await supabase.from('areas_curriculares').select('*, asignaturas(id, nombre, activo, institucion_id)').order('orden')
    if (!result.error) {
      setAreas(result.data.map(function (a) {
        return {
          ...a,
          asignaturas: a.asignaturas
            .filter(function (s) { return s.activo })
            .filter(function (s) { return !institucionFija || !s.institucion_id || s.institucion_id === institucionFija })
            .sort(function (x, y) { return x.nombre.localeCompare(y.nombre) }),
        }
      }))
    }
  }

  async function toggleAsignaturaEnInstitucion(asignaturaId, activarATodas) {
    setActualizandoId(asignaturaId)
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

  if (loading) return <p className="text-slate-400 text-sm">Cargando...</p>

  const institucionesUnicas = [...new Map(
    courses.map(function (c) { return [c.institucion_id || 'sin-institucion', c.instituciones_educativas?.nombre || 'Sin institución asignada'] })
  ).entries()]

  return (
    <div>
      <h2 className="text-2xl font-bold mb-2" style={{ color: NAVY_DARK }}>Habilitar / Deshabilitar Cursos</h2>
      <p className="text-sm text-slate-400 mb-6">
        Activa o desactiva una Asignatura completa — aplica de golpe a todos los grados y secciones que ya la tengan, en la institución elegida.
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
      ) : (
        <>
          {!institucionFija && (
            <button onClick={function () { setInstitucionSel(null) }} className="text-sm font-semibold mb-4 hover:underline" style={{ color: NAVY }}>← Volver a Instituciones</button>
          )}

          <div className="space-y-6">
            {areas.map(function (area) {
              const asignaturasConDatos = area.asignaturas.filter(function (asig) {
                return courses.some(function (c) { return c.asignatura_id === asig.id && (c.institucion_id || 'sin-institucion') === institucionSel })
              })
              if (asignaturasConDatos.length === 0) return null
              return (
                <div key={area.id}>
                  <p className="text-xs font-bold uppercase tracking-wide mb-3 px-3 py-1.5 rounded-lg inline-block" style={{ backgroundColor: '#E7F3E4', color: '#16A34A' }}>{area.nombre}</p>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {asignaturasConDatos.map(function (asig) {
                      const cursosDeEsta = courses.filter(function (c) {
                        return c.asignatura_id === asig.id && (c.institucion_id || 'sin-institucion') === institucionSel
                      })
                      const activosCount = cursosDeEsta.filter(function (c) { return c.activo }).length
                      const estado = activosCount === cursosDeEsta.length ? 'todas' : activosCount === 0 ? 'ninguna' : 'parcial'
                      const actualizando = actualizandoId === asig.id
                      const encendido = estado === 'todas'
                      return (
                        <div
                          key={asig.id}
                          className="bg-white rounded-2xl p-4 flex items-center justify-between gap-3"
                          style={{ border: '1px solid #E5E9F0', boxShadow: '0 1px 3px rgba(15,42,74,0.04)' }}
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-semibold truncate" style={{ color: NAVY_DARK }}>{asig.nombre}</p>
                            <p className="text-xs mt-0.5" style={{ color: estado === 'todas' ? '#16A34A' : estado === 'ninguna' ? '#94A3B8' : '#B45309' }}>
                              {activosCount}/{cursosDeEsta.length} aula(s){estado === 'parcial' ? ' · mixto' : ''}
                            </p>
                          </div>
                          <button
                            onClick={function () { toggleAsignaturaEnInstitucion(asig.id, !encendido) }}
                            disabled={actualizando}
                            className="relative rounded-full transition disabled:opacity-50 flex-shrink-0"
                            style={{ width: 48, height: 26, backgroundColor: encendido ? GREEN : '#D6DCE5' }}
                            title={encendido ? 'Desactivar todas' : 'Activar todas'}
                          >
                            <span
                              className="absolute top-0.5 rounded-full bg-white transition-all shadow-sm"
                              style={{ width: 22, height: 22, left: encendido ? 24 : 2 }}
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
        </>
      )}
    </div>
  )
}
