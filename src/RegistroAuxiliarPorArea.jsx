import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import { getLetterGrade, getLetterColor, compararPorApellido } from './gradeUtils'
import ExcelJS from 'exceljs'

const NAVY_DARK = '#0F2A4A'
const GREEN = '#5DAA47'

const COLOR_INSTITUCION = 'FF1F4E79'
const COLOR_TITULO = 'FF2E75B6'
const COLOR_METADATA = 'FFDEEBF7'
const COLOR_COMPETENCIA = 'FF548235'
const COLOR_CAPACIDAD = 'FFE2EFDA'
const COLOR_TABLA_HEAD = 'FF1F4E79'
const COLOR_CIERRE = 'FFFFF2CC'
const NIVEL_COLOR_ARGB = { AD: 'FF2F7A1F', A: 'FF1D5C8F', B: 'FFB45309', C: 'FFB91C1C' }

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

const BIMESTRES = [1, 2, 3, 4]
const NOMBRE_BIMESTRE = { 1: 'I Bimestre', 2: 'II Bimestre', 3: 'III Bimestre', 4: 'IV Bimestre' }

const NIVELES_INFO = [
  { letra: 'AD', nombre: 'Logro destacado', color: '#1d5c8f', bg: '#DEEBF7' },
  { letra: 'A', nombre: 'Logro esperado', color: '#2f7a1f', bg: '#E7F3E4' },
  { letra: 'B', nombre: 'En proceso', color: '#B45309', bg: '#FFF7E6' },
  { letra: 'C', nombre: 'En inicio', color: '#B91C1C', bg: '#FDECEC' },
]

function average(numbers) {
  const validos = numbers.filter(function (n) { return n != null })
  if (validos.length === 0) return null
  return validos.reduce(function (a, b) { return a + b }, 0) / validos.length
}

function ciclo(grado) {
  return grado <= 2 ? 'VI' : 'VII'
}

export default function RegistroAuxiliarPorArea({ courseId }) {
  const [bimestre, setBimestre] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [ficha, setFicha] = useState(null)
  const [competenciasData, setCompetenciasData] = useState([])
  const [students, setStudents] = useState([])
  const [abierto, setAbierto] = useState(null)

  useEffect(function () {
    cargarTodo()
  }, [bimestre])

  async function cargarTodo() {
    setLoading(true)
    setError('')

    const courseResult = await supabase
      .from('courses')
      .select('grado, grupo, institucion_id, asignaturas(area_id, nombre, areas_curriculares(nombre))')
      .eq('id', courseId)
      .single()

    if (courseResult.error || !courseResult.data?.asignaturas) {
      setError('No se pudo determinar el Área de este curso.')
      setLoading(false)
      return
    }
    const areaId = courseResult.data.asignaturas.area_id
    const areaNombre = courseResult.data.asignaturas.areas_curriculares?.nombre
    const grado = courseResult.data.grado
    const grupo = courseResult.data.grupo

    let institucion = null
    if (courseResult.data.institucion_id) {
      const instResult = await supabase
        .from('instituciones_educativas')
        .select('*')
        .eq('id', courseResult.data.institucion_id)
        .single()
      if (!instResult.error) institucion = instResult.data
    }

    // Todas las asignaturas (cursos) de esta Área, para este Grado y Sección
    const coursesResult = await supabase
      .from('courses')
      .select('id, nombre, docente:profiles(full_name), asignaturas!inner(area_id)')
      .eq('grado', grado)
      .eq('grupo', grupo)
      .eq('asignaturas.area_id', areaId)
    if (coursesResult.error) {
      setError(coursesResult.error.message)
      setLoading(false)
      return
    }
    const courseIds = coursesResult.data.map(function (c) { return c.id })
    const docentesUnicos = [...new Set(coursesResult.data.map(function (c) { return c.docente?.full_name }).filter(Boolean))]
    const mapaAbreviaturas = {}
    coursesResult.data.forEach(function (c) {
      mapaAbreviaturas[c.id] = (c.nombre || '').slice(0, 3)
    })

    // Competencias y capacidades del área
    const compResult = await supabase.from('competencias').select('*').eq('area', areaNombre).order('codigo')
    if (compResult.error) {
      setError(compResult.error.message)
      setLoading(false)
      return
    }
    const competencias = compResult.data
    const competenciaIds = competencias.map(function (c) { return c.id })

    const capResult = await supabase.from('capacidades').select('*').in('competencia_id', competenciaIds).order('orden')
    const capacidades = capResult.error ? [] : capResult.data

    // Unidades de este bimestre, compartidas por toda el Área+Grado+Sección
    const unidResult = await supabase
      .from('unidades')
      .select('id, numero, finalizada')
      .eq('area_id', areaId)
      .eq('grado', grado)
      .eq('grupo', grupo)
    const unidadesBimestre = (unidResult.error ? [] : unidResult.data).filter(function (u) {
      return Math.ceil(u.numero / 2) === bimestre
    })
    const unidadIds = unidadesBimestre.map(function (u) { return u.id })
    const unidadIdsFinalizadas = unidadesBimestre.filter(function (u) { return u.finalizada }).map(function (u) { return u.id })

    let actividades = []
    let assignments = []
    if (unidadIds.length > 0) {
      const actResult = await supabase
        .from('actividades')
        .select('id, nombre, numero_actividad, unidad_id, course_id, actividad_capacidades(capacidad_id, criterio, desempeno)')
        .in('unidad_id', unidadIds)
      actividades = actResult.error ? [] : actResult.data

      const actIds = actividades.map(function (a) { return a.id })
      if (actIds.length > 0) {
        const assignResult = await supabase
          .from('assignments')
          .select('id, titulo, actividad_id, assignment_capacidades(capacidad_id)')
          .in('actividad_id', actIds)
        assignments = assignResult.error ? [] : assignResult.data
      }
    }

    // Estudiantes matriculados en el aula (vía cualquiera de sus cursos)
    let studentsList = []
    if (courseIds.length > 0) {
      const enrollResult = await supabase
        .from('enrollments')
        .select('student:profiles(id, full_name)')
        .in('course_id', courseIds)
        .eq('status', 'activo')
      if (!enrollResult.error) {
        const seen = new Set()
        enrollResult.data.forEach(function (e) {
          if (e.student && !seen.has(e.student.id)) {
            seen.add(e.student.id)
            studentsList.push(e.student)
          }
        })
        studentsList.sort(function (a, b) { return compararPorApellido(a.full_name, b.full_name) })
      }
    }
    setStudents(studentsList)

    // Notas de tareas (publicadas)
    const assignmentIds = assignments.map(function (a) { return a.id })
    let notaTareaMap = {} // studentId__assignmentId__capacidadId -> score
    if (assignmentIds.length > 0) {
      const subsResult = await supabase
        .from('submissions')
        .select('id, student_id, assignment_id, publicado')
        .in('assignment_id', assignmentIds)
      const submissionsData = subsResult.error ? [] : subsResult.data
      const submissionIds = submissionsData.map(function (s) { return s.id })
      const subMap = {}
      submissionsData.forEach(function (s) { subMap[s.id] = s })

      if (submissionIds.length > 0) {
        const scoresResult = await supabase
          .from('submission_scores')
          .select('submission_id, capacidad_id, score')
          .in('submission_id', submissionIds)
        if (!scoresResult.error) {
          scoresResult.data.forEach(function (row) {
            const sub = subMap[row.submission_id]
            if (!sub || !sub.publicado) return
            const key = `${sub.student_id}__${sub.assignment_id}__${row.capacidad_id}`
            notaTareaMap[key] = row.score
          })
        }
      }
    }

    // Notas de cierre de unidad (por competencia) — solo de Unidades ya finalizadas
    let cierreMap = {} // studentId__competenciaId -> [notas]
    if (unidadIdsFinalizadas.length > 0) {
      const cierreResult = await supabase
        .from('evaluacion_cierre')
        .select('student_id, competencia_id, nota_numerica, estado')
        .in('unidad_id', unidadIdsFinalizadas)
        .eq('estado', 'confirmada')
      if (!cierreResult.error) {
        cierreResult.data.forEach(function (row) {
          const key = `${row.student_id}__${row.competencia_id}`
          if (!cierreMap[key]) cierreMap[key] = []
          cierreMap[key].push(row.nota_numerica)
        })
      }
    }

    // Armar estructura: Competencia > Capacidad > Instancias (Actividad+Tarea con criterio/desempeño)
    const estructura = competencias.map(function (comp) {
      const capsDeEstaCompetencia = capacidades
        .filter(function (c) { return c.competencia_id === comp.id })
        .map(function (cap) {
          const instancias = []
          assignments.forEach(function (a) {
            const tieneCapacidad = (a.assignment_capacidades || []).some(function (ac) { return ac.capacidad_id === cap.id })
            if (!tieneCapacidad) return
            const actividad = actividades.find(function (act) { return act.id === a.actividad_id })
            const detalleCap = (actividad?.actividad_capacidades || []).find(function (ac) { return ac.capacidad_id === cap.id })
            instancias.push({
              assignmentId: a.id,
              tituloTarea: a.titulo,
              actividadNombre: actividad?.nombre,
              actividadNumero: actividad?.numero_actividad,
              asignaturaAbrev: mapaAbreviaturas[actividad?.course_id] || '',
              criterio: detalleCap?.criterio || '',
              desempeno: detalleCap?.desempeno || '',
            })
          })
          return { ...cap, instancias: instancias }
        })
      return { ...comp, capacidades: capsDeEstaCompetencia }
    })

    setCompetenciasData(estructura)
    setFicha({
      institucion: institucion?.nombre || '',
      ugel: institucion?.ugel || '',
      dre: institucion?.dre || '',
      director: institucion?.director || '',
      docentes: docentesUnicos.join(', ') || '—',
      area: areaNombre,
      grado: grado,
      grupo: grupo,
      ciclo: ciclo(grado),
      anio: new Date().getFullYear(),
      totalEstudiantes: studentsList.length,
      cierreMap: cierreMap,
      notaTareaMap: notaTareaMap,
    })

    setLoading(false)
  }

  function notaTarea(studentId, assignmentId, capacidadId) {
    const v = ficha?.notaTareaMap?.[`${studentId}__${assignmentId}__${capacidadId}`]
    return v != null ? v : null
  }

  function notaCierre(studentId, competenciaId) {
    const arr = ficha?.cierreMap?.[`${studentId}__${competenciaId}`]
    return arr ? average(arr) : null
  }

  function promedioCapacidad(studentId, cap) {
    const notas = cap.instancias.map(function (inst) { return notaTarea(studentId, inst.assignmentId, cap.id) })
    return average(notas)
  }

  function promedioCompetencia(studentId, comp) {
    const promsCapacidades = comp.capacidades.map(function (cap) { return promedioCapacidad(studentId, cap) })
    const cierre = notaCierre(studentId, comp.id)
    return average([...promsCapacidades, cierre])
  }

  function promedioArea(studentId) {
    const proms = competenciasData.map(function (comp) { return promedioCompetencia(studentId, comp) })
    return average(proms)
  }

  function toggle(key) {
    setAbierto(function (prev) { return prev === key ? null : key })
  }

  const [exportando, setExportando] = useState(false)
  const [vista, setVista] = useState('registro')

  async function exportExcel() {
    setExportando(true)
    const workbook = new ExcelJS.Workbook()
    const ws = workbook.addWorksheet('Registro')

    // Total de columnas de datos (sin contar Nombre y Promedio Área)
    const totalColsDatos = competenciasData.reduce(function (acc, comp) {
      const colsCap = comp.capacidades.reduce(function (a, cap) { return a + Math.max(cap.instancias.length, 1) }, 0)
      return acc + colsCap + 2 // +cierre +promedio competencia
    }, 0)
    const totalCols = 2 + totalColsDatos

    ws.getColumn(1).width = 30
    ws.getColumn(2).width = 12
    for (let i = 3; i <= totalCols; i++) ws.getColumn(i).width = 12

    function mergedRow(rowNum, text, fillArgb, fontArgb, size, bold, colStart, colEnd) {
      ws.mergeCells(rowNum, colStart || 1, rowNum, colEnd || totalCols)
      const cell = ws.getCell(rowNum, colStart || 1)
      cell.value = text
      cell.font = { bold: bold, size: size || 11, color: { argb: fontArgb || 'FF000000' } }
      if (fillArgb) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fillArgb } }
      cell.alignment = { vertical: 'middle', wrapText: true, horizontal: 'center' }
      ws.getRow(rowNum).height = size >= 14 ? 24 : 16
    }

    mergedRow(1, ficha.institucion || 'Institución educativa', COLOR_INSTITUCION, 'FFFFFFFF', 14, true)
    mergedRow(2, `REGISTRO AUXILIAR ${ficha.anio}`, COLOR_TITULO, 'FFFFFFFF', 12, true)
    mergedRow(
      3,
      `UGEL: ${ficha.ugel || '—'}   DRE: ${ficha.dre || '—'}   Director(a): ${ficha.director || '—'}`,
      COLOR_METADATA, 'FF000000', 9, false
    )
    mergedRow(
      4,
      `Docente(s): ${ficha.docentes}   Área: ${ficha.area}   Nivel: Secundaria   Ciclo: ${ficha.ciclo}`,
      COLOR_METADATA, 'FF000000', 9, false
    )
    mergedRow(
      5,
      `Grado y Sección: ${ficha.grado}° "${ficha.grupo}"   Año lectivo: ${ficha.anio}   Periodo: ${NOMBRE_BIMESTRE[bimestre]}   N° de estudiantes: ${ficha.totalEstudiantes}`,
      COLOR_METADATA, 'FF000000', 9, false
    )

    let r = 7
    const rowComp = r
    const rowCap = r + 1
    const rowAct = r + 2

    // Nombre y Promedio Área (ocupan las 3 filas de encabezado)
    ws.mergeCells(rowComp, 1, rowAct, 1)
    const cellNombre = ws.getCell(rowComp, 1)
    cellNombre.value = 'Apellidos y Nombres'
    cellNombre.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    cellNombre.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_TABLA_HEAD } }
    cellNombre.alignment = { vertical: 'middle' }

    ws.mergeCells(rowComp, 2, rowAct, 2)
    const cellPromArea = ws.getCell(rowComp, 2)
    cellPromArea.value = 'Promedio del Área'
    cellPromArea.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    cellPromArea.fill = {
      type: 'gradient', gradient: 'angle', degree: 135,
      stops: [{ position: 0, color: { argb: 'FF0F2A4A' } }, { position: 1, color: { argb: 'FF5DAA47' } }],
    }
    cellPromArea.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }

    let colCursor = 3
    competenciasData.forEach(function (comp) {
      const colsComp = comp.capacidades.reduce(function (a, cap) { return a + Math.max(cap.instancias.length, 1) + 1 }, 0) + 2
      ws.mergeCells(rowComp, colCursor, rowComp, colCursor + colsComp - 1)
      const cellComp = ws.getCell(rowComp, colCursor)
      cellComp.value = comp.nombre
      cellComp.font = { bold: true, color: { argb: 'FFFFFFFF' } }
      cellComp.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_COMPETENCIA } }
      cellComp.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }

      let colCapCursor = colCursor
      comp.capacidades.forEach(function (cap) {
        const span = Math.max(cap.instancias.length, 1)
        ws.mergeCells(rowCap, colCapCursor, rowCap, colCapCursor + span - 1)
        const cellCap = ws.getCell(rowCap, colCapCursor)
        cellCap.value = cap.nombre
        cellCap.font = { bold: true, size: 9 }
        cellCap.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_CAPACIDAD } }
        cellCap.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }

        if (cap.instancias.length === 0) {
          const cellAct = ws.getCell(rowAct, colCapCursor)
          cellAct.value = '—'
          cellAct.alignment = { horizontal: 'center' }
        } else {
          cap.instancias.forEach(function (inst, i) {
            const cellAct = ws.getCell(rowAct, colCapCursor + i)
            cellAct.value = `${inst.asignaturaAbrev ? inst.asignaturaAbrev + '.' : ''}Act.${inst.actividadNumero}`
            cellAct.font = { size: 8 }
            cellAct.alignment = { horizontal: 'center', vertical: 'middle', textRotation: 90 }
            cellAct.note = `Tarea: ${inst.tituloTarea}\n\nCriterio: ${inst.criterio || '—'}\n\nDesempeño: ${inst.desempeno || '—'}`
          })
        }
        colCapCursor += span

        // Columna Promedio de la Capacidad
        ws.mergeCells(rowCap, colCapCursor, rowAct, colCapCursor)
        const cellPromCap = ws.getCell(rowCap, colCapCursor)
        cellPromCap.value = 'Promedio Capacidad'
        cellPromCap.font = { bold: true, size: 8 }
        cellPromCap.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF4F6F9' } }
        cellPromCap.alignment = { horizontal: 'center', vertical: 'middle', textRotation: 90 }
        colCapCursor++
      })

      // Columna Cierre
      ws.mergeCells(rowCap, colCapCursor, rowAct, colCapCursor)
      const cellCierre = ws.getCell(rowCap, colCapCursor)
      cellCierre.value = 'Evaluación de Bimestre'
      cellCierre.font = { bold: true, size: 8 }
      cellCierre.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_CIERRE } }
      cellCierre.alignment = { horizontal: 'center', vertical: 'middle', textRotation: 90 }
      colCapCursor++

      // Columna Promedio Competencia
      ws.mergeCells(rowCap, colCapCursor, rowAct, colCapCursor)
      const cellPC = ws.getCell(rowCap, colCapCursor)
      cellPC.value = 'Promedio Competencia'
      cellPC.font = { bold: true, size: 8 }
      cellPC.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDEEBF7' } }
      cellPC.alignment = { horizontal: 'center', vertical: 'middle', textRotation: 90 }

      colCursor += colsComp
    })

    r = rowAct + 1

    students.forEach(function (s) {
      const row = ws.getRow(r)
      row.getCell(1).value = s.full_name
      const provArea = promedioArea(s.id)
      row.getCell(2).value = provArea != null ? getLetterGrade(provArea) : '—'
      row.getCell(2).font = { bold: true, size: 13, color: { argb: 'FFFFFFFF' } }
      row.getCell(2).fill = {
        type: 'gradient', gradient: 'angle', degree: 135,
        stops: [{ position: 0, color: { argb: 'FF0F2A4A' } }, { position: 1, color: { argb: 'FF5DAA47' } }],
      }
      row.getCell(2).alignment = { horizontal: 'center' }

      let c = 3
      competenciasData.forEach(function (comp) {
        comp.capacidades.forEach(function (cap) {
          if (cap.instancias.length === 0) { c++; c++; return }
          cap.instancias.forEach(function (inst) {
            const nota = notaTarea(s.id, inst.assignmentId, cap.id)
            const letra = nota != null ? getLetterGrade(nota) : '—'
            const cell = row.getCell(c)
            cell.value = letra
            cell.font = { bold: true, color: { argb: nota != null ? NIVEL_COLOR_ARGB[letra] : 'FF94A3B8' } }
            cell.alignment = { horizontal: 'center' }
            c++
          })
          const provCap = promedioCapacidad(s.id, cap)
          const letraCap = provCap != null ? getLetterGrade(provCap) : '—'
          const cellCap = row.getCell(c)
          cellCap.value = letraCap
          cellCap.font = { bold: true, color: { argb: provCap != null ? NIVEL_COLOR_ARGB[letraCap] : 'FF94A3B8' } }
          cellCap.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF4F6F9' } }
          cellCap.alignment = { horizontal: 'center' }
          c++
        })
        const cierre = notaCierre(s.id, comp.id)
        const letraCierre = cierre != null ? getLetterGrade(cierre) : '—'
        const cellCierre = row.getCell(c)
        cellCierre.value = letraCierre
        cellCierre.font = { bold: true, color: { argb: cierre != null ? NIVEL_COLOR_ARGB[letraCierre] : 'FF94A3B8' } }
        cellCierre.alignment = { horizontal: 'center' }
        c++

        const provComp = promedioCompetencia(s.id, comp)
        const letraComp = provComp != null ? getLetterGrade(provComp) : '—'
        const cellComp = row.getCell(c)
        cellComp.value = letraComp
        cellComp.font = { bold: true, color: { argb: provComp != null ? NIVEL_COLOR_ARGB[letraComp] : 'FF94A3B8' } }
        cellComp.alignment = { horizontal: 'center' }
        c++
      })

      for (let cc = 1; cc <= totalCols; cc++) {
        row.getCell(cc).border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }
      }
      r++
    })

    // Ajustar para imprimir: todo el ancho en una sola página
    ws.pageSetup = {
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0, footer: 0 },
    }
    ws.views = [{ state: 'frozen', xSplit: 2, ySplit: rowAct }]

    // -------- Hoja 2: Reporte Estadístico --------
    const wsStats = workbook.addWorksheet('Reporte Estadistico')
    wsStats.getColumn(1).width = 30
    wsStats.getColumn(2).width = 16
    wsStats.getColumn(3).width = 14
    wsStats.getColumn(4).width = 16
    wsStats.getColumn(5).width = 18

    function contarNivelesExcel(getNota) {
      const conteo = { AD: 0, A: 0, B: 0, C: 0 }
      let conNota = 0
      students.forEach(function (s) {
        const valor = getNota(s.id)
        if (valor == null) return
        conteo[getLetterGrade(valor)]++
        conNota++
      })
      return { conteo: conteo, conNota: conNota }
    }

    wsStats.mergeCells(1, 1, 1, 5)
    const statsTitle = wsStats.getCell(1, 1)
    statsTitle.value = `REPORTE ESTADÍSTICO — ${ficha.area} — ${ficha.grado}° "${ficha.grupo}" — ${NOMBRE_BIMESTRE[bimestre]}`
    statsTitle.font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } }
    statsTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_TITULO } }
    statsTitle.alignment = { horizontal: 'center', vertical: 'middle' }
    wsStats.getRow(1).height = 22

    wsStats.getCell(3, 1).value = 'Cantidad de estudiantes por nivel — Promedio del Área'
    wsStats.getCell(3, 1).font = { bold: true }
    const headerFrec = wsStats.getRow(4)
    ;['Nivel', 'Descripción', 'Cantidad', '% del aula'].forEach(function (t, i) {
      const cell = headerFrec.getCell(i + 1)
      cell.value = t
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_TABLA_HEAD } }
    })
    const generalStats = contarNivelesExcel(promedioArea)
    let rr = 5
    NIVELES_INFO.forEach(function (n) {
      const cantidad = generalStats.conteo[n.letra]
      const pct = generalStats.conNota > 0 ? Math.round((cantidad / generalStats.conNota) * 100) : 0
      const row = wsStats.getRow(rr)
      row.getCell(1).value = n.letra
      row.getCell(2).value = n.nombre
      row.getCell(3).value = cantidad
      row.getCell(4).value = `${pct}%`
      row.getCell(1).font = { bold: true, color: { argb: NIVEL_COLOR_ARGB[n.letra] } }
      for (let cc = 1; cc <= 4; cc++) {
        row.getCell(cc).border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }
      }
      rr++
    })

    rr += 2
    wsStats.getCell(rr, 1).value = 'Aprobados vs Desaprobados por Competencia'
    wsStats.getCell(rr, 1).font = { bold: true }
    rr++
    const headerComp = wsStats.getRow(rr)
    ;['Competencia', 'Aprobados (AD+A+B)', '% Aprob.', 'Desaprobados (C)', '% Desaprob.'].forEach(function (t, i) {
      const cell = headerComp.getCell(i + 1)
      cell.value = t
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_TABLA_HEAD } }
    })
    rr++
    competenciasData.forEach(function (comp) {
      const stats = contarNivelesExcel(function (studentId) { return promedioCompetencia(studentId, comp) })
      const aprobados = stats.conteo.AD + stats.conteo.A + stats.conteo.B
      const desaprobados = stats.conteo.C
      const total = stats.conNota
      const pctAprob = total > 0 ? Math.round((aprobados / total) * 100) : 0
      const pctDesaprob = total > 0 ? Math.round((desaprobados / total) * 100) : 0
      const row = wsStats.getRow(rr)
      row.getCell(1).value = comp.nombre
      row.getCell(2).value = aprobados
      row.getCell(3).value = `${pctAprob}%`
      row.getCell(3).font = { color: { argb: 'FF2F7A1F' }, bold: true }
      row.getCell(4).value = desaprobados
      row.getCell(5).value = `${pctDesaprob}%`
      row.getCell(5).font = { color: { argb: 'FFB91C1C' }, bold: true }
      for (let cc = 1; cc <= 5; cc++) {
        row.getCell(cc).border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }
      }
      rr++
    })

    wsStats.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 }

    // -------- Hoja 3: Mapa de Calor --------
    const wsMapa = workbook.addWorksheet('Mapa de Calor')
    wsMapa.getColumn(1).width = 30
    wsMapa.getColumn(2).width = 14
    for (let i = 3; i <= 2 + competenciasData.length; i++) wsMapa.getColumn(i).width = 22

    const headerMapa = wsMapa.getRow(1)
    headerMapa.getCell(1).value = 'Apellidos y Nombres'
    headerMapa.getCell(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
    headerMapa.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_TABLA_HEAD } }
    headerMapa.getCell(2).value = 'Promedio Área'
    headerMapa.getCell(2).font = { bold: true, color: { argb: 'FFFFFFFF' } }
    headerMapa.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_TABLA_HEAD } }
    competenciasData.forEach(function (comp, i) {
      const cell = headerMapa.getCell(3 + i)
      cell.value = comp.nombre
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_COMPETENCIA } }
      cell.alignment = { wrapText: true, vertical: 'middle' }
    })
    headerMapa.height = 30

    function fillDeNivelExcel(valor) {
      if (valor == null) return 'FFF4F6F9'
      const letra = getLetterGrade(valor)
      const info = NIVELES_INFO.find(function (n) { return n.letra === letra })
      return info.bg.replace('#', 'FF')
    }

    students.forEach(function (s, idx) {
      const row = wsMapa.getRow(idx + 2)
      row.getCell(1).value = s.full_name
      const provArea = promedioArea(s.id)
      row.getCell(2).value = provArea != null ? getLetterGrade(provArea) : '—'
      row.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fillDeNivelExcel(provArea) } }
      row.getCell(2).font = { bold: true, color: { argb: provArea != null ? NIVEL_COLOR_ARGB[getLetterGrade(provArea)] : 'FF94A3B8' } }
      row.getCell(2).alignment = { horizontal: 'center' }

      competenciasData.forEach(function (comp, i) {
        const prov = promedioCompetencia(s.id, comp)
        const cell = row.getCell(3 + i)
        cell.value = prov != null ? getLetterGrade(prov) : '—'
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fillDeNivelExcel(prov) } }
        cell.font = { bold: true, color: { argb: prov != null ? NIVEL_COLOR_ARGB[getLetterGrade(prov)] : 'FF94A3B8' } }
        cell.alignment = { horizontal: 'center' }
      })

      for (let cc = 1; cc <= 2 + competenciasData.length; cc++) {
        row.getCell(cc).border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }
      }
    })

    wsMapa.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 }

    await descargarWorkbook(workbook, `Registro_Auxiliar_${ficha.area}_${ficha.grado}${ficha.grupo}_Bim${bimestre}.xlsx`)
    setExportando(false)
  }

  if (loading) return <p className="text-slate-400 text-sm">Cargando registro...</p>
  if (error) return <p className="text-red-500 text-sm">{error}</p>

  return (
    <div>
      <div className="flex justify-between items-center flex-wrap gap-3 mb-4">
        <h3 className="text-lg font-bold" style={{ color: NAVY_DARK }}>Registro Auxiliar</h3>
        <button
          onClick={exportExcel}
          disabled={exportando}
          className="text-xs font-semibold px-4 py-2 rounded-lg text-white transition hover:opacity-90 disabled:opacity-50"
          style={{ backgroundColor: '#1d5c8f' }}
        >
          {exportando ? 'Generando...' : 'Exportar Excel'}
        </button>
      </div>

      <div className="mb-5 max-w-md">
        <label className="block text-xs font-medium mb-1" style={{ color: NAVY_DARK }}>Periodo</label>
        <div className="flex gap-2">
          {BIMESTRES.map(function (b) {
            const active = bimestre === b
            return (
              <button
                key={b}
                onClick={function () { setBimestre(b) }}
                className="flex-1 text-sm font-semibold py-2 rounded-lg transition"
                style={active ? { backgroundColor: GREEN, color: 'white' } : { backgroundColor: 'white', color: NAVY_DARK, border: '1px solid #D6DCE5' }}
              >
                {b}° Bim.
              </button>
            )
          })}
        </div>
      </div>

      {/* Ficha informativa */}
      <div className="bg-white rounded-2xl p-5 mb-6" style={{ border: '1px solid #E5E9F0' }}>
        <p className="text-sm font-bold mb-3" style={{ color: NAVY_DARK }}>Datos informativos</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-3">
          <Dato label="Institución educativa" valor={ficha.institucion || '—'} />
          <Dato label="UGEL" valor={ficha.ugel || '—'} />
          <Dato label="DRE" valor={ficha.dre || '—'} />
          <Dato label="Director(a)" valor={ficha.director || '—'} />
          <Dato label="Docente(s)" valor={ficha.docentes} />
          <Dato label="Área curricular" valor={ficha.area} />
          <Dato label="Nivel" valor="Secundaria" />
          <Dato label="Ciclo" valor={ficha.ciclo} />
          <Dato label="Grado y sección" valor={`${ficha.grado}° "${ficha.grupo}"`} />
          <Dato label="Año lectivo" valor={ficha.anio} />
          <Dato label="Periodo" valor={NOMBRE_BIMESTRE[bimestre]} />
          <Dato label="N° de estudiantes" valor={ficha.totalEstudiantes} />
        </div>
      </div>

      <div className="flex gap-2 mb-5 border-b" style={{ borderColor: '#E5E9F0' }}>
        {[
          { id: 'registro', label: 'Registro' },
          { id: 'estadistico', label: 'Reporte Estadístico' },
          { id: 'mapa', label: 'Mapa de Calor' },
        ].map(function (t) {
          const active = vista === t.id
          return (
            <button key={t.id} onClick={function () { setVista(t.id) }}
              className="px-4 py-2.5 text-sm font-semibold border-b-2 transition"
              style={active ? { borderColor: GREEN, color: NAVY_DARK } : { borderColor: 'transparent', color: '#94A3B8' }}>
              {t.label}
            </button>
          )
        })}
      </div>

      {vista === 'registro' && (
      students.length === 0 ? (
        <p className="text-slate-400 text-sm">No hay estudiantes matriculados en esta aula.</p>
      ) : competenciasData.every(function (c) { return c.capacidades.every(function (cap) { return cap.instancias.length === 0 }) }) ? (
        <p className="text-slate-400 text-sm">Aún no hay actividades/tareas registradas en este bimestre.</p>
      ) : (
        <div className="overflow-auto" style={{ maxHeight: '70vh' }}>
          <table className="border-collapse" style={{ minWidth: '100%' }}>
            <thead className="sticky top-0 z-20">
              <tr>
                <td rowSpan={5} className="p-2 font-semibold sticky left-0" style={{ backgroundColor: '#F4F6F9', color: NAVY_DARK, border: '1px solid #E5E9F0', minWidth: 170, verticalAlign: 'bottom' }}>
                  Apellidos y Nombres
                </td>
                <td rowSpan={5} className="p-2 text-center font-semibold" style={{ background: `linear-gradient(135deg, ${NAVY_DARK}, ${GREEN})`, color: 'white', border: '1px solid #0a1f38', minWidth: 60, verticalAlign: 'middle' }}>
                  Promedio<br />del Área
                </td>
                {competenciasData.map(function (comp) {
                  const cols = comp.capacidades.reduce(function (acc, cap) { return acc + Math.max(cap.instancias.length, 1) + 1 }, 0) + 2
                  return (
                    <td key={comp.id} colSpan={cols} className="p-1.5 text-center font-semibold text-white" style={{ backgroundColor: GREEN, border: '1px solid #4a9038', fontSize: 12 }}>
                      {comp.nombre}
                    </td>
                  )
                })}
              </tr>
              <tr>
                {competenciasData.map(function (comp) {
                  return comp.capacidades.flatMap(function (cap) {
                    const span = Math.max(cap.instancias.length, 1)
                    return [
                      <td key={cap.id} colSpan={span} className="p-1.5 text-center" style={{ backgroundColor: '#E7F3E4', color: '#2f7a1f', border: '1px solid #E5E9F0', fontSize: 11, minWidth: 100 * span }}>
                        {cap.nombre}
                      </td>,
                      <td key={cap.id + '_promcap'} rowSpan={4} className="p-1 text-center font-semibold" style={{ backgroundColor: '#F4F6F9', color: '#2f7a1f', border: '1px solid #E5E9F0', fontSize: 10, minWidth: 28, verticalAlign: 'middle' }}>
                        <span style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', whiteSpace: 'nowrap' }}>Promedio Capacidad</span>
                      </td>,
                    ]
                  }).concat([
                    <td key={comp.id + '_cierre'} rowSpan={4} className="p-1 text-center font-semibold" style={{ backgroundColor: '#FFF7E6', color: '#B45309', border: '1px solid #E5E9F0', fontSize: 10, minWidth: 28, verticalAlign: 'middle' }}>
                      <span style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', whiteSpace: 'nowrap' }}>Evaluación de Bimestre</span>
                    </td>,
                    <td key={comp.id + '_prom'} rowSpan={4} className="p-1 text-center font-semibold" style={{ backgroundColor: '#DEEBF7', color: NAVY_DARK, border: '1px solid #E5E9F0', fontSize: 10, minWidth: 28, verticalAlign: 'middle' }}>
                      <span style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', whiteSpace: 'nowrap' }}>Promedio Competencia</span>
                    </td>,
                  ])
                })}
              </tr>
              <tr>
                {competenciasData.map(function (comp) {
                  return comp.capacidades.map(function (cap) {
                    if (cap.instancias.length === 0) {
                      return <td key={cap.id + '_noact'} className="p-1.5 text-center" style={{ backgroundColor: '#FAFAF8', border: '1px solid #E5E9F0', fontSize: 10, color: '#B0AFA8' }}>—</td>
                    }
                    return cap.instancias.map(function (inst) {
                      return (
                        <td key={inst.assignmentId} className="p-1 text-center" style={{ backgroundColor: '#FAFAF8', border: '1px solid #E5E9F0', fontSize: 10, color: '#5F5E5A', minWidth: 28, verticalAlign: 'middle' }}>
                          <span style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', whiteSpace: 'nowrap' }}>{inst.asignaturaAbrev ? inst.asignaturaAbrev + '. ' : ''}Act.{inst.actividadNumero}</span>
                        </td>
                      )
                    })
                  })
                })}
              </tr>
              <tr>
                {competenciasData.map(function (comp) {
                  return comp.capacidades.map(function (cap) {
                    if (cap.instancias.length === 0) return <td key={cap.id + '_c0'} style={{ border: '1px solid #E5E9F0', backgroundColor: '#FAFAF8' }}></td>
                    return cap.instancias.map(function (inst) {
                      const key = 'c_' + inst.assignmentId
                      return (
                        <td
                          key={key}
                          onClick={function () { toggle(key) }}
                          className="p-1 text-center cursor-pointer"
                          style={{ backgroundColor: '#FAFAF8', border: '1px solid #E5E9F0', fontSize: 10, color: '#164a72', minWidth: 28 }}
                        >
                          <span style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', whiteSpace: 'nowrap', textDecoration: 'underline dotted' }}>Criterio</span>
                        </td>
                      )
                    })
                  })
                })}
              </tr>
              <tr>
                {competenciasData.map(function (comp) {
                  return comp.capacidades.map(function (cap) {
                    if (cap.instancias.length === 0) return <td key={cap.id + '_d0'} style={{ border: '1px solid #E5E9F0', backgroundColor: '#FAFAF8' }}></td>
                    return cap.instancias.map(function (inst) {
                      const key = 'd_' + inst.assignmentId
                      return (
                        <td
                          key={key}
                          onClick={function () { toggle(key) }}
                          className="p-1 text-center cursor-pointer"
                          style={{ backgroundColor: '#FAFAF8', border: '1px solid #E5E9F0', fontSize: 10, color: '#8a5cb0', minWidth: 28 }}
                        >
                          <span style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', whiteSpace: 'nowrap', textDecoration: 'underline dotted' }}>Desempeño</span>
                        </td>
                      )
                    })
                  })
                })}
              </tr>
            </thead>
            <tbody>
              {students.map(function (s) {
                return (
                  <tr key={s.id}>
                    <td className="p-2 sticky left-0" style={{ backgroundColor: 'white', color: NAVY_DARK, border: '1px solid #E5E9F0' }}>{s.full_name}</td>
                    {(function () {
                      const provArea = promedioArea(s.id)
                      return (
                        <td className="p-2 text-center font-bold" style={{ background: `linear-gradient(135deg, ${NAVY_DARK}, ${GREEN})`, color: 'white', border: '1px solid #0a1f38', fontSize: 15 }}>
                          {provArea != null ? getLetterGrade(provArea) : '—'}
                        </td>
                      )
                    })()}
                    {competenciasData.map(function (comp) {
                      const provComp = promedioCompetencia(s.id, comp)
                      const cierre = notaCierre(s.id, comp.id)
                      return (
                        <>
                          {comp.capacidades.flatMap(function (cap) {
                            const provCap = promedioCapacidad(s.id, cap)
                            const celdasActividad = cap.instancias.length === 0
                              ? [<td key={cap.id + '_' + s.id} style={{ border: '1px solid #E5E9F0' }}></td>]
                              : cap.instancias.map(function (inst) {
                                const nota = notaTarea(s.id, inst.assignmentId, cap.id)
                                return (
                                  <td key={inst.assignmentId + '_' + s.id} className="p-2 text-center" style={{ border: '1px solid #E5E9F0' }}>
                                    {nota != null ? (
                                      <span className={'font-semibold ' + getLetterColor(nota)}>{getLetterGrade(nota)}</span>
                                    ) : (
                                      <span style={{ color: '#CBD5E1' }}>—</span>
                                    )}
                                  </td>
                                )
                              })
                            return celdasActividad.concat([
                              <td key={cap.id + '_promcap_' + s.id} className="p-2 text-center font-semibold" style={{ backgroundColor: '#F4F6F9', border: '1px solid #E5E9F0' }}>
                                {provCap != null ? (
                                  <span className={getLetterColor(provCap)}>{getLetterGrade(provCap)}</span>
                                ) : (
                                  <span style={{ color: '#CBD5E1' }}>—</span>
                                )}
                              </td>,
                            ])
                          })}
                          <td key={comp.id + '_cierre_' + s.id} className="p-2 text-center font-semibold" style={{ backgroundColor: '#FFFBF0', border: '1px solid #E5E9F0' }}>
                            {cierre != null ? (
                              <span className={getLetterColor(cierre)}>{getLetterGrade(cierre)}</span>
                            ) : (
                              <span style={{ color: '#CBD5E1' }}>—</span>
                            )}
                          </td>
                          <td key={comp.id + '_prom_' + s.id} className="p-2 text-center font-bold" style={{ backgroundColor: '#F4F6F9', border: '1px solid #E5E9F0' }}>
                            {provComp != null ? (
                              <span className={getLetterColor(provComp)}>{getLetterGrade(provComp)}</span>
                            ) : '—'}
                          </td>
                        </>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )
      )}

      {vista === 'estadistico' && <ReporteEstadistico competenciasData={competenciasData} students={students} promedioArea={promedioArea} promedioCompetencia={promedioCompetencia} />}

      {vista === 'mapa' && <MapaCalor competenciasData={competenciasData} students={students} promedioArea={promedioArea} promedioCompetencia={promedioCompetencia} />}

      {/* Popups de criterio/desempeño */}
      {competenciasData.map(function (comp) {
        return comp.capacidades.map(function (cap) {
          return cap.instancias.map(function (inst) {
            return (
              <div key={'pops_' + inst.assignmentId}>
                {abierto === 'c_' + inst.assignmentId && (
                  <div className="mt-4 p-4 rounded-xl" style={{ backgroundColor: '#DEEBF7' }}>
                    <p className="text-xs font-semibold mb-1" style={{ color: NAVY_DARK }}>
                      Criterio — {inst.tituloTarea} ({inst.asignaturaAbrev ? inst.asignaturaAbrev + '. ' : ''}Act. {inst.actividadNumero})
                    </p>
                    <p className="text-sm" style={{ color: NAVY_DARK }}>{inst.criterio || 'Sin criterio registrado.'}</p>
                  </div>
                )}
                {abierto === 'd_' + inst.assignmentId && (
                  <div className="mt-4 p-4 rounded-xl" style={{ backgroundColor: '#f0e7f7' }}>
                    <p className="text-xs font-semibold mb-1" style={{ color: '#4a2e63' }}>
                      Desempeño — {inst.tituloTarea} ({inst.asignaturaAbrev ? inst.asignaturaAbrev + '. ' : ''}Act. {inst.actividadNumero})
                    </p>
                    <p className="text-sm" style={{ color: '#4a2e63' }}>{inst.desempeno || 'Sin desempeño registrado.'}</p>
                  </div>
                )}
              </div>
            )
          })
        })
      })}
    </div>
  )
}

function Dato({ label, valor }) {
  return (
    <div>
      <p className="text-xs text-slate-400 mb-0.5">{label}</p>
      <p className="text-sm" style={{ color: NAVY_DARK }}>{valor}</p>
    </div>
  )
}

// ============================================================
// Reporte Estadístico: tabla de frecuencias, % aprobados/desaprobados
// ============================================================
function ReporteEstadistico({ competenciasData, students, promedioArea, promedioCompetencia }) {
  function contarNiveles(getNota) {
    const conteo = { AD: 0, A: 0, B: 0, C: 0 }
    let conNota = 0
    students.forEach(function (s) {
      const valor = getNota(s.id)
      if (valor == null) return
      conteo[getLetterGrade(valor)]++
      conNota++
    })
    return { conteo: conteo, conNota: conNota }
  }

  const generalStats = contarNiveles(promedioArea)
  const totalEstudiantes = students.length

  return (
    <div>
      <h4 className="text-sm font-bold mb-3" style={{ color: NAVY_DARK }}>Cantidad de estudiantes por nivel — Promedio del Área</h4>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        {NIVELES_INFO.map(function (n) {
          const cantidad = generalStats.conteo[n.letra]
          const pct = generalStats.conNota > 0 ? Math.round((cantidad / generalStats.conNota) * 100) : 0
          return (
            <div key={n.letra} className="rounded-2xl p-4" style={{ backgroundColor: n.bg, border: `1px solid ${n.color}33` }}>
              <p className="text-xs font-semibold" style={{ color: n.color }}>{n.letra} — {n.nombre}</p>
              <p className="text-3xl font-bold mt-1" style={{ color: n.color }}>{cantidad}</p>
              <p className="text-xs mt-0.5" style={{ color: n.color }}>{pct}% del aula</p>
            </div>
          )
        })}
      </div>

      <GraficoCircular conteo={generalStats.conteo} conNota={generalStats.conNota} />

      <h4 className="text-sm font-bold mb-3" style={{ color: NAVY_DARK }}>Aprobados vs Desaprobados por Competencia</h4>
      <div className="space-y-3 mb-4">
        {competenciasData.map(function (comp) {
          const stats = contarNiveles(function (studentId) { return promedioCompetencia(studentId, comp) })
          const aprobados = stats.conteo.AD + stats.conteo.A + stats.conteo.B
          const desaprobados = stats.conteo.C
          const total = stats.conNota
          const pctAprob = total > 0 ? Math.round((aprobados / total) * 100) : 0
          const pctDesaprob = total > 0 ? Math.round((desaprobados / total) * 100) : 0
          return (
            <div key={comp.id} className="bg-white rounded-xl p-4" style={{ border: '1px solid #E5E9F0' }}>
              <div className="flex justify-between items-center mb-2 flex-wrap gap-1">
                <p className="text-sm font-semibold" style={{ color: NAVY_DARK }}>{comp.nombre}</p>
                <p className="text-xs text-slate-400">
                  <span style={{ color: '#2f7a1f' }}>{aprobados} aprobados ({pctAprob}%)</span>
                  {' · '}
                  <span style={{ color: '#B91C1C' }}>{desaprobados} desaprobados ({pctDesaprob}%)</span>
                  {total === 0 && ' · sin notas aún'}
                </p>
              </div>
              <div className="w-full h-2.5 rounded-full overflow-hidden flex" style={{ backgroundColor: '#F4F6F9' }}>
                <div style={{ width: `${pctAprob}%`, backgroundColor: '#5DAA47' }} />
                <div style={{ width: `${pctDesaprob}%`, backgroundColor: '#B91C1C' }} />
              </div>
            </div>
          )
        })}
      </div>

      <p className="text-xs text-slate-400">
        Promedio automático consolidado del periodo, calculado por estudiante y por área a partir de las tareas publicadas y la evaluación de cierre de cada unidad finalizada. Total de estudiantes en el aula: {totalEstudiantes}.
      </p>
    </div>
  )
}

// ============================================================
// Mapa de Calor: estudiantes x competencias, coloreado por nivel
// ============================================================
function MapaCalor({ competenciasData, students, promedioArea, promedioCompetencia }) {
  function colorDeNivel(valor) {
    if (valor == null) return { bg: '#F4F6F9', color: '#94A3B8' }
    const letra = getLetterGrade(valor)
    const info = NIVELES_INFO.find(function (n) { return n.letra === letra })
    return { bg: info.bg, color: info.color }
  }

  return (
    <div>
      <div className="flex items-center gap-4 mb-4 flex-wrap">
        {NIVELES_INFO.map(function (n) {
          return (
            <div key={n.letra} className="flex items-center gap-2">
              <span className="w-4 h-4 rounded" style={{ backgroundColor: n.bg, border: `1px solid ${n.color}` }} />
              <span className="text-xs" style={{ color: NAVY_DARK }}>{n.letra} — {n.nombre}</span>
            </div>
          )
        })}
      </div>

      <div className="overflow-auto" style={{ maxHeight: '70vh' }}>
        <table className="border-collapse" style={{ minWidth: '100%' }}>
          <thead className="sticky top-0 z-10">
            <tr>
              <td className="p-2 font-semibold sticky left-0" style={{ backgroundColor: '#F4F6F9', color: NAVY_DARK, border: '1px solid #E5E9F0', minWidth: 170 }}>
                Apellidos y Nombres
              </td>
              <td className="p-2 text-center font-semibold" style={{ backgroundColor: NAVY_DARK, color: 'white', border: '1px solid #0a1f38', minWidth: 60 }}>
                Promedio Área
              </td>
              {competenciasData.map(function (comp) {
                return (
                  <td key={comp.id} className="p-2 text-center font-semibold" style={{ backgroundColor: GREEN, color: 'white', border: '1px solid #4a9038', minWidth: 130, fontSize: 11 }}>
                    {comp.nombre}
                  </td>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {students.map(function (s) {
              const provArea = promedioArea(s.id)
              const colorArea = colorDeNivel(provArea)
              return (
                <tr key={s.id}>
                  <td className="p-2 sticky left-0" style={{ backgroundColor: 'white', color: NAVY_DARK, border: '1px solid #E5E9F0' }}>{s.full_name}</td>
                  <td className="p-2 text-center font-bold" style={{ backgroundColor: colorArea.bg, color: colorArea.color, border: '1px solid #E5E9F0' }}>
                    {provArea != null ? getLetterGrade(provArea) : '—'}
                  </td>
                  {competenciasData.map(function (comp) {
                    const prov = promedioCompetencia(s.id, comp)
                    const c = colorDeNivel(prov)
                    return (
                      <td key={comp.id} className="p-2 text-center font-semibold" style={{ backgroundColor: c.bg, color: c.color, border: '1px solid #E5E9F0' }}>
                        {prov != null ? getLetterGrade(prov) : '—'}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ============================================================
// Gráfico circular interactivo (clic en cada porción)
// ============================================================
function GraficoCircular({ conteo, conNota }) {
  const [seleccionado, setSeleccionado] = useState(null)
  const radio = 80
  const centro = 100

  if (conNota === 0) {
    return (
      <div className="bg-white rounded-2xl p-6 mb-8 text-center" style={{ border: '1px solid #E5E9F0' }}>
        <p className="text-slate-400 text-sm">Aún no hay notas suficientes para graficar.</p>
      </div>
    )
  }

  let anguloAcumulado = -90
  const porciones = NIVELES_INFO.map(function (n) {
    const cantidad = conteo[n.letra]
    const proporcion = cantidad / conNota
    const anguloInicio = anguloAcumulado
    const anguloFin = anguloAcumulado + proporcion * 360
    anguloAcumulado = anguloFin

    const rad1 = (anguloInicio * Math.PI) / 180
    const rad2 = (anguloFin * Math.PI) / 180
    const x1 = centro + radio * Math.cos(rad1)
    const y1 = centro + radio * Math.sin(rad1)
    const x2 = centro + radio * Math.cos(rad2)
    const y2 = centro + radio * Math.sin(rad2)
    const largeArc = anguloFin - anguloInicio > 180 ? 1 : 0

    const path = cantidad === 0
      ? null
      : `M ${centro} ${centro} L ${x1} ${y1} A ${radio} ${radio} 0 ${largeArc} 1 ${x2} ${y2} Z`

    return { ...n, cantidad: cantidad, pct: Math.round(proporcion * 100), path: path }
  })

  return (
    <div className="bg-white rounded-2xl p-6 mb-8" style={{ border: '1px solid #E5E9F0' }}>
      <p className="text-sm font-bold mb-4" style={{ color: NAVY_DARK }}>Distribución por Nivel (haz clic en una porción)</p>
      <div className="flex flex-wrap items-center gap-8">
        <svg width={200} height={200} viewBox="0 0 200 200">
          {porciones.map(function (p) {
            if (!p.path) return null
            const activo = seleccionado === p.letra
            return (
              <path
                key={p.letra}
                d={p.path}
                fill={p.color}
                opacity={seleccionado && !activo ? 0.35 : 1}
                stroke="white"
                strokeWidth={2}
                style={{ cursor: 'pointer', transition: 'opacity 0.15s' }}
                onClick={function () { setSeleccionado(activo ? null : p.letra) }}
              />
            )
          })}
        </svg>

        <div className="flex-1 min-w-[200px]">
          {seleccionado ? (
            (function () {
              const p = porciones.find(function (x) { return x.letra === seleccionado })
              return (
                <div>
                  <p className="text-xs font-semibold" style={{ color: p.color }}>{p.letra} — {p.nombre}</p>
                  <p className="text-2xl font-bold mt-1" style={{ color: p.color }}>{p.cantidad} estudiante(s)</p>
                  <p className="text-sm text-slate-500">{p.pct}% del total</p>
                </div>
              )
            })()
          ) : (
            <ul className="space-y-1.5">
              {porciones.map(function (p) {
                return (
                  <li key={p.letra} className="flex items-center gap-2 text-sm cursor-pointer" onClick={function () { setSeleccionado(p.letra) }}>
                    <span className="w-3 h-3 rounded-full inline-block" style={{ backgroundColor: p.color }} />
                    <span style={{ color: NAVY_DARK }}>{p.letra} — {p.nombre}: <strong>{p.cantidad}</strong> ({p.pct}%)</span>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
