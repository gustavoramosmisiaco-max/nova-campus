import { useEffect, useState, useRef } from 'react'
import { supabase } from './supabaseClient'
import { useAuth } from './AuthContext'
import { getLetterGrade } from './gradeUtils'

const NAVY_DARK = '#0F172A'
const NAVY = '#2563EB'
const GREEN = '#22C55E'

function formatearFechaHora(iso) {
  return new Date(iso).toLocaleString('es-PE', { dateStyle: 'medium', timeStyle: 'short' })
}

function formatearTiempo(segundos) {
  const m = Math.floor(segundos / 60)
  const s = segundos % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export default function PracticaEstudiante({ actividad }) {
  const { session } = useAuth()
  const [loading, setLoading] = useState(true)
  const [practica, setPractica] = useState(null)
  const [preguntas, setPreguntas] = useState([])
  const [intento, setIntento] = useState(null)
  const [respuestas, setRespuestas] = useState({})
  const [indiceActual, setIndiceActual] = useState(0)
  const [segundosRestantes, setSegundosRestantes] = useState(0)
  const [enviando, setEnviando] = useState(false)
  const [resultado, setResultado] = useState(null)
  const timerRef = useRef(null)

  useEffect(function () {
    cargar()
    return function () { if (timerRef.current) clearInterval(timerRef.current) }
  }, [actividad.id])

  async function cargar() {
    setLoading(true)

    const practicaResult = await supabase.from('practicas').select('*').eq('actividad_id', actividad.id).maybeSingle()
    if (!practicaResult.data) {
      setPractica(null)
      setLoading(false)
      return
    }
    setPractica(practicaResult.data)

    const preguntasResult = await supabase.from('practica_preguntas').select('*').eq('practica_id', practicaResult.data.id).order('numero')
    setPreguntas(preguntasResult.data || [])

    const intentoResult = await supabase
      .from('practica_intentos')
      .select('*')
      .eq('practica_id', practicaResult.data.id)
      .eq('student_id', session.user.id)
      .maybeSingle()

    if (intentoResult.data) {
      setIntento(intentoResult.data)
      if (intentoResult.data.estado === 'finalizado') {
        // Ya se envió — mostrar el resumen de resultado guardado
        const respResult = await supabase.from('practica_respuestas').select('*').eq('intento_id', intentoResult.data.id)
        const respuestasData = respResult.data || []
        const puntajeAuto = respuestasData.reduce(function (a, r) { return a + (r.puntaje_obtenido || 0) }, 0)
        const puntajeTotal = (preguntasResult.data || []).reduce(function (a, p) { return a + Number(p.puntaje) }, 0)
        const hayAbiertas = (preguntasResult.data || []).some(function (p) { return p.tipo === 'abierta' })
        setResultado({ puntajeAuto: puntajeAuto, puntajeTotal: puntajeTotal, hayAbiertas: hayAbiertas })
      } else if (intentoResult.data.estado === 'en_progreso') {
        // Retomar el cronómetro desde donde quedó
        const finPrevisto = new Date(intentoResult.data.iniciado_at).getTime() + practicaResult.data.duracion_minutos * 60000
        const segundos = Math.max(0, Math.floor((finPrevisto - Date.now()) / 1000))
        setSegundosRestantes(segundos)
        if (segundos > 0) iniciarTimer(segundos)
        else handleFinalizar(true, practicaResult.data, preguntasResult.data || [], intentoResult.data)
      }
    }

    setLoading(false)
  }

  function estaVencida() {
    if (!practica) return false
    return new Date() > new Date(practica.fecha_entrega)
  }

  async function handleComenzar() {
    const nowIso = new Date().toISOString()
    const result = await supabase.from('practica_intentos').insert({
      practica_id: practica.id,
      student_id: session.user.id,
      iniciado_at: nowIso,
      estado: 'en_progreso',
    }).select('*').single()

    if (result.error) { alert('Error al comenzar: ' + result.error.message); return }
    setIntento(result.data)

    const segundos = practica.duracion_minutos * 60
    setSegundosRestantes(segundos)
    iniciarTimer(segundos)
  }

  function iniciarTimer(segundosIniciales) {
    let restante = segundosIniciales
    timerRef.current = setInterval(function () {
      restante -= 1
      setSegundosRestantes(restante)
      if (restante <= 0) {
        clearInterval(timerRef.current)
        handleFinalizar(true)
      }
    }, 1000)
  }

  function handleRespuesta(preguntaId, valor) {
    setRespuestas(function (prev) { return { ...prev, [preguntaId]: valor } })
  }

  async function handleFinalizar(automatico, practicaParam, preguntasParam, intentoParam) {
    const p = practicaParam || practica
    const preg = preguntasParam || preguntas
    const int = intentoParam || intento

    if (!automatico && !confirm('¿Enviar la práctica? No podrás cambiar tus respuestas después.')) return
    if (timerRef.current) clearInterval(timerRef.current)
    setEnviando(true)

    // 1. Calificar automático las preguntas de alternativa/verdadero_falso, guardar todas las respuestas
    const respuestasPayload = preg.map(function (q) {
      const valorRespuesta = respuestas[q.id] || null
      let esCorrecta = null
      let puntajeObtenido = null
      if (q.tipo !== 'abierta') {
        esCorrecta = valorRespuesta === q.respuesta_correcta
        puntajeObtenido = esCorrecta ? Number(q.puntaje) : 0
      }
      return {
        intento_id: int.id,
        pregunta_id: q.id,
        respuesta_texto: valorRespuesta,
        es_correcta: esCorrecta,
        puntaje_obtenido: puntajeObtenido,
      }
    })
    await supabase.from('practica_respuestas').insert(respuestasPayload)

    // 2. Crear la Entrega (submission) de la Tarea asociada — igual que cualquier Tarea normal
    const submissionResult = await supabase.from('submissions').insert({
      assignment_id: p.assignment_id,
      student_id: session.user.id,
      file_url: null,
      submitted_at: new Date().toISOString(),
      publicado: false,
    }).select('id').single()

    let submissionId = null
    if (!submissionResult.error) {
      submissionId = submissionResult.data.id

      // 3. Por cada Capacidad: si TODAS sus preguntas son de alternativa/V-F, calificar automático (0-20 proporcional).
      //    Si tiene alguna pregunta abierta, se deja sin calificar — el docente la revisa en "Ver entregas", como cualquier Tarea.
      const capacidadIds = [...new Set(preg.map(function (q) { return q.capacidad_id }).filter(Boolean))]
      for (const capId of capacidadIds) {
        const preguntasDeLaCapacidad = preg.filter(function (q) { return q.capacidad_id === capId })
        const tieneAbiertas = preguntasDeLaCapacidad.some(function (q) { return q.tipo === 'abierta' })
        if (tieneAbiertas) continue

        const totalPts = preguntasDeLaCapacidad.reduce(function (a, q) { return a + Number(q.puntaje) }, 0)
        const obtenidoPts = respuestasPayload
          .filter(function (r) { return preguntasDeLaCapacidad.some(function (q) { return q.id === r.pregunta_id }) })
          .reduce(function (a, r) { return a + (r.puntaje_obtenido || 0) }, 0)
        const notaCapacidad = totalPts > 0 ? Math.round((obtenidoPts / totalPts) * 20 * 10) / 10 : 0

        await supabase.from('submission_scores').insert({
          submission_id: submissionId,
          capacidad_id: capId,
          score: notaCapacidad,
        })
      }

      // 4. Promedio preliminar visible de una vez (solo con lo auto-calificado; el docente lo recalcula al revisar lo demás)
      const scoresResult = await supabase.from('submission_scores').select('score').eq('submission_id', submissionId)
      const valores = (scoresResult.data || []).map(function (s) { return s.score }).filter(function (s) { return s != null })
      const promedio = valores.length > 0 ? valores.reduce(function (a, b) { return a + b }, 0) / valores.length : null
      await supabase.from('submissions').update({ score: promedio }).eq('id', submissionId)
    }

    // 5. Cerrar el intento
    await supabase.from('practica_intentos').update({
      finalizado_at: new Date().toISOString(),
      estado: 'finalizado',
      submission_id: submissionId,
    }).eq('id', int.id)

    const puntajeAuto = respuestasPayload.reduce(function (a, r) { return a + (r.puntaje_obtenido || 0) }, 0)
    const puntajeTotal = preg.reduce(function (a, q) { return a + Number(q.puntaje) }, 0)
    const hayAbiertas = preg.some(function (q) { return q.tipo === 'abierta' })
    setResultado({ puntajeAuto: puntajeAuto, puntajeTotal: puntajeTotal, hayAbiertas: hayAbiertas })
    setEnviando(false)
  }

  if (loading) return <p className="text-slate-400 text-sm">Cargando...</p>

  if (!practica) {
    return <p className="text-slate-400 text-sm">Tu docente todavía no ha programado ninguna Práctica en esta Actividad.</p>
  }

  if (resultado) {
    return (
      <div className="text-center py-10">
        <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: '#E7F3E4' }}>
          <span style={{ fontSize: 36 }}>✓</span>
        </div>
        <h2 className="text-xl font-bold mb-1" style={{ color: NAVY_DARK }}>¡Práctica enviada!</h2>
        <p className="text-sm text-slate-500 mb-1">{practica.nombre}</p>
        <p className="text-sm text-slate-400 mb-4">
          Puntaje automático: {resultado.puntajeAuto} / {resultado.puntajeTotal} (preguntas con alternativas)
        </p>
        {resultado.hayAbiertas && (
          <p className="text-xs rounded-lg p-3 inline-block" style={{ backgroundColor: '#FFF7E6', color: '#B45309' }}>
            Tu docente revisará las preguntas de desarrollo antes de que la nota final quede confirmada.
          </p>
        )}
      </div>
    )
  }

  if (!intento) {
    if (estaVencida()) {
      return (
        <div className="text-center py-10">
          <p className="text-lg font-bold mb-1" style={{ color: '#B91C1C' }}>Práctica cerrada</p>
          <p className="text-sm text-slate-500">El plazo para empezar "{practica.nombre}" ya venció.</p>
        </div>
      )
    }
    return (
      <div className="text-center py-10">
        <h2 className="text-xl font-bold mb-1" style={{ color: NAVY_DARK }}>{practica.nombre}</h2>
        <p className="text-sm text-slate-500 mb-1">{preguntas.length} preguntas · {practica.duracion_minutos} minutos</p>
        <p className="text-xs text-slate-400 mb-1">Fecha límite para empezar: {formatearFechaHora(practica.fecha_entrega)}</p>
        <p className="text-xs text-slate-400 mb-6">Una vez que empieces, el tiempo corre sin pausa.</p>
        <button onClick={handleComenzar} className="text-sm font-semibold px-8 py-3 rounded-xl text-white transition hover:opacity-90" style={{ background: `linear-gradient(90deg, ${NAVY}, ${GREEN})` }}>
          Empezar práctica
        </button>
      </div>
    )
  }

  const pregunta = preguntas[indiceActual]
  if (!pregunta) return <p className="text-slate-400 text-sm">Cargando pregunta...</p>
  const respuestaActual = respuestas[pregunta.id] || ''

  return (
    <div style={{ maxWidth: 640, margin: '0 auto' }}>
      <div className="flex justify-between items-center mb-4">
        <p className="text-base font-semibold" style={{ color: NAVY_DARK }}>{practica.nombre}</p>
        <div className="rounded-xl px-4 py-2 text-center" style={{ backgroundColor: segundosRestantes < 60 ? '#FDECEC' : '#F4F6F9' }}>
          <p className="text-xs" style={{ color: '#5F5E5A' }}>Tiempo restante</p>
          <p className="text-lg font-bold" style={{ color: segundosRestantes < 60 ? '#B91C1C' : NAVY_DARK }}>⏱ {formatearTiempo(Math.max(0, segundosRestantes))}</p>
        </div>
      </div>

      <div className="h-1.5 rounded-full mb-1" style={{ backgroundColor: '#E5E9F0' }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${((indiceActual + 1) / preguntas.length) * 100}%`, backgroundColor: GREEN }} />
      </div>
      <p className="text-xs text-slate-400 mb-4">Pregunta {indiceActual + 1} de {preguntas.length}</p>

      <div className="rounded-2xl p-5" style={{ backgroundColor: '#F4F6F9', border: '1px solid #E5E9F0' }}>
        <p className="text-xs font-semibold mb-1" style={{ color: NAVY }}>{pregunta.puntaje} pts</p>
        <p className="text-base font-medium mb-4" style={{ color: NAVY_DARK }}>{pregunta.enunciado}</p>

        {(pregunta.tipo === 'alternativa' || pregunta.tipo === 'verdadero_falso') && (
          <div className="space-y-2">
            {(pregunta.opciones || []).map(function (op) {
              const marcado = respuestaActual === op.letra
              return (
                <label
                  key={op.letra}
                  className="flex items-center gap-3 px-4 py-2.5 rounded-lg cursor-pointer transition"
                  style={marcado ? { backgroundColor: '#E7F3E4', border: '1px solid ' + GREEN } : { backgroundColor: 'white', border: '1px solid #D6DCE5' }}
                >
                  <input type="radio" name={`pregunta-${pregunta.id}`} checked={marcado} onChange={function () { handleRespuesta(pregunta.id, op.letra) }} />
                  <span className="text-sm" style={{ color: marcado ? '#16A34A' : NAVY_DARK }}>{op.letra}) {op.texto}</span>
                </label>
              )
            })}
          </div>
        )}

        {pregunta.tipo === 'abierta' && (
          <textarea
            value={respuestaActual}
            onChange={function (e) { handleRespuesta(pregunta.id, e.target.value) }}
            rows={5}
            placeholder="Escribe tu respuesta aquí..."
            className="w-full rounded-lg px-3 py-2 text-sm outline-none"
            style={{ backgroundColor: 'white', border: '1px solid #D6DCE5', color: NAVY_DARK }}
          />
        )}
      </div>

      <div className="flex justify-between mt-5">
        <button
          onClick={function () { setIndiceActual(Math.max(0, indiceActual - 1)) }}
          disabled={indiceActual === 0}
          className="text-sm font-semibold px-4 py-2 rounded-lg transition disabled:opacity-30"
          style={{ backgroundColor: 'white', color: NAVY_DARK, border: '1px solid #D6DCE5' }}
        >
          ← Anterior
        </button>
        {indiceActual < preguntas.length - 1 ? (
          <button
            onClick={function () { setIndiceActual(indiceActual + 1) }}
            className="text-sm font-semibold px-4 py-2 rounded-lg text-white transition hover:opacity-90"
            style={{ backgroundColor: NAVY }}
          >
            Siguiente →
          </button>
        ) : (
          <button
            onClick={function () { handleFinalizar(false) }}
            disabled={enviando}
            className="text-sm font-semibold px-6 py-2 rounded-lg text-white transition hover:opacity-90 disabled:opacity-50"
            style={{ backgroundColor: GREEN }}
          >
            {enviando ? 'Enviando...' : 'Finalizar y enviar'}
          </button>
        )}
      </div>
    </div>
  )
}
