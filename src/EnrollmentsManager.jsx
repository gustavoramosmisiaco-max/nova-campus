import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'

const NAVY_DARK = '#0F2A4A'
const NAVY = '#1d5c8f'
const GREEN = '#5DAA47'
const GREEN_DARK = '#2f7a1f'

const GRADOS = [1, 2, 3, 4, 5]
const SECCIONES = ['A', 'B', 'C', 'D', 'E']

function gradoLabel(g) {
  return g ? `${g}° de Secundaria` : ''
}

const inputStyle = { backgroundColor: 'white', border: '1px solid #D6DCE5', color: NAVY_DARK }

export default function EnrollmentsManager() {
  const [selectedGrado, setSelectedGrado] = useState('')
  const [selectedSeccion, setSelectedSeccion] = useState('')

  const [aulaCourses, setAulaCourses] = useState([])
  const [allStudents, setAllStudents] = useState([])
  const [enrollments, setEnrollments] = useState([])

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(function () {
    loadAllStudents()
  }, [])

  useEffect(function () {
    if (selectedGrado && selectedSeccion) {
      loadAula()
    } else {
      setAulaCourses([])
      setEnrollments([])
    }
  }, [selectedGrado, selectedSeccion])

  async function loadAllStudents() {
    const result = await supabase
      .from('profiles')
      .select('id, full_name, email')
      .eq('role', 'estudiante')
      .order('full_name')
    if (!result.error) setAllStudents(result.data)
  }

  async function loadAula() {
    setLoading(true)
    setError('')

    const coursesResult = await supabase
      .from('courses')
      .select('id, nombre')
      .eq('grado', selectedGrado)
      .eq('grupo', selectedSeccion)
      .order('nombre')

    if (coursesResult.error) {
      setError(coursesResult.error.message)
      setLoading(false)
      return
    }

    setAulaCourses(coursesResult.data)

    const courseIds = coursesResult.data.map(function (c) { return c.id })
    if (courseIds.length === 0) {
      setEnrollments([])
      setLoading(false)
      return
    }

    const enrollResult = await supabase
      .from('enrollments')
      .select('id, course_id, student:profiles(id, full_name, email)')
      .in('course_id', courseIds)

    if (enrollResult.error) {
      setError(enrollResult.error.message)
    } else {
      setEnrollments(enrollResult.data)
    }
    setLoading(false)
  }

  async function handleEnrollAll(studentId) {
    setError('')
    const missing = aulaCourses.filter(function (c) {
      return !enrollments.some(function (e) { return e.course_id === c.id && e.student?.id === studentId })
    })
    if (missing.length === 0) return

    const payload = missing.map(function (c) {
      return { course_id: c.id, student_id: studentId, status: 'activo' }
    })
    const result = await supabase.from('enrollments').insert(payload)
    if (result.error) {
      setError('Error al matricular: ' + result.error.message)
    } else {
      loadAula()
    }
  }

  async function handleToggleSubject(studentId, courseId, isEnrolled, enrollmentId) {
    setError('')
    if (isEnrolled) {
      const result = await supabase.from('enrollments').delete().eq('id', enrollmentId)
      if (result.error) {
        alert('Error: ' + result.error.message)
      } else {
        loadAula()
      }
    } else {
      const result = await supabase.from('enrollments').insert({ course_id: courseId, student_id: studentId, status: 'activo' })
      if (result.error) {
        setError('Error al matricular: ' + result.error.message)
      } else {
        loadAula()
      }
    }
  }

  async function handleRemoveFromAula(studentId) {
    if (!confirm('¿Quitar a este alumno de todas las asignaturas de esta aula?')) return
    const courseIds = aulaCourses.map(function (c) { return c.id })
    const result = await supabase
      .from('enrollments')
      .delete()
      .eq('student_id', studentId)
      .in('course_id', courseIds)
    if (result.error) {
      alert('Error: ' + result.error.message)
    } else {
      loadAula()
    }
  }

  const enrolledStudentIds = new Set(enrollments.map(function (e) { return e.student?.id }).filter(Boolean))
  const studentsInAula = allStudents.filter(function (s) { return enrolledStudentIds.has(s.id) })
  const availableStudents = allStudents.filter(function (s) { return !enrolledStudentIds.has(s.id) })

  function coursesForStudent(studentId) {
    return enrollments.filter(function (e) { return e.student?.id === studentId })
  }

  return (
    <div>
      <h2 className="text-2xl font-bold mb-4" style={{ color: NAVY_DARK }}>Matrículas</h2>

      <div className="grid grid-cols-2 gap-3 mb-6 max-w-md">
        <div>
          <label className="block text-sm font-medium mb-1" style={{ color: NAVY_DARK }}>Grado</label>
          <select
            value={selectedGrado}
            onChange={function (e) { setSelectedGrado(e.target.value ? Number(e.target.value) : '') }}
            className="w-full rounded-lg px-3 py-2 text-sm outline-none"
            style={inputStyle}
          >
            <option value="">-- Elige --</option>
            {GRADOS.map(function (g) {
              return <option key={g} value={g}>{g}°</option>
            })}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1" style={{ color: NAVY_DARK }}>Sección</label>
          <select
            value={selectedSeccion}
            onChange={function (e) { setSelectedSeccion(e.target.value) }}
            className="w-full rounded-lg px-3 py-2 text-sm outline-none"
            style={inputStyle}
          >
            <option value="">-- Elige --</option>
            {SECCIONES.map(function (s) {
              return <option key={s} value={s}>Sección {s}</option>
            })}
          </select>
        </div>
      </div>

      {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

      {selectedGrado && selectedSeccion && (
        <>
          {loading ? (
            <p className="text-slate-400 text-sm">Cargando aula...</p>
          ) : aulaCourses.length === 0 ? (
            <div className="bg-white rounded-2xl p-8 text-center" style={{ border: '1px dashed #D6DCE5' }}>
              <p className="text-slate-400 text-sm">
                No hay cursos creados para {gradoLabel(selectedGrado)} - Sección {selectedSeccion}. Créalos primero en "Cursos".
              </p>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap gap-2 mb-6">
                <span
                  className="text-xs font-semibold px-3 py-1.5 rounded-full"
                  style={{ backgroundColor: '#E7F3E4', color: GREEN_DARK }}
                >
                  {gradoLabel(selectedGrado)} · Sección {selectedSeccion}
                </span>
                {aulaCourses.map(function (c) {
                  return (
                    <span
                      key={c.id}
                      className="text-xs font-semibold px-3 py-1.5 rounded-full"
                      style={{ backgroundColor: '#F4F6F9', color: NAVY_DARK, border: '1px solid #D6DCE5' }}
                    >
                      {c.nombre}
                    </span>
                  )
                })}
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                {/* Matriculados en el aula */}
                <div className="bg-white rounded-2xl p-5" style={{ border: '1px solid #E5E9F0' }}>
                  <h3 className="font-bold mb-3" style={{ color: NAVY_DARK }}>
                    Matriculados en el aula ({studentsInAula.length})
                  </h3>
                  {studentsInAula.length === 0 ? (
                    <p className="text-slate-400 text-sm">Ningún alumno matriculado aún en esta aula.</p>
                  ) : (
                    <ul className="space-y-3">
                      {studentsInAula.map(function (s) {
                        const studentEnrollments = coursesForStudent(s.id)
                        return (
                          <li
                            key={s.id}
                            className="rounded-lg p-3"
                            style={{ backgroundColor: '#F4F6F9' }}
                          >
                            <div className="flex justify-between items-start mb-2">
                              <div>
                                <p className="text-sm font-semibold" style={{ color: NAVY_DARK }}>{s.full_name}</p>
                                <p className="text-xs text-slate-500">{s.email}</p>
                              </div>
                              <button
                                onClick={function () { handleRemoveFromAula(s.id) }}
                                className="text-xs font-semibold px-2 py-1 rounded-lg text-white transition hover:opacity-90"
                                style={{ backgroundColor: '#B91C1C' }}
                              >
                                Quitar del aula
                              </button>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {aulaCourses.map(function (c) {
                                const enr = studentEnrollments.find(function (e) { return e.course_id === c.id })
                                const isEnrolled = Boolean(enr)
                                return (
                                  <button
                                    key={c.id}
                                    onClick={function () { handleToggleSubject(s.id, c.id, isEnrolled, enr?.id) }}
                                    className="text-xs font-medium px-2.5 py-1 rounded-full transition"
                                    style={
                                      isEnrolled
                                        ? { backgroundColor: '#E7F3E4', color: GREEN_DARK }
                                        : { backgroundColor: 'white', color: '#94A3B8', border: '1px dashed #D6DCE5' }
                                    }
                                  >
                                    {isEnrolled ? '✓ ' : '+ '}{c.nombre}
                                  </button>
                                )
                              })}
                            </div>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </div>

                {/* Disponibles para matricular */}
                <div className="bg-white rounded-2xl p-5" style={{ border: '1px solid #E5E9F0' }}>
                  <h3 className="font-bold mb-3" style={{ color: NAVY_DARK }}>
                    Disponibles para matricular ({availableStudents.length})
                  </h3>
                  {availableStudents.length === 0 ? (
                    <p className="text-slate-400 text-sm">
                      Todos los alumnos ya están matriculados en esta aula.
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {availableStudents.map(function (s) {
                        return (
                          <li
                            key={s.id}
                            className="flex justify-between items-center rounded-lg px-3 py-2"
                            style={{ backgroundColor: '#F4F6F9' }}
                          >
                            <div>
                              <p className="text-sm font-medium" style={{ color: NAVY_DARK }}>{s.full_name}</p>
                              <p className="text-xs text-slate-500">{s.email}</p>
                            </div>
                            <button
                              onClick={function () { handleEnrollAll(s.id) }}
                              className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white transition hover:opacity-90"
                              style={{ backgroundColor: GREEN }}
                            >
                              Matricular en el aula
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}