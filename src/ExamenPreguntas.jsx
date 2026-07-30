import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import jsPDF from 'jspdf'
import RevisarExamen from './RevisarExamen'

const NAVY_DARK = '#0F2A4A'
const NAVY = '#1d5c8f'
const GREEN = '#5DAA47'

const inputStyle = { backgroundColor: 'white', border: '1px solid #D6DCE5', color: NAVY_DARK }

const TIPOS = [
  { id: 'alternativa', label: 'Alternativas (A, B, C, D)' },
  { id: 'verdadero_falso', label: 'Verdadero / Falso' },
  { id: 'abierta', label: 'Desarrollo / Respuesta abierta' },
]

export default function ExamenPreguntas({ evaluacionId, evaluacionNombre, evaluacionFecha, courseId, unidad, onCerrar }) {
  const [preguntas, setPreguntas] = useState([])
  const [competencias, setCompetencias] = useState([])
  const [competenciasSeleccionadas, setCompetenciasSeleccionadas] = useState(new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [guardandoCompetencias, setGuardandoCompetencias] = useState(false)
  const [publicado, setPublicado] = useState(false)
  const [publicando, setPublicando] = useState(false)
  const [fechaHoraInicio, setFechaHoraInicio] = useState(null)
  const [verRevision, setVerRevision] = useState(false)

  const [tipo, setTipo] = useState('alternativa')
  const [enunciado, setEnunciado] = useState('')
  const [opciones, setOpciones] = useState(['', '', '', ''])
  const [respuestaCorrecta, setRespuestaCorrecta] = useState('')
  const [puntaje, setPuntaje] = useState(1)
  const [competenciaId, setCompetenciaId] = useState('')

  useEffect(function () {
    cargarTodo()
  }, [evaluacionId])

  async function cargarTodo() {
    setLoading(true)

    const evalActualResult = await supabase.from('evaluaciones_unidad').select('competencias_ids, publicado, fecha_hora_inicio').eq('id', evaluacionId).single()
    const idsGuardados = evalActualResult.data?.competencias_ids || []
    setPublicado(evalActualResult.data?.publicado || false)
    setFechaHoraInicio(evalActualResult.data?.fecha_hora_inicio || null)

    const preguntasResult = await supabase
      .from('examen_preguntas')
      .select('*, competencia:competencias(nombre)')
      .eq('evaluacion_id', evaluacionId)
      .order('numero')
    if (!preguntasResult.error) setPreguntas(preguntasResult.data)

    const courseResult = await supabase
      .from('courses')
      .select('asignaturas(area_id, areas_curriculares(nombre))')
      .eq('id', courseId)
      .single()
    const areaNombre = courseResult.data?.asignaturas?.areas_curriculares?.nombre
    if (areaNombre) {
      const compResult = await supabase.from('competencias').select('*').eq('area', areaNombre).order('codigo')
      if (!compResult.error) setCompetencias(compResult.data)
    }

    setCompetenciasSeleccionadas(new Set(idsGuardados))
    setLoading(false)
  }

  async function handleGuardarCompetencias() {
    setGuardandoCompetencias(true)
    const result = await supabase
      .from('evaluaciones_unidad')
      .update({ competencias_ids: [...competenciasSeleccionadas] })
      .eq('id', evaluacionId)
    if (result.error) alert('Error: ' + result.error.message)
    setGuardandoCompetencias(false)
  }

  function toggleCompetencia(id) {
    setCompetenciasSeleccionadas(function (prev) {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function resetForm() {
    setEditingId(null)
    setTipo('alternativa')
    setEnunciado('')
    setOpciones(['', '', '', ''])
    setRespuestaCorrecta('')
    setPuntaje(1)
    setCompetenciaId(competenciasSeleccionadas.size === 1 ? [...competenciasSeleccionadas][0] : '')
  }

  function openNew() {
    resetForm()
    setShowForm(true)
  }

  function openEdit(p) {
    setEditingId(p.id)
    setTipo(p.tipo)
    setEnunciado(p.enunciado)
    setOpciones(p.opciones && p.opciones.length > 0 ? p.opciones.map(function (o) { return o.texto }) : ['', '', '', ''])
    setRespuestaCorrecta(p.respuesta_correcta || '')
    setPuntaje(p.puntaje)
    setCompetenciaId(p.competencia_id || '')
    setShowForm(true)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!enunciado.trim()) { setError('Escribe el enunciado de la pregunta.'); return }
    if (!competenciaId) { setError('Elige a qué competencia pertenece esta pregunta.'); return }

    let opcionesPayload = null
    if (tipo === 'alternativa') {
      const letras = ['A', 'B', 'C', 'D']
      opcionesPayload = opciones
        .map(function (texto, i) { return { letra: letras[i], texto: texto.trim() } })
        .filter(function (o) { return o.texto })
      if (opcionesPayload.length < 2) { setError('Agrega al menos 2 alternativas.'); return }
      if (!respuestaCorrecta) { setError('Marca cuál alternativa es la correcta.'); return }
    } else if (tipo === 'verdadero_falso') {
      opcionesPayload = [{ letra: 'V', texto: 'Verdadero' }, { letra: 'F', texto: 'Falso' }]
      if (!respuestaCorrecta) { setError('Marca si la respuesta correcta es Verdadero o Falso.'); return }
    }

    const payload = {
      evaluacion_id: evaluacionId,
      tipo: tipo,
      enunciado: enunciado.trim(),
      opciones: opcionesPayload,
      respuesta_correcta: tipo === 'abierta' ? null : respuestaCorrecta,
      puntaje: puntaje,
      competencia_id: competenciaId,
    }

    let result
    if (editingId) {
      result = await supabase.from('examen_preguntas').update(payload).eq('id', editingId)
    } else {
      payload.numero = preguntas.length + 1
      result = await supabase.from('examen_preguntas').insert(payload)
    }

    if (result.error) {
      setError(result.error.message)
      return
    }
    resetForm()
    setShowForm(false)
    cargarTodo()
  }

  async function handlePublicar() {
    if (!fechaHoraInicio) { alert('Primero ponle fecha/hora de inicio a la evaluación (vuelve a "Evaluación de Cierre").'); return }
    if (preguntas.length === 0) { alert('Agrega al menos una pregunta antes de publicar.'); return }
    if (!confirm('¿Publicar este examen? Se notificará a todos los estudiantes matriculados.')) return

    setPublicando(true)

    const enrollResult = await supabase
      .from('enrollments')
      .select('student_id')
      .eq('course_id', courseId)
      .eq('status', 'activo')

    if (!enrollResult.error && enrollResult.data.length > 0) {
      const fechaTexto = new Date(fechaHoraInicio).toLocaleString('es-PE', { dateStyle: 'medium', timeStyle: 'short' })
      const notifs = enrollResult.data.map(function (e) {
        return {
          user_id: e.student_id,
          tipo: 'tarea_nueva',
          titulo: 'Nuevo examen programado',
          mensaje: `${evaluacionNombre} — disponible el ${fechaTexto}`,
        }
      })
      await supabase.from('notificaciones').insert(notifs)
    }

    const result = await supabase.from('evaluaciones_unidad').update({ publicado: true }).eq('id', evaluacionId)
    if (result.error) alert('Error: ' + result.error.message)
    else setPublicado(true)

    setPublicando(false)
  }

  async function handleDelete(id) {
    if (!confirm('¿Eliminar esta pregunta?')) return
    await supabase.from('examen_preguntas').delete().eq('id', id)
    cargarTodo()
  }

  function generarPDF() {
    const doc = new jsPDF()
    const pageWidth = doc.internal.pageSize.getWidth()
    let y = 15

    doc.setFontSize(11)
    doc.setFont(undefined, 'bold')
    doc.text(evaluacionNombre, pageWidth / 2, y, { align: 'center' })
    y += 6
    doc.setFontSize(9)
    doc.setFont(undefined, 'normal')
    doc.text(`${unidad.tipo} ${unidad.numero}${evaluacionFecha ? ' — ' + new Date(evaluacionFecha + 'T00:00:00').toLocaleDateString('es-PE') : ''}`, pageWidth / 2, y, { align: 'center' })
    y += 10

    doc.setDrawColor(200, 200, 200)
    doc.line(14, y, pageWidth - 14, y)
    y += 8

    doc.setFontSize(9)
    doc.text('Apellidos y Nombres: _________________________________________', 14, y)
    y += 6
    doc.text('Grado y Sección: _____________     Fecha: _____________     Nota: _______', 14, y)
    y += 10

    const totalPuntos = preguntas.reduce(function (a, p) { return a + Number(p.puntaje) }, 0)
    doc.setFont(undefined, 'italic')
    doc.text(`Puntaje total: ${totalPuntos} puntos`, 14, y)
    doc.setFont(undefined, 'normal')
    y += 10

    let numeroGlobal = 1
    competencias.filter(function (c) { return competenciasSeleccionadas.has(c.id) }).forEach(function (comp) {
      const preguntasDeComp = preguntas.filter(function (p) { return p.competencia_id === comp.id })
      if (preguntasDeComp.length === 0) return

      if (y > 260) { doc.addPage(); y = 15 }
      doc.setFontSize(10)
      doc.setFont(undefined, 'bold')
      doc.setTextColor(93, 170, 71)
      doc.text(comp.nombre, 14, y)
      doc.setTextColor(0, 0, 0)
      y += 7

      preguntasDeComp.forEach(function (p) {
        if (y > 265) { doc.addPage(); y = 15 }

        doc.setFontSize(10)
        doc.setFont(undefined, 'bold')
        const enunciadoLines = doc.splitTextToSize(`${numeroGlobal}. ${p.enunciado}  (${p.puntaje} pts)`, pageWidth - 28)
        doc.text(enunciadoLines, 14, y)
        y += enunciadoLines.length * 5 + 2
        doc.setFont(undefined, 'normal')
        numeroGlobal++

        if (p.tipo === 'alternativa' || p.tipo === 'verdadero_falso') {
          ;(p.opciones || []).forEach(function (op) {
            const opLines = doc.splitTextToSize(`${op.letra}) ${op.texto}`, pageWidth - 40)
            doc.text(opLines, 22, y)
            y += opLines.length * 5
          })
          y += 4
        } else {
          for (let i = 0; i < 3; i++) {
            doc.setDrawColor(220, 220, 220)
            doc.line(20, y, pageWidth - 14, y)
            y += 7
          }
          y += 2
        }
      })
      y += 3
    })

    doc.save(`${evaluacionNombre.replace(/[^a-zA-Z0-9]+/g, '_')}.pdf`)
  }

  if (loading) return <p className="text-slate-400 text-sm">Cargando...</p>

  if (verRevision) {
    return (
      <RevisarExamen
        evaluacionId={evaluacionId}
        evaluacionNombre={evaluacionNombre}
        unidad={unidad}
        onCerrar={function () { setVerRevision(false) }}
      />
    )
  }

  const competenciasElegidas = competencias.filter(function (c) { return competenciasSeleccionadas.has(c.id) })
  const totalPreguntas = preguntas.length

  return (
    <div>
      <button onClick={onCerrar} className="text-sm font-semibold mb-4 hover:underline" style={{ color: NAVY }}>
        ← Volver a Evaluación de Cierre
      </button>

      <div className="flex justify-between items-start flex-wrap gap-3 mb-4">
        <div>
          <h3 className="text-lg font-bold" style={{ color: NAVY_DARK }}>{evaluacionNombre}</h3>
          <p className="text-xs text-slate-400">{totalPreguntas} pregunta(s) en total</p>
        </div>
        {totalPreguntas > 0 && (
          <div className="flex gap-2">
            <button onClick={generarPDF} className="text-xs font-semibold px-4 py-2 rounded-lg text-white transition hover:opacity-90" style={{ backgroundColor: NAVY }}>
              📄 Generar PDF del examen
            </button>
            {publicado ? (
              <span className="text-xs font-semibold px-4 py-2 rounded-lg flex items-center gap-1" style={{ backgroundColor: '#E7F3E4', color: '#2f7a1f' }}>
                ✓ Publicado
              </span>
            ) : (
              <button
                onClick={handlePublicar}
                disabled={publicando}
                className="text-xs font-semibold px-4 py-2 rounded-lg text-white transition hover:opacity-90 disabled:opacity-50"
                style={{ backgroundColor: GREEN }}
              >
                {publicando ? 'Publicando...' : '🚀 Publicar examen'}
              </button>
            )}
            {publicado && (
              <button
                onClick={function () { setVerRevision(true) }}
                className="text-xs font-semibold px-4 py-2 rounded-lg text-white transition hover:opacity-90"
                style={{ backgroundColor: '#B45309' }}
              >
                📋 Revisar exámenes rendidos
              </button>
            )}
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl p-4 mb-5" style={{ border: '1px solid #E5E9F0' }}>
        <p className="text-sm font-bold mb-1" style={{ color: NAVY_DARK }}>Paso 1 — ¿Qué competencias vas a evaluar en este examen?</p>
        <p className="text-xs text-slate-400 mb-3">Marca todas las que correspondan. Después podrás agregar preguntas para cada una.</p>
        <div className="grid sm:grid-cols-2 gap-2 mb-3">
          {competencias.map(function (c) {
            const marcado = competenciasSeleccionadas.has(c.id)
            return (
              <label key={c.id} className="flex items-center gap-2 text-sm rounded-lg px-3 py-2 cursor-pointer" style={{ backgroundColor: marcado ? '#E7F3E4' : '#F4F6F9' }}>
                <input type="checkbox" checked={marcado} onChange={function () { toggleCompetencia(c.id) }} />
                <span style={{ color: marcado ? '#2f7a1f' : NAVY_DARK }}>{c.nombre}</span>
              </label>
            )
          })}
        </div>
        <button
          onClick={handleGuardarCompetencias}
          disabled={guardandoCompetencias}
          className="text-xs font-semibold px-4 py-2 rounded-lg text-white transition hover:opacity-90 disabled:opacity-50"
          style={{ backgroundColor: GREEN }}
        >
          {guardandoCompetencias ? 'Guardando...' : 'Guardar competencias'}
        </button>
      </div>

      {competenciasElegidas.length === 0 ? (
        <p className="text-slate-400 text-sm">Elige y guarda al menos una competencia arriba para empezar a agregar preguntas.</p>
      ) : (
        <>
          <div className="flex justify-between items-center mb-3">
            <p className="text-sm font-bold" style={{ color: NAVY_DARK }}>Paso 2 — Preguntas por competencia</p>
            <button
              onClick={function () { if (showForm) setShowForm(false); else openNew() }}
              className="text-xs font-semibold px-4 py-2 rounded-lg text-white transition hover:opacity-90"
              style={{ backgroundColor: GREEN }}
            >
              {showForm ? 'Cancelar' : '+ Nueva pregunta'}
            </button>
          </div>

          {showForm && (
            <form onSubmit={handleSubmit} className="bg-white rounded-2xl p-4 mb-5 space-y-3" style={{ border: '1px solid #E5E9F0' }}>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: NAVY_DARK }}>Competencia que evalúa esta pregunta</label>
                <select value={competenciaId} onChange={function (e) { setCompetenciaId(e.target.value) }} required className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={inputStyle}>
                  <option value="">-- Elige --</option>
                  {competenciasElegidas.map(function (c) { return <option key={c.id} value={c.id}>{c.nombre}</option> })}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: NAVY_DARK }}>Tipo de pregunta</label>
                <div className="flex gap-2 flex-wrap">
                  {TIPOS.map(function (t) {
                    const active = tipo === t.id
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={function () { setTipo(t.id) }}
                        className="text-xs font-semibold px-3 py-1.5 rounded-lg transition"
                        style={active ? { backgroundColor: GREEN, color: 'white' } : { backgroundColor: '#F4F6F9', color: NAVY_DARK }}
                      >
                        {t.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: NAVY_DARK }}>Enunciado</label>
                <textarea
                  value={enunciado}
                  onChange={function (e) { setEnunciado(e.target.value) }}
                  rows={3}
                  required
                  className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                  style={inputStyle}
                  placeholder="Escribe la pregunta..."
                />
              </div>

              {tipo === 'alternativa' && (
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: NAVY_DARK }}>Alternativas (marca la correcta con el círculo)</label>
                  <div className="space-y-2">
                    {['A', 'B', 'C', 'D'].map(function (letra, i) {
                      return (
                        <div key={letra} className="flex items-center gap-2">
                          <input type="radio" name="respuestaCorrecta" checked={respuestaCorrecta === letra} onChange={function () { setRespuestaCorrecta(letra) }} />
                          <span className="text-xs font-bold w-5" style={{ color: NAVY_DARK }}>{letra})</span>
                          <input
                            type="text"
                            value={opciones[i]}
                            onChange={function (e) {
                              const nuevas = [...opciones]
                              nuevas[i] = e.target.value
                              setOpciones(nuevas)
                            }}
                            className="flex-1 rounded-lg px-3 py-1.5 text-sm outline-none"
                            style={inputStyle}
                            placeholder={`Alternativa ${letra}`}
                          />
                        </div>
                      )
                    })}
                  </div>
                  <p className="text-xs mt-1 text-slate-400">El círculo marcado es la que el sistema calificará como correcta automáticamente.</p>
                </div>
              )}

              {tipo === 'verdadero_falso' && (
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: NAVY_DARK }}>Respuesta correcta</label>
                  <div className="flex gap-2">
                    {[{ v: 'V', label: 'Verdadero' }, { v: 'F', label: 'Falso' }].map(function (op) {
                      const active = respuestaCorrecta === op.v
                      return (
                        <button
                          key={op.v}
                          type="button"
                          onClick={function () { setRespuestaCorrecta(op.v) }}
                          className="text-xs font-semibold px-4 py-2 rounded-lg transition"
                          style={active ? { backgroundColor: GREEN, color: 'white' } : { backgroundColor: '#F4F6F9', color: NAVY_DARK }}
                        >
                          {op.label}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {tipo === 'abierta' && (
                <p className="text-xs rounded-lg p-2" style={{ backgroundColor: '#F4F6F9', color: '#5F5E5A' }}>
                  El estudiante podrá escribir su respuesta y/o adjuntar una imagen o PDF. Esta pregunta no se corrige sola — la revisarás tú manualmente.
                </p>
              )}

              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: NAVY_DARK }}>Puntaje</label>
                <input
                  type="number"
                  min="0.5"
                  step="0.5"
                  value={puntaje}
                  onChange={function (e) { setPuntaje(Number(e.target.value)) }}
                  className="w-32 rounded-lg px-3 py-2 text-sm outline-none"
                  style={inputStyle}
                />
              </div>

              {error && <p className="text-red-500 text-sm">{error}</p>}
              <button type="submit" className="text-sm font-semibold px-4 py-2 rounded-lg text-white transition hover:opacity-90" style={{ backgroundColor: GREEN }}>
                {editingId ? 'Guardar cambios' : 'Agregar pregunta'}
              </button>
            </form>
          )}

          <div className="space-y-6">
            {competenciasElegidas.map(function (comp) {
              const preguntasDeComp = preguntas.filter(function (p) { return p.competencia_id === comp.id })
              const puntosComp = preguntasDeComp.reduce(function (a, p) { return a + Number(p.puntaje) }, 0)
              return (
                <div key={comp.id}>
                  <div className="flex justify-between items-center mb-2">
                    <p className="text-sm font-bold" style={{ color: '#2f7a1f' }}>{comp.nombre}</p>
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: '#E7F3E4', color: '#2f7a1f' }}>
                      {preguntasDeComp.length} pregunta(s) · {puntosComp} pts
                    </span>
                  </div>
                  {preguntasDeComp.length === 0 ? (
                    <p className="text-xs text-slate-400 mb-2">Sin preguntas todavía para esta competencia.</p>
                  ) : (
                    <ul className="space-y-2">
                      {preguntasDeComp.map(function (p, index) {
                        return (
                          <li key={p.id} className="bg-white rounded-xl p-3" style={{ border: '1px solid #E5E9F0' }}>
                            <div className="flex justify-between items-start gap-3">
                              <div className="flex-1">
                                <p className="text-sm font-semibold" style={{ color: NAVY_DARK }}>{index + 1}. {p.enunciado}</p>
                                {p.opciones && (
                                  <ul className="mt-1 space-y-0.5">
                                    {p.opciones.map(function (o) {
                                      const esCorrecta = o.letra === p.respuesta_correcta
                                      return (
                                        <li key={o.letra} className="text-xs" style={{ color: esCorrecta ? '#2f7a1f' : '#5F5E5A', fontWeight: esCorrecta ? 600 : 400 }}>
                                          {o.letra}) {o.texto} {esCorrecta ? '✓' : ''}
                                        </li>
                                      )
                                    })}
                                  </ul>
                                )}
                                <p className="text-xs text-slate-400 mt-1">{p.puntaje} pts</p>
                              </div>
                              <div className="flex gap-1 flex-shrink-0">
                                <button onClick={function () { openEdit(p) }} className="text-xs font-semibold px-2 py-1 rounded-lg transition" style={{ backgroundColor: 'white', color: NAVY, border: '1px solid #D6DCE5' }}>Editar</button>
                                <button onClick={function () { handleDelete(p.id) }} className="text-xs font-semibold px-2 py-1 rounded-lg text-white transition hover:opacity-90" style={{ backgroundColor: '#B91C1C' }}>Eliminar</button>
                              </div>
                            </div>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
