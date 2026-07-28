import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import { useAuth } from './AuthContext'
import { getLetterGrade, getLetterColor } from './gradeUtils'

const NAVY_DARK = '#0F2A4A'
const GREEN = '#5DAA47'

const inputStyle = { backgroundColor: 'white', border: '1px solid #D6DCE5', color: NAVY_DARK }
const BIMESTRES = [1, 2, 3, 4]

export default function EvaluacionCierre({ courseId }) {
  const { session } = useAuth()
  const [bimestre, setBimestre] = useState(1)
  const [areaNombre, setAreaNombre] = useState('')
  const [competencias, setCompetencias] = useState([])
  const [students, setStudents] = useState([])
  const [notasMap, setNotasMap] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [savingKey, setSavingKey] = useState(null)

  useEffect(function () {
    cargarTodo()
  }, [bimestre])

  async function cargarTodo() {
    setLoading(true)
    setError('')

    const courseResult = await supabase
      .from('courses')
      .select('asignaturas(area_id, areas_curriculares(nombre))')
      .eq('id', courseId)
      .single()

    const area = courseResult.data?.asignaturas?.areas_curriculares
    if (!area) {
      setError('Este curso no tiene un Área vinculada. Revisa la Asignatura en "Cursos".')
      setLoading(false)
      return
    }
    setAreaNombre(area.nombre)

    const compResult = await supabase
      .from('competencias')
      .select('*')
      .eq('area', area.nombre)
      .order('codigo')
    if (compResult.error) {
      setError(compResult.error.message)
      setLoading(false)
      return
    }
    setCompetencias(compResult.data)

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
    const studentsList = enrollResult.data.map(function (e) { return e.student }).sort(function (a, b) { return a.full_name.localeCompare(b.full_name) })
    setStudents(studentsList)

    const notasResult = await supabase
      .from('evaluacion_cierre')
      .select('*')
      .eq('course_id', courseId)
      .eq('bimestre', bimestre)
    const map = {}
    if (!notasResult.error) {
      notasResult.data.forEach(function (n) {
        map[`${n.student_id}__${n.competencia_id}`] = n.nota_numerica
      })
    }
    setNotasMap(map)

    setLoading(false)
  }

  async function handleGuardarNota(studentId, competenciaId, valor) {
    const numScore = Number(valor)
    if (isNaN(numScore) || numScore < 0 || numScore > 20) {
      alert('La nota debe ser un número entre 0 y 20.')
      return
    }
    const key = `${studentId}__${competenciaId}`
    setSavingKey(key)

    const result = await supabase.from('evaluacion_cierre').upsert(
      {
        student_id: studentId,
        course_id: courseId,
        competencia_id: competenciaId,
        bimestre: bimestre,
        nota_numerica: numScore,
        nota_letra: getLetterGrade(numScore),
        graded_by: session.user.id,
        graded_at: new Date().toISOString(),
      },
      { onConflict: 'student_id,course_id,competencia_id,bimestre' }
    )

    if (result.error) {
      alert('Error al guardar: ' + result.error.message)
    } else {
      setNotasMap(function (prev) { return { ...prev, [key]: numScore } })
    }
    setSavingKey(null)
  }

  if (loading) return <p className="text-slate-400 text-sm">Cargando...</p>

  return (
    <div>
      <h3 className="text-lg font-bold mb-1" style={{ color: NAVY_DARK }}>Evaluación de Cierre</h3>
      <p className="text-sm text-slate-400 mb-4">
        Nota de cierre por competencia del área <strong>{areaNombre}</strong>, para el Registro Auxiliar oficial.
      </p>

      <div className="mb-5 max-w-xs">
        <label className="block text-xs font-medium mb-1" style={{ color: NAVY_DARK }}>Bimestre</label>
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

      {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

      {!error && competencias.length === 0 ? (
        <p className="text-slate-400 text-sm">No se encontraron competencias para esta área.</p>
      ) : !error && students.length === 0 ? (
        <p className="text-slate-400 text-sm">No hay estudiantes matriculados en este curso.</p>
      ) : !error && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr>
                <td className="p-2 font-semibold sticky left-0" style={{ backgroundColor: '#F4F6F9', color: NAVY_DARK, border: '1px solid #E5E9F0', minWidth: 180 }}>
                  Apellidos y Nombres
                </td>
                {competencias.map(function (c) {
                  return (
                    <td key={c.id} className="p-2 text-center font-semibold" style={{ backgroundColor: '#F4F6F9', color: NAVY_DARK, border: '1px solid #E5E9F0', minWidth: 160 }}>
                      {c.nombre}
                    </td>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {students.map(function (s) {
                return (
                  <tr key={s.id}>
                    <td className="p-2 sticky left-0" style={{ backgroundColor: 'white', color: NAVY_DARK, border: '1px solid #E5E9F0' }}>{s.full_name}</td>
                    {competencias.map(function (c) {
                      const key = `${s.id}__${c.id}`
                      const valor = notasMap[key]
                      const isSaving = savingKey === key
                      return (
                        <td key={c.id} className="p-2 text-center" style={{ border: '1px solid #E5E9F0' }}>
                          <div className="flex items-center justify-center gap-2">
                            <input
                              type="number"
                              min="0"
                              max="20"
                              step="0.5"
                              defaultValue={valor != null ? valor : ''}
                              placeholder="Nota"
                              disabled={isSaving}
                              className="w-16 rounded-lg text-sm px-2 py-1 outline-none text-center"
                              style={inputStyle}
                              onBlur={function (e) { if (e.target.value) handleGuardarNota(s.id, c.id, e.target.value) }}
                            />
                            {valor != null && (
                              <span className={'text-xs font-bold ' + getLetterColor(valor)}>{getLetterGrade(valor)}</span>
                            )}
                          </div>
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
