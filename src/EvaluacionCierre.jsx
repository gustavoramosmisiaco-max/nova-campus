import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import { useAuth } from './AuthContext'
import { getLetterGrade, getLetterColor, compararPorApellido } from './gradeUtils'

const NAVY_DARK = '#0F2A4A'
const GREEN = '#5DAA47'

const inputStyle = { backgroundColor: 'white', border: '1px solid #D6DCE5', color: NAVY_DARK }

export default function EvaluacionCierre({ unidad, onFinalizada }) {
  const { session } = useAuth()
  const [areaNombre, setAreaNombre] = useState('')
  const [competencias, setCompetencias] = useState([])
  const [students, setStudents] = useState([])
  const [notasMap, setNotasMap] = useState({})
  const [finalizada, setFinalizada] = useState(unidad.finalizada || false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [savingKey, setSavingKey] = useState(null)
  const [marcandoFinal, setMarcandoFinal] = useState(false)

  useEffect(function () {
    cargarTodo()
  }, [unidad.id])

  async function cargarTodo() {
    setLoading(true)
    setError('')

    const courseResult = await supabase
      .from('courses')
      .select('asignaturas(area_id, areas_curriculares(nombre))')
      .eq('id', unidad.course_id)
      .single()

    const area = courseResult.data?.asignaturas?.areas_curriculares
    if (!area) {
      setError('Este curso no tiene un Área vinculada. Revisa la Asignatura en "Cursos".')
      setLoading(false)
      return
    }
    setAreaNombre(area.nombre)

    const compResult = await supabase.from('competencias').select('*').eq('area', area.nombre).order('codigo')
    if (compResult.error) {
      setError(compResult.error.message)
      setLoading(false)
      return
    }
    setCompetencias(compResult.data)

    const enrollResult = await supabase
      .from('enrollments')
      .select('student:profiles(id, full_name)')
      .eq('course_id', unidad.course_id)
      .eq('status', 'activo')
    if (enrollResult.error) {
      setError(enrollResult.error.message)
      setLoading(false)
      return
    }
    const studentsList = enrollResult.data.map(function (e) { return e.student }).sort(function (a, b) { return compararPorApellido(a.full_name, b.full_name) })
    setStudents(studentsList)

    const notasResult = await supabase
      .from('evaluacion_cierre')
      .select('*')
      .eq('unidad_id', unidad.id)
    const map = {}
    if (!notasResult.error) {
      notasResult.data.forEach(function (n) {
        map[`${n.student_id}__${n.competencia_id}`] = n.nota_numerica
      })
    }
    setNotasMap(map)

    const unidResult = await supabase.from('unidades').select('finalizada').eq('id', unidad.id).single()
    if (!unidResult.error) setFinalizada(unidResult.data.finalizada)

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

    const bimestre = Math.ceil(unidad.numero / 2)

    const result = await supabase.from('evaluacion_cierre').upsert(
      {
        student_id: studentId,
        course_id: unidad.course_id,
        unidad_id: unidad.id,
        competencia_id: competenciaId,
        bimestre: bimestre,
        nota_numerica: numScore,
        nota_letra: getLetterGrade(numScore),
        graded_by: session.user.id,
        graded_at: new Date().toISOString(),
      },
      { onConflict: 'student_id,unidad_id,competencia_id' }
    )

    if (result.error) {
      alert('Error al guardar: ' + result.error.message)
    } else {
      setNotasMap(function (prev) { return { ...prev, [key]: numScore } })
    }
    setSavingKey(null)
  }

  async function handleFinalizarUnidad() {
    if (!confirm(`¿Marcar ${unidad.tipo} ${unidad.numero} como finalizada? Sus notas de cierre pasarán al Registro Auxiliar del Bimestre correspondiente.`)) return
    setMarcandoFinal(true)
    const result = await supabase.from('unidades').update({ finalizada: true }).eq('id', unidad.id)
    if (result.error) {
      alert('Error: ' + result.error.message)
    } else {
      setFinalizada(true)
      if (onFinalizada) onFinalizada()
    }
    setMarcandoFinal(false)
  }

  async function handleReabrirUnidad() {
    if (!confirm('¿Reabrir esta unidad para seguir editando sus notas de cierre?')) return
    const result = await supabase.from('unidades').update({ finalizada: false }).eq('id', unidad.id)
    if (!result.error) setFinalizada(false)
  }

  if (loading) return <p className="text-slate-400 text-sm">Cargando...</p>

  return (
    <div>
      <div className="flex justify-between items-center flex-wrap gap-3 mb-1">
        <h3 className="text-lg font-bold" style={{ color: NAVY_DARK }}>Evaluación de Cierre</h3>
        {finalizada ? (
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold px-3 py-1.5 rounded-full" style={{ backgroundColor: '#E7F3E4', color: '#2f7a1f' }}>
              ✓ {unidad.tipo} {unidad.numero} finalizada
            </span>
            <button onClick={handleReabrirUnidad} className="text-xs font-semibold px-3 py-1.5 rounded-lg transition" style={{ backgroundColor: 'white', color: NAVY_DARK, border: '1px solid #D6DCE5' }}>
              Reabrir
            </button>
          </div>
        ) : (
          <button
            onClick={handleFinalizarUnidad}
            disabled={marcandoFinal}
            className="text-xs font-semibold px-4 py-2 rounded-lg text-white transition hover:opacity-90 disabled:opacity-50"
            style={{ backgroundColor: GREEN }}
          >
            {marcandoFinal ? 'Guardando...' : `Marcar ${unidad.tipo} ${unidad.numero} como finalizada`}
          </button>
        )}
      </div>
      <p className="text-sm text-slate-400 mb-4">
        Nota de cierre por competencia del área <strong>{areaNombre}</strong>, correspondiente a {unidad.tipo} {unidad.numero} (Bimestre {Math.ceil(unidad.numero / 2)}).
      </p>

      {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

      {!error && competencias.length === 0 ? (
        <p className="text-slate-400 text-sm">No se encontraron competencias para esta área.</p>
      ) : !error && students.length === 0 ? (
        <p className="text-slate-400 text-sm">No hay estudiantes matriculados en este curso.</p>
      ) : !error && (
        <div className="overflow-auto" style={{ maxHeight: '70vh' }}>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr>
                <td className="p-2 font-semibold sticky left-0 top-0 z-20" style={{ backgroundColor: '#F4F6F9', color: NAVY_DARK, border: '1px solid #E5E9F0', minWidth: 180 }}>
                  Apellidos y Nombres
                </td>
                {competencias.map(function (c) {
                  return (
                    <td key={c.id} className="p-2 text-center font-semibold sticky top-0 z-10" style={{ backgroundColor: '#F4F6F9', color: NAVY_DARK, border: '1px solid #E5E9F0', minWidth: 160 }}>
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
                              disabled={isSaving || finalizada}
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
