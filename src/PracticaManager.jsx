import { useEffect, useState } from 'react'
import mammoth from 'mammoth'
import { supabase } from './supabaseClient'
import { useAuth } from './AuthContext'
import { llamarIA } from './aiClient'

const NAVY_DARK = '#0F172A'
const NAVY = '#2563EB'
const GREEN = '#22C55E'

const inputStyle = { backgroundColor: 'white', border: '1px solid #D6DCE5', color: NAVY_DARK }

const TIPOS_PREGUNTA = [
  { id: 'alternativa', label: 'Alternativa (4 opciones)' },
  { id: 'verdadero_falso', label: 'Verdadero / Falso' },
  { id: 'abierta', label: 'Abierta (la revisas tú después)' },
]

function opcionesVacias(tipo) {
  if (tipo === 'alternativa') return [{ letra: 'A', texto: '' }, { letra: 'B', texto: '' }, { letra: 'C', texto: '' }, { letra: 'D', texto: '' }]
  if (tipo === 'verdadero_falso') return [{ letra: 'V', texto: 'Verdadero' }, { letra: 'F', texto: 'Falso' }]
  return null
}

export default function PracticaManager({ actividad }) {
  const { session } = useAuth()
  const [loading, setLoading] = useState(true)
  const [practica, setPractica] = useState(null)
  const [preguntas, setPreguntas] = useState([])

  const [nombre, setNombre] = useState('')
  const [fechaEntrega, setFechaEntrega] = useState('')
  const [duracion, setDuracion] = useState(30)
  const [guardandoInfo, setGuardandoInfo] = useState(false)

  const capacidadesDisponibles = (actividad.actividad_capacidades || []).map(function (ac) { return ac.capacidad }).filter(Boolean)

  useEffect(function () {
    cargar()
  }, [actividad.id])

  async function cargar() {
    setLoading(true)
    const practicaResult = await supabase.from('practicas').select('*').eq('actividad_id', actividad.id).maybeSingle()
    if (practicaResult.data) {
      setPractica(practicaResult.data)
      setNombre(practicaResult.data.nombre)
      const d = new Date(practicaResult.data.fecha_entrega)
      const pad = function (n) { return String(n).padStart(2, '0') }
      setFechaEntrega(d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()))
      setDuracion(practicaResult.data.duracion_minutos)

      const preguntasResult = await supabase.from('practica_preguntas').select('*, capacidad:capacidades(nombre)').eq('practica_id', practicaResult.data.id).order('numero')
      setPreguntas(preguntasResult.data || [])
    }
    setLoading(false)
  }

  // Mantiene sincronizado assignment_capacidades con las Capacidades que realmente usan las preguntas guardadas
  async function sincronizarCapacidadesDelAssignment(assignmentId, listaPreguntas) {
    const capacidadIds = [...new Set(listaPreguntas.map(function (p) { return p.capacidad_id }).filter(Boolean))]
    await supabase.from('assignment_capacidades').delete().eq('assignment_id', assignmentId)
    if (capacidadIds.length > 0) {
      const payload = capacidadIds.map(function (capId) { return { assignment_id: assignmentId, capacidad_id: capId } })
      await supabase.from('assignment_capacidades').insert(payload)
    }
  }

  async function handleGuardarInfo(e) {
    e.preventDefault()
    if (!nombre.trim() || !fechaEntrega) { alert('Completa el nombre y la fecha límite.'); return }
    setGuardandoInfo(true)

    if (practica) {
      const result = await supabase.from('practicas').update({
        nombre: nombre.trim(),
        fecha_entrega: `${fechaEntrega}:00-05:00`,
        duracion_minutos: duracion,
      }).eq('id', practica.id)
      if (result.error) { alert('Error: ' + result.error.message); setGuardandoInfo(false); return }

      if (practica.assignment_id) {
        await supabase.from('assignments').update({ titulo: nombre.trim(), fecha_entrega: `${fechaEntrega}:00-05:00` }).eq('id', practica.assignment_id)
      }
      await cargar()
    } else {
      // Se crea primero la Tarea (assignment) que va a recibir las notas, igual que cualquier otra Tarea
      const assignResult = await supabase.from('assignments').insert({
        course_id: actividad.course_id,
        actividad_id: actividad.id,
        titulo: nombre.trim(),
        descripcion: 'Práctica calificada — resuelta en línea por el estudiante.',
        fecha_entrega: `${fechaEntrega}:00-05:00`,
        puntaje_maximo: 20,
        instrumento_evaluacion: 'Práctica calificada',
        tipo_entrega: 'individual',
        tema: actividad.nombre,
        created_by: session.user.id,
      }).select('id').single()

      if (assignResult.error) { alert('Error al crear: ' + assignResult.error.message); setGuardandoInfo(false); return }

      const practicaResult = await supabase.from('practicas').insert({
        actividad_id: actividad.id,
        course_id: actividad.course_id,
        assignment_id: assignResult.data.id,
        nombre: nombre.trim(),
        fecha_entrega: `${fechaEntrega}:00-05:00`,
        duracion_minutos: duracion,
        created_by: session.user.id,
      }).select('*').single()

      if (practicaResult.error) { alert('Error al crear: ' + practicaResult.error.message); setGuardandoInfo(false); return }
      setPractica(practicaResult.data)
    }
    setGuardandoInfo(false)
  }

  // ============================================================
  // Preguntas — manual o generadas con IA
  // ============================================================
  const [mostrarFormPregunta, setMostrarFormPregunta] = useState(false)
  const [tipoPregunta, setTipoPregunta] = useState('alternativa')
  const [enunciado, setEnunciado] = useState('')
  const [opciones, setOpciones] = useState(opcionesVacias('alternativa'))
  const [respuestaCorrecta, setRespuestaCorrecta] = useState('')
  const [puntaje, setPuntaje] = useState(1)
  const [capacidadId, setCapacidadId] = useState('')

  function resetFormPregunta() {
    setTipoPregunta('alternativa')
    setEnunciado('')
    setOpciones(opcionesVacias('alternativa'))
    setRespuestaCorrecta('')
    setPuntaje(1)
    setCapacidadId('')
  }

  async function handleAgregarPregunta(e) {
    e.preventDefault()
    if (!enunciado.trim() || !capacidadId) { alert('Completa el enunciado y la Capacidad.'); return }
    if (tipoPregunta !== 'abierta' && !respuestaCorrecta) { alert('Marca cuál es la respuesta correcta.'); return }

    const payload = {
      practica_id: practica.id,
      numero: preguntas.length + 1,
      tipo: tipoPregunta,
      enunciado: enunciado.trim(),
      opciones: tipoPregunta === 'abierta' ? null : opciones,
      respuesta_correcta: tipoPregunta === 'abierta' ? null : respuestaCorrecta,
      puntaje: puntaje,
      capacidad_id: capacidadId,
    }
    const result = await supabase.from('practica_preguntas').insert(payload)
    if (result.error) { alert('Error: ' + result.error.message); return }

    resetFormPregunta()
    setMostrarFormPregunta(false)
    await cargar()
    const nuevasPreguntas = [...preguntas, payload]
    await sincronizarCapacidadesDelAssignment(practica.assignment_id, nuevasPreguntas)
  }

  async function handleEliminarPregunta(id) {
    if (!confirm('¿Eliminar esta pregunta?')) return
    await supabase.from('practica_preguntas').delete().eq('id', id)
    await cargar()
    const restantes = preguntas.filter(function (p) { return p.id !== id })
    await sincronizarCapacidadesDelAssignment(practica.assignment_id, restantes)
  }

  // ============================================================
  // Generar preguntas con IA a partir del documento de la Unidad
  // ============================================================
  const [generandoConIA, setGenerandoConIA] = useState(false)
  const [preguntasPropuestas, setPreguntasPropuestas] = useState(null)

  async function handleSubirWordParaIA(file) {
    if (!file) return
    setGenerandoConIA(true)
    try {
      const arrayBuffer = await file.arrayBuffer()
      const resultadoMammoth = await mammoth.extractRawText({ arrayBuffer: arrayBuffer })
      const textoDocumento = resultadoMammoth.value

      if (!textoDocumento || textoDocumento.trim().length < 20) {
        alert('No se pudo leer texto de ese documento.')
        setGenerandoConIA(false)
        return
      }

      const resultado = await llamarIA('generar_preguntas_practica', {
        textoDocumento: textoDocumento,
        nombrePractica: nombre,
        capacidades: capacidadesDisponibles.map(function (c) { return { id: c.id, nombre: c.nombre } }),
        cantidadPreguntas: 6,
      })

      if (resultado.error) {
        alert('Error al generar con IA: ' + resultado.error)
      } else {
        setPreguntasPropuestas(resultado.data.preguntas)
      }
    } catch (err) {
      alert('Error al leer el documento: ' + err.message)
    }
    setGenerandoConIA(false)
  }

  async function confirmarPreguntasPropuestas() {
    const payload = preguntasPropuestas.map(function (p, i) {
      return {
        practica_id: practica.id,
        numero: preguntas.length + i + 1,
        tipo: p.tipo,
        enunciado: p.enunciado,
        opciones: p.opciones || null,
        respuesta_correcta: p.respuestaCorrecta || null,
        puntaje: p.puntaje || 1,
        capacidad_id: p.capacidadId,
      }
    })
    const result = await supabase.from('practica_preguntas').insert(payload)
    if (result.error) { alert('Error al guardar: ' + result.error.message); return }
    setPreguntasPropuestas(null)
    await cargar()
    await sincronizarCapacidadesDelAssignment(practica.assignment_id, [...preguntas, ...payload])
  }

  if (loading) return <p className="text-slate-400 text-sm">Cargando...</p>

  return (
    <div>
      <div className="bg-white rounded-2xl p-4 mb-5" style={{ border: '1px solid #E5E9F0' }}>
        <p className="text-sm font-bold mb-3" style={{ color: NAVY_DARK }}>
          Datos de la Práctica {practica && <span style={{ color: GREEN }}>✓ Guardada</span>}
        </p>
        <form onSubmit={handleGuardarInfo} className="space-y-3">
          <input type="text" value={nombre} onChange={function (e) { setNombre(e.target.value) }} placeholder="Nombre de la práctica" required className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={inputStyle} />
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: NAVY_DARK }}>Fecha límite (hasta cuándo puede empezar)</label>
              <input type="datetime-local" value={fechaEntrega} onChange={function (e) { setFechaEntrega(e.target.value) }} required className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={inputStyle} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: NAVY_DARK }}>Duración una vez que empiece (minutos)</label>
              <input type="number" min="1" value={duracion} onChange={function (e) { setDuracion(Number(e.target.value)) }} className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={inputStyle} />
            </div>
          </div>
          <button type="submit" disabled={guardandoInfo} className="text-xs font-semibold px-4 py-2 rounded-lg text-white transition hover:opacity-90 disabled:opacity-50" style={{ backgroundColor: GREEN }}>
            {guardandoInfo ? 'Guardando...' : practica ? 'Actualizar' : 'Guardar y continuar'}
          </button>
        </form>
      </div>

      {practica && (
        <>
          <div className="flex justify-between items-center mb-3 flex-wrap gap-2">
            <p className="text-sm font-bold" style={{ color: NAVY_DARK }}>Preguntas ({preguntas.length})</p>
            <div className="flex gap-2">
              <label className="text-xs font-semibold px-3 py-1.5 rounded-lg cursor-pointer transition" style={{ backgroundColor: 'white', color: '#7C3AED', border: '1px solid #D6D0FA' }}>
                {generandoConIA ? 'Generando...' : '✨ Generar desde Word con IA'}
                <input type="file" accept=".docx" className="hidden" disabled={generandoConIA} onChange={function (e) { if (e.target.files[0]) handleSubirWordParaIA(e.target.files[0]) }} />
              </label>
              <button onClick={function () { setMostrarFormPregunta(!mostrarFormPregunta) }} className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white transition hover:opacity-90" style={{ backgroundColor: GREEN }}>
                {mostrarFormPregunta ? 'Cancelar' : '+ Pregunta manual'}
              </button>
            </div>
          </div>

          {preguntasPropuestas && (
            <div className="rounded-xl p-4 mb-4" style={{ backgroundColor: '#F0F0FF', border: '1px solid #D6D0FA' }}>
              <p className="text-xs font-bold mb-2" style={{ color: '#4A2E9E' }}>La IA propone {preguntasPropuestas.length} pregunta(s) — revísalas antes de confirmar:</p>
              <div className="space-y-2 mb-3 max-h-72 overflow-y-auto">
                {preguntasPropuestas.map(function (p, i) {
                  return (
                    <div key={i} className="bg-white rounded-lg p-2 text-xs" style={{ border: '1px solid #D6D0FA' }}>
                      <p className="font-semibold" style={{ color: NAVY_DARK }}>{i + 1}. [{p.tipo}] {p.enunciado}</p>
                      {p.opciones && <p className="text-slate-500 mt-1">{p.opciones.map(function (o) { return `${o.letra}) ${o.texto}` }).join(' · ')} — Correcta: {p.respuestaCorrecta}</p>}
                    </div>
                  )
                })}
              </div>
              <div className="flex gap-2">
                <button onClick={confirmarPreguntasPropuestas} className="text-xs font-semibold px-4 py-2 rounded-lg text-white transition hover:opacity-90" style={{ backgroundColor: GREEN }}>✓ Confirmar y agregar todas</button>
                <button onClick={function () { setPreguntasPropuestas(null) }} className="text-xs font-semibold px-4 py-2 rounded-lg transition" style={{ backgroundColor: 'white', color: NAVY_DARK, border: '1px solid #D6DCE5' }}>Descartar</button>
              </div>
            </div>
          )}

          {mostrarFormPregunta && (
            <form onSubmit={handleAgregarPregunta} className="rounded-xl p-4 mb-4 space-y-3" style={{ backgroundColor: '#F4F6F9', border: '1px solid #E5E9F0' }}>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: NAVY_DARK }}>Tipo de pregunta</label>
                <div className="flex gap-2 flex-wrap">
                  {TIPOS_PREGUNTA.map(function (t) {
                    const active = tipoPregunta === t.id
                    return (
                      <button key={t.id} type="button" onClick={function () { setTipoPregunta(t.id); setOpciones(opcionesVacias(t.id)); setRespuestaCorrecta('') }}
                        className="text-xs font-semibold px-3 py-1.5 rounded-lg transition"
                        style={active ? { backgroundColor: GREEN, color: 'white' } : { backgroundColor: 'white', color: NAVY_DARK, border: '1px solid #D6DCE5' }}>
                        {t.label}
                      </button>
                    )
                  })}
                </div>
              </div>
              <textarea value={enunciado} onChange={function (e) { setEnunciado(e.target.value) }} placeholder="Enunciado de la pregunta" rows={2} className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={inputStyle} />
              {opciones && (
                <div className="space-y-1.5">
                  {opciones.map(function (op, i) {
                    return (
                      <div key={op.letra} className="flex items-center gap-2">
                        <input type="radio" name="correcta" checked={respuestaCorrecta === op.letra} onChange={function () { setRespuestaCorrecta(op.letra) }} />
                        <span className="text-xs font-semibold w-5" style={{ color: NAVY_DARK }}>{op.letra})</span>
                        {tipoPregunta === 'verdadero_falso' ? (
                          <span className="text-xs" style={{ color: NAVY_DARK }}>{op.texto}</span>
                        ) : (
                          <input type="text" value={op.texto} onChange={function (e) {
                            const nuevas = [...opciones]; nuevas[i] = { ...op, texto: e.target.value }; setOpciones(nuevas)
                          }} placeholder={`Opción ${op.letra}`} className="flex-1 rounded-lg px-2 py-1 text-xs outline-none" style={inputStyle} />
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: NAVY_DARK }}>Capacidad</label>
                  <select value={capacidadId} onChange={function (e) { setCapacidadId(e.target.value) }} className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={inputStyle}>
                    <option value="">-- Elige --</option>
                    {capacidadesDisponibles.map(function (c) { return <option key={c.id} value={c.id}>{c.nombre}</option> })}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: NAVY_DARK }}>Puntaje</label>
                  <input type="number" min="0.5" step="0.5" value={puntaje} onChange={function (e) { setPuntaje(Number(e.target.value)) }} className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={inputStyle} />
                </div>
              </div>
              <button type="submit" className="text-xs font-semibold px-4 py-2 rounded-lg text-white transition hover:opacity-90" style={{ backgroundColor: GREEN }}>+ Agregar pregunta</button>
            </form>
          )}

          {preguntas.length === 0 ? (
            <p className="text-slate-400 text-sm">Aún no hay preguntas — agrega manualmente o genera con IA.</p>
          ) : (
            <ul className="space-y-2">
              {preguntas.map(function (p) {
                return (
                  <li key={p.id} className="rounded-lg p-3 flex justify-between items-start gap-2" style={{ backgroundColor: '#F4F6F9', border: '1px solid #E5E9F0' }}>
                    <div>
                      <p className="text-xs font-semibold" style={{ color: NAVY_DARK }}>{p.numero}. [{p.tipo}] {p.enunciado}</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">{p.capacidad?.nombre} · {p.puntaje} pt(s)</p>
                    </div>
                    <button onClick={function () { handleEliminarPregunta(p.id) }} className="text-xs font-semibold px-2 py-1 rounded text-white flex-shrink-0" style={{ backgroundColor: '#B91C1C' }}>Eliminar</button>
                  </li>
                )
              })}
            </ul>
          )}
        </>
      )}
    </div>
  )
}
