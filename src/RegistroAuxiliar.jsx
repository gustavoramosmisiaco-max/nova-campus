import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import { useAuth } from './AuthContext'
import { getLetterGrade } from './gradeUtils'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

const NAVY_DARK = '#0F2A4A'
const NAVY = '#1d5c8f'
const GREEN = '#5DAA47'

const inputStyle = { backgroundColor: 'white', border: '1px solid #D6DCE5', color: NAVY_DARK }

function average(numbers) {
  if (numbers.length === 0) return null
  const sum = numbers.reduce(function (a, b) { return a + b }, 0)
  return sum / numbers.length
}

export default function RegistroAuxiliar({ courseId, courseNombre, courseGrado, courseGrupo }) {
  const { profile } = useAuth()
  const [units, setUnits] = useState([])
  const [selectedUnit, setSelectedUnit] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reportRows, setReportRows] = useState([])
  const [taskColumns, setTaskColumns] = useState([])
  const [institucion, setInstitucion] = useState(function () {
    return localStorage.getItem('nova_institucion') || ''
  })

  useEffect(function () {
    loadUnits()
  }, [courseId])

  async function loadUnits() {
    setLoading(true)
    const result = await supabase
      .from('actividades')
      .select('tipo_unidad, numero_unidad')
      .eq('course_id', courseId)

    if (!result.error) {
      const seen = new Set()
      const list = []
      result.data.forEach(function (a) {
        const key = `${a.tipo_unidad}__${a.numero_unidad}`
        if (!seen.has(key)) {
          seen.add(key)
          list.push({ key, tipo: a.tipo_unidad, numero: a.numero_unidad })
        }
      })
      list.sort(function (a, b) { return Number(a.numero) - Number(b.numero) })
      setUnits(list)
    }
    setLoading(false)
  }

  async function loadUnitReport(unitKey) {
    setSelectedUnit(unitKey)
    if (!unitKey) {
      setReportRows([])
      setTaskColumns([])
      return
    }
    setLoading(true)
    setError('')

    const unit = units.find(function (u) { return u.key === unitKey })

    const actResult = await supabase
      .from('actividades')
      .select('id')
      .eq('course_id', courseId)
      .eq('tipo_unidad', unit.tipo)
      .eq('numero_unidad', unit.numero)

    if (actResult.error) {
      setError(actResult.error.message)
      setLoading(false)
      return
    }

    const actividadIds = actResult.data.map(function (a) { return a.id })
    if (actividadIds.length === 0) {
      setReportRows([])
      setTaskColumns([])
      setLoading(false)
      return
    }

    const assignResult = await supabase
      .from('assignments')
      .select('id, titulo, instrumento_evaluacion, fecha_entrega, puntaje_maximo')
      .in('actividad_id', actividadIds)
      .order('fecha_entrega', { ascending: true })

    if (assignResult.error) {
      setError(assignResult.error.message)
      setLoading(false)
      return
    }

    const assignmentIds = assignResult.data.map(function (a) { return a.id })
    setTaskColumns(assignResult.data)

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

    let subsMap = {}
    if (assignmentIds.length > 0) {
      const subsResult = await supabase
        .from('submissions')
        .select('student_id, assignment_id, score, publicado')
        .in('assignment_id', assignmentIds)

      if (!subsResult.error) {
        subsResult.data.forEach(function (s) {
          subsMap[`${s.student_id}__${s.assignment_id}`] = { score: s.score, publicado: s.publicado }
        })
      }
    }

    const now = new Date()
    const rows = enrollResult.data.map(function (e) {
      const student = e.student
      const notas = assignResult.data.map(function (a) {
        const info = subsMap[`${student.id}__${a.id}`]
        const entregado = Boolean(info)
        const isPastDue = new Date(a.fecha_entrega) < now
        let score = null
        if (entregado && info.publicado) score = info.score
        else if (!entregado && isPastDue) score = 0
        return { assignmentId: a.id, score: score }
      })
      const validScores = notas.map(function (n) { return n.score }).filter(function (s) { return s != null })
      return {
        studentId: student.id,
        studentName: student.full_name,
        notas: notas,
        promedio: average(validScores),
      }
    })

    rows.sort(function (a, b) { return a.studentName.localeCompare(b.studentName) })
    setReportRows(rows)
    setLoading(false)
  }

  function saveInstitucion(value) {
    setInstitucion(value)
    localStorage.setItem('nova_institucion', value)
  }

  function exportPDF() {
    if (!institucion.trim()) {
      alert('Por favor completa el nombre de la institución educativa antes de exportar.')
      return
    }

    const unit = units.find(function (u) { return u.key === selectedUnit })
    const doc = new jsPDF({ orientation: 'landscape' })

    doc.setFontSize(13)
    doc.text(institucion, 14, 14)
    doc.setFontSize(11)
    doc.text('Registro Auxiliar de Evaluación', 14, 21)
    doc.setFontSize(9)
    doc.text(`Curso: ${courseNombre} — ${courseGrado}° Sección ${courseGrupo}`, 14, 27)
    doc.text(`Docente: ${profile?.full_name || ''}`, 14, 32)
    doc.text(`${unit.tipo} ${unit.numero}`, 14, 37)

    const head = [['Estudiante', ...taskColumns.map(function (t) { return t.titulo }), 'Promedio']]
    const body = reportRows.map(function (r) {
      const notaCells = r.notas.map(function (n) {
        return n.score != null ? getLetterGrade(n.score) : '—'
      })
      const prom = r.promedio != null ? getLetterGrade(r.promedio) : '—'
      return [r.studentName, ...notaCells, prom]
    })

    autoTable(doc, {
      startY: 42,
      head: head,
      body: body,
      styles: { fontSize: 7 },
      headStyles: { fillColor: [15, 42, 74] },
      margin: { left: 14, right: 14 },
    })

    const instrumentosUsados = [...new Set(taskColumns.map(function (t) { return t.instrumento_evaluacion }).filter(Boolean))]
    if (instrumentosUsados.length > 0) {
      const finalY = doc.lastAutoTable.finalY + 8
      doc.setFontSize(8)
      doc.text(`Instrumentos de evaluación usados: ${instrumentosUsados.join(', ')}`, 14, finalY)
    }

    doc.save(`Registro_Auxiliar_${courseNombre}_${unit.tipo}${unit.numero}.pdf`)
  }

  return (
    <div>
      <h3 className="text-lg font-bold mb-4" style={{ color: NAVY_DARK }}>Registro Auxiliar</h3>

      <div className="grid md:grid-cols-2 gap-3 mb-5">
        <div>
          <label className="block text-xs font-medium mb-1" style={{ color: NAVY_DARK }}>Unidad / Experiencia</label>
          <select
            value={selectedUnit}
            onChange={function (e) { loadUnitReport(e.target.value) }}
            className="w-full rounded-lg px-3 py-2 text-sm outline-none"
            style={inputStyle}
          >
            <option value="">-- Selecciona una unidad --</option>
            {units.map(function (u) {
              return <option key={u.key} value={u.key}>{u.tipo} {u.numero}</option>
            })}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium mb-1" style={{ color: NAVY_DARK }}>
            Institución educativa (para exportar)
          </label>
          <input
            type="text"
            value={institucion}
            onChange={function (e) { saveInstitucion(e.target.value) }}
            placeholder="Ej: I.E.P. Señor de Luren"
            className="w-full rounded-lg px-3 py-2 text-sm outline-none"
            style={inputStyle}
          />
        </div>
      </div>

      {error && <p className="text-red-500 text-sm mb-3">{error}</p>}

      {selectedUnit && (
        <>
          <div className="flex justify-end mb-3">
            <button
              onClick={exportPDF}
              disabled={reportRows.length === 0}
              className="text-xs font-semibold px-4 py-2 rounded-lg text-white transition hover:opacity-90 disabled:opacity-50"
              style={{ backgroundColor: GREEN }}
            >
              Exportar PDF
            </button>
          </div>

          {loading ? (
            <p className="text-slate-400 text-sm">Cargando registro...</p>
          ) : reportRows.length === 0 ? (
            <p className="text-slate-400 text-sm">No hay tareas o estudiantes matriculados en esta unidad.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: '1px solid #E5E9F0' }}>
                    <th className="text-left py-2 pr-3 font-semibold" style={{ color: NAVY_DARK }}>Estudiante</th>
                    {taskColumns.map(function (t) {
                      return (
                        <th key={t.id} className="text-center py-2 px-2 font-semibold text-xs" style={{ color: NAVY_DARK }}>
                          {t.titulo}
                          {t.instrumento_evaluacion && (
                            <div className="text-[10px] font-normal text-slate-400">{t.instrumento_evaluacion}</div>
                          )}
                        </th>
                      )
                    })}
                    <th className="text-right py-2 pl-3 font-semibold" style={{ color: NAVY_DARK }}>Promedio</th>
                  </tr>
                </thead>
                <tbody>
                  {reportRows.map(function (r) {
                    return (
                      <tr key={r.studentId} style={{ borderBottom: '1px solid #F4F6F9' }}>
                        <td className="py-2 pr-3" style={{ color: NAVY_DARK }}>{r.studentName}</td>
                        {r.notas.map(function (n, i) {
                          return (
                            <td key={i} className="text-center py-2 px-2 text-xs">
                              {n.score != null ? getLetterGrade(n.score) : '—'}
                            </td>
                          )
                        })}
                        <td className="text-right py-2 pl-3 font-semibold" style={{ color: NAVY }}>
                          {r.promedio != null ? getLetterGrade(r.promedio) : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
