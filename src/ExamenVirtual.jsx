import { useEffect, useState, useRef } from 'react'
import { supabase } from './supabaseClient'
import { useAuth } from './AuthContext'
import { getLetterGrade } from './gradeUtils'

const NAVY_DARK = '#0F2A4A'
const NAVY = '#1d5c8f'
const GREEN = '#5DAA47'

function formatearFechaHora(iso) {
  return new Date(iso).toLocaleString('es-PE', { dateStyle: 'medium', timeStyle: 'short' })
}

function formatearTiempo(segundos) {
  const m = Math.floor(segundos / 60)
  const s = segundos % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export default function ExamenVirtual({ unidad, courseId, onCerrar }) {
  const { session, profile } = useAuth()
  const [loading, setLoading] = useState(true)
  const [evaluacion, setEvaluacion] = useState(null)
  const [preguntas, setPreguntas] = useState([])
  const [competencias, setCompetencias] = useState([])
  const [intento, setIntento] = useState(null)
  const [respuestas, setRespuestas] = useState({})
  const [indiceActual, setIndiceActual] = useState(0)
  const [segundosRestantes, setSegundosRestantes] = useState(0)
  const [enviando, setEnviando] = useState(false)
  const [resultado, setResultado] = useState(null)
  const [subiendoArchivo, setSubiendoArchivo] = useState(false)
  const timerRef = useRef(null)

  useEffect(function () {
    cargar()
    return function () { if (timerRef.current) clearInterval(timerRef.current) }
  }, [unidad.id])

  async function cargar() {
    setLoading(true)

    const evalResult = await supabase
      .from('evaluaciones_unidad')
      .select('*')
      .eq('unidad_id', unidad.id)
      .eq('publicado', true)
      .maybeSingle()

    if (evalResult.error || !evalResult.data) {
      setEvaluacion(null)
      setLoading(false)
      return
    }
    setEvaluacion(evalResult.data)

    const preguntasResult = await supabase
      .from('examen_preguntas')
      .select('*')
      .eq('evaluacion_id', evalResult.data.id)
      .order('numero')
    if (!preguntasResult.error) setPreguntas(preguntasResult.data)

    const compIds = [...new Set((preguntasResult.data || []).map(function (p) { return p.competencia_id }))]
    if (compIds.length > 0) {
      const compResult = await supabase.from('competencias').select('id, nombre').in('id', compIds)
      if (!compResult.error) setCompetencias(compResult.data)
    }

    const intentoResult = await supabase
      .from('examen_intentos')
      .select('*')
      .eq('evaluacion_id', evalResult.data.id)
      .eq('student_id', session.user.id)
      .maybeSingle()
    if (!intentoResult.error && intentoResult.data) {
      setIntento(intentoResult.data)
      if (intentoResult.data.estado === 'finalizado') {
        setResultado({ puntajeAuto: intentoResult.data.puntaje_auto, puntajeTotal: intentoResult.data.puntaje_total })
      }
    }

    setLoading(false)
  }

  function estadoVentana() {
    if (!evaluacion || !evaluacion.fecha_hora_inicio || !evaluacion.duracion_minutos) return 'sin_programar'
    const ahora = new Date()
    const inicio = new Date(evaluacion.fecha_hora_inicio)
    const cierre = new Date(inicio.getTime() + evaluacion.duracion_minutos * 60000)
    if (ahora < inicio) return 'antes'
    if (ahora > cierre) return 'cerrado'
    return 'abierto'
  }

  async function handleComenzar() {
    const inicio = new Date(evaluacion.fecha_hora_inicio)
    const cierre = new Date(inicio.getTime() + evaluacion.duracion_minutos * 60000)
    const result = await supabase.from('examen_intentos').insert({
      evaluacion_id: evaluacion.id,
      student_id: session.user.id,
      iniciado_at: new Date().toISOString(),
      estado: 'en_progreso',
    }).select('*').single()

    if (result.error) { alert('Error al comenzar: ' + result.error.message); return }
    setIntento(result.data)

    const segundos = Math.max(0, Math.floor((cierre - new Date()) / 1000))
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
    setRespuestas(function (prev) { return { ...prev, [preguntaId]: { ...prev[preguntaId], texto: valor } } })
  }

  async function handleAdjuntar(preguntaId, file) {
    setSubiendoArchivo(true)
    const path = `${session.user.id}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_')}`
    const uploadResult = await supabase.storage.from('examenes').upload(path, file)
    if (uploadResult.error) {
      alert('Error al subir el archivo: ' + uploadResult.error.message)
    } else {
      setRespuestas(function (prev) { return { ...prev, [preguntaId]: { ...prev[preguntaId], archivo: path, archivoNombre: file.name } } })
    }
    setSubiendoArchivo(false)
  }

  async function handleFinalizar(automatico) {
    if (!automatico && !confirm('¿Enviar el examen? No podrás cambiar tus respuestas después.')) return
    if (timerRef.current) clearInterval(timerRef.current)
    setEnviando(true)

    const respuestasPayload = preguntas.map(function (p) {
      const r = respuestas[p.id] || {}
      let esCorrecta = null
      let puntajeObtenido = null
      if (p.tipo !== 'abierta') {
        esCorrecta = r.texto === p.respuesta_correcta
        puntajeObtenido = esCorrecta ? Number(p.puntaje) : 0
      }
      return {
        intento_id: intento.id,
        pregunta_id: p.id,
        respuesta_texto: r.texto || null,
        respuesta_archivo_url: r.archivo || null,
        es_correcta: esCorrecta,
        puntaje_obtenido: puntajeObtenido,
      }
    })
    await supabase.from('examen_respuestas').insert(respuestasPayload)

    const puntajeAuto = respuestasPayload.reduce(function (a, r) { return a + (r.puntaje_obtenido || 0) }, 0)
    const puntajeTotal = preguntas.reduce(function (a, p) { return a + Number(p.puntaje) }, 0)

    await supabase.from('examen_intentos').update({
      finalizado_at: new Date().toISOString(),
      estado: 'finalizado',
      puntaje_auto: puntajeAuto,
      puntaje_total: puntajeTotal,
    }).eq('id', intento.id)

    for (const comp of competencias) {
      const preguntasComp = preguntas.filter(function (p) { return p.competencia_id === comp.id })
      const tieneAbiertas = preguntasComp.some(function (p) { return p.tipo === 'abierta' })
      const puntosObtenidosComp = preguntasComp.reduce(function (a, p) {
        const r = respuestasPayload.find(function (x) { return x.pregunta_id === p.id })
        return a + (r?.puntaje_obtenido || 0)
      }, 0)
      const puntosTotalComp = preguntasComp.reduce(function (a, p) { return a + Number(p.puntaje) }, 0)
      const notaNumerica = puntosTotalComp > 0 ? Math.round((puntosObtenidosComp / puntosTotalComp) * 20 * 10) / 10 : 0
      const bimestre = Math.ceil(unidad.numero / 2)

      await supabase.from('evaluacion_cierre').upsert({
        student_id: session.user.id,
        course_id: courseId,
        unidad_id: unidad.id,
        competencia_id: comp.id,
        evaluacion_id: evaluacion.id,
        bimestre: bimestre,
        nota_numerica: notaNumerica,
        nota_letra: getLetterGrade(notaNumerica),
        estado: tieneAbiertas ? 'pendiente_revision' : 'pendiente_revision',
        graded_at: new Date().toISOString(),
      }, { onConflict: 'student_id,unidad_id,competencia_id' })
    }

    setResultado({ puntajeAuto, puntajeTotal })
    setEnviando(false)
  }

  if (loading) return <p className="text-slate-400 text-sm">Cargando...</p>

  if (!evaluacion) {
    return (
      <div>
        {onCerrar && <button onClick={onCerrar} className="text-sm font-semibold mb-4 hover:underline" style={{ color: NAVY }}>← Volver</button>}
        <p className="text-slate-400 text-sm">Todavía no hay ningún examen virtual publicado para esta Unidad.</p>
      </div>
    )
  }

  const ventana = estadoVentana()

  if (resultado) {
    return (
      <div className="text-center py-10">
        <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: '#E7F3E4' }}>
          <span style={{ fontSize: 36 }}>✓</span>
        </div>
        <h2 className="text-xl font-bold mb-1" style={{ color: NAVY_DARK }}>¡Examen enviado!</h2>
        <p className="text-sm text-slate-500 mb-1">{evaluacion.nombre}</p>
        <p className="text-sm text-slate-400 mb-4">
          Puntaje automático: {resultado.puntajeAuto} / {resultado.puntajeTotal} (preguntas con alternativas)
        </p>
        <p className="text-xs rounded-lg p-3 inline-block" style={{ backgroundColor: '#FFF7E6', color: '#B45309' }}>
          Tu docente revisará el examen (incluyendo preguntas de desarrollo, si las hubo) antes de que la nota quede confirmada en tu Registro.
        </p>
        {onCerrar && <div className="mt-6"><button onClick={onCerrar} className="text-sm font-semibold px-4 py-2 rounded-lg text-white transition hover:opacity-90" style={{ backgroundColor: GREEN }}>Volver</button></div>}
      </div>
    )
  }

  if (ventana === 'sin_programar') {
    return <p className="text-slate-400 text-sm">Este examen todavía no tiene fecha/hora programada por tu docente.</p>
  }

  if (ventana === 'antes') {
    return (
      <div className="text-center py-10">
        <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: '#F4F6F9' }}>
          <span style={{ fontSize: 32 }}>🕐</span>
        </div>
        <h2 className="text-lg font-bold mb-1" style={{ color: NAVY_DARK }}>{evaluacion.nombre}</h2>
        <p className="text-sm text-slate-500">Este examen se habilitará el</p>
        <p className="text-base font-semibold mt-1" style={{ color: NAVY }}>{formatearFechaHora(evaluacion.fecha_hora_inicio)}</p>
        <p className="text-xs text-slate-400 mt-2">Duración: {evaluacion.duracion_minutos} minutos</p>
      </div>
    )
  }

  if (ventana === 'cerrado' && !intento) {
    return (
      <div className="text-center py-10">
        <p className="text-lg font-bold mb-1" style={{ color: '#B91C1C' }}>Examen cerrado</p>
        <p className="text-sm text-slate-500">El plazo para rendir "{evaluacion.nombre}" ya venció.</p>
      </div>
    )
  }

  if (!intento) {
    return (
      <div className="text-center py-10">
        <h2 className="text-xl font-bold mb-1" style={{ color: NAVY_DARK }}>{evaluacion.nombre}</h2>
        <p className="text-sm text-slate-500 mb-1">{preguntas.length} preguntas · {evaluacion.duracion_minutos} minutos</p>
        <p className="text-xs text-slate-400 mb-6">Una vez que empieces, el tiempo corre sin pausa hasta que se acabe la ventana del examen.</p>
        <button onClick={handleComenzar} className="text-sm font-semibold px-8 py-3 rounded-xl text-white transition hover:opacity-90" style={{ background: `linear-gradient(90deg, ${NAVY}, ${GREEN})` }}>
          Empezar examen
        </button>
      </div>
    )
  }

  const pregunta = preguntas[indiceActual]
  const respuestaActual = respuestas[pregunta.id] || {}
  const competenciaDePregunta = competencias.find(function (c) { return c.id === pregunta.competencia_id })

  return (
    <div style={{ maxWidth: 640, margin: '0 auto' }}>
      <div className="flex justify-between items-center mb-4">
        <div>
          <p className="text-xs text-slate-400">{competenciaDePregunta?.nombre}</p>
          <p className="text-base font-semibold" style={{ color: NAVY_DARK }}>{evaluacion.nombre}</p>
        </div>
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
              const marcado = respuestaActual.texto === op.letra
              return (
                <label
                  key={op.letra}
                  className="flex items-center gap-3 px-4 py-2.5 rounded-lg cursor-pointer transition"
                  style={marcado ? { backgroundColor: '#E7F3E4', border: '1px solid ' + GREEN } : { backgroundColor: 'white', border: '1px solid #D6DCE5' }}
                >
                  <input type="radio" name={`pregunta-${pregunta.id}`} checked={marcado} onChange={function () { handleRespuesta(pregunta.id, op.letra) }} />
                  <span className="text-sm" style={{ color: marcado ? '#2f7a1f' : NAVY_DARK }}>{op.letra}) {op.texto}</span>
                </label>
              )
            })}
          </div>
        )}

        {pregunta.tipo === 'abierta' && (
          <div className="space-y-3">
            <textarea
              value={respuestaActual.texto || ''}
              onChange={function (e) { handleRespuesta(pregunta.id, e.target.value) }}
              rows={5}
              placeholder="Escribe tu respuesta aquí..."
              className="w-full rounded-lg px-3 py-2 text-sm outline-none"
              style={{ backgroundColor: 'white', border: '1px solid #D6DCE5', color: NAVY_DARK }}
            />
            <div className="flex items-center gap-3">
              <label className="text-xs font-semibold px-3 py-2 rounded-lg cursor-pointer transition" style={{ backgroundColor: 'white', color: NAVY, border: '1px solid #D6DCE5' }}>
                {subiendoArchivo ? 'Subiendo...' : '📎 Adjuntar imagen o PDF'}
                <input type="file" accept="image/*,application/pdf" className="hidden" disabled={subiendoArchivo} onChange={function (e) { if (e.target.files[0]) handleAdjuntar(pregunta.id, e.target.files[0]) }} />
              </label>
              {respuestaActual.archivoNombre && <span className="text-xs text-slate-500">{respuestaActual.archivoNombre} ✓</span>}
            </div>
          </div>
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
