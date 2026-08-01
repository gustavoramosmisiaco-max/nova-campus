import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import { useAuth } from './AuthContext'
import { getLetterGrade, getLetterColor, compararPorApellido } from './gradeUtils'
import ExamenPreguntas from './ExamenPreguntas'
import RevisarExamen from './RevisarExamen'

const NAVY_DARK = '#0F2A4A'
const NAVY = '#1d5c8f'
const GREEN = '#5DAA47'

const inputStyle = { backgroundColor: 'white', border: '1px solid #D6DCE5', color: NAVY_DARK }

export default function EvaluacionCierre({ unidad, onFinalizada }) {
  const { session } = useAuth()
  const [tab, setTab] = useState('datos')
  const [areaNombre, setAreaNombre] = useState('')
  const [competencias, setCompetencias] = useState([])
  const [students, setStudents] = useState([])
  const [notasMap, setNotasMap] = useState({})
  const [estadoMap, setEstadoMap] = useState({})
  const [finalizada, setFinalizada] = useState(unidad.finalizada || false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [savingKey, setSavingKey] = useState(null)
  const [marcandoFinal, setMarcandoFinal] = useState(false)
  const [evaluacionId, setEvaluacionId] = useState(null)
  const [evalNombre, setEvalNombre] = useState('')
  const [evalFecha, setEvalFecha] = useState('')
  const [evalHoraInicio, setEvalHoraInicio] = useState('')
  const [evalDuracion, setEvalDuracion] = useState(45)
  const [intentosPermitidos, setIntentosPermitidos] = useState(1)
  const [guardandoEval, setGuardandoEval] = useState(false)

  useEffect(function () {
    cargarTodo()
  }, [unidad.id])

  useEffect(function () {
    const channel = supabase
      .channel(`evaluacion-cierre-${unidad.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'evaluacion_cierre', filter: `unidad_id=eq.${unidad.id}` }, function () {
        cargarTodo()
      })
      .subscribe()

    return function () { supabase.removeChannel(channel) }
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
    const estados = {}
    if (!notasResult.error) {
      notasResult.data.forEach(function (n) {
        const key = `${n.student_id}__${n.competencia_id}`
        map[key] = n.nota_numerica
        estados[key] = n.estado
      })
    }
    setNotasMap(map)
    setEstadoMap(estados)

    const evalResult = await supabase
      .from('evaluaciones_unidad')
      .select('*')
      .eq('unidad_id', unidad.id)
      .maybeSingle()
    if (!evalResult.error && evalResult.data) {
      setEvaluacionId(evalResult.data.id)
      setEvalNombre(evalResult.data.nombre)
      setEvalFecha(evalResult.data.fecha || '')
      if (evalResult.data.fecha_hora_inicio) {
        const d = new Date(evalResult.data.fecha_hora_inicio)
        const pad = function (n) { return String(n).padStart(2, '0') }
        setEvalHoraInicio(d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()))
      } else {
        setEvalHoraInicio('')
      }
      setEvalDuracion(evalResult.data.duracion_minutos || 45)
      setIntentosPermitidos(evalResult.data.intentos_permitidos || 1)
    } else {
      setEvaluacionId(null)
      setEvalNombre('')
      setEvalFecha('')
      setEvalHoraInicio('')
      setEvalDuracion(45)
      setIntentosPermitidos(1)
    }

    const unidResult = await supabase.from('unidades').select('finalizada').eq('id', unidad.id).single()
    if (!unidResult.error) setFinalizada(unidResult.data.finalizada)

    setLoading(false)
  }

  async function handleGuardarEvaluacion(e) {
    e.preventDefault()
    if (!evalNombre.trim()) { alert('Ponle un nombre a la evaluación.'); return }
    setGuardandoEval(true)

    const payload = {
      unidad_id: unidad.id,
      course_id: unidad.course_id,
      nombre: evalNombre.trim(),
      fecha: evalFecha || null,
      fecha_hora_inicio: evalHoraInicio ? `${evalHoraInicio}:00-05:00` : null,
      duracion_minutos: evalDuracion || null,
      intentos_permitidos: intentosPermitidos,
      created_by: session.user.id,
    }

    let result
    if (evaluacionId) {
      result = await supabase.from('evaluaciones_unidad').update(payload).eq('id', evaluacionId)
    } else {
      result = await supabase.from('evaluaciones_unidad').insert(payload).select('id').single()
      if (!result.error) setEvaluacionId(result.data.id)
    }

    if (result.error) alert('Error al guardar: ' + result.error.message)
    setGuardandoEval(false)
  }

  async function handleGuardarNota(studentId, competenciaId, valor) {
    if (!evaluacionId) {
      alert('Primero ponle un nombre a la evaluación y guárdala.')
      return
    }
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
        evaluacion_id: evaluacionId,
        bimestre: bimestre,
        nota_numerica: numScore,
        nota_letra: getLetterGrade(numScore),
        estado: 'confirmada',
        graded_by: session.user.id,
        graded_at: new Date().toISOString(),
      },
      { onConflict: 'student_id,unidad_id,competencia_id' }
    )

    if (result.error) {
      alert('Error al guardar: ' + result.error.message)
    } else {
      setNotasMap(function (prev) { return { ...prev, [key]: numScore } })
      setEstadoMap(function (prev) { return { ...prev, [key]: 'confirmada' } })
    }
    setSavingKey(null)
  }

  async function handleConfirmarNota(studentId, competenciaId) {
    const key = `${studentId}__${competenciaId}`
    const result = await supabase
      .from('evaluacion_cierre')
      .update({ estado: 'confirmada' })
      .eq('student_id', studentId)
      .eq('unidad_id', unidad.id)
      .eq('competencia_id', competenciaId)
    if (result.error) alert('Error: ' + result.error.message)
    else setEstadoMap(function (prev) { return { ...prev, [key]: 'confirmada' } })
  }

  async function handleConfirmarTodasPendientes() {
    const pendientes = Object.keys(estadoMap).filter(function (k) { return estadoMap[k] === 'pendiente_revision' })
    if (pendientes.length === 0) return
    if (!confirm(`¿Confirmar las ${pendientes.length} notas pendientes de revisión? Contarán en el Registro Auxiliar.`)) return

    const result = await supabase
      .from('evaluacion_cierre')
      .update({ estado: 'confirmada' })
      .eq('unidad_id', unidad.id)
      .eq('estado', 'pendiente_revision')
    if (result.error) { alert('Error: ' + result.error.message); return }

    const nuevos = { ...estadoMap }
    pendientes.forEach(function (k) { nuevos[k] = 'confirmada' })
    setEstadoMap(nuevos)
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

  const TABS = [
    { id: 'datos', label: '1. Datos' },
    { id: 'notas', label: '2. Notas' },
    { id: 'preguntas', label: '3. Preguntas del examen' },
    { id: 'revisar', label: '4. Revisar' },
  ]

  const pendientesCount = Object.values(estadoMap).filter(function (e) { return e === 'pendiente_revision' }).length

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
        Nota de cierre por competencia del área <strong>{areaNombre}</strong>, correspondiente a {unidad.tipo} {unidad.numero} (Bimestre {Math.ceil(unidad.numero / 2)}). Esta evaluación es <strong>una sola, compartida</strong> entre todas las asignaturas de esta área — cualquiera de los docentes puede editarla.
      </p>

      <div className="flex gap-2 mb-6 border-b flex-wrap" style={{ borderColor: '#E5E9F0' }}>
        {TABS.map(function (t) {
          const active = tab === t.id
          const bloqueado = t.id !== 'datos' && !evaluacionId
          return (
            <button
              key={t.id}
              onClick={function () { if (!bloqueado) setTab(t.id) }}
              disabled={bloqueado}
              className="px-4 py-2.5 text-sm font-semibold border-b-2 transition disabled:opacity-40"
              style={active ? { borderColor: GREEN, color: NAVY_DARK } : { borderColor: 'transparent', color: '#94A3B8' }}
            >
              {t.label}
              {t.id === 'notas' && pendientesCount > 0 && (
                <span className="ml-1.5 text-xs font-bold px-1.5 rounded-full text-white" style={{ backgroundColor: '#B45309' }}>{pendientesCount}</span>
              )}
            </button>
          )
        })}
      </div>

      {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

      {tab === 'datos' && (
        <form onSubmit={handleGuardarEvaluacion} className="bg-white rounded-2xl p-4" style={{ border: '1px solid #E5E9F0' }}>
          <p className="text-sm font-bold mb-3" style={{ color: NAVY_DARK }}>
            Datos de la evaluación {evaluacionId && <span style={{ color: GREEN }}>✓ Guardada</span>}
          </p>
          <div className="grid sm:grid-cols-3 gap-3 items-end">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium mb-1" style={{ color: NAVY_DARK }}>Nombre de la evaluación</label>
              <input
                type="text"
                value={evalNombre}
                onChange={function (e) { setEvalNombre(e.target.value) }}
                placeholder='Ej: "Examen Bimestral I — Ecosistemas"'
                required
                disabled={finalizada}
                className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                style={inputStyle}
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: NAVY_DARK }}>Fecha (referencial)</label>
              <input
                type="date"
                value={evalFecha}
                onChange={function (e) { setEvalFecha(e.target.value) }}
                disabled={finalizada}
                className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                style={inputStyle}
              />
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-3 mt-3 p-3 rounded-lg" style={{ backgroundColor: '#F4F6F9' }}>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: NAVY_DARK }}>
                Fecha y hora en que se habilita el examen virtual
              </label>
              <input
                type="datetime-local"
                value={evalHoraInicio}
                onChange={function (e) { setEvalHoraInicio(e.target.value) }}
                disabled={finalizada}
                className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                style={inputStyle}
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: NAVY_DARK }}>
                Duración del examen (minutos)
              </label>
              <input
                type="number"
                min="1"
                value={evalDuracion}
                onChange={function (e) { setEvalDuracion(Number(e.target.value)) }}
                disabled={finalizada}
                className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                style={inputStyle}
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: NAVY_DARK }}>
                N° de intentos permitidos
              </label>
              <input
                type="number"
                min="1"
                value={intentosPermitidos}
                onChange={function (e) { setIntentosPermitidos(Number(e.target.value)) }}
                disabled={finalizada}
                className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                style={inputStyle}
              />
              <p className="text-xs text-slate-400 mt-1">Por si hay problemas de conexión, deja que rinda el examen más de una vez.</p>
            </div>
            <p className="text-xs sm:col-span-2" style={{ color: '#B45309' }}>
              Déjalo en blanco si el examen no será virtual (solo en papel) — así, la pestaña "Notas" seguirá aceptando notas manuales normalmente.
            </p>
          </div>
          {!finalizada && (
            <button
              type="submit"
              disabled={guardandoEval}
              className="mt-3 text-xs font-semibold px-4 py-2 rounded-lg text-white transition hover:opacity-90 disabled:opacity-50"
              style={{ backgroundColor: GREEN }}
            >
              {guardandoEval ? 'Guardando...' : evaluacionId ? 'Actualizar datos' : 'Guardar y continuar'}
            </button>
          )}
          {!evaluacionId && (
            <p className="text-xs mt-2" style={{ color: '#B45309' }}>
              Guarda el nombre de la evaluación para habilitar las demás pestañas.
            </p>
          )}
        </form>
      )}

      {tab === 'notas' && (
        <>
          {pendientesCount > 0 && (
            <div className="flex justify-between items-center flex-wrap gap-2 rounded-xl p-3 mb-4" style={{ backgroundColor: '#FFF7E6', border: '1px solid #F5D98A' }}>
              <p className="text-xs font-semibold" style={{ color: '#B45309' }}>
                ⏳ {pendientesCount} nota(s) generadas automáticamente por un examen virtual están pendientes de tu revisión — no cuentan todavía en el Registro Auxiliar.
              </p>
              <button
                onClick={handleConfirmarTodasPendientes}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white transition hover:opacity-90 flex-shrink-0"
                style={{ backgroundColor: '#B45309' }}
              >
                Confirmar todas
              </button>
            </div>
          )}

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
                          const pendiente = estadoMap[key] === 'pendiente_revision'
                          return (
                            <td key={c.id} className="p-2 text-center" style={{ border: '1px solid #E5E9F0', backgroundColor: pendiente ? '#FFF7E6' : 'transparent' }}>
                              <div className="flex items-center justify-center gap-2">
                                <input
                                  type="number"
                                  min="0"
                                  max="20"
                                  step="0.5"
                                  defaultValue={valor != null ? valor : ''}
                                  placeholder="Nota"
                                  disabled={isSaving || finalizada || !evaluacionId}
                                  className="w-16 rounded-lg text-sm px-2 py-1 outline-none text-center"
                                  style={inputStyle}
                                  onBlur={function (e) { if (e.target.value) handleGuardarNota(s.id, c.id, e.target.value) }}
                                />
                                {valor != null && (
                                  <span className={'text-xs font-bold ' + getLetterColor(valor)}>{getLetterGrade(valor)}</span>
                                )}
                              </div>
                              {pendiente && (
                                <button
                                  onClick={function () { handleConfirmarNota(s.id, c.id) }}
                                  className="text-xs font-semibold px-2 py-0.5 rounded-full mt-1 transition hover:opacity-90"
                                  style={{ backgroundColor: '#B45309', color: 'white' }}
                                >
                                  Confirmar
                                </button>
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
          )}
        </>
      )}

      {tab === 'preguntas' && evaluacionId && (
        <ExamenPreguntas
          evaluacionId={evaluacionId}
          evaluacionNombre={evalNombre}
          evaluacionFecha={evalFecha}
          courseId={unidad.course_id}
          unidad={unidad}
          onEliminado={function () { setTab('datos'); cargarTodo() }}
        />
      )}

      {tab === 'revisar' && evaluacionId && (
        <RevisarExamen
          evaluacionId={evaluacionId}
          evaluacionNombre={evalNombre}
          unidad={unidad}
        />
      )}
    </div>
  )
}
