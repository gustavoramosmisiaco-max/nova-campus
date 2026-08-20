import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import { useAuth } from './AuthContext'
import { getLetterGrade, compararPorApellido } from './gradeUtils'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import ExcelJS from 'exceljs'

const NAVY_DARK = '#0F172A'
const NAVY = '#2563EB'
const GREEN = '#22C55E'

const inputStyle = { backgroundColor: 'white', border: '1px solid #D6DCE5', color: NAVY_DARK }

const NIVELES = [
  { letra: 'AD', nombre: 'Logro destacado', color: '#16A34A' },
  { letra: 'A', nombre: 'Logro esperado', color: '#2563EB' },
  { letra: 'B', nombre: 'En proceso', color: '#B45309' },
  { letra: 'C', nombre: 'En inicio', color: '#B91C1C' },
]

const tableCell = { border: '1px solid #94A3B8', padding: '6px 8px', fontSize: '12px' }
const tableHeadCell = { ...tableCell, backgroundColor: '#F4F6F9', fontWeight: 700, color: NAVY_DARK }

const COLOR_INSTITUCION = 'FF1F4E79'
const COLOR_TITULO = 'FF2E75B6'
const COLOR_METADATA = 'FFDEEBF7'
const COLOR_CAPACIDAD = 'FF548235'
const COLOR_TABLA_HEAD = 'FF1F4E79'
const NIVEL_COLOR_ARGB = { AD: 'FF2F7A1F', A: 'FF1D5C8F', B: 'FFB45309', C: 'FFB91C1C' }

const RGB_INSTITUCION = [31, 78, 121]
const RGB_TITULO = [46, 117, 182]
const RGB_METADATA = [222, 235, 247]
const RGB_CAPACIDAD = [84, 130, 53]
const RGB_TABLA_HEAD = [31, 78, 121]
const RGB_NIVEL = { AD: [47, 122, 31], A: [29, 92, 143], B: [180, 83, 9], C: [185, 28, 28] }

// Texto de "Criterio(s)" a mostrar — si la Actividad ya tiene varios criterios individuales
// (Lista de Cotejo nueva), los enumera; si no, cae al campo de texto libre de siempre.
function textoCriterios(cap) {
  if (cap.criteriosLista && cap.criteriosLista.length > 0) {
    return cap.criteriosLista.map(function (c, i) { return `${i + 1}. ${c.texto}` }).join('  ·  ')
  }
  return cap.criterio || '—'
}

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

function unidadTexto(unidadInfo) {
  if (!unidadInfo) return '—'
  return `${unidadInfo.tipo} ${unidadInfo.numero}${unidadInfo.nombre ? ' · ' + unidadInfo.nombre : ''}`
}

function todayFormatted() {
  const d = new Date()
  const pad = function (n) { return String(n).padStart(2, '0') }
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`
}

function average(numbers) {
  const validos = numbers.filter(function (n) { return n != null })
  if (validos.length === 0) return null
  return validos.reduce(function (a, b) { return a + b }, 0) / validos.length
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

export default function InstrumentoEvaluacion({ courseId, courseNombre, courseGrado, courseGrupo }) {
  const { profile } = useAuth()
  const [unidades, setUnidades] = useState([])
  const [activities, setActivities] = useState([])
  const [selectedId, setSelectedId] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [matrix, setMatrix] = useState(null)
  const [institucion, setInstitucion] = useState('')
  const [selectedForExport, setSelectedForExport] = useState(new Set())
  const [exporting, setExporting] = useState(false)

  useEffect(function () {
    loadAll()
  }, [courseId])

  async function loadAll() {
    setLoading(true)

    const courseResult = await supabase
      .from('courses')
      .select('institucion_id, grado, grupo, asignaturas(area_id)')
      .eq('id', courseId)
      .single()
    if (courseResult.data?.institucion_id) {
      const instResult = await supabase
        .from('instituciones_educativas')
        .select('nombre')
        .eq('id', courseResult.data.institucion_id)
        .single()
      if (!instResult.error) setInstitucion(instResult.data.nombre)
    }

    const areaId = courseResult.data?.asignaturas?.area_id
    const unidadesResult = areaId
      ? await supabase
          .from('unidades')
          .select('id, tipo, numero, nombre')
          .eq('area_id', areaId)
          .eq('grado', courseResult.data.grado)
          .eq('grupo', courseResult.data.grupo)
          .order('numero', { ascending: true })
      : { error: null, data: [] }
    if (!unidadesResult.error) setUnidades(unidadesResult.data)

    const result = await supabase
      .from('actividades')
      .select('id, nombre, numero_actividad, proposito, tipo_instrumento, unidad_id, fecha_clase, competencia:competencias(nombre), actividad_capacidades(criterio, desempeno, desc_ad, desc_a, desc_b, desc_c, capacidad:capacidades(id, nombre, orden))')
      .eq('course_id', courseId)
      .order('created_at', { ascending: true })
    if (!result.error) setActivities(result.data)
    setLoading(false)
  }

  async function computeMatrix(actividad) {
    const capacidades = (actividad.actividad_capacidades || [])
      .slice()
      .sort(function (x, y) { return (x.capacidad.orden || 0) - (y.capacidad.orden || 0) })

    // Criterios individuales de la Lista de Cotejo (si esta Actividad ya los tiene, con el sistema nuevo)
    if (actividad.tipo_instrumento === 'Lista de cotejo') {
      const critResult = await supabase.from('criterios_cotejo').select('capacidad_id, texto, orden').eq('actividad_id', actividad.id).order('orden')
      const criteriosPorCapacidad = {}
      ;(critResult.data || []).forEach(function (c) {
        if (!criteriosPorCapacidad[c.capacidad_id]) criteriosPorCapacidad[c.capacidad_id] = []
        criteriosPorCapacidad[c.capacidad_id].push(c)
      })
      capacidades.forEach(function (cap) { cap.criteriosLista = criteriosPorCapacidad[cap.capacidad.id] || [] })
    }

    const assignResult = await supabase
      .from('assignments')
      .select('id, fecha_entrega, habilitar_notas_clase, assignment_capacidades(capacidad_id)')
      .eq('actividad_id', actividad.id)
    if (assignResult.error) return null
    const assignmentIds = assignResult.data.map(function (a) { return a.id })

    const enrollResult = await supabase
      .from('enrollments')
      .select('student:profiles(id, full_name)')
      .eq('course_id', courseId)
      .eq('status', 'activo')
    if (enrollResult.error) return null
    const students = enrollResult.data
      .map(function (e) { return e.student })
      .sort(function (a, b) { return compararPorApellido(a.full_name, b.full_name) })

    let cellValues = {}
    // Asistencias sin justificar, para dejar en blanco las celdas de estudiantes ausentes ese día
    const ausenciaSet = new Set()
    if (actividad.fecha_clase) {
      const studentIds = students.map(function (s) { return s.id })
      if (studentIds.length > 0) {
        const asisResult = await supabase
          .from('asistencias')
          .select('student_id')
          .eq('fecha', actividad.fecha_clase)
          .eq('estado', 'ausente')
          .in('student_id', studentIds)
        if (!asisResult.error) asisResult.data.forEach(function (a) { ausenciaSet.add(a.student_id) })
      }
    }

    // Notas de clase sueltas (sin tarea), directo por Actividad+Capacidad
    const notaClaseStandaloneMap = {} // studentId__capId -> nota
    const notasClaseActResult = await supabase
      .from('notas_clase')
      .select('student_id, capacidad_id, nota')
      .eq('actividad_id', actividad.id)
    if (!notasClaseActResult.error) {
      notasClaseActResult.data.forEach(function (n) { notaClaseStandaloneMap[`${n.student_id}__${n.capacidad_id}`] = n.nota })
    }

    if (assignmentIds.length > 0) {
      const subsResult = await supabase.from('submissions').select('id, student_id, assignment_id, publicado').in('assignment_id', assignmentIds)
      const submissionsData = subsResult.error ? [] : subsResult.data
      const submissionIds = submissionsData.map(function (s) { return s.id })
      const subMap = {}
      submissionsData.forEach(function (s) { subMap[s.id] = { studentId: s.student_id, publicado: s.publicado } })

      let scoresData = []
      if (submissionIds.length > 0) {
        const scoresResult = await supabase
          .from('submission_scores')
          .select('submission_id, capacidad_id, score')
          .in('submission_id', submissionIds)
        if (!scoresResult.error) scoresData = scoresResult.data
      }

      // Notas de clase de tareas con esa opción habilitada
      const assignmentIdsConNotaClase = assignResult.data.filter(function (a) { return a.habilitar_notas_clase }).map(function (a) { return a.id })
      const notaClaseTareaMap = {} // studentId__assignmentId -> nota
      if (assignmentIdsConNotaClase.length > 0) {
        const notasClaseResult = await supabase
          .from('notas_clase')
          .select('student_id, assignment_id, nota')
          .in('assignment_id', assignmentIdsConNotaClase)
        if (!notasClaseResult.error) {
          notasClaseResult.data.forEach(function (n) { notaClaseTareaMap[`${n.student_id}__${n.assignment_id}`] = n.nota })
        }
      }

      const now = new Date()
      const grouped = {}

      students.forEach(function (student) {
        if (ausenciaSet.has(student.id)) return // ausente sin justificar ese día, no se evalúa

        assignResult.data.forEach(function (assignment) {
          const capacidadIds = (assignment.assignment_capacidades || []).map(function (ac) { return ac.capacidad_id })
          const sub = submissionsData.find(function (s) { return s.student_id === student.id && s.assignment_id === assignment.id })
          const isPastDue = new Date(assignment.fecha_entrega) < now

          capacidadIds.forEach(function (capId) {
            const key = `${student.id}__${capId}`
            let notaTareaEfectiva = null
            if (sub && sub.publicado) {
              const scoreRow = scoresData.find(function (r) { return r.submission_id === sub.id && r.capacidad_id === capId })
              notaTareaEfectiva = scoreRow ? scoreRow.score : null
            }
            if (notaTareaEfectiva == null && isPastDue) notaTareaEfectiva = 0

            let notaFinal = notaTareaEfectiva
            if (assignment.habilitar_notas_clase) {
              const notaClaseVal = notaClaseTareaMap[`${student.id}__${assignment.id}`]
              notaFinal = average([notaClaseVal != null ? notaClaseVal : null, notaTareaEfectiva])
            }
            if (notaFinal == null) return
            if (!grouped[key]) grouped[key] = []
            grouped[key].push(notaFinal)
          })
        })
      })

      Object.keys(grouped).forEach(function (key) {
        cellValues[key] = average(grouped[key])
      })
    }

    // Sumar las notas de clase sueltas (sin tarea) al promedio de cada celda
    students.forEach(function (student) {
      if (ausenciaSet.has(student.id)) return
      capacidades.forEach(function (c) {
        const capId = c.capacidad.id
        const sueltaVal = notaClaseStandaloneMap[`${student.id}__${capId}`]
        if (sueltaVal == null) return
        const key = `${student.id}__${capId}`
        cellValues[key] = average([cellValues[key] != null ? cellValues[key] : null, sueltaVal])
      })
    })

    const unidadInfo = unidades.find(function (u) { return u.id === actividad.unidad_id })

    return {
      actividad: actividad,
      unidadInfo: unidadInfo,
      tipoInstrumento: actividad.tipo_instrumento || 'Lista de cotejo',
      capacidades: capacidades,
      students: students,
      cellValues: cellValues,
    }
  }

  async function loadMatrix(actividadId) {
    setSelectedId(actividadId)
    if (!actividadId) { setMatrix(null); return }
    setLoading(true)
    setError('')
    const actividad = activities.find(function (a) { return a.id === actividadId })
    const m = await computeMatrix(actividad)
    setMatrix(m)
    setLoading(false)
  }

  function toggleActividad(id) {
    setSelectedForExport(function (prev) {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function toggleCarpeta(unidadId, actividadesDeCarpeta) {
    setSelectedForExport(function (prev) {
      const next = new Set(prev)
      const todosMarcados = actividadesDeCarpeta.every(function (a) { return next.has(a.id) })
      actividadesDeCarpeta.forEach(function (a) {
        if (todosMarcados) next.delete(a.id); else next.add(a.id)
      })
      return next
    })
  }

  function selectAll() {
    setSelectedForExport(new Set(activities.map(function (a) { return a.id })))
  }

  function clearSelection() {
    setSelectedForExport(new Set())
  }

  // ============================================================
  // Construcción de una hoja Excel (reutilizable individual + masivo)
  // ============================================================
  function buildListaCotejoSheet(ws, m) {
    const a = m.actividad
    const totalCols = 2 + m.capacidades.length
    for (let i = 1; i <= totalCols; i++) {
      ws.getColumn(i).width = i === 1 ? 14.75 : i === 2 ? 43.375 : 21.625
    }

    function mergedRow(rowNum, text, fillArgb, fontArgb, size, bold) {
      ws.mergeCells(rowNum, 1, rowNum, totalCols)
      const cell = ws.getCell(rowNum, 1)
      cell.value = text
      cell.font = { bold: bold, size: size || 11, color: { argb: fontArgb || 'FF000000' } }
      if (fillArgb) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fillArgb } }
      cell.alignment = { vertical: 'middle', wrapText: true }
      ws.getRow(rowNum).height = size >= 14 ? 26 : 18
    }

    mergedRow(1, institucion, COLOR_INSTITUCION, 'FFFFFFFF', 16, true)
    mergedRow(2, 'LISTA DE COTEJO', COLOR_TITULO, 'FFFFFFFF', 14, true)

    const row3 = ws.getRow(3)
    ;[`Fecha: ${todayFormatted()}`, `Grado: ${courseGrado}° SECUNDARIA`, `Sección: ${courseGrupo}`].forEach(function (text, i) {
      const cell = row3.getCell(i + 1)
      cell.value = text
      cell.font = { bold: true, size: 11 }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_METADATA } }
    })

    mergedRow(4, `Propósito: ${a.proposito || '—'}`, COLOR_METADATA, 'FF000000', 11, false)
    mergedRow(5, `Competencia: ${a.competencia?.nombre || '—'}`, COLOR_METADATA, 'FF000000', 11, false)
    mergedRow(6, `N° de Actividad: ${a.numero_actividad}`, COLOR_METADATA, 'FF000000', 11, false)
    mergedRow(7, `Actividad: ${a.nombre}`, COLOR_METADATA, 'FF000000', 11, false)
    mergedRow(8, `Unidad: ${unidadTexto(m.unidadInfo)}`, COLOR_METADATA, 'FF000000', 11, false)

    let r = 10
    m.capacidades.forEach(function (cap) {
      mergedRow(r, cap.capacidad.nombre, COLOR_CAPACIDAD, 'FFFFFFFF', 12, true)
      r++
      mergedRow(r, `Criterio(s): ${textoCriterios(cap)}`, null, 'FF000000', 10, false)
      r++
      if (!(cap.criteriosLista && cap.criteriosLista.length > 0)) {
        mergedRow(r, `Desempeño: ${cap.desempeno || '—'}`, null, 'FF000000', 10, false)
        r++
      }
    })
    r++

    const headerRow = ws.getRow(r)
    ;['N°', 'Apellidos y Nombres', ...m.capacidades.map(function (cap) { return cap.capacidad.nombre })].forEach(function (text, i) {
      const cell = headerRow.getCell(i + 1)
      cell.value = text
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_TABLA_HEAD } }
      cell.border = { top: { style: 'medium' }, bottom: { style: 'medium' }, left: { style: 'medium' }, right: { style: 'medium' } }
      cell.alignment = { horizontal: 'center', vertical: 'middle' }
    })
    r++

    m.students.forEach(function (s, idx) {
      const row = ws.getRow(r)
      row.getCell(1).value = idx + 1
      row.getCell(2).value = s.full_name
      row.getCell(1).border = row.getCell(2).border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }
      m.capacidades.forEach(function (cap, ci) {
        const score = m.cellValues[`${s.id}__${cap.capacidad.id}`]
        const letra = score != null ? getLetterGrade(score) : '—'
        const cell = row.getCell(3 + ci)
        cell.value = letra
        cell.font = { bold: true, color: { argb: NIVEL_COLOR_ARGB[letra] || 'FF000000' } }
        cell.alignment = { horizontal: 'center' }
        cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }
      })
      r++
    })

    ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 }
  }

  function buildRubricaSheet(ws, m) {
    const a = m.actividad
    const totalCols = 4
    for (let i = 1; i <= totalCols; i++) ws.getColumn(i).width = 32

    function mergedRow(rowNum, text, fillArgb, fontArgb, size, bold) {
      ws.mergeCells(rowNum, 1, rowNum, totalCols)
      const cell = ws.getCell(rowNum, 1)
      cell.value = text
      cell.font = { bold: bold, size: size || 11, color: { argb: fontArgb || 'FF000000' } }
      if (fillArgb) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fillArgb } }
      cell.alignment = { vertical: 'middle', wrapText: true }
      ws.getRow(rowNum).height = size >= 14 ? 26 : 18
    }

    mergedRow(1, institucion, COLOR_INSTITUCION, 'FFFFFFFF', 16, true)
    mergedRow(2, 'RÚBRICA DE EVALUACIÓN', COLOR_TITULO, 'FFFFFFFF', 14, true)

    const row3 = ws.getRow(3)
    ;[`Fecha: ${todayFormatted()}`, `Grado: ${courseGrado}° SECUNDARIA`, `Sección: ${courseGrupo}`].forEach(function (text, i) {
      const cell = row3.getCell(i + 1)
      cell.value = text
      cell.font = { bold: true, size: 11 }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_METADATA } }
    })

    mergedRow(4, `Competencia: ${a.competencia?.nombre || '—'}`, COLOR_METADATA, 'FF000000', 11, false)
    mergedRow(5, `Propósito: ${a.proposito || '—'}`, COLOR_METADATA, 'FF000000', 11, false)
    mergedRow(6, `N° de Actividad: ${a.numero_actividad}`, COLOR_METADATA, 'FF000000', 11, false)
    mergedRow(7, `Actividad: ${a.nombre}`, COLOR_METADATA, 'FF000000', 11, false)
    mergedRow(8, `Unidad: ${unidadTexto(m.unidadInfo)}`, COLOR_METADATA, 'FF000000', 11, false)
    mergedRow(9, `Docente: ${profile?.full_name || ''}`, COLOR_METADATA, 'FF000000', 11, false)

    let r = 11
    m.capacidades.forEach(function (cap) {
      mergedRow(r, cap.capacidad.nombre, COLOR_CAPACIDAD, 'FFFFFFFF', 12, true)
      r++
      if (cap.criterio) {
        mergedRow(r, `Criterio: ${cap.criterio}`, null, 'FF000000', 10, false)
        r++
      }

      const nivelRow = ws.getRow(r)
      ;['AD', 'A', 'B', 'C'].forEach(function (letra, i) {
        const cell = nivelRow.getCell(i + 1)
        cell.value = letra
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NIVEL_COLOR_ARGB[letra] } }
        cell.alignment = { horizontal: 'center' }
      })
      r++

      const descRow = ws.getRow(r)
      ;[cap.desc_ad, cap.desc_a, cap.desc_b, cap.desc_c].forEach(function (text, i) {
        const cell = descRow.getCell(i + 1)
        cell.value = text || '—'
        cell.alignment = { wrapText: true, vertical: 'top' }
        cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }
      })
      r += 2

      const headerRow = ws.getRow(r)
      ;['N°', 'Apellidos y Nombres', 'Calificación'].forEach(function (text, i) {
        const cell = headerRow.getCell(i + 1)
        cell.value = text
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_TABLA_HEAD } }
        cell.alignment = { horizontal: 'center' }
      })
      r++

      m.students.forEach(function (s, idx) {
        const score = m.cellValues[`${s.id}__${cap.capacidad.id}`]
        const letra = score != null ? getLetterGrade(score) : '—'
        const row = ws.getRow(r)
        row.getCell(1).value = idx + 1
        row.getCell(2).value = s.full_name
        row.getCell(3).value = letra
        row.getCell(3).font = { bold: true, color: { argb: NIVEL_COLOR_ARGB[letra] || 'FF000000' } }
        for (let c = 1; c <= 3; c++) {
          row.getCell(c).border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }
        }
        r++
      })
      r++
    })

    ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 }
  }

  // ============================================================
  // Dibujo de una página PDF (reutilizable individual + masivo)
  // ============================================================
  function drawListaCotejoPDF(doc, m) {
    const a = m.actividad
    const pageWidth = doc.internal.pageSize.getWidth()
    let y = 4

    y = coloredBlock(doc, y, institucion, RGB_INSTITUCION, [255, 255, 255], 14, true, pageWidth)
    y = coloredBlock(doc, y, 'LISTA DE COTEJO', RGB_TITULO, [255, 255, 255], 12, true, pageWidth, 'center')
    y = coloredBlock(doc, y, `Fecha: ${todayFormatted()}   Grado: ${courseGrado}° SECUNDARIA   Sección: ${courseGrupo}`, RGB_METADATA, [0, 0, 0], 9, true, pageWidth)
    y = coloredBlock(doc, y, `Propósito: ${a.proposito || '—'}`, RGB_METADATA, [0, 0, 0], 8, false, pageWidth)
    y = coloredBlock(doc, y, `Competencia: ${a.competencia?.nombre || '—'}`, RGB_METADATA, [0, 0, 0], 8, false, pageWidth)
    y = coloredBlock(doc, y, `N° de Actividad: ${a.numero_actividad}`, RGB_METADATA, [0, 0, 0], 8, false, pageWidth)
    y = coloredBlock(doc, y, `Actividad: ${a.nombre}`, RGB_METADATA, [0, 0, 0], 8, false, pageWidth)
    y = coloredBlock(doc, y, `Unidad: ${unidadTexto(m.unidadInfo)}`, RGB_METADATA, [0, 0, 0], 8, false, pageWidth)
    y += 1.5

    m.capacidades.forEach(function (cap) {
      if (y > doc.internal.pageSize.getHeight() - 50) { doc.addPage(); y = 4 }
      y = coloredBlock(doc, y, cap.capacidad.nombre, RGB_CAPACIDAD, [255, 255, 255], 10, true, pageWidth)
      y = coloredBlock(doc, y, `Criterio(s): ${textoCriterios(cap)}`, null, [0, 0, 0], 8, false, pageWidth)
      if (!(cap.criteriosLista && cap.criteriosLista.length > 0)) {
        y = coloredBlock(doc, y, `Desempeño: ${cap.desempeno || '—'}`, null, [0, 0, 0], 8, false, pageWidth)
      }
    })
    y += 1.5

    const head = [['N°', 'Apellidos y Nombres', ...m.capacidades.map(function (cap) { return cap.capacidad.nombre })]]
    const body = m.students.map(function (s, idx) {
      const row = [idx + 1, s.full_name]
      m.capacidades.forEach(function (cap) {
        const score = m.cellValues[`${s.id}__${cap.capacidad.id}`]
        row.push(score != null ? getLetterGrade(score) : '—')
      })
      return row
    })

    autoTable(doc, {
      startY: y,
      head: head,
      body: body,
      styles: { fontSize: 8, halign: 'center' },
      headStyles: { fillColor: RGB_TABLA_HEAD, textColor: [255, 255, 255] },
      columnStyles: { 1: { halign: 'left' } },
      margin: { left: 10, right: 10 },
      didParseCell: function (data) {
        if (data.section === 'body' && data.column.index >= 2) {
          const val = data.cell.raw
          if (RGB_NIVEL[val]) {
            data.cell.styles.textColor = RGB_NIVEL[val]
            data.cell.styles.fontStyle = 'bold'
          }
        }
      },
    })
  }

  function drawRubricaPDF(doc, m) {
    const a = m.actividad
    const pageWidth = doc.internal.pageSize.getWidth()
    let y = 4

    y = coloredBlock(doc, y, institucion, RGB_INSTITUCION, [255, 255, 255], 14, true, pageWidth)
    y = coloredBlock(doc, y, 'RÚBRICA DE EVALUACIÓN', RGB_TITULO, [255, 255, 255], 12, true, pageWidth, 'center')
    y = coloredBlock(doc, y, `Fecha: ${todayFormatted()}   Grado: ${courseGrado}° SECUNDARIA   Sección: ${courseGrupo}`, RGB_METADATA, [0, 0, 0], 9, true, pageWidth)
    y = coloredBlock(doc, y, `Competencia: ${a.competencia?.nombre || '—'}`, RGB_METADATA, [0, 0, 0], 8, false, pageWidth)
    y = coloredBlock(doc, y, `Propósito: ${a.proposito || '—'}`, RGB_METADATA, [0, 0, 0], 8, false, pageWidth)
    y = coloredBlock(doc, y, `N° de Actividad: ${a.numero_actividad}`, RGB_METADATA, [0, 0, 0], 8, false, pageWidth)
    y = coloredBlock(doc, y, `Actividad: ${a.nombre}`, RGB_METADATA, [0, 0, 0], 8, false, pageWidth)
    y = coloredBlock(doc, y, `Unidad: ${unidadTexto(m.unidadInfo)}`, RGB_METADATA, [0, 0, 0], 8, false, pageWidth)
    y = coloredBlock(doc, y, `Docente: ${profile?.full_name || ''}`, RGB_METADATA, [0, 0, 0], 8, false, pageWidth)
    y += 1.5

    m.capacidades.forEach(function (cap) {
      if (y > doc.internal.pageSize.getHeight() - 70) { doc.addPage(); y = 4 }
      y = coloredBlock(doc, y, cap.capacidad.nombre, RGB_CAPACIDAD, [255, 255, 255], 10, true, pageWidth)
      if (cap.criterio) {
        y = coloredBlock(doc, y, `Criterio: ${cap.criterio}`, null, [0, 0, 0], 8, false, pageWidth)
      }

      autoTable(doc, {
        startY: y,
        head: [['AD', 'A', 'B', 'C']],
        body: [NIVELES.map(function (n) { return cap['desc_' + n.letra.toLowerCase()] || '—' })],
        styles: { fontSize: 7 },
        margin: { left: 10, right: 10 },
        didParseCell: function (data) {
          if (data.section === 'head') {
            const letras = ['AD', 'A', 'B', 'C']
            data.cell.styles.fillColor = RGB_NIVEL[letras[data.column.index]]
            data.cell.styles.textColor = [255, 255, 255]
          }
        },
      })
      y = doc.lastAutoTable.finalY + 3

      const rosterBody = m.students.map(function (s, idx) {
        const score = m.cellValues[`${s.id}__${cap.capacidad.id}`]
        const letra = score != null ? getLetterGrade(score) : '—'
        return [idx + 1, s.full_name, letra]
      })
      autoTable(doc, {
        startY: y,
        head: [['N°', 'Apellidos y Nombres', 'Calificación']],
        body: rosterBody,
        styles: { fontSize: 7 },
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
      y = doc.lastAutoTable.finalY + 8
    })
  }

  // ============================================================
  // Exportar UNA sola actividad (vista actual)
  // ============================================================
  async function exportarActualExcel() {
    if (!institucion.trim()) { alert('Este curso no tiene una Institución asignada. Ve a "Cursos" y asígnala antes de exportar.'); return }
    const workbook = new ExcelJS.Workbook()
    const ws = workbook.addWorksheet(matrix.tipoInstrumento === 'Rúbrica' ? 'Rúbrica' : 'Lista de Cotejo')
    if (matrix.tipoInstrumento === 'Rúbrica') buildRubricaSheet(ws, matrix)
    else buildListaCotejoSheet(ws, matrix)
    const a = matrix.actividad
    await descargarWorkbook(workbook, `${matrix.tipoInstrumento === 'Rúbrica' ? 'Rubrica' : 'Lista_Cotejo'}_${courseNombre}_Actividad${a.numero_actividad}.xlsx`)
  }

  function exportarActualPDF() {
    if (!institucion.trim()) { alert('Este curso no tiene una Institución asignada. Ve a "Cursos" y asígnala antes de exportar.'); return }
    const doc = new jsPDF({ orientation: 'landscape', format: 'a4' })
    if (matrix.tipoInstrumento === 'Rúbrica') drawRubricaPDF(doc, matrix)
    else drawListaCotejoPDF(doc, matrix)
    const a = matrix.actividad
    doc.save(`${matrix.tipoInstrumento === 'Rúbrica' ? 'Rubrica' : 'Lista_Cotejo'}_${courseNombre}_Actividad${a.numero_actividad}.pdf`)
  }

  // ============================================================
  // Exportar VARIAS actividades seleccionadas (checkboxes)
  // ============================================================
  async function exportarSeleccionadosExcel() {
    if (!institucion.trim()) { alert('Este curso no tiene una Institución asignada. Ve a "Cursos" y asígnala antes de exportar.'); return }
    if (selectedForExport.size === 0) { alert('Marca al menos una actividad para exportar.'); return }
    setExporting(true)

    const seleccionadas = activities.filter(function (a) { return selectedForExport.has(a.id) })
    const workbook = new ExcelJS.Workbook()

    for (const act of seleccionadas) {
      const m = await computeMatrix(act)
      if (!m || m.capacidades.length === 0) continue
      const rawName = `Act${act.numero_actividad}-${act.nombre}`
      const sheetName = rawName.replace(/[\\/*?:[\]]/g, '').slice(0, 31)
      const ws = workbook.addWorksheet(sheetName || `Actividad ${act.numero_actividad}`)
      if (m.tipoInstrumento === 'Rúbrica') buildRubricaSheet(ws, m)
      else buildListaCotejoSheet(ws, m)
    }

    await descargarWorkbook(workbook, `Instrumentos_${courseNombre}.xlsx`)
    setExporting(false)
  }

  async function exportarSeleccionadosPDF() {
    if (!institucion.trim()) { alert('Este curso no tiene una Institución asignada. Ve a "Cursos" y asígnala antes de exportar.'); return }
    if (selectedForExport.size === 0) { alert('Marca al menos una actividad para exportar.'); return }
    setExporting(true)

    const seleccionadas = activities.filter(function (a) { return selectedForExport.has(a.id) })
    const doc = new jsPDF({ orientation: 'landscape', format: 'a4' })
    let first = true

    for (const act of seleccionadas) {
      const m = await computeMatrix(act)
      if (!m || m.capacidades.length === 0) continue
      if (!first) doc.addPage()
      first = false
      if (m.tipoInstrumento === 'Rúbrica') drawRubricaPDF(doc, m)
      else drawListaCotejoPDF(doc, m)
    }

    doc.save(`Instrumentos_${courseNombre}.pdf`)
    setExporting(false)
  }

  const actividadesPorUnidad = unidades.map(function (u) {
    return { unidad: u, actividades: activities.filter(function (a) { return a.unidad_id === u.id }) }
  }).filter(function (grupo) { return grupo.actividades.length > 0 })

  const sinCarpeta = activities.filter(function (a) { return !a.unidad_id })

  return (
    <div>
      <h3 className="text-lg font-bold mb-1" style={{ color: NAVY_DARK }}>Instrumento de Evaluación</h3>
      <p className="text-xs text-slate-400 mb-5">
        Institución: <strong>{institucion || 'Sin asignar (revisa la Institución del curso en "Cursos")'}</strong>
      </p>

      {/* ===================== Ver una actividad ===================== */}
      <div className="mb-8 pb-6" style={{ borderBottom: '2px solid #E5E9F0' }}>
        <h4 className="text-sm font-bold mb-3" style={{ color: NAVY_DARK }}>Ver una actividad</h4>
        <div className="max-w-md mb-3">
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

        {matrix && matrix.capacidades.length > 0 && (
          <div className="flex gap-2 mb-3">
            <button onClick={exportarActualExcel} className="text-xs font-semibold px-4 py-2 rounded-lg text-white transition hover:opacity-90" style={{ backgroundColor: '#2563EB' }}>
              Exportar Excel
            </button>
            <button onClick={exportarActualPDF} className="text-xs font-semibold px-4 py-2 rounded-lg text-white transition hover:opacity-90" style={{ backgroundColor: GREEN }}>
              Exportar PDF
            </button>
          </div>
        )}

        {error && <p className="text-red-500 text-sm mb-3">{error}</p>}

        {selectedId && (
          loading ? (
            <p className="text-slate-400 text-sm">Cargando...</p>
          ) : !matrix || matrix.capacidades.length === 0 ? (
            <p className="text-slate-400 text-sm">Esta actividad no tiene capacidades vinculadas.</p>
          ) : matrix.tipoInstrumento === 'Rúbrica' ? (
            <RubricaView matrix={matrix} courseGrado={courseGrado} courseGrupo={courseGrupo} docente={profile?.full_name} />
          ) : (
            <ListaCotejoView matrix={matrix} courseGrado={courseGrado} courseGrupo={courseGrupo} />
          )
        )}
      </div>

      {/* ===================== Exportación masiva ===================== */}
      <div>
        <div className="flex justify-between items-center mb-3 flex-wrap gap-2">
          <h4 className="text-sm font-bold" style={{ color: NAVY_DARK }}>Exportar varios instrumentos</h4>
          <div className="flex gap-2">
            <button onClick={selectAll} className="text-xs font-semibold px-3 py-1.5 rounded-lg transition" style={{ backgroundColor: 'white', color: NAVY, border: '1px solid #D6DCE5' }}>
              Marcar todo
            </button>
            <button onClick={clearSelection} className="text-xs font-semibold px-3 py-1.5 rounded-lg transition" style={{ backgroundColor: 'white', color: NAVY, border: '1px solid #D6DCE5' }}>
              Desmarcar todo
            </button>
          </div>
        </div>

        {loading ? (
          <p className="text-slate-400 text-sm">Cargando...</p>
        ) : activities.length === 0 ? (
          <p className="text-slate-400 text-sm">Aún no hay actividades en este curso.</p>
        ) : (
          <div className="space-y-4 mb-4">
            {actividadesPorUnidad.map(function (grupo) {
              const todosMarcados = grupo.actividades.every(function (a) { return selectedForExport.has(a.id) })
              return (
                <div key={grupo.unidad.id} className="rounded-xl p-4" style={{ backgroundColor: '#F4F6F9', border: '1px solid #E5E9F0' }}>
                  <label className="flex items-center gap-2 mb-2 cursor-pointer">
                    <input type="checkbox" checked={todosMarcados} onChange={function () { toggleCarpeta(grupo.unidad.id, grupo.actividades) }} />
                    <span className="text-sm font-bold" style={{ color: NAVY_DARK }}>
                      {grupo.unidad.tipo} {grupo.unidad.numero}{grupo.unidad.nombre ? ` · ${grupo.unidad.nombre}` : ''}
                    </span>
                  </label>
                  <div className="pl-6 space-y-1.5">
                    {grupo.actividades.map(function (a) {
                      return (
                        <label key={a.id} className="flex items-center gap-2 text-sm cursor-pointer">
                          <input type="checkbox" checked={selectedForExport.has(a.id)} onChange={function () { toggleActividad(a.id) }} />
                          <span style={{ color: NAVY_DARK }}>Actividad {a.numero_actividad} · {a.nombre}</span>
                        </label>
                      )
                    })}
                  </div>
                </div>
              )
            })}

            {sinCarpeta.length > 0 && (
              <div className="rounded-xl p-4" style={{ backgroundColor: '#F4F6F9', border: '1px solid #E5E9F0' }}>
                <p className="text-sm font-bold mb-2" style={{ color: NAVY_DARK }}>Sin carpeta</p>
                <div className="space-y-1.5">
                  {sinCarpeta.map(function (a) {
                    return (
                      <label key={a.id} className="flex items-center gap-2 text-sm cursor-pointer">
                        <input type="checkbox" checked={selectedForExport.has(a.id)} onChange={function () { toggleActividad(a.id) }} />
                        <span style={{ color: NAVY_DARK }}>Actividad {a.numero_actividad} · {a.nombre}</span>
                      </label>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="flex gap-2">
          <button
            onClick={exportarSeleccionadosExcel}
            disabled={exporting}
            className="text-xs font-semibold px-4 py-2 rounded-lg text-white transition hover:opacity-90 disabled:opacity-50"
            style={{ backgroundColor: '#2563EB' }}
          >
            {exporting ? 'Generando...' : `Exportar seleccionados a Excel (${selectedForExport.size})`}
          </button>
          <button
            onClick={exportarSeleccionadosPDF}
            disabled={exporting}
            className="text-xs font-semibold px-4 py-2 rounded-lg text-white transition hover:opacity-90 disabled:opacity-50"
            style={{ backgroundColor: GREEN }}
          >
            {exporting ? 'Generando...' : `Exportar seleccionados a PDF (${selectedForExport.size})`}
          </button>
        </div>
      </div>
    </div>
  )
}

function HeaderBlock({ courseGrado, courseGrupo, extra }) {
  return (
    <table style={{ borderCollapse: 'collapse', width: '100%', marginBottom: '16px' }}>
      <tbody>
        <tr>
          <td style={tableHeadCell}>Fecha:</td>
          <td style={tableCell}>{todayFormatted()}</td>
          <td style={tableHeadCell}>Grado:</td>
          <td style={tableCell}>{courseGrado}° SECUNDARIA</td>
          <td style={tableHeadCell}>Sección:</td>
          <td style={tableCell}>{courseGrupo}</td>
        </tr>
        {extra}
      </tbody>
    </table>
  )
}

function ListaCotejoView({ matrix, courseGrado, courseGrupo }) {
  const a = matrix.actividad
  return (
    <div className="overflow-auto" style={{ maxHeight: '70vh' }}>
      <h2 className="text-center text-lg font-bold mb-3" style={{ color: NAVY_DARK }}>LISTA DE COTEJO</h2>
      <HeaderBlock
        courseGrado={courseGrado}
        courseGrupo={courseGrupo}
        extra={
          <>
            <tr>
              <td style={tableHeadCell}>Propósito:</td>
              <td style={tableCell} colSpan={5}>{a.proposito || '—'}</td>
            </tr>
            <tr>
              <td style={tableHeadCell}>Competencia:</td>
              <td style={tableCell} colSpan={5}>{a.competencia?.nombre || '—'}</td>
            </tr>
            <tr>
              <td style={tableHeadCell}>N° de Actividad:</td>
              <td style={tableCell} colSpan={5}>{a.numero_actividad}</td>
            </tr>
            <tr>
              <td style={tableHeadCell}>Actividad:</td>
              <td style={tableCell} colSpan={5}>{a.nombre}</td>
            </tr>
            <tr>
              <td style={tableHeadCell}>Unidad:</td>
              <td style={tableCell} colSpan={5}>{unidadTexto(matrix.unidadInfo)}</td>
            </tr>
          </>
        }
      />

      <table style={{ borderCollapse: 'collapse', width: '100%', tableLayout: 'fixed' }}>
        <thead>
          <tr>
            <td style={{ ...tableHeadCell, textAlign: 'center' }} colSpan={matrix.capacidades.length}>
              CRITERIO DE EVALUACIÓN
            </td>
          </tr>
          <tr>
            {matrix.capacidades.map(function (cap) {
              return (
                <td
                  key={cap.capacidad.id}
                  style={{ ...tableHeadCell, textAlign: 'center', width: `${100 / matrix.capacidades.length}%` }}
                >
                  {cap.capacidad.nombre}
                </td>
              )
            })}
          </tr>
          <tr>
            {matrix.capacidades.map(function (cap) {
              const tieneListaCriterios = cap.criteriosLista && cap.criteriosLista.length > 0
              return (
                <td
                  key={cap.capacidad.id}
                  style={{
                    ...tableCell,
                    color: '#2563EB',
                    verticalAlign: 'top',
                    width: `${100 / matrix.capacidades.length}%`,
                    wordBreak: 'break-word',
                    whiteSpace: 'normal',
                  }}
                >
                  {tieneListaCriterios ? (
                    <ul style={{ margin: 0, paddingLeft: 16 }}>
                      {cap.criteriosLista.map(function (c, i) {
                        return <li key={i} style={{ marginBottom: 2 }}>{c.texto}</li>
                      })}
                    </ul>
                  ) : (
                    <>
                      <p style={{ marginBottom: 4 }}><strong>Criterio:</strong> {cap.criterio || '—'}</p>
                      <p style={{ color: NAVY_DARK }}><strong>Desempeño:</strong> {cap.desempeno || '—'}</p>
                    </>
                  )}
                </td>
              )
            })}
          </tr>
        </thead>
      </table>

      <table style={{ borderCollapse: 'collapse', width: '100%', marginTop: '-1px', tableLayout: 'fixed' }}>
        <thead style={{ position: 'sticky', top: 0, zIndex: 20 }}>
          <tr>
            <td style={{ ...tableHeadCell, width: 40 }}>N°</td>
            <td style={{ ...tableHeadCell, width: 220 }}>APELLIDOS Y NOMBRES</td>
            {matrix.capacidades.map(function (cap) {
              return (
                <td key={cap.capacidad.id} style={{ ...tableHeadCell, textAlign: 'center' }}>
                  {cap.capacidad.nombre}
                </td>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {matrix.students.map(function (s, idx) {
            return (
              <tr key={s.id}>
                <td style={{ ...tableCell, textAlign: 'center' }}>{idx + 1}</td>
                <td style={tableCell}>{s.full_name}</td>
                {matrix.capacidades.map(function (cap) {
                  const score = matrix.cellValues[`${s.id}__${cap.capacidad.id}`]
                  const letra = score != null ? getLetterGrade(score) : null
                  const nivel = letra ? NIVELES.find(function (n) { return n.letra === letra }) : null
                  return (
                    <td key={cap.capacidad.id} style={{ ...tableCell, textAlign: 'center' }}>
                      {letra ? (
                        <span style={{ fontWeight: 700, color: nivel?.color }}>{letra}</span>
                      ) : (
                        <span style={{ color: '#94A3B8' }}>—</span>
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
  )
}

function RubricaView({ matrix, courseGrado, courseGrupo, docente }) {
  const a = matrix.actividad
  return (
    <div className="overflow-auto space-y-8" style={{ maxHeight: '70vh' }}>
      <h2 className="text-center text-lg font-bold" style={{ color: NAVY_DARK }}>RÚBRICA DE EVALUACIÓN</h2>
      <HeaderBlock
        courseGrado={courseGrado}
        courseGrupo={courseGrupo}
        extra={
          <>
            <tr>
              <td style={tableHeadCell}>Competencia:</td>
              <td style={tableCell} colSpan={5}>{a.competencia?.nombre || '—'}</td>
            </tr>
            <tr>
              <td style={tableHeadCell}>Propósito:</td>
              <td style={tableCell} colSpan={5}>{a.proposito || '—'}</td>
            </tr>
            <tr>
              <td style={tableHeadCell}>N° de Actividad:</td>
              <td style={tableCell} colSpan={5}>{a.numero_actividad}</td>
            </tr>
            <tr>
              <td style={tableHeadCell}>Actividad:</td>
              <td style={tableCell} colSpan={5}>{a.nombre}</td>
            </tr>
            <tr>
              <td style={tableHeadCell}>Unidad:</td>
              <td style={tableCell} colSpan={5}>{unidadTexto(matrix.unidadInfo)}</td>
            </tr>
            <tr>
              <td style={tableHeadCell}>Docente:</td>
              <td style={tableCell} colSpan={5}>{docente || '—'}</td>
            </tr>
          </>
        }
      />

      {matrix.capacidades.map(function (cap) {
        return (
          <div key={cap.capacidad.id}>
            <table style={{ borderCollapse: 'collapse', width: '100%' }}>
              <thead>
                <tr>
                  <td style={{ ...tableHeadCell, textAlign: 'center' }} colSpan={5}>CAPACIDADES/CRITERIOS</td>
                </tr>
                <tr>
                  <td style={{ ...tableCell, width: '18%', fontWeight: 700, color: NAVY_DARK }}>
                    {cap.capacidad.nombre}
                    {cap.criterio && <p style={{ fontWeight: 400, marginTop: 4, color: '#475569' }}>{cap.criterio}</p>}
                  </td>
                  {NIVELES.map(function (n) {
                    const descKey = 'desc_' + n.letra.toLowerCase()
                    return (
                      <td key={n.letra} style={{ ...tableCell, verticalAlign: 'top' }}>
                        <p style={{ fontWeight: 700, color: n.color, marginBottom: 4 }}>{n.letra}</p>
                        <p>{cap[descKey] || '—'}</p>
                      </td>
                    )
                  })}
                </tr>
              </thead>
            </table>

            <table style={{ borderCollapse: 'collapse', width: '100%', marginTop: '-1px' }}>
              <thead style={{ position: 'sticky', top: 0, zIndex: 20 }}>
                <tr>
                  <td style={{ ...tableHeadCell, width: 40 }}>N°</td>
                  <td style={{ ...tableHeadCell, minWidth: 220 }}>Apellidos y Nombres</td>
                  <td style={{ ...tableHeadCell, textAlign: 'center' }}>Calificación</td>
                </tr>
              </thead>
              <tbody>
                {matrix.students.map(function (s, idx) {
                  const score = matrix.cellValues[`${s.id}__${cap.capacidad.id}`]
                  const nivel = score != null ? NIVELES.find(function (n) { return n.letra === getLetterGrade(score) }) : null
                  return (
                    <tr key={s.id}>
                      <td style={{ ...tableCell, textAlign: 'center' }}>{idx + 1}</td>
                      <td style={tableCell}>{s.full_name}</td>
                      <td style={{ ...tableCell, textAlign: 'center' }}>
                        {nivel ? (
                          <span style={{ fontWeight: 700, color: nivel.color }}>{nivel.letra}</span>
                        ) : (
                          <span style={{ color: '#94A3B8' }}>—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )
      })}
    </div>
  )
}
