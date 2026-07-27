import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import { useAuth } from './AuthContext'
import { getLetterGrade, getLetterColor } from './gradeUtils'

const DESCRIPCION_NIVEL = {
  AD: 'El estudiante demuestra un nivel superior al esperado para la competencia, resolviendo situaciones incluso más complejas.',
  A: 'El estudiante alcanza el nivel esperado de la competencia para el grado o ciclo.',
  B: 'El estudiante está próximo a alcanzar el nivel esperado y requiere acompañamiento para consolidarlo.',
  C: 'El estudiante evidencia dificultades importantes y necesita mayor tiempo y apoyo para desarrollar la competencia.',
}

const RGB_TITULO = [46, 117, 182]
const RGB_METADATA = [222, 235, 247]
const RGB_AREA = [84, 130, 53]
const RGB_CURSO = [29, 92, 143]
const RGB_TABLA_HEAD = [31, 78, 121]
const RGB_NIVEL = { AD: [47, 122, 31], A: [29, 92, 143], B: [180, 83, 9], C: [185, 28, 28] }

const COLOR_TITULO_ARGB = 'FF2E75B6'
const COLOR_METADATA_ARGB = 'FFDEEBF7'
const COLOR_AREA_ARGB = 'FF548235'
const COLOR_CURSO_ARGB = 'FF1D5C8F'
const COLOR_TABLA_HEAD_ARGB = 'FF1F4E79'
const NIVEL_COLOR_ARGB = { AD: 'FF2F7A1F', A: 'FF1D5C8F', B: 'FFB45309', C: 'FFB91C1C' }

function coloredBlock(doc, y, text, fillColor, textColor, fontSize, bold, pageWidth, align) {
  doc.setFontSize(fontSize)
  doc.setFont(undefined, bold ? 'bold' : 'normal')
  const maxWidth = pageWidth - 20
  const lines = doc.splitTextToSize(text, maxWidth)
  const lineHeight = fontSize * 0.42 + 1.2
  const blockHeight = lines.length * lineHeight + 2.5
  if (fillColor) {
    doc.setFillColor(fillColor[0], fillColor[1], fillColor[2])
    doc.rect(10, y, pageWidth - 20, blockHeight, 'F')
  }
  doc.setTextColor(textColor[0], textColor[1], textColor[2])
  lines.forEach(function (line, i) {
    if (align === 'center') {
      doc.text(line, pageWidth / 2, y + lineHeight * (i + 1), { align: 'center' })
    } else {
      doc.text(line, 14, y + lineHeight * (i + 1))
    }
  })
  doc.setFont(undefined, 'normal')
  doc.setTextColor(0, 0, 0)
  return y + blockHeight + 0.8
}

async function descargarWorkbook(workbook, filename) {
  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import ExcelJS from 'exceljs'

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
      .select('id, course:courses!inner(id, nombre, grupo, grado, asignaturas!inner(activo, areas_curriculares(nombre)))')
      .eq('student_id', session.user.id)
      .eq('status', 'activo')
      .eq('course.asignaturas.activo', true)

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
          submissionsMap[s.assignment_id] = { score: s.score, entregado: true }
        })
      }
    }

    const now = new Date()

    const enrichedCourses = courseList.map(function (c) {
      const courseAssignments = assignmentsResult.data
        .filter(function (a) { return a.course_id === c.id })
        .map(function (a) {
          const submission = submissionsMap[a.id]
          const isPastDue = new Date(a.fecha_entrega) < now
          const entregado = Boolean(submission)
          const calificado = entregado && submission.score != null

          // Regla: tarea vencida SIN entrega -> C automático (0). Si entregó pero no lo calificaron, NO se autocalifica.
          const autoZero = isPastDue && !entregado
          const finalScore = autoZero ? 0 : (calificado ? submission.score : null)

          return {
            ...a,
            score: finalScore,
            isAutoZero: autoZero,
            entregado: entregado,
            noCalificado: entregado && !calificado,
            pending: !isPastDue && !entregado, // aún no vence y no entregó: no cuenta todavía
          }
        })

      const gradedScores = courseAssignments
        .map(function (a) { return a.score })
        .filter(function (s) { return s != null })

      return {
        ...c,
        areaNombre: c.asignaturas?.areas_curriculares?.nombre || 'Otras',
        assignments: courseAssignments,
        promedio: average(gradedScores),
      }
    })

    setCourses(enrichedCourses)
    setLoading(false)
  }

  const areaGroups = (function () {
    const map = {}
    courses.forEach(function (c) {
      if (!map[c.areaNombre]) map[c.areaNombre] = []
      map[c.areaNombre].push(c)
    })
    return Object.keys(map).map(function (areaNombre) {
      const cursosArea = map[areaNombre]
      const promediosValidos = cursosArea.map(function (c) { return c.promedio }).filter(function (p) { return p != null })
      return {
        nombre: areaNombre,
        cursos: cursosArea,
        promedio: average(promediosValidos),
      }
    }).sort(function (a, b) { return a.nombre.localeCompare(b.nombre) })
  })()

  const promediosDeArea = areaGroups.map(function (a) { return a.promedio }).filter(function (p) { return p != null })
  const promedioGeneral = average(promediosDeArea)

  const allGradedScores = courses.flatMap(function (c) {
    return c.assignments.map(function (a) { return a.score }).filter(function (s) { return s != null })
  })

  function scoreLabel(a) {
    if (a.score != null) {
      const suffix = a.isAutoZero ? ' — No entregó' : ''
      return `${getLetterGrade(a.score)}${suffix}`
    }
    if (a.noCalificado) return 'No calificado'
    return 'Pendiente (aún no vence)'
  }

  function exportPDF() {
    const doc = new jsPDF()
    const pageWidth = doc.internal.pageSize.getWidth()
    let y = 4

    y = coloredBlock(doc, y, 'REPORTE DE NOTAS', RGB_TITULO, [255, 255, 255], 14, true, pageWidth, 'center')
    y = coloredBlock(doc, y, `Alumno: ${profile?.full_name || ''}`, RGB_METADATA, [0, 0, 0], 9, true, pageWidth)
    y = coloredBlock(
      doc, y,
      `Promedio general: ${promedioGeneral != null ? promedioGeneral.toFixed(1) + ' — Nivel de logro: ' + getLetterGrade(promedioGeneral) + ' (' + DESCRIPCION_NIVEL[getLetterGrade(promedioGeneral)] + ')' : '—'}`,
      RGB_METADATA, [0, 0, 0], 9, true, pageWidth
    )
    y += 2

    areaGroups.forEach(function (area) {
      if (y > doc.internal.pageSize.getHeight() - 40) { doc.addPage(); y = 4 }

      const areaTexto = `${area.nombre} — Promedio: ${area.promedio != null ? area.promedio.toFixed(1) + ' (' + getLetterGrade(area.promedio) + ')' : '—'}`
      y = coloredBlock(doc, y, areaTexto, RGB_AREA, [255, 255, 255], 11, true, pageWidth)
      if (area.promedio != null) {
        y = coloredBlock(doc, y, DESCRIPCION_NIVEL[getLetterGrade(area.promedio)], null, [80, 80, 80], 8, false, pageWidth)
      }

      area.cursos.forEach(function (c) {
        if (y > doc.internal.pageSize.getHeight() - 40) { doc.addPage(); y = 4 }

        const cursoTexto = `${c.nombre} (${c.grado}° Sección ${c.grupo}) — Promedio: ${c.promedio != null ? c.promedio.toFixed(1) + ' (' + getLetterGrade(c.promedio) + ')' : '—'}`
        y = coloredBlock(doc, y, cursoTexto, RGB_CURSO, [255, 255, 255], 9, true, pageWidth)

        if (c.assignments.length === 0) {
          y = coloredBlock(doc, y, 'Aún no hay tareas registradas.', null, [100, 100, 100], 8, false, pageWidth)
          return
        }

        const rows = c.assignments.map(function (a) {
          return [
            a.titulo,
            a.tema || '—',
            a.score != null ? getLetterGrade(a.score) : (a.pending ? 'Pendiente' : '—'),
            a.isAutoZero ? 'No entregó' : '',
          ]
        })

        autoTable(doc, {
          startY: y,
          head: [['Tarea', 'Tema', 'Nota', 'Obs.']],
          body: rows,
          styles: { fontSize: 8 },
          headStyles: { fillColor: RGB_TABLA_HEAD, textColor: [255, 255, 255] },
          margin: { left: 10, right: 10 },
          didParseCell: function (data) {
            if (data.section === 'body' && data.column.index === 2) {
              const val = data.cell.raw
              if (RGB_NIVEL[val]) {
                data.cell.styles.textColor = RGB_NIVEL[val]
                data.cell.styles.fontStyle = 'bold'
              }
            }
          },
        })
        y = doc.lastAutoTable.finalY + 4
      })
      y += 2
    })

    doc.save(`Reporte_Notas_${(profile?.full_name || 'alumno').replace(/\s+/g, '_')}.pdf`)
  }

  async function exportExcel() {
    const workbook = new ExcelJS.Workbook()
    const ws = workbook.addWorksheet('Notas')
    const totalCols = 4
    ws.getColumn(1).width = 40
    ws.getColumn(2).width = 30
    ws.getColumn(3).width = 14
    ws.getColumn(4).width = 20

    function mergedRow(rowNum, text, fillArgb, fontArgb, size, bold) {
      ws.mergeCells(rowNum, 1, rowNum, totalCols)
      const cell = ws.getCell(rowNum, 1)
      cell.value = text
      cell.font = { bold: bold, size: size || 11, color: { argb: fontArgb || 'FF000000' } }
      if (fillArgb) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fillArgb } }
      cell.alignment = { vertical: 'middle', wrapText: true }
      ws.getRow(rowNum).height = size >= 14 ? 26 : 18
    }

    mergedRow(1, 'REPORTE DE NOTAS', COLOR_TITULO_ARGB, 'FFFFFFFF', 14, true)
    mergedRow(2, `Alumno: ${profile?.full_name || ''}`, COLOR_METADATA_ARGB, 'FF000000', 11, false)
    mergedRow(
      3,
      `Promedio general: ${promedioGeneral != null ? promedioGeneral.toFixed(1) + ' — Nivel de logro: ' + getLetterGrade(promedioGeneral) + ' (' + DESCRIPCION_NIVEL[getLetterGrade(promedioGeneral)] + ')' : '—'}`,
      COLOR_METADATA_ARGB, 'FF000000', 11, true
    )

    let r = 5
    areaGroups.forEach(function (area) {
      const areaTexto = `${area.nombre} — Promedio: ${area.promedio != null ? area.promedio.toFixed(1) + ' (' + getLetterGrade(area.promedio) + ')' : '—'}`
      mergedRow(r, areaTexto, COLOR_AREA_ARGB, 'FFFFFFFF', 12, true)
      r++
      if (area.promedio != null) {
        mergedRow(r, DESCRIPCION_NIVEL[getLetterGrade(area.promedio)], null, 'FF475569', 9, false)
        r++
      }

      area.cursos.forEach(function (c) {
        const cursoTexto = `${c.nombre} (${c.grado}° Sección ${c.grupo}) — Promedio: ${c.promedio != null ? c.promedio.toFixed(1) + ' (' + getLetterGrade(c.promedio) + ')' : '—'}`
        mergedRow(r, cursoTexto, COLOR_CURSO_ARGB, 'FFFFFFFF', 10, true)
        r++

        if (c.assignments.length === 0) {
          mergedRow(r, 'Aún no hay tareas registradas.', null, 'FF94A3B8', 9, false)
          r++
          r++
          return
        }

        const headerRow = ws.getRow(r)
        ;['Tarea', 'Tema', 'Nota', 'Observación'].forEach(function (text, i) {
          const cell = headerRow.getCell(i + 1)
          cell.value = text
          cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_TABLA_HEAD_ARGB } }
        })
        r++

        c.assignments.forEach(function (a) {
          const letra = a.score != null ? getLetterGrade(a.score) : (a.pending ? 'Pendiente' : '—')
          const row = ws.getRow(r)
          row.getCell(1).value = a.titulo
          row.getCell(2).value = a.tema || '—'
          row.getCell(3).value = letra
          row.getCell(3).font = { bold: true, color: { argb: NIVEL_COLOR_ARGB[letra] || 'FF000000' } }
          row.getCell(4).value = a.isAutoZero ? 'No entregó' : ''
          for (let c2 = 1; c2 <= 4; c2++) {
            row.getCell(c2).border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }
          }
          r++
        })
        r++
      })
      r++
    })

    await descargarWorkbook(workbook, `Reporte_Notas_${(profile?.full_name || 'alumno').replace(/\s+/g, '_')}.xlsx`)
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
            {promedioGeneral != null ? promedioGeneral.toFixed(1) : '—'}
          </p>
          {promedioGeneral != null && (
            <p className="text-white/90 text-sm mt-1">
              Nivel de logro: <strong>{getLetterGrade(promedioGeneral)}</strong> — {DESCRIPCION_NIVEL[getLetterGrade(promedioGeneral)]}
            </p>
          )}
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
        <div className="space-y-8">
          {areaGroups.map(function (area) {
            return (
              <div key={area.nombre}>
                <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                  <h3 className="text-base font-bold" style={{ color: NAVY_DARK }}>{area.nombre}</h3>
                  <div className="text-right">
                    <p className="text-xs text-slate-500">Promedio de área</p>
                    <p className={'text-base font-bold ' + getLetterColor(area.promedio)}>
                      {area.promedio != null ? area.promedio.toFixed(1) : '—'}
                      {area.promedio != null && (
                        <span className="text-xs font-normal text-slate-400 ml-1">
                          — {getLetterGrade(area.promedio)} ({DESCRIPCION_NIVEL[getLetterGrade(area.promedio)]})
                        </span>
                      )}
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  {area.cursos.map(function (c) {
                    return (
                      <div key={c.id} className="bg-white rounded-2xl p-5" style={{ border: '1px solid #E5E9F0' }}>
                        <div className="flex justify-between items-center mb-3 flex-wrap gap-2">
                          <h4 className="text-lg font-bold" style={{ color: NAVY_DARK }}>
                            {c.nombre} <span className="text-slate-400 text-sm font-medium">({c.grado}° Sección {c.grupo})</span>
                          </h4>
                          <div className="text-right">
                            <p className="text-xs text-slate-500">Promedio del curso</p>
                            <p className={'text-lg font-bold ' + getLetterColor(c.promedio)}>
                              {c.promedio != null ? c.promedio.toFixed(1) : '—'}
                            </p>
                            {c.promedio != null && (
                              <p className="text-xs text-slate-400">
                                Nivel de logro: {getLetterGrade(c.promedio)}
                              </p>
                            )}
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
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
