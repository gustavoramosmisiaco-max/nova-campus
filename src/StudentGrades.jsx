import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import { useAuth } from './AuthContext'
import { getLetterGrade, getLetterColor } from './gradeUtils'

const NAVY_DARK = '#0F2A4A'
const NAVY = '#1d5c8f'
const GREEN = '#5DAA47'
const GREEN_DARK = '#2f7a1f'

const BIMESTRES = [1, 2, 3, 4]
const NOMBRE_BIMESTRE = { 1: 'I Bimestre', 2: 'II Bimestre', 3: 'III Bimestre', 4: 'IV Bimestre' }

const DESCRIPCION_NIVEL = {
  AD: 'El estudiante demuestra un nivel superior al esperado para la competencia, resolviendo situaciones incluso más complejas.',
  A: 'El estudiante alcanza el nivel esperado de la competencia para el grado o ciclo.',
  B: 'El estudiante está próximo a alcanzar el nivel esperado y requiere acompañamiento para consolidarlo.',
  C: 'El estudiante evidencia dificultades importantes y necesita mayor tiempo y apoyo para desarrollar la competencia.',
}

function average(numbers) {
  const validos = numbers.filter(function (n) { return n != null })
  if (validos.length === 0) return null
  return validos.reduce(function (a, b) { return a + b }, 0) / validos.length
}

export default function StudentGrades() {
  const { session, profile } = useAuth()
  const [bimestre, setBimestre] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [areasData, setAreasData] = useState([])
  const [abierto, setAbierto] = useState(null)

  useEffect(function () {
    cargarTodo()
  }, [bimestre])

  async function cargarTodo() {
    setLoading(true)
    setError('')

    const enrollResult = await supabase
      .from('enrollments')
      .select('course:courses!inner(id, nombre, grado, grupo, asignaturas!inner(activo, area_id, areas_curriculares(nombre)))')
      .eq('student_id', session.user.id)
      .eq('status', 'activo')
      .eq('course.asignaturas.activo', true)

    if (enrollResult.error) {
      setError(enrollResult.error.message)
      setLoading(false)
      return
    }

    // Agrupar los cursos del estudiante por Área
    const gruposArea = {}
    enrollResult.data.forEach(function (e) {
      const areaId = e.course.asignaturas.area_id
      const areaNombre = e.course.asignaturas.areas_curriculares?.nombre || 'Otras'
      if (!gruposArea[areaId]) {
        gruposArea[areaId] = { areaId: areaId, areaNombre: areaNombre, grado: e.course.grado, grupo: e.course.grupo, courseIds: [] }
      }
      gruposArea[areaId].courseIds.push(e.course.id)
    })

    const resultado = []

    for (const areaId of Object.keys(gruposArea)) {
      const grupo = gruposArea[areaId]

      const compResult = await supabase.from('competencias').select('*').eq('area', grupo.areaNombre).order('codigo')
      const competencias = compResult.error ? [] : compResult.data
      const competenciaIds = competencias.map(function (c) { return c.id })

      const capResult = await supabase.from('capacidades').select('*').in('competencia_id', competenciaIds).order('orden')
      const capacidades = capResult.error ? [] : capResult.data

      const unidResult = await supabase
        .from('unidades')
        .select('id, numero, tipo, nombre, finalizada')
        .eq('area_id', areaId)
        .eq('grado', grupo.grado)
        .eq('grupo', grupo.grupo)
      const unidadesBimestre = (unidResult.error ? [] : unidResult.data).filter(function (u) {
        return Math.ceil(u.numero / 2) === bimestre
      })
      const unidadIds = unidadesBimestre.map(function (u) { return u.id })
      const unidadIdsFinalizadas = unidadesBimestre.filter(function (u) { return u.finalizada }).map(function (u) { return u.id })
      const unidadMap = {}
      unidadesBimestre.forEach(function (u) { unidadMap[u.id] = u })

      let actividades = []
      let assignments = []
      if (unidadIds.length > 0) {
        const actResult = await supabase
          .from('actividades')
          .select('id, nombre, numero_actividad, unidad_id, actividad_capacidades(capacidad_id, criterio, desempeno)')
          .in('unidad_id', unidadIds)
          .in('course_id', grupo.courseIds)
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

      const assignmentIds = assignments.map(function (a) { return a.id })
      let notaTareaMap = {}
      if (assignmentIds.length > 0) {
        const subsResult = await supabase
          .from('submissions')
          .select('id, assignment_id, publicado')
          .eq('student_id', session.user.id)
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
              const key = `${row.capacidad_id}__${sub.assignment_id}`
              notaTareaMap[key] = row.score
            })
          }
        }
      }

      let cierreMap = {}
      if (unidadIdsFinalizadas.length > 0) {
        const cierreResult = await supabase
          .from('evaluacion_cierre')
          .select('competencia_id, nota_numerica')
          .eq('student_id', session.user.id)
          .in('unidad_id', unidadIdsFinalizadas)
        if (!cierreResult.error) {
          cierreResult.data.forEach(function (row) {
            if (!cierreMap[row.competencia_id]) cierreMap[row.competencia_id] = []
            cierreMap[row.competencia_id].push(row.nota_numerica)
          })
        }
      }

      const competenciasData = competencias.map(function (comp) {
        const capsDeEstaCompetencia = capacidades
          .filter(function (c) { return c.competencia_id === comp.id })
          .map(function (cap) {
            const instancias = []
            assignments.forEach(function (a) {
              const tieneCapacidad = (a.assignment_capacidades || []).some(function (ac) { return ac.capacidad_id === cap.id })
              if (!tieneCapacidad) return
              const actividad = actividades.find(function (act) { return act.id === a.actividad_id })
              const detalleCap = (actividad?.actividad_capacidades || []).find(function (ac) { return ac.capacidad_id === cap.id })
              const unidad = unidadMap[actividad?.unidad_id]
              instancias.push({
                assignmentId: a.id,
                tituloTarea: a.titulo,
                actividadNombre: actividad?.nombre,
                actividadNumero: actividad?.numero_actividad,
                unidadTexto: unidad ? `${unidad.tipo} ${unidad.numero}` : '—',
                criterio: detalleCap?.criterio || '',
                desempeno: detalleCap?.desempeno || '',
                nota: notaTareaMap[`${cap.id}__${a.id}`] != null ? notaTareaMap[`${cap.id}__${a.id}`] : null,
              })
            })
            const promedioCapacidad = average(instancias.map(function (i) { return i.nota }))
            return { ...cap, instancias: instancias, promedioCapacidad: promedioCapacidad }
          })

        const cierreNota = cierreMap[comp.id] ? average(cierreMap[comp.id]) : null
        const promedioCompetencia = average(capsDeEstaCompetencia.map(function (c) { return c.promedioCapacidad }).concat([cierreNota]))

        return { ...comp, capacidades: capsDeEstaCompetencia, cierreNota: cierreNota, promedioCompetencia: promedioCompetencia }
      })

      const promedioArea = average(competenciasData.map(function (c) { return c.promedioCompetencia }))

      resultado.push({
        areaId: areaId,
        areaNombre: grupo.areaNombre,
        unidades: unidadesBimestre,
        competenciasData: competenciasData,
        promedioArea: promedioArea,
      })
    }

    resultado.sort(function (a, b) { return a.areaNombre.localeCompare(b.areaNombre) })
    setAreasData(resultado)
    setLoading(false)
  }

  function toggle(key) {
    setAbierto(function (prev) { return prev === key ? null : key })
  }

  if (loading) return <p className="text-slate-400 text-sm">Cargando tus notas...</p>
  if (error) return <p className="text-red-500 text-sm">Error: {error}</p>

  const promedioGeneral = average(areasData.map(function (a) { return a.promedioArea }))
  const letraGeneral = promedioGeneral != null ? getLetterGrade(promedioGeneral) : null

  return (
    <div>
      <h2 className="text-2xl font-bold mb-1" style={{ color: NAVY_DARK }}>Notas</h2>
      <p className="text-sm text-slate-400 mb-5">
        Calculado igual que el Registro Auxiliar de tu docente: por Bimestre, Competencia y Capacidad.
      </p>

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

      <div
        className="rounded-2xl p-6 mb-6"
        style={{ background: `linear-gradient(135deg, ${NAVY_DARK}, ${GREEN})` }}
      >
        <p className="text-white/80 text-sm font-medium">Promedio general — {NOMBRE_BIMESTRE[bimestre]}</p>
        <p className="text-white text-3xl font-bold">{promedioGeneral != null ? promedioGeneral.toFixed(1) : '—'}</p>
        {letraGeneral && (
          <p className="text-white/90 text-sm mt-1">
            Nivel de logro: <strong>{letraGeneral}</strong> — {DESCRIPCION_NIVEL[letraGeneral]}
          </p>
        )}
      </div>

      {areasData.length === 0 ? (
        <p className="text-slate-400 text-sm">Aún no estás matriculado en ningún curso.</p>
      ) : (
        <div className="space-y-8">
          {areasData.map(function (area) {
            const letraArea = area.promedioArea != null ? getLetterGrade(area.promedioArea) : null
            const unidadesTexto = area.unidades.map(function (u) { return `${u.tipo} ${u.numero}` }).join(' y ')
            return (
              <div key={area.areaId} className="bg-white rounded-2xl p-5" style={{ border: '1px solid #E5E9F0' }}>
                <div className="flex justify-between items-start flex-wrap gap-3 mb-1">
                  <div>
                    <h3 className="text-lg font-bold" style={{ color: NAVY_DARK }}>{area.areaNombre}</h3>
                    <p className="text-xs text-slate-400">{unidadesTexto ? `Trabajado en: ${unidadesTexto}` : 'Sin unidades registradas para este bimestre'}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-slate-500">Promedio de Área</p>
                    <p className={'text-xl font-bold ' + getLetterColor(area.promedioArea)}>
                      {area.promedioArea != null ? area.promedioArea.toFixed(1) : '—'}
                    </p>
                    {letraArea && <p className="text-xs" style={{ color: NAVY_DARK }}>{letraArea}</p>}
                  </div>
                </div>

                <div className="space-y-4 mt-4">
                  {area.competenciasData.map(function (comp) {
                    const letraComp = comp.promedioCompetencia != null ? getLetterGrade(comp.promedioCompetencia) : null
                    return (
                      <div key={comp.id} className="rounded-xl p-4" style={{ backgroundColor: '#F4F6F9' }}>
                        <div className="flex justify-between items-center flex-wrap gap-2 mb-3">
                          <p className="text-sm font-semibold" style={{ color: GREEN_DARK }}>{comp.nombre}</p>
                          <p className="text-sm font-bold" style={{ color: NAVY_DARK }}>
                            Promedio: {comp.promedioCompetencia != null ? comp.promedioCompetencia.toFixed(1) : '—'}
                            {letraComp && <span className="ml-1 text-xs font-normal text-slate-500">({letraComp})</span>}
                          </p>
                        </div>

                        <div className="space-y-3">
                          {comp.capacidades.map(function (cap) {
                            return (
                              <div key={cap.id} className="bg-white rounded-lg p-3" style={{ border: '1px solid #E5E9F0' }}>
                                <div className="flex justify-between items-center mb-2">
                                  <p className="text-xs font-semibold" style={{ color: NAVY_DARK }}>{cap.nombre}</p>
                                  <p className={'text-xs font-bold ' + getLetterColor(cap.promedioCapacidad)}>
                                    {cap.promedioCapacidad != null ? getLetterGrade(cap.promedioCapacidad) : '—'}
                                  </p>
                                </div>
                                {cap.instancias.length === 0 ? (
                                  <p className="text-xs text-slate-400">Sin tareas registradas.</p>
                                ) : (
                                  <ul className="space-y-1.5">
                                    {cap.instancias.map(function (inst) {
                                      const keyC = 'c_' + inst.assignmentId + '_' + cap.id
                                      const keyD = 'd_' + inst.assignmentId + '_' + cap.id
                                      return (
                                        <li key={inst.assignmentId + '_' + cap.id} className="text-xs">
                                          <div className="flex justify-between items-center gap-2">
                                            <span style={{ color: '#5F5E5A' }}>
                                              {inst.unidadTexto} · Act.{inst.actividadNumero} · {inst.tituloTarea}{' '}
                                              <button className="underline decoration-dotted" style={{ color: NAVY }} onClick={function () { toggle(keyC) }}>Criterio</button>
                                              {' · '}
                                              <button className="underline decoration-dotted" style={{ color: '#8a5cb0' }} onClick={function () { toggle(keyD) }}>Desempeño</button>
                                            </span>
                                            <span className={'font-bold ' + getLetterColor(inst.nota)}>
                                              {inst.nota != null ? getLetterGrade(inst.nota) : '—'}
                                            </span>
                                          </div>
                                          {abierto === keyC && (
                                            <div className="mt-1 p-2 rounded" style={{ backgroundColor: '#DEEBF7', color: NAVY_DARK }}>{inst.criterio || 'Sin criterio registrado.'}</div>
                                          )}
                                          {abierto === keyD && (
                                            <div className="mt-1 p-2 rounded" style={{ backgroundColor: '#f0e7f7', color: '#4a2e63' }}>{inst.desempeno || 'Sin desempeño registrado.'}</div>
                                          )}
                                        </li>
                                      )
                                    })}
                                  </ul>
                                )}
                                {cap.instancias.length > 0 && (
                                  <p className="text-xs mt-2 pt-2" style={{ borderTop: '1px solid #F4F6F9', color: '#94A3B8' }}>
                                    Promedio de esta capacidad: {cap.promedioCapacidad != null ? cap.promedioCapacidad.toFixed(1) : '—'}
                                  </p>
                                )}
                              </div>
                            )
                          })}
                        </div>

                        {comp.cierreNota != null && (
                          <p className="text-xs mt-3" style={{ color: '#B45309' }}>
                            Evaluación de Unidad (cierre): {comp.cierreNota.toFixed(1)} ({getLetterGrade(comp.cierreNota)})
                          </p>
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
