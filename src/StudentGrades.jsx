import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import { useAuth } from './AuthContext'
import { getLetterGrade, getLetterColor } from './gradeUtils'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import * as XLSX from 'xlsx'

const NAVY_DARK = '#0F2A4A'
const NAVY = '#1d5c8f'
const GREEN = '#5DAA47'

function average(numbers) {
  if (numbers.length === 0) return null
  const sum = numbers.reduce(function (a, b) { return a + b }, 0)
  return sum / numbers.length
}

export default function StudentGrades() {
  const { session, profile } = useAuth()
  const [courses, setCourses] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(function () {
    loadReport()
  }, [])

  async function loadReport() {
    setLoading(true)
    setError('')

    const enrollResult = await supabase
      .from('enrollments')
      .select('id, course:courses(id, nombre, grupo, grado)')
      .eq('student_id', session.user.id)
      .eq('status', 'activo')

    if (enrollResult.error) {
      setError(enrollResult.error.message)
      setLoading(false)
      return
    }

    const courseList = enrollResult.data.map(function (e) { return e.course })
    const courseIds = courseList.map(function (c) { return c.id })

    if (courseIds.length === 0) {
      setCourses([])
      setLoading(false)
      return
    }

    const assignmentsResult = await supabase
      .from('assignments')
      .select('id, course_id, titulo, tema, competencia, capacidad, criterio, desempeno, puntaje_maximo, fecha_entrega')
      .in('course_id', courseIds)
      .order('fecha_entrega', { ascending: true })

    if (assignmentsResult.error) {
      setError(assignmentsResult.error.message)
      setLoading(false)
      return
    }

    const assignmentIds = assignmentsResult.data.map(function (a) { return a.id })

    let submissionsMap = {}
    if (assignmentIds.length > 0) {
      const subsResult = await supabase
        .from('submissions')
        .select('assignment_id, score')
        .eq('student_id', session.user.id)
        .in('assignment_id', assignmentIds)

      if (!subsResult.error) {
        subsResult.data.forEach(function (s) {
          submissionsMap[s.assignment_id] = s.score
        })
      }
    }

    const now = new Date()

    const enrichedCourses = courseList.map(function (c) {
      const courseAssignments = assignmentsResult.data
        .filter(function (a) { return a.course_id === c.id })
        .map(function (a) {
          const submittedScore = submissionsMap[a.id]
          const isPastDue = new Date(a.fecha_entrega) < now
          const noSubmission = submittedScore == null

          // Regla: tarea vencida sin entrega -> C automático (0)
          const autoZero = isPastDue && noSubmission
          const finalScore = autoZero ? 0 : (submittedScore != null ? submittedScore : null)

          return {
            ...a,
            score: finalScore,
            isAutoZero: autoZero,
            pending: !isPastDue && noSubmission, // aún no vence y no entregó: no cuenta todavía
          }
        })

      const gradedScores = courseAssignments
        .map(function (a) { return a.score })
        .filter(function (s) { return s != null })

      return {
        ...c,
        assignments: courseAssignments,
        promedio: average(gradedScores),
      }
    })

    setCourses(enrichedCourses)
    setLoading(false)
  }

  const allGradedScores = courses.flatMap(function (c) {
    return c.assignments.map(function (a) { return a.score }).filter(function (s) { return s != null })
  })
  const promedioGeneral = average(allGradedScores)

  function scoreLabel(a) {
    if (a.score != null) {
      const suffix = a.isAutoZero ? ' — No entregó' : ''
      return `${getLetterGrade(a.score)}${suffix}`
    }
    return 'Pendiente (aún no vence)'
  }

  function exportPDF() {
    const doc = new jsPDF()
    doc.setFontSize(14)
    doc.text('Reporte de Notas — Nova Campus', 14, 15)
    doc.setFontSize(10)
    doc.text(`Alumno: ${profile?.full_name || ''}`, 14, 22)
    doc.text(
      `Promedio general: ${promedioGeneral != null ? getLetterGrade(promedioGeneral) : '—'}`,
      14, 28
    )

    let startY = 35
    courses.forEach(function (c) {
      doc.setFontSize(11)
      doc.text(`${c.nombre} (${c.grado}° Sección ${c.grupo})`, 14, startY)
      const rows = c.assignments.map(function (a) {
        return [
          a.titulo,
          a.tema || '—',
          a.competencia || '—',
          a.score != null ? getLetterGrade(a.score) : (a.pending ? 'Pendiente' : '—'),
          a.isAutoZero ? 'No entregó' : '',
        ]
      })
      autoTable(doc, {
        startY: startY + 3,
        head: [['Tarea', 'Tema', 'Competencia', 'Nota', 'Obs.']],
        body: rows,
        styles: { fontSize: 8 },
        headStyles: { fillColor: [15, 42, 74] },
        margin: { left: 14, right: 14 },
      })
      startY = doc.lastAutoTable.finalY + 10
    })

    doc.save(`Reporte_Notas_${(profile?.full_name || 'alumno').replace(/\s+/g, '_')}.pdf`)
  }

  function exportExcel() {
    const rows = []
    courses.forEach(function (c) {
      c.assignments.forEach(function (a) {
        rows.push({
          Curso: c.nombre,
          Grado: `${c.grado}°`,
          Seccion: c.grupo,
          Tarea: a.titulo,
          Tema: a.tema || '',
          Competencia: a.competencia || '',
          Capacidad: a.capacidad || '',
          Criterio: a.criterio || '',
          Desempeño: a.desempeno || '',
          'Fecha de entrega': new Date(a.fecha_entrega).toLocaleDateString('es-PE'),
          Nota: a.score != null ? getLetterGrade(a.score) : (a.pending ? 'Pendiente' : ''),
          Observación: a.isAutoZero ? 'No entregó (C automático)' : '',
        })
      })
    })

    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Notas')
    XLSX.writeFile(wb, `Reporte_Notas_${(profile?.full_name || 'alumno').replace(/\s+/g, '_')}.xlsx`)
  }

  if (loading) return <p className="text-slate-400 text-sm">Cargando tu reporte de notas...</p>
  if (error) return <p className="text-red-500 text-sm">Error: {error}</p>

  return (
    <div>
      <div className="flex justify-between items-center mb-2 flex-wrap gap-3">
        <h2 className="text-2xl font-bold" style={{ color: NAVY_DARK }}>Mis Notas</h2>
        <div className="flex gap-2">
          <button
            onClick={exportPDF}
            className="text-xs font-semibold px-4 py-2 rounded-lg transition"
            style={{ backgroundColor: 'white', color: NAVY, border: '1px solid #D6DCE5' }}
          >
            Exportar PDF
          </button>
          <button
            onClick={exportExcel}
            className="text-xs font-semibold px-4 py-2 rounded-lg text-white transition hover:opacity-90"
            style={{ backgroundColor: GREEN }}
          >
            Exportar Excel
          </button>
        </div>
      </div>

      <div
        className="rounded-2xl p-6 mb-6 flex items-center justify-between flex-wrap gap-4"
        style={{ background: `linear-gradient(90deg, ${NAVY}, ${GREEN})` }}
      >
        <div>
          <p className="text-white/80 text-sm font-medium">Promedio general</p>
          <p className="text-white text-3xl font-bold">
            {promedioGeneral != null ? getLetterGrade(promedioGeneral) : '—'}
          </p>
        </div>
        <p className="text-white/80 text-sm">
          {allGradedScores.length} tarea{allGradedScores.length !== 1 ? 's' : ''} registrada{allGradedScores.length !== 1 ? 's' : ''}
        </p>
      </div>

      {courses.length === 0 ? (
        <div className="bg-white rounded-2xl p-10 text-center" style={{ border: '1px dashed #D6DCE5' }}>
          <p className="text-slate-400 text-sm">Aún no estás matriculado en ningún curso.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {courses.map(function (c) {
            return (
              <div key={c.id} className="bg-white rounded-2xl p-5" style={{ border: '1px solid #E5E9F0' }}>
                <div className="flex justify-between items-center mb-3 flex-wrap gap-2">
                  <h3 className="text-lg font-bold" style={{ color: NAVY_DARK }}>
                    {c.nombre} <span className="text-slate-400 text-sm font-medium">({c.grado}° Sección {c.grupo})</span>
                  </h3>
                  <div className="text-right">
                    <p className="text-xs text-slate-500">Promedio del curso</p>
                    <p className={'text-lg font-bold ' + getLetterColor(c.promedio)}>
                      {c.promedio != null ? getLetterGrade(c.promedio) : '—'}
                    </p>
                  </div>
                </div>

                {c.assignments.length === 0 ? (
                  <p className="text-slate-400 text-sm">Aún no hay tareas registradas.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr style={{ borderBottom: '1px solid #E5E9F0' }}>
                          <th className="text-left py-2 pr-3 font-semibold" style={{ color: NAVY_DARK }}>Tarea</th>
                          <th className="text-left py-2 pr-3 font-semibold" style={{ color: NAVY_DARK }}>Tema</th>
                          <th className="text-left py-2 pr-3 font-semibold" style={{ color: NAVY_DARK }}>Competencia</th>
                          <th className="text-right py-2 pr-3 font-semibold" style={{ color: NAVY_DARK }}>Nota</th>
                        </tr>
                      </thead>
                      <tbody>
                        {c.assignments.map(function (a) {
                          return (
                            <tr key={a.id} style={{ borderBottom: '1px solid #F4F6F9' }}>
                              <td className="py-2 pr-3" style={{ color: NAVY_DARK }}>{a.titulo}</td>
                              <td className="py-2 pr-3 text-slate-500">{a.tema || '—'}</td>
                              <td className="py-2 pr-3 text-slate-500 max-w-xs">{a.competencia || '—'}</td>
                              <td className="py-2 pr-3 text-right">
                                {a.score != null ? (
                                  <span className={'font-semibold ' + getLetterColor(a.score)}>
                                    {scoreLabel(a)}
                                  </span>
                                ) : (
                                  <span className="text-slate-400">{scoreLabel(a)}</span>
                                )}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}