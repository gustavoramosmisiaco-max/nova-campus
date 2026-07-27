import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import { useAuth } from './AuthContext'
import { getLetterGrade } from './gradeUtils'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

const NAVY_DARK = '#0F2A4A'

const inputStyle = { backgroundColor: 'white', border: '1px solid #D6DCE5', color: NAVY_DARK }

const NIVELES = [
  { letra: 'AD', nombre: 'Logro destacado', color: '#2f7a1f' },
  { letra: 'A', nombre: 'Logro esperado', color: '#1d5c8f' },
  { letra: 'B', nombre: 'En proceso', color: '#B45309' },
  { letra: 'C', nombre: 'En inicio', color: '#B91C1C' },
]

const tableCell = { border: '1px solid #94A3B8', padding: '6px 8px', fontSize: '12px' }
const tableHeadCell = { ...tableCell, backgroundColor: '#F4F6F9', fontWeight: 700, color: NAVY_DARK }

function todayFormatted() {
  const d = new Date()
  const pad = function (n) { return String(n).padStart(2, '0') }
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`
}

function average(numbers) {
  if (numbers.length === 0) return null
  return numbers.reduce(function (a, b) { return a + b }, 0) / numbers.length
}

export default function InstrumentoEvaluacion({ courseId, courseNombre, courseGrado, courseGrupo }) {
  const { profile } = useAuth()
  const [activities, setActivities] = useState([])
  const [selectedId, setSelectedId] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [matrix, setMatrix] = useState(null)
  const [institucion, setInstitucion] = useState(function () {
    return localStorage.getItem('nova_institucion') || ''
  })

  function saveInstitucion(value) {
    setInstitucion(value)
    localStorage.setItem('nova_institucion', value)
  }

  useEffect(function () {
    loadActivities()
  }, [courseId])

  async function loadActivities() {
    setLoading(true)
    const result = await supabase
      .from('actividades')
      .select('id, nombre, numero_actividad, proposito, tipo_instrumento, competencia:competencias(nombre), actividad_capacidades(criterio, desempeno, desc_ad, desc_a, desc_b, desc_c, capacidad:capacidades(id, nombre, orden))')
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
      .select('id, fecha_entrega, assignment_capacidades(capacidad_id)')
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
    const students = enrollResult.data
      .map(function (e) { return e.student })
      .sort(function (a, b) { return a.full_name.localeCompare(b.full_name) })

    let cellValues = {}
    if (assignmentIds.length > 0) {
      const subsResult = await supabase.from('submissions').select('id, student_id, assignment_id').in('assignment_id', assignmentIds)
      const submissionsData = subsResult.error ? [] : subsResult.data
      const submissionIds = submissionsData.map(function (s) { return s.id })
      const subMap = {}
      submissionsData.forEach(function (s) { subMap[s.id] = s.student_id })

      let scoresData = []
      if (submissionIds.length > 0) {
        const scoresResult = await supabase
          .from('submission_scores')
          .select('submission_id, capacidad_id, score')
          .in('submission_id', submissionIds)
        if (!scoresResult.error) scoresData = scoresResult.data
      }

      const now = new Date()
      const grouped = {}

      // Notas ya registradas por el docente
      scoresData.forEach(function (row) {
        const studentId = subMap[row.submission_id]
        const key = `${studentId}__${row.capacidad_id}`
        if (!grouped[key]) grouped[key] = []
        if (row.score != null) grouped[key].push(row.score)
      })

      // Para cada tarea de esta actividad, revisar quién no entregó y ya venció -> C (0)
      assignResult.data.forEach(function (assignment) {
        const isPastDue = new Date(assignment.fecha_entrega) < now
        if (!isPastDue) return
        const capacidadIds = (assignment.assignment_capacidades || []).map(function (ac) { return ac.capacidad_id })
        students.forEach(function (student) {
          const hasSubmission = submissionsData.some(function (s) {
            return s.student_id === student.id && s.assignment_id === assignment.id
          })
          if (hasSubmission) return
          capacidadIds.forEach(function (capId) {
            const key = `${student.id}__${capId}`
            if (!grouped[key]) grouped[key] = []
            grouped[key].push(0)
          })
        })
      })

      Object.keys(grouped).forEach(function (key) {
        cellValues[key] = average(grouped[key])
      })
    }

    setMatrix({
      actividad: actividad,
      tipoInstrumento: actividad.tipo_instrumento || 'Lista de cotejo',
      capacidades: capacidades,
      students: students,
      cellValues: cellValues,
    })
    setLoading(false)
  }

  function exportarListaCotejoPDF() {
    if (!institucion.trim()) {
      alert('Completa el nombre de la institución educativa antes de exportar.')
      return
    }
    const a = matrix.actividad
    const doc = new jsPDF({ orientation: 'landscape' })

    doc.setFontSize(13)
    doc.text(institucion, 14, 14)
    doc.setFontSize(10)
    doc.text(`Fecha: ${todayFormatted()}   Grado: ${courseGrado}° SECUNDARIA   Sección: ${courseGrupo}`, 14, 21)
    doc.text(`Propósito: ${a.proposito || '—'}`, 14, 27)
    doc.text(`Competencia: ${a.competencia?.nombre || '—'}`, 14, 33)
    doc.text(`Actividad: ${a.nombre}`, 14, 39)

    // Bloque de detalle: capacidad, criterio y desempeño (igual que en pantalla)
    autoTable(doc, {
      startY: 44,
      head: [matrix.capacidades.map(function (cap) { return cap.capacidad.nombre })],
      body: [matrix.capacidades.map(function (cap) {
        return `Criterio: ${cap.criterio || '—'}\n\nDesempeño: ${cap.desempeno || '—'}`
      })],
      styles: { fontSize: 7, cellWidth: 'wrap', valign: 'top' },
      headStyles: { fillColor: [15, 42, 74], halign: 'center' },
      margin: { left: 14, right: 14 },
    })

    const detailEndY = doc.lastAutoTable.finalY + 4

    const head = [
      ['N°', 'Apellidos y Nombres', ...matrix.capacidades.flatMap(function (cap) {
        return NIVELES.map(function (n) { return `${cap.capacidad.nombre.slice(0, 12)}… ${n.letra}` })
      })]
    ]
    const body = matrix.students.map(function (s, idx) {
      const row = [idx + 1, s.full_name]
      matrix.capacidades.forEach(function (cap) {
        const score = matrix.cellValues[`${s.id}__${cap.capacidad.id}`]
        const letra = score != null ? getLetterGrade(score) : null
        NIVELES.forEach(function (n) {
          row.push(letra === n.letra ? 'X' : '')
        })
      })
      return row
    })

    autoTable(doc, {
      startY: detailEndY,
      head: head,
      body: body,
      styles: { fontSize: 6.5, halign: 'center' },
      headStyles: { fillColor: [15, 42, 74] },
      columnStyles: { 1: { halign: 'left' } },
      margin: { left: 14, right: 14 },
    })

    doc.save(`Lista_Cotejo_${courseNombre}_Actividad${a.numero_actividad}.pdf`)
  }

  function exportarRubricaPDF() {
    if (!institucion.trim()) {
      alert('Completa el nombre de la institución educativa antes de exportar.')
      return
    }
    const a = matrix.actividad
    const doc = new jsPDF({ orientation: 'landscape' })

    doc.setFontSize(13)
    doc.text(institucion, 14, 14)
    doc.setFontSize(10)
    doc.text(`Fecha: ${todayFormatted()}   Grado: ${courseGrado}° SECUNDARIA   Sección: ${courseGrupo}`, 14, 21)
    doc.text(`Competencia: ${a.competencia?.nombre || '—'}`, 14, 27)
    doc.text(`Propósito: ${a.proposito || '—'}`, 14, 33)
    doc.text(`Actividad: ${a.nombre}   Docente: ${profile?.full_name || ''}`, 14, 39)

    let startY = 46
    matrix.capacidades.forEach(function (cap) {
      doc.setFontSize(10)
      doc.text(cap.capacidad.nombre, 14, startY)
      startY += 4

      autoTable(doc, {
        startY: startY,
        head: [['AD', 'A', 'B', 'C']],
        body: [NIVELES.map(function (n) { return cap['desc_' + n.letra.toLowerCase()] || '—' })],
        styles: { fontSize: 7 },
        headStyles: { fillColor: [15, 42, 74] },
        margin: { left: 14, right: 14 },
      })
      startY = doc.lastAutoTable.finalY + 4

      const rosterBody = matrix.students.map(function (s, idx) {
        const score = matrix.cellValues[`${s.id}__${cap.capacidad.id}`]
        const letra = score != null ? getLetterGrade(score) : '—'
        return [idx + 1, s.full_name, letra]
      })
      autoTable(doc, {
        startY: startY,
        head: [['N°', 'Apellidos y Nombres', 'Calificación']],
        body: rosterBody,
        styles: { fontSize: 7 },
        headStyles: { fillColor: [15, 42, 74] },
        margin: { left: 14, right: 14 },
      })
      startY = doc.lastAutoTable.finalY + 10
    })

    doc.save(`Rubrica_${courseNombre}_Actividad${a.numero_actividad}.pdf`)
  }

  return (
    <div>
      <h3 className="text-lg font-bold mb-4" style={{ color: NAVY_DARK }}>Instrumento de Evaluación</h3>

      <div className="grid md:grid-cols-2 gap-3 mb-5">
        <div>
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

      {matrix && matrix.capacidades.length > 0 && (
        <div className="flex justify-end mb-3">
          <button
            onClick={matrix.tipoInstrumento === 'Rúbrica' ? exportarRubricaPDF : exportarListaCotejoPDF}
            className="text-xs font-semibold px-4 py-2 rounded-lg text-white transition hover:opacity-90"
            style={{ backgroundColor: '#5DAA47' }}
          >
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
    <div className="overflow-x-auto">
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
              <td style={tableHeadCell}>Actividad:</td>
              <td style={tableCell} colSpan={5}>{a.nombre}</td>
            </tr>
          </>
        }
      />

      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead>
          <tr>
            <td style={{ ...tableHeadCell, textAlign: 'center' }} colSpan={matrix.capacidades.length}>
              CRITERIO DE EVALUACIÓN
            </td>
          </tr>
          <tr>
            {matrix.capacidades.map(function (cap) {
              return (
                <td key={cap.capacidad.id} style={{ ...tableHeadCell, textAlign: 'center' }}>
                  {cap.capacidad.nombre}
                </td>
              )
            })}
          </tr>
          <tr>
            {matrix.capacidades.map(function (cap) {
              return (
                <td key={cap.capacidad.id} style={{ ...tableCell, color: '#1d5c8f', verticalAlign: 'top' }}>
                  <p style={{ marginBottom: 4 }}><strong>Criterio:</strong> {cap.criterio || '—'}</p>
                  <p style={{ color: NAVY_DARK }}><strong>Desempeño:</strong> {cap.desempeno || '—'}</p>
                </td>
              )
            })}
          </tr>
        </thead>
      </table>

      <table style={{ borderCollapse: 'collapse', width: '100%', marginTop: '-1px' }}>
        <thead>
          <tr>
            <td style={{ ...tableHeadCell, width: 40 }}>N°</td>
            <td style={{ ...tableHeadCell, minWidth: 220 }}>APELLIDOS Y NOMBRES</td>
            {matrix.capacidades.map(function (cap) {
              return (
                <td key={cap.capacidad.id} style={{ ...tableHeadCell, textAlign: 'center' }} colSpan={4}>
                  calificación
                </td>
              )
            })}
          </tr>
          <tr>
            <td style={tableHeadCell}></td>
            <td style={tableHeadCell}></td>
            {matrix.capacidades.map(function (cap) {
              return NIVELES.map(function (n) {
                return (
                  <td key={cap.capacidad.id + n.letra} style={{ ...tableHeadCell, textAlign: 'center', color: n.color }}>
                    {n.letra}
                  </td>
                )
              })
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
                  return NIVELES.map(function (n) {
                    return (
                      <td key={cap.capacidad.id + n.letra} style={{ ...tableCell, textAlign: 'center' }}>
                        {letra === n.letra ? <span style={{ fontWeight: 700, color: n.color }}>X</span> : ''}
                      </td>
                    )
                  })
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
    <div className="overflow-x-auto space-y-8">
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
              <td style={tableHeadCell}>Actividad:</td>
              <td style={tableCell} colSpan={5}>{a.nombre}</td>
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
              <thead>
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