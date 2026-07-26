import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import { getLetterGrade } from './gradeUtils'

const NAVY_DARK = '#0F2A4A'
const NAVY = '#1d5c8f'
const GREEN_DARK = '#2f7a1f'

const inputStyle = { backgroundColor: 'white', border: '1px solid #D6DCE5', color: NAVY_DARK }

const NIVELES_RUBRICA = [
  { letra: 'AD', nombre: 'Logro destacado', rango: '18-20', color: '#2f7a1f' },
  { letra: 'A', nombre: 'Logro esperado', rango: '14-17', color: '#1d5c8f' },
  { letra: 'B', nombre: 'En proceso', rango: '11-13', color: '#B45309' },
  { letra: 'C', nombre: 'En inicio', rango: '0-10', color: '#B91C1C' },
]

function average(numbers) {
  if (numbers.length === 0) return null
  return numbers.reduce(function (a, b) { return a + b }, 0) / numbers.length
}

export default function InstrumentoEvaluacion({ courseId }) {
  const [activities, setActivities] = useState([])
  const [selectedId, setSelectedId] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [matrix, setMatrix] = useState(null)

  useEffect(function () {
    loadActivities()
  }, [courseId])

  async function loadActivities() {
    setLoading(true)
    const result = await supabase
      .from('actividades')
      .select('id, nombre, numero_actividad, tipo_instrumento, actividad_capacidades(criterio, capacidad:capacidades(id, nombre, orden))')
      .eq('course_id', courseId)
      .order('created_at', { ascending: true })
    if (!result.error) setActivities(result.data)
    setLoading(false)
  }

  async function loadMatrix(actividadId) {
    setSelectedId(actividadId)
    if (!actividadId) {
      setMatrix(null)
      return
    }
    setLoading(true)
    setError('')

    const actividad = activities.find(function (a) { return a.id === actividadId })
    const capacidades = (actividad.actividad_capacidades || [])
      .slice()
      .sort(function (x, y) { return (x.capacidad.orden || 0) - (y.capacidad.orden || 0) })

    const assignResult = await supabase
      .from('assignments')
      .select('id')
      .eq('actividad_id', actividadId)
    if (assignResult.error) {
      setError(assignResult.error.message)
      setLoading(false)
      return
    }
    const assignmentIds = assignResult.data.map(function (a) { return a.id })

    const enrollResult = await supabase
      .from('enrollments')
      .select('student:profiles(id, full_name)')
      .eq('course_id', courseId)
      .eq('status', 'activo')
    if (enrollResult.error) {
      setError(enrollResult.error.message)
      setLoading(false)
      return
    }
    const students = enrollResult.data.map(function (e) { return e.student }).sort(function (a, b) { return a.full_name.localeCompare(b.full_name) })

    let cellValues = {}
    if (assignmentIds.length > 0) {
      const subsResult = await supabase
        .from('submissions')
        .select('id, student_id')
        .in('assignment_id', assignmentIds)
      if (!subsResult.error) {
        const submissionIds = subsResult.data.map(function (s) { return s.id })
        const subMap = {}
        subsResult.data.forEach(function (s) { subMap[s.id] = s.student_id })

        if (submissionIds.length > 0) {
          const scoresResult = await supabase
            .from('submission_scores')
            .select('submission_id, capacidad_id, score')
            .in('submission_id', submissionIds)
          if (!scoresResult.error) {
            const grouped = {}
            scoresResult.data.forEach(function (row) {
              const studentId = subMap[row.submission_id]
              const key = `${studentId}__${row.capacidad_id}`
              if (!grouped[key]) grouped[key] = []
              if (row.score != null) grouped[key].push(row.score)
            })
            Object.keys(grouped).forEach(function (key) {
              cellValues[key] = average(grouped[key])
            })
          }
        }
      }
    }

    setMatrix({
      tipoInstrumento: actividad.tipo_instrumento || 'Lista de cotejo',
      capacidades: capacidades,
      students: students,
      cellValues: cellValues,
    })
    setLoading(false)
  }

  return (
    <div>
      <h3 className="text-lg font-bold mb-4" style={{ color: NAVY_DARK }}>Instrumento de Evaluación</h3>

      <div className="mb-5 max-w-md">
        <label className="block text-xs font-medium mb-1" style={{ color: NAVY_DARK }}>Actividad</label>
        <select
          value={selectedId}
          onChange={function (e) { loadMatrix(e.target.value) }}
          className="w-full rounded-lg px-3 py-2 text-sm outline-none"
          style={inputStyle}
        >
          <option value="">-- Selecciona una actividad --</option>
          {activities.map(function (a) {
            return <option key={a.id} value={a.id}>Actividad {a.numero_actividad} · {a.nombre}</option>
          })}
        </select>
      </div>

      {error && <p className="text-red-500 text-sm mb-3">{error}</p>}

      {selectedId && (
        loading ? (
          <p className="text-slate-400 text-sm">Cargando...</p>
        ) : !matrix || matrix.capacidades.length === 0 ? (
          <p className="text-slate-400 text-sm">Esta actividad no tiene capacidades vinculadas.</p>
        ) : (
          <>
            <p className="text-xs font-semibold mb-3" style={{ color: GREEN_DARK }}>
              {matrix.tipoInstrumento}
            </p>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: '1px solid #E5E9F0' }}>
                    <th className="text-left py-2 pr-3 font-semibold" style={{ color: NAVY_DARK }}>Criterio</th>
                    {matrix.students.map(function (s) {
                      return (
                        <th key={s.id} className="text-center py-2 px-2 font-semibold text-xs" style={{ color: NAVY_DARK }}>
                          {s.full_name}
                        </th>
                      )
                    })}
                  </tr>
                </thead>
                <tbody>
                  {matrix.capacidades.map(function (cap) {
                    return (
                      <tr key={cap.capacidad.id} style={{ borderBottom: '1px solid #F4F6F9' }}>
                        <td className="py-2 pr-3" style={{ color: NAVY_DARK }}>
                          <p className="font-medium">{cap.capacidad.nombre}</p>
                          {cap.criterio && <p className="text-xs text-slate-500">{cap.criterio}</p>}
                        </td>
                        {matrix.students.map(function (s) {
                          const score = matrix.cellValues[`${s.id}__${cap.capacidad.id}`]
                          if (matrix.tipoInstrumento === 'Rúbrica') {
                            const nivel = score != null ? NIVELES_RUBRICA.find(function (n) { return n.letra === getLetterGrade(score) }) : null
                            return (
                              <td key={s.id} className="text-center py-2 px-2 text-xs">
                                {score != null ? (
                                  <span className="font-semibold" style={{ color: nivel?.color }}>
                                    {nivel?.letra} ({score.toFixed(1)})
                                  </span>
                                ) : (
                                  <span className="text-slate-300">—</span>
                                )}
                              </td>
                            )
                          }
                          return (
                            <td key={s.id} className="text-center py-2 px-2 text-xs">
                              {score == null ? (
                                <span className="text-slate-300">—</span>
                              ) : score >= 11 ? (
                                <span className="font-semibold" style={{ color: '#2f7a1f' }}>Logrado ✓</span>
                              ) : (
                                <span className="font-semibold" style={{ color: '#B91C1C' }}>No logrado</span>
                              )}
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {matrix.tipoInstrumento === 'Rúbrica' && (
              <div className="mt-4 flex flex-wrap gap-2">
                {NIVELES_RUBRICA.map(function (n) {
                  return (
                    <span
                      key={n.letra}
                      className="text-xs px-2.5 py-1 rounded-full"
                      style={{ backgroundColor: '#F4F6F9', color: n.color, border: '1px solid #E5E9F0' }}
                    >
                      {n.letra} = {n.nombre} ({n.rango})
                    </span>
                  )
                })}
              </div>
            )}
          </>
        )
      )}
    </div>
  )
}