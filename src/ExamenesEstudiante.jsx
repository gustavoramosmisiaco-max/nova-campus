import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import { useAuth } from './AuthContext'
import ExamenVirtual from './ExamenVirtual'

const NAVY_DARK = '#0F172A'
const NAVY = '#2563EB'
const GREEN = '#22C55E'

function formatearFechaHora(iso) {
  return new Date(iso).toLocaleString('es-PE', { dateStyle: 'medium', timeStyle: 'short' })
}

function calcularEstado(evaluacion, intento) {
  if (intento?.estado === 'finalizado') return 'rendido'
  if (!evaluacion.fecha_hora_inicio || !evaluacion.duracion_minutos) return 'sin_programar'
  const ahora = new Date()
  const inicio = new Date(evaluacion.fecha_hora_inicio)
  const cierre = new Date(inicio.getTime() + evaluacion.duracion_minutos * 60000)
  if (ahora < inicio) return 'antes'
  if (ahora > cierre) return 'cerrado'
  return 'abierto'
}

const ESTADO_INFO = {
  antes: { label: 'Programado', color: '#B45309', bg: '#FFF7E6' },
  abierto: { label: '¡Disponible ahora!', color: '#16A34A', bg: '#E7F3E4' },
  cerrado: { label: 'Cerrado', color: '#B91C1C', bg: '#FDECEC' },
  rendido: { label: 'Ya lo rendiste', color: '#5F5E5A', bg: '#F4F6F9' },
  sin_programar: { label: 'Sin fecha programada', color: '#5F5E5A', bg: '#F4F6F9' },
}

export default function ExamenesEstudiante() {
  const { session } = useAuth()
  const [loading, setLoading] = useState(true)
  const [examenes, setExamenes] = useState([])
  const [examenSeleccionado, setExamenSeleccionado] = useState(null)

  useEffect(function () {
    cargar()
  }, [])

  async function cargar() {
    setLoading(true)

    const enrollResult = await supabase
      .from('enrollments')
      .select('course:courses(id, nombre, grado, grupo, asignaturas(area_id, areas_curriculares(nombre)))')
      .eq('student_id', session.user.id)
      .eq('status', 'activo')

    if (enrollResult.error || enrollResult.data.length === 0) {
      setExamenes([])
      setLoading(false)
      return
    }

    const gruposUnicos = {}
    enrollResult.data.forEach(function (e) {
      const c = e.course
      const areaId = c.asignaturas?.area_id
      if (!areaId) return
      const key = `${areaId}__${c.grado}__${c.grupo}`
      if (!gruposUnicos[key]) {
        gruposUnicos[key] = { areaId: areaId, grado: c.grado, grupo: c.grupo, courseId: c.id, areaNombre: c.asignaturas?.areas_curriculares?.nombre }
      }
    })

    const listaFinal = []

    for (const key of Object.keys(gruposUnicos)) {
      const grupo = gruposUnicos[key]

      const unidResult = await supabase
        .from('unidades')
        .select('id, tipo, numero, nombre, course_id')
        .eq('area_id', grupo.areaId)
        .eq('grado', grupo.grado)
        .eq('grupo', grupo.grupo)
      if (unidResult.error || unidResult.data.length === 0) continue

      const unidadIds = unidResult.data.map(function (u) { return u.id })
      const evalResult = await supabase
        .from('evaluaciones_unidad')
        .select('*')
        .in('unidad_id', unidadIds)
        .eq('publicado', true)
      if (evalResult.error || evalResult.data.length === 0) continue

      for (const evaluacion of evalResult.data) {
        const unidad = unidResult.data.find(function (u) { return u.id === evaluacion.unidad_id })
        const intentoResult = await supabase
          .from('examen_intentos')
          .select('*')
          .eq('evaluacion_id', evaluacion.id)
          .eq('student_id', session.user.id)
          .maybeSingle()

        listaFinal.push({
          evaluacion: evaluacion,
          unidad: { id: unidad.id, tipo: unidad.tipo, numero: unidad.numero, course_id: grupo.courseId },
          areaNombre: grupo.areaNombre,
          estado: calcularEstado(evaluacion, intentoResult.data),
        })
      }
    }

    listaFinal.sort(function (a, b) {
      const orden = { abierto: 0, antes: 1, cerrado: 2, rendido: 3, sin_programar: 4 }
      return orden[a.estado] - orden[b.estado]
    })

    setExamenes(listaFinal)
    setLoading(false)
  }

  if (examenSeleccionado) {
    return (
      <ExamenVirtual
        unidad={examenSeleccionado.unidad}
        courseId={examenSeleccionado.unidad.course_id}
        onCerrar={function () { setExamenSeleccionado(null); cargar() }}
      />
    )
  }

  if (loading) return <p className="text-slate-400 text-sm">Cargando exámenes...</p>

  return (
    <div>
      <h2 className="text-2xl font-bold mb-2" style={{ color: NAVY_DARK }}>Exámenes</h2>
      <p className="text-sm text-slate-400 mb-6">Aquí ves todos tus exámenes virtuales programados, de todas tus asignaturas.</p>

      {examenes.length === 0 ? (
        <div className="bg-white rounded-2xl p-10 text-center" style={{ border: '1px dashed #D6DCE5' }}>
          <p className="text-slate-400 text-sm">No tienes ningún examen virtual programado por ahora.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {examenes.map(function (item, i) {
            const info = ESTADO_INFO[item.estado]
            const puedeEntrar = item.estado === 'abierto' || item.estado === 'rendido'
            return (
              <li key={i} className="bg-white rounded-2xl p-5" style={{ border: '1px solid #E5E9F0' }}>
                <div className="flex justify-between items-start flex-wrap gap-3">
                  <div>
                    <p className="text-xs text-slate-400">{item.areaNombre} · {item.unidad.tipo} {item.unidad.numero}</p>
                    <p className="text-base font-bold" style={{ color: NAVY_DARK }}>{item.evaluacion.nombre}</p>
                    {item.evaluacion.fecha_hora_inicio && (
                      <p className="text-sm text-slate-500 mt-1">
                        {formatearFechaHora(item.evaluacion.fecha_hora_inicio)} · {item.evaluacion.duracion_minutos} min
                      </p>
                    )}
                    <span className="text-xs font-semibold px-2.5 py-1 rounded-full inline-block mt-2" style={{ backgroundColor: info.bg, color: info.color }}>
                      {info.label}
                    </span>
                  </div>
                  {puedeEntrar && (
                    <button
                      onClick={function () { setExamenSeleccionado(item) }}
                      className="text-sm font-semibold px-4 py-2 rounded-lg text-white transition hover:opacity-90 flex-shrink-0"
                      style={{ backgroundColor: item.estado === 'rendido' ? NAVY : GREEN }}
                    >
                      {item.estado === 'rendido' ? 'Ver resultado' : 'Entrar al examen'}
                    </button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
