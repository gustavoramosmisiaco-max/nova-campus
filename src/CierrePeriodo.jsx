import { useState } from 'react'
import { supabase } from './supabaseClient'
import ExcelJS from 'exceljs'
import { compararPorApellido } from './gradeUtils'

const NAVY_DARK = '#0F2A4A'
const GREEN = '#5DAA47'

const COLOR_INSTITUCION = 'FF1F4E79'
const COLOR_TITULO = 'FF2E75B6'
const COLOR_TABLA_HEAD = 'FF1F4E79'
const COLOR_CAPACIDAD = 'FF548235'
const NIVEL_COLOR_ARGB = { AD: 'FF2F7A1F', A: 'FF1D5C8F', B: 'FFB45309', C: 'FFB91C1C' }

function average(numbers) {
  if (numbers.length === 0) return null
  return numbers.reduce(function (a, b) { return a + b }, 0) / numbers.length
}

function getLetter(score) {
  if (score == null) return '—'
  if (score >= 18) return 'AD'
  if (score >= 14) return 'A'
  if (score >= 11) return 'B'
  return 'C'
}

function safeSheetName(name) {
  return name.replace(/[\\/*?:[\]]/g, '').slice(0, 31)
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

export default function CierrePeriodo() {
  const [step, setStep] = useState(1) // 1: intro, 2: respaldo generado, 3: confirmando borrado
  const [progreso, setProgreso] = useState('')
  const [generando, setGenerando] = useState(false)
  const [borrando, setBorrando] = useState(false)
  const [error, setError] = useState('')
  const [confirmText, setConfirmText] = useState('')

  async function generarRespaldo() {
    setGenerando(true)
    setError('')
    setProgreso('Cargando cursos...')

    try {
      const coursesResult = await supabase
        .from('courses')
        .select('id, nombre, grado, grupo')
        .order('grado', { ascending: true })
        .order('grupo', { ascending: true })
        .order('nombre', { ascending: true })
      if (coursesResult.error) throw new Error(coursesResult.error.message)
      const courses = coursesResult.data

      const workbook = new ExcelJS.Workbook()

      // -------- Hoja 1: Resumen general de notas --------
      setProgreso('Generando resumen general...')
      const resumenWs = workbook.addWorksheet('Resumen General')
      resumenWs.columns = [
        { header: 'Curso', key: 'curso', width: 22 },
        { header: 'Grado', key: 'grado', width: 8 },
        { header: 'Sección', key: 'seccion', width: 10 },
        { header: 'Estudiante', key: 'estudiante', width: 35 },
        { header: 'Promedio', key: 'promedio', width: 12 },
      ]
      resumenWs.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
      resumenWs.getRow(1).eachCell(function (cell) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_TABLA_HEAD } }
      })

      for (const course of courses) {
        const enrollResult = await supabase
          .from('enrollments')
          .select('student:profiles(id, full_name)')
          .eq('course_id', course.id)
          .eq('status', 'activo')
        const students = enrollResult.error ? [] : enrollResult.data.map(function (e) { return e.student })

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
        students.forEach(function (student) {
          const scores = assignments.map(function (a) {
            const raw = subsByStudent[student.id]?.[a.id]
            const isPastDue = new Date(a.fecha_entrega) < now
            if (raw != null) return raw
            if (isPastDue) return 0
            return null
          }).filter(function (s) { return s != null })

          const prom = average(scores)
          resumenWs.addRow({
            curso: course.nombre,
            grado: `${course.grado}°`,
            seccion: course.grupo,
            estudiante: student.full_name,
            promedio: getLetter(prom),
          })
        })
      }

      // -------- Una hoja "Registro" por curso (todas sus unidades) --------
      for (const course of courses) {
        setProgreso(`Generando registro de ${course.nombre} ${course.grado}°${course.grupo}...`)

        const unidadesResult = await supabase
          .from('unidades')
          .select('id, tipo, numero, nombre')
          .eq('course_id', course.id)
          .order('numero', { ascending: true })
        const unidades = unidadesResult.error ? [] : unidadesResult.data
        if (unidades.length === 0) continue

        const ws = workbook.addWorksheet(safeSheetName(`Reg ${course.nombre} ${course.grado}${course.grupo}`))
        let r = 1

        for (const unidad of unidades) {
          const actResult = await supabase
            .from('actividades')
            .select('id')
            .eq('unidad_id', unidad.id)
          const actIds = actResult.error ? [] : actResult.data.map(function (a) { return a.id })
          if (actIds.length === 0) continue

          const assignResult = await supabase
            .from('assignments')
            .select('id, titulo, fecha_entrega')
            .in('actividad_id', actIds)
            .order('fecha_entrega', { ascending: true })
          const assignments = assignResult.error ? [] : assignResult.data
          if (assignments.length === 0) continue
          const assignmentIds = assignments.map(function (a) { return a.id })

          const enrollResult = await supabase
            .from('enrollments')
            .select('student:profiles(id, full_name)')
            .eq('course_id', course.id)
            .eq('status', 'activo')
          const students = enrollResult.error ? [] : enrollResult.data.map(function (e) { return e.student })

          const subsResult = await supabase
            .from('submissions')
            .select('student_id, assignment_id, score')
            .in('assignment_id', assignmentIds)
          const subsMap = {}
          if (!subsResult.error) {
            subsResult.data.forEach(function (s) { subsMap[`${s.student_id}__${s.assignment_id}`] = s.score })
          }

          const titleCell = ws.getCell(r, 1)
          ws.mergeCells(r, 1, r, 2 + assignments.length)
          titleCell.value = `${unidad.tipo} ${unidad.numero}${unidad.nombre ? ' · ' + unidad.nombre : ''}`
          titleCell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 12 }
          titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_CAPACIDAD } }
          r++

          const headerRow = ws.getRow(r)
          headerRow.getCell(1).value = 'Estudiante'
          assignments.forEach(function (a, i) { headerRow.getCell(2 + i).value = a.titulo })
          headerRow.getCell(2 + assignments.length).value = 'Promedio'
          headerRow.eachCell(function (cell) {
            cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_TABLA_HEAD } }
          })
          r++

          const now = new Date()
          students.forEach(function (student) {
            const row = ws.getRow(r)
            row.getCell(1).value = student.full_name
            const scores = []
            assignments.forEach(function (a, i) {
              const raw = subsMap[`${student.id}__${a.id}`]
              const isPastDue = new Date(a.fecha_entrega) < now
              const score = raw != null ? raw : (isPastDue ? 0 : null)
              if (score != null) scores.push(score)
              row.getCell(2 + i).value = getLetter(score)
            })
            row.getCell(2 + assignments.length).value = getLetter(average(scores))
            r++
          })
          r += 2
        }

        ws.getColumn(1).width = 32
        for (let c = 2; c <= 15; c++) ws.getColumn(c).width = 18
      }

      // -------- Una hoja de Instrumento por cada actividad con capacidades --------
      for (const course of courses) {
        const actResult = await supabase
          .from('actividades')
          .select('id, nombre, numero_actividad, proposito, tipo_instrumento, competencia:competencias(nombre), actividad_capacidades(criterio, desempeno, desc_ad, desc_a, desc_b, desc_c, capacidad:capacidades(id, nombre, orden))')
          .eq('course_id', course.id)
          .order('created_at', { ascending: true })
        const actividades = (actResult.error ? [] : actResult.data).filter(function (a) {
          return a.actividad_capacidades && a.actividad_capacidades.length > 0
        })
        if (actividades.length === 0) continue

        setProgreso(`Generando instrumentos de ${course.nombre} ${course.grado}°${course.grupo}...`)

        for (const actividad of actividades) {
          const capacidades = actividad.actividad_capacidades
            .slice()
            .sort(function (x, y) { return (x.capacidad.orden || 0) - (y.capacidad.orden || 0) })

          const assignResult = await supabase
            .from('assignments')
            .select('id, fecha_entrega, assignment_capacidades(capacidad_id)')
            .eq('actividad_id', actividad.id)
          const assignments = assignResult.error ? [] : assignResult.data

          const enrollResult = await supabase
            .from('enrollments')
            .select('student:profiles(id, full_name)')
            .eq('course_id', course.id)
            .eq('status', 'activo')
          const students = enrollResult.error ? [] : enrollResult.data.map(function (e) { return e.student })
          students.sort(function (a, b) { return compararPorApellido(a.full_name, b.full_name) })

          const assignmentIds = assignments.map(function (a) { return a.id })
          let cellValues = {}
          if (assignmentIds.length > 0) {
            const subsResult = await supabase.from('submissions').select('id, student_id, assignment_id').in('assignment_id', assignmentIds)
            const submissionsData = subsResult.error ? [] : subsResult.data
            const submissionIds = submissionsData.map(function (s) { return s.id })
            const subMap = {}
            submissionsData.forEach(function (s) { subMap[s.id] = s.student_id })

            let scoresData = []
            if (submissionIds.length > 0) {
              const scoresResult = await supabase.from('submission_scores').select('submission_id, capacidad_id, score').in('submission_id', submissionIds)
              if (!scoresResult.error) scoresData = scoresResult.data
            }

            const now = new Date()
            const grouped = {}
            scoresData.forEach(function (row) {
              const studentId = subMap[row.submission_id]
              const key = `${studentId}__${row.capacidad_id}`
              if (!grouped[key]) grouped[key] = []
              if (row.score != null) grouped[key].push(row.score)
            })
            assignments.forEach(function (assignment) {
              const isPastDue = new Date(assignment.fecha_entrega) < now
              if (!isPastDue) return
              const capacidadIds = (assignment.assignment_capacidades || []).map(function (ac) { return ac.capacidad_id })
              students.forEach(function (student) {
                const hasSubmission = submissionsData.some(function (s) { return s.student_id === student.id && s.assignment_id === assignment.id })
                if (hasSubmission) return
                capacidadIds.forEach(function (capId) {
                  const key = `${student.id}__${capId}`
                  if (!grouped[key]) grouped[key] = []
                  grouped[key].push(0)
                })
              })
            })
            Object.keys(grouped).forEach(function (key) { cellValues[key] = average(grouped[key]) })
          }

          const sheetName = safeSheetName(`${course.nombre.slice(0, 8)} ${course.grado}${course.grupo} Act${actividad.numero_actividad}`)
          const ws = workbook.addWorksheet(sheetName)

          if (actividad.tipo_instrumento === 'Rúbrica') {
            const totalCols = 4
            for (let i = 1; i <= totalCols; i++) ws.getColumn(i).width = 32
            let r = 1
            const titleCell = ws.getCell(r, 1)
            ws.mergeCells(r, 1, r, totalCols)
            titleCell.value = `${course.nombre} ${course.grado}°${course.grupo} — Actividad ${actividad.numero_actividad}: ${actividad.nombre} (Rúbrica)`
            titleCell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 12 }
            titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_TITULO } }
            r += 2

            capacidades.forEach(function (cap) {
              const capCell = ws.getCell(r, 1)
              ws.mergeCells(r, 1, r, totalCols)
              capCell.value = cap.capacidad.nombre
              capCell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
              capCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_CAPACIDAD } }
              r++

              const nivelRow = ws.getRow(r)
              ;['AD', 'A', 'B', 'C'].forEach(function (letra, i) {
                const cell = nivelRow.getCell(i + 1)
                cell.value = letra
                cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NIVEL_COLOR_ARGB[letra] } }
              })
              r++
              const descRow = ws.getRow(r)
              ;[cap.desc_ad, cap.desc_a, cap.desc_b, cap.desc_c].forEach(function (t, i) { descRow.getCell(i + 1).value = t || '—' })
              r += 2

              const headerRow = ws.getRow(r)
              ;['N°', 'Apellidos y Nombres', 'Calificación'].forEach(function (t, i) {
                const cell = headerRow.getCell(i + 1)
                cell.value = t
                cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_TABLA_HEAD } }
              })
              r++
              students.forEach(function (s, idx) {
                const score = cellValues[`${s.id}__${cap.capacidad.id}`]
                const row = ws.getRow(r)
                row.getCell(1).value = idx + 1
                row.getCell(2).value = s.full_name
                row.getCell(3).value = getLetter(score)
                r++
              })
              r++
            })
          } else {
            const totalCols = 2 + capacidades.length
            ws.getColumn(1).width = 6
            ws.getColumn(2).width = 32
            for (let i = 3; i <= totalCols; i++) ws.getColumn(i).width = 22

            let r = 1
            const titleCell = ws.getCell(r, 1)
            ws.mergeCells(r, 1, r, totalCols)
            titleCell.value = `${course.nombre} ${course.grado}°${course.grupo} — Actividad ${actividad.numero_actividad}: ${actividad.nombre} (Lista de Cotejo)`
            titleCell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 12 }
            titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_TITULO } }
            r += 2

            const headerRow = ws.getRow(r)
            headerRow.getCell(1).value = 'N°'
            headerRow.getCell(2).value = 'Apellidos y Nombres'
            capacidades.forEach(function (cap, i) { headerRow.getCell(3 + i).value = cap.capacidad.nombre })
            headerRow.eachCell(function (cell) {
              cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
              cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_TABLA_HEAD } }
            })
            r++

            students.forEach(function (s, idx) {
              const row = ws.getRow(r)
              row.getCell(1).value = idx + 1
              row.getCell(2).value = s.full_name
              capacidades.forEach(function (cap, i) {
                const score = cellValues[`${s.id}__${cap.capacidad.id}`]
                row.getCell(3 + i).value = getLetter(score)
              })
              r++
            })
          }
        }
      }

      setProgreso('Descargando archivo...')
      const fecha = new Date().toISOString().slice(0, 10)
      await descargarWorkbook(workbook, `Respaldo_NovaCampus_${fecha}.xlsx`)

      setStep(2)
    } catch (err) {
      setError(err.message || 'Ocurrió un error generando el respaldo.')
    }
    setGenerando(false)
    setProgreso('')
  }

  async function borrarTodo() {
    if (confirmText !== 'BORRAR') return
    setBorrando(true)
    setError('')

    try {
      setProgreso('Recolectando archivos a eliminar del almacenamiento...')
      const materialsResult = await supabase.from('materials').select('file_url')
      const submissionsResult = await supabase.from('submissions').select('file_url')

      const materialPaths = (materialsResult.data || []).map(function (m) { return m.file_url }).filter(Boolean)
      const submissionPaths = (submissionsResult.data || []).map(function (s) { return s.file_url }).filter(Boolean)

      async function removeInChunks(bucket, paths) {
        for (let i = 0; i < paths.length; i += 100) {
          const chunk = paths.slice(i, i + 100)
          await supabase.storage.from(bucket).remove(chunk)
        }
      }
      await removeInChunks('materiales', materialPaths)
      await removeInChunks('entregas', submissionPaths)

      setProgreso('Borrando calificaciones por capacidad...')
      await supabase.from('submission_scores').delete().neq('id', '00000000-0000-0000-0000-000000000000')

      setProgreso('Borrando entregas...')
      await supabase.from('submissions').delete().neq('id', '00000000-0000-0000-0000-000000000000')

      setProgreso('Borrando vínculos de tareas...')
      await supabase.from('assignment_capacidades').delete().neq('assignment_id', '00000000-0000-0000-0000-000000000000')

      setProgreso('Borrando tareas...')
      await supabase.from('assignments').delete().neq('id', '00000000-0000-0000-0000-000000000000')

      setProgreso('Borrando materiales...')
      await supabase.from('materials').delete().neq('id', '00000000-0000-0000-0000-000000000000')

      setProgreso('Borrando capacidades vinculadas a actividades...')
      await supabase.from('actividad_capacidades').delete().neq('actividad_id', '00000000-0000-0000-0000-000000000000')

      setProgreso('Borrando actividades...')
      await supabase.from('actividades').delete().neq('id', '00000000-0000-0000-0000-000000000000')

      setProgreso('Borrando carpetas (unidades)...')
      await supabase.from('unidades').delete().neq('id', '00000000-0000-0000-0000-000000000000')

      setProgreso('')
      setStep(4)
    } catch (err) {
      setError(err.message || 'Ocurrió un error al borrar.')
    }
    setBorrando(false)
  }

  return (
    <div>
      <h2 className="text-2xl font-bold mb-2" style={{ color: NAVY_DARK }}>Cierre de Periodo</h2>
      <p className="text-sm text-slate-400 mb-6">
        Descarga un respaldo completo de notas, instrumentos y registro auxiliar de toda la plataforma, y luego
        borra materiales, tareas, entregas, actividades y carpetas para liberar espacio y empezar el siguiente
        periodo limpio. Las cuentas de estudiantes/docentes y los cursos NO se borran.
      </p>

      {step === 1 && (
        <div className="bg-white rounded-2xl p-6" style={{ border: '1px solid #E5E9F0' }}>
          <h3 className="text-sm font-bold mb-3" style={{ color: NAVY_DARK }}>Paso 1 — Descargar respaldo</h3>
          <p className="text-sm text-slate-500 mb-4">
            Genera y descarga un Excel con: el promedio de cada estudiante en cada curso, el registro auxiliar
            completo de cada curso (todas las unidades), y el instrumento de evaluación de cada actividad con
            capacidades. Puede tardar unos minutos si tienes muchos cursos.
          </p>
          {progreso && <p className="text-xs mb-3" style={{ color: '#1d5c8f' }}>{progreso}</p>}
          {error && <p className="text-red-500 text-sm mb-3">{error}</p>}
          <button
            onClick={generarRespaldo}
            disabled={generando}
            className="text-sm font-semibold px-5 py-2.5 rounded-lg text-white transition hover:opacity-90 disabled:opacity-50"
            style={{ backgroundColor: GREEN }}
          >
            {generando ? 'Generando respaldo...' : 'Generar y descargar respaldo'}
          </button>
        </div>
      )}

      {step === 2 && (
        <div className="bg-white rounded-2xl p-6" style={{ border: '1px solid #E5E9F0' }}>
          <h3 className="text-sm font-bold mb-3" style={{ color: '#2f7a1f' }}>✓ Respaldo descargado</h3>
          <p className="text-sm text-slate-500 mb-4">
            Sube ese archivo a tu Google Drive ahora, antes de continuar. Cuando confirmes que ya lo guardaste
            en un lugar seguro, sigue al paso de borrado.
          </p>
          <button
            onClick={function () { setStep(3) }}
            className="text-sm font-semibold px-5 py-2.5 rounded-lg text-white transition hover:opacity-90"
            style={{ backgroundColor: '#B91C1C' }}
          >
            Ya guardé el respaldo, continuar a borrar
          </button>
        </div>
      )}

      {step === 3 && (
        <div className="bg-white rounded-2xl p-6" style={{ border: '2px solid #B91C1C' }}>
          <h3 className="text-sm font-bold mb-3" style={{ color: '#B91C1C' }}>⚠ Esta acción no se puede deshacer</h3>
          <p className="text-sm text-slate-500 mb-2">Se borrará permanentemente, de TODOS los cursos:</p>
          <ul className="text-sm text-slate-500 mb-4 list-disc pl-5 space-y-1">
            <li>Todos los materiales subidos (y sus archivos)</li>
            <li>Todas las tareas y entregas de estudiantes (y sus archivos)</li>
            <li>Todas las notas por capacidad</li>
            <li>Todas las Actividades y carpetas (Unidades/Experiencias)</li>
          </ul>
          <p className="text-sm text-slate-500 mb-4">
            No se borran: cuentas de usuarios, cursos, matrículas, ni el catálogo de competencias/capacidades.
          </p>
          <label className="block text-xs font-medium mb-1" style={{ color: NAVY_DARK }}>
            Escribe <strong>BORRAR</strong> para confirmar
          </label>
          <input
            type="text"
            value={confirmText}
            onChange={function (e) { setConfirmText(e.target.value) }}
            className="w-full max-w-xs rounded-lg px-3 py-2 text-sm outline-none mb-4"
            style={{ backgroundColor: 'white', border: '1px solid #D6DCE5', color: NAVY_DARK }}
          />
          {progreso && <p className="text-xs mb-3" style={{ color: '#1d5c8f' }}>{progreso}</p>}
          {error && <p className="text-red-500 text-sm mb-3">{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={function () { setStep(1); setConfirmText('') }}
              className="text-sm font-semibold px-5 py-2.5 rounded-lg transition"
              style={{ backgroundColor: '#F4F6F9', color: NAVY_DARK, border: '1px solid #D6DCE5' }}
            >
              Cancelar
            </button>
            <button
              onClick={borrarTodo}
              disabled={confirmText !== 'BORRAR' || borrando}
              className="text-sm font-semibold px-5 py-2.5 rounded-lg text-white transition hover:opacity-90 disabled:opacity-50"
              style={{ backgroundColor: '#B91C1C' }}
            >
              {borrando ? 'Borrando...' : 'Borrar todo definitivamente'}
            </button>
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="bg-white rounded-2xl p-6" style={{ border: '1px solid #E5E9F0' }}>
          <h3 className="text-sm font-bold mb-2" style={{ color: '#2f7a1f' }}>✓ Periodo cerrado</h3>
          <p className="text-sm text-slate-500 mb-4">
            Se borraron materiales, tareas, entregas y carpetas de todos los cursos. Cuentas, cursos y matrículas
            siguen intactos. Ya puedes empezar el siguiente periodo creando nuevas Unidades y Actividades.
          </p>
          <button
            onClick={function () { setStep(1) }}
            className="text-sm font-semibold px-5 py-2.5 rounded-lg text-white transition hover:opacity-90"
            style={{ backgroundColor: GREEN }}
          >
            Listo
          </button>
        </div>
      )}
    </div>
  )
}
