import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import { getLetterGrade, getLetterColor } from './gradeUtils'

const NAVY_DARK = '#0F2A4A'
const GREEN = '#5DAA47'

const BIMESTRES = [1, 2, 3, 4]
const NOMBRE_BIMESTRE = { 1: 'I Bimestre', 2: 'II Bimestre', 3: 'III Bimestre', 4: 'IV Bimestre' }

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

    // Unidades de este bimestre, en cualquiera de las asignaturas del área
    const unidResult = await supabase
      .from('unidades')
      .select('id, numero, course_id')
      .in('course_id', courseIds)
    const unidadesBimestre = (unidResult.error ? [] : unidResult.data).filter(function (u) {
      return Math.ceil(u.numero / 2) === bimestre
    })
    const unidadIds = unidadesBimestre.map(function (u) { return u.id })

    let actividades = []
    let assignments = []
    if (unidadIds.length > 0) {
      const actResult = await supabase
        .from('actividades')
        .select('id, nombre, numero_actividad, unidad_id, actividad_capacidades(capacidad_id, criterio, desempeno)')
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
        studentsList.sort(function (a, b) { return a.full_name.localeCompare(b.full_name) })
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

    // Notas de cierre de unidad (por competencia)
    let cierreMap = {} // studentId__competenciaId -> [notas]
    if (courseIds.length > 0) {
      const cierreResult = await supabase
        .from('evaluacion_cierre')
        .select('student_id, competencia_id, nota_numerica')
        .in('course_id', courseIds)
        .eq('bimestre', bimestre)
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

  if (loading) return <p className="text-slate-400 text-sm">Cargando registro...</p>
  if (error) return <p className="text-red-500 text-sm">{error}</p>

  return (
    <div>
      <h3 className="text-lg font-bold mb-4" style={{ color: NAVY_DARK }}>Registro Auxiliar</h3>

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

      {students.length === 0 ? (
        <p className="text-slate-400 text-sm">No hay estudiantes matriculados en esta aula.</p>
      ) : competenciasData.every(function (c) { return c.capacidades.every(function (cap) { return cap.instancias.length === 0 }) }) ? (
        <p className="text-slate-400 text-sm">Aún no hay actividades/tareas registradas en este bimestre.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="border-collapse" style={{ minWidth: '100%' }}>
            <thead>
              <tr>
                <td rowSpan={5} className="p-2 font-semibold sticky left-0" style={{ backgroundColor: '#F4F6F9', color: NAVY_DARK, border: '1px solid #E5E9F0', minWidth: 170, verticalAlign: 'bottom' }}>
                  Apellidos y Nombres
                </td>
                <td rowSpan={5} className="p-2 text-center font-semibold" style={{ backgroundColor: NAVY_DARK, color: 'white', border: '1px solid #0a1f38', minWidth: 60, verticalAlign: 'middle' }}>
                  Promedio<br />del Área
                </td>
                {competenciasData.map(function (comp) {
                  const cols = comp.capacidades.reduce(function (acc, cap) { return acc + Math.max(cap.instancias.length, 1) }, 0) + 1
                  return (
                    <td key={comp.id} colSpan={cols} className="p-1.5 text-center font-semibold text-white" style={{ backgroundColor: GREEN, border: '1px solid #4a9038', fontSize: 12 }}>
                      {comp.nombre}
                    </td>
                  )
                })}
              </tr>
              <tr>
                {competenciasData.map(function (comp) {
                  return comp.capacidades.map(function (cap) {
                    const span = Math.max(cap.instancias.length, 1)
                    return (
                      <td key={cap.id} colSpan={span} className="p-1.5 text-center" style={{ backgroundColor: '#E7F3E4', color: '#2f7a1f', border: '1px solid #E5E9F0', fontSize: 11, minWidth: 100 * span }}>
                        {cap.nombre}
                      </td>
                    )
                  }).concat(
                    <td key={comp.id + '_prom'} rowSpan={4} className="p-1.5 text-center font-semibold" style={{ backgroundColor: '#DEEBF7', color: NAVY_DARK, border: '1px solid #E5E9F0', fontSize: 11, minWidth: 60, verticalAlign: 'middle' }}>
                      Promedio<br />Competencia
                    </td>
                  )
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
                        <td key={inst.assignmentId} className="p-1.5 text-center" style={{ backgroundColor: '#FAFAF8', border: '1px solid #E5E9F0', fontSize: 10, color: '#5F5E5A', minWidth: 100 }}>
                          Act.{inst.actividadNumero}
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
                          className="p-1.5 text-center cursor-pointer"
                          style={{ backgroundColor: '#FAFAF8', border: '1px solid #E5E9F0', fontSize: 10, color: '#164a72', textDecoration: 'underline dotted' }}
                        >
                          Criterio
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
                          className="p-1.5 text-center cursor-pointer"
                          style={{ backgroundColor: '#FAFAF8', border: '1px solid #E5E9F0', fontSize: 10, color: '#8a5cb0', textDecoration: 'underline dotted' }}
                        >
                          Desempeño
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
                        <td className="p-2 text-center font-bold" style={{ backgroundColor: NAVY_DARK, color: 'white', border: '1px solid #0a1f38' }}>
                          {provArea != null ? getLetterGrade(provArea) : '—'}
                        </td>
                      )
                    })()}
                    {competenciasData.map(function (comp) {
                      const provComp = promedioCompetencia(s.id, comp)
                      return (
                        <>
                          {comp.capacidades.map(function (cap) {
                            if (cap.instancias.length === 0) {
                              return <td key={cap.id + '_' + s.id} style={{ border: '1px solid #E5E9F0' }}></td>
                            }
                            return cap.instancias.map(function (inst) {
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
                          })}
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
      )}

      {/* Popups de criterio/desempeño */}
      {competenciasData.map(function (comp) {
        return comp.capacidades.map(function (cap) {
          return cap.instancias.map(function (inst) {
            return (
              <div key={'pops_' + inst.assignmentId}>
                {abierto === 'c_' + inst.assignmentId && (
                  <div className="mt-4 p-4 rounded-xl" style={{ backgroundColor: '#DEEBF7' }}>
                    <p className="text-xs font-semibold mb-1" style={{ color: NAVY_DARK }}>
                      Criterio — {inst.tituloTarea} (Act. {inst.actividadNumero})
                    </p>
                    <p className="text-sm" style={{ color: NAVY_DARK }}>{inst.criterio || 'Sin criterio registrado.'}</p>
                  </div>
                )}
                {abierto === 'd_' + inst.assignmentId && (
                  <div className="mt-4 p-4 rounded-xl" style={{ backgroundColor: '#f0e7f7' }}>
                    <p className="text-xs font-semibold mb-1" style={{ color: '#4a2e63' }}>
                      Desempeño — {inst.tituloTarea} (Act. {inst.actividadNumero})
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
