import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'

const NAVY_DARK = '#0F172A'
const GREEN = '#22C55E'
const GREEN_DARK = '#16A34A'
const RED = '#B91C1C'

function average(numbers) {
  if (numbers.length === 0) return null
  return numbers.reduce(function (a, b) { return a + b }, 0) / numbers.length
}

function BarraProgreso({ aprobados, desaprobados }) {
  const total = aprobados + desaprobados
  const pctAprob = total > 0 ? (aprobados / total) * 100 : 0
  const pctDesaprob = total > 0 ? (desaprobados / total) * 100 : 0
  return (
    <div className="w-full h-3 rounded-full overflow-hidden flex" style={{ backgroundColor: '#F4F6F9' }}>
      <div style={{ width: `${pctAprob}%`, backgroundColor: GREEN }} />
      <div style={{ width: `${pctDesaprob}%`, backgroundColor: RED }} />
    </div>
  )
}

export default function ReportesManager() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [progreso, setProgreso] = useState('')
  const [statsPorArea, setStatsPorArea] = useState([])
  const [statsPorGrado, setStatsPorGrado] = useState([])
  const [totalGeneral, setTotalGeneral] = useState({ aprobados: 0, desaprobados: 0, sinNota: 0 })

  useEffect(function () {
    cargarReportes()
  }, [])

  async function cargarReportes() {
    setLoading(true)
    setError('')

    const coursesResult = await supabase
      .from('courses')
      .select('id, nombre, grado, grupo, asignaturas(areas_curriculares(nombre))')
    if (coursesResult.error) {
      setError(coursesResult.error.message)
      setLoading(false)
      return
    }
    const courses = coursesResult.data

    const areaAcc = {}
    const gradoAcc = {}
    let total = { aprobados: 0, desaprobados: 0, sinNota: 0 }

    for (const course of courses) {
      setProgreso(`Procesando ${course.nombre} ${course.grado}°${course.grupo}...`)
      const areaNombre = course.asignaturas?.areas_curriculares?.nombre || 'Sin área'

      const enrollResult = await supabase
        .from('enrollments')
        .select('student_id')
        .eq('course_id', course.id)
        .eq('status', 'activo')
      const studentIds = enrollResult.error ? [] : enrollResult.data.map(function (e) { return e.student_id })
      if (studentIds.length === 0) continue

      const assignResult = await supabase
        .from('assignments')
        .select('id, fecha_entrega')
        .eq('course_id', course.id)
      const assignments = assignResult.error ? [] : assignResult.data
      const assignmentIds = assignments.map(function (a) { return a.id })

      let subsByStudent = {}
      if (assignmentIds.length > 0) {
        const subsResult = await supabase
          .from('submissions')
          .select('student_id, assignment_id, score')
          .in('assignment_id', assignmentIds)
        if (!subsResult.error) {
          subsResult.data.forEach(function (s) {
            if (!subsByStudent[s.student_id]) subsByStudent[s.student_id] = {}
            subsByStudent[s.student_id][s.assignment_id] = s.score
          })
        }
      }

      const now = new Date()
      studentIds.forEach(function (studentId) {
        const scores = assignments.map(function (a) {
          const raw = subsByStudent[studentId]?.[a.id]
          const isPastDue = new Date(a.fecha_entrega) < now
          if (raw != null) return raw
          if (isPastDue) return 0
          return null
        }).filter(function (s) { return s != null })

        if (scores.length === 0) {
          total.sinNota++
          if (!areaAcc[areaNombre]) areaAcc[areaNombre] = { aprobados: 0, desaprobados: 0, sinNota: 0 }
          areaAcc[areaNombre].sinNota++
          const gKey = `${course.grado}`
          if (!gradoAcc[gKey]) gradoAcc[gKey] = { aprobados: 0, desaprobados: 0, sinNota: 0 }
          gradoAcc[gKey].sinNota++
          return
        }

        const prom = average(scores)
        const aprobado = prom >= 11

        if (!areaAcc[areaNombre]) areaAcc[areaNombre] = { aprobados: 0, desaprobados: 0, sinNota: 0 }
        if (aprobado) areaAcc[areaNombre].aprobados++
        else areaAcc[areaNombre].desaprobados++

        const gKey = `${course.grado}`
        if (!gradoAcc[gKey]) gradoAcc[gKey] = { aprobados: 0, desaprobados: 0, sinNota: 0 }
        if (aprobado) gradoAcc[gKey].aprobados++
        else gradoAcc[gKey].desaprobados++

        if (aprobado) total.aprobados++
        else total.desaprobados++
      })
    }

    const areasArr = Object.keys(areaAcc).map(function (nombre) {
      return { nombre: nombre, ...areaAcc[nombre] }
    }).sort(function (a, b) { return a.nombre.localeCompare(b.nombre) })

    const gradosArr = Object.keys(gradoAcc).sort().map(function (g) {
      return { grado: g, ...gradoAcc[g] }
    })

    setStatsPorArea(areasArr)
    setStatsPorGrado(gradosArr)
    setTotalGeneral(total)
    setProgreso('')
    setLoading(false)
  }

  if (loading) {
    return (
      <div>
        <h2 className="text-2xl font-bold mb-2" style={{ color: NAVY_DARK }}>Reportes</h2>
        <p className="text-slate-400 text-sm">{progreso || 'Cargando...'}</p>
      </div>
    )
  }
  if (error) return <p className="text-red-500 text-sm">Error: {error}</p>

  const totalEvaluados = totalGeneral.aprobados + totalGeneral.desaprobados
  const pctAprobGeneral = totalEvaluados > 0 ? Math.round((totalGeneral.aprobados / totalEvaluados) * 100) : 0

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6" style={{ color: NAVY_DARK }}>Reportes</h2>

      {/* Resumen general */}
      <div className="grid gap-4 sm:grid-cols-3 mb-8">
        <div className="bg-white rounded-2xl p-5" style={{ border: '1px solid #E5E9F0' }}>
          <p className="text-xs text-slate-400 mb-1">Estudiantes evaluados</p>
          <p className="text-2xl font-bold" style={{ color: NAVY_DARK }}>{totalEvaluados}</p>
        </div>
        <div className="bg-white rounded-2xl p-5" style={{ border: '1px solid #E5E9F0' }}>
          <p className="text-xs text-slate-400 mb-1">% Aprobados (general)</p>
          <p className="text-2xl font-bold" style={{ color: GREEN_DARK }}>{pctAprobGeneral}%</p>
        </div>
        <div className="bg-white rounded-2xl p-5" style={{ border: '1px solid #E5E9F0' }}>
          <p className="text-xs text-slate-400 mb-1">Sin nota registrada aún</p>
          <p className="text-2xl font-bold" style={{ color: NAVY_DARK }}>{totalGeneral.sinNota}</p>
        </div>
      </div>

      {/* Por área */}
      <h3 className="text-sm font-bold mb-3" style={{ color: NAVY_DARK }}>Aprobados vs Desaprobados por Área</h3>
      <div className="space-y-4 mb-8">
        {statsPorArea.map(function (a) {
          const total = a.aprobados + a.desaprobados
          const pct = total > 0 ? Math.round((a.aprobados / total) * 100) : 0
          return (
            <div key={a.nombre} className="bg-white rounded-2xl p-4" style={{ border: '1px solid #E5E9F0' }}>
              <div className="flex justify-between items-center mb-2">
                <p className="text-sm font-semibold" style={{ color: NAVY_DARK }}>{a.nombre}</p>
                <p className="text-xs text-slate-400">
                  <span style={{ color: GREEN_DARK }}>{a.aprobados} aprobados</span> · <span style={{ color: RED }}>{a.desaprobados} desaprobados</span>
                  {a.sinNota > 0 && <span> · {a.sinNota} sin nota</span>}
                  {' '}({pct}%)
                </p>
              </div>
              <BarraProgreso aprobados={a.aprobados} desaprobados={a.desaprobados} />
            </div>
          )
        })}
        {statsPorArea.length === 0 && <p className="text-slate-400 text-sm">Aún no hay datos suficientes.</p>}
      </div>

      {/* Por grado */}
      <h3 className="text-sm font-bold mb-3" style={{ color: NAVY_DARK }}>Aprobados vs Desaprobados por Grado</h3>
      <div className="space-y-4">
        {statsPorGrado.map(function (g) {
          const total = g.aprobados + g.desaprobados
          const pct = total > 0 ? Math.round((g.aprobados / total) * 100) : 0
          return (
            <div key={g.grado} className="bg-white rounded-2xl p-4" style={{ border: '1px solid #E5E9F0' }}>
              <div className="flex justify-between items-center mb-2">
                <p className="text-sm font-semibold" style={{ color: NAVY_DARK }}>{g.grado}° Secundaria</p>
                <p className="text-xs text-slate-400">
                  <span style={{ color: GREEN_DARK }}>{g.aprobados} aprobados</span> · <span style={{ color: RED }}>{g.desaprobados} desaprobados</span>
                  {g.sinNota > 0 && <span> · {g.sinNota} sin nota</span>}
                  {' '}({pct}%)
                </p>
              </div>
              <BarraProgreso aprobados={g.aprobados} desaprobados={g.desaprobados} />
            </div>
          )
        })}
        {statsPorGrado.length === 0 && <p className="text-slate-400 text-sm">Aún no hay datos suficientes.</p>}
      </div>
    </div>
  )
}
