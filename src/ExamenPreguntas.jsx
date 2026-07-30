import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import jsPDF from 'jspdf'

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
  const [capacidades, setCapacidades] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)

  const [tipo, setTipo] = useState('alternativa')
  const [enunciado, setEnunciado] = useState('')
  const [opciones, setOpciones] = useState(['', '', '', ''])
  const [respuestaCorrecta, setRespuestaCorrecta] = useState('')
  const [puntaje, setPuntaje] = useState(1)
  const [capacidadId, setCapacidadId] = useState('')

  useEffect(function () {
    cargarTodo()
  }, [evaluacionId])

  async function cargarTodo() {
    setLoading(true)

    const preguntasResult = await supabase
      .from('examen_preguntas')
      .select('*, capacidad:capacidades(nombre)')
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
      const compResult = await supabase.from('competencias').select('id').eq('area', areaNombre)
      const competenciaIds = (compResult.data || []).map(function (c) { return c.id })
      if (competenciaIds.length > 0) {
        const capResult = await supabase.from('capacidades').select('id, nombre').in('competencia_id', competenciaIds).order('orden')
        if (!capResult.error) setCapacidades(capResult.data)
      }
    }

    setLoading(false)
  }

  function resetForm() {
    setEditingId(null)
    setTipo('alternativa')
    setEnunciado('')
    setOpciones(['', '', '', ''])
    setRespuestaCorrecta('')
    setPuntaje(1)
    setCapacidadId('')
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
    setCapacidadId(p.capacidad_id || '')
    setShowForm(true)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!enunciado.trim()) { setError('Escribe el enunciado de la pregunta.'); return }

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
      capacidad_id: capacidadId || null,
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

  async function handleDelete(id) {
    if (!confirm('¿Eliminar esta pregunta?')) return
    await supabase.from('examen_preguntas').delete().eq('id', id)
    const restantes = preguntas.filter(function (p) { return p.id !== id })
    for (let i = 0; i < restantes.length; i++) {
      await supabase.from('examen_preguntas').update({ numero: i + 1 }).eq('id', restantes[i].id)
    }
    cargarTodo()
  }

  async function moverPregunta(index, direccion) {
    const otras = index + direccion
    if (otras < 0 || otras >= preguntas.length) return
    const a = preguntas[index]
    const b = preguntas[otras]
    await supabase.from('examen_preguntas').update({ numero: b.numero }).eq('id', a.id)
    await supabase.from('examen_preguntas').update({ numero: a.numero }).eq('id', b.id)
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

    preguntas.forEach(function (p) {
      if (y > 265) { doc.addPage(); y = 15 }

      doc.setFontSize(10)
      doc.setFont(undefined, 'bold')
      const enunciadoLines = doc.splitTextToSize(`${p.numero}. ${p.enunciado}  (${p.puntaje} pts)`, pageWidth - 28)
      doc.text(enunciadoLines, 14, y)
      y += enunciadoLines.length * 5 + 2
      doc.setFont(undefined, 'normal')

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

    doc.save(`${evaluacionNombre.replace(/[^a-zA-Z0-9]+/g, '_')}.pdf`)
  }

  if (loading) return <p className="text-slate-400 text-sm">Cargando...</p>

  return (
    <div>
      <button onClick={onCerrar} className="text-sm font-semibold mb-4 hover:underline" style={{ color: NAVY }}>
        ← Volver a Evaluación de Cierre
      </button>

      <div className="flex justify-between items-start flex-wrap gap-3 mb-1">
        <div>
          <h3 className="text-lg font-bold" style={{ color: NAVY_DARK }}>{evaluacionNombre}</h3>
          <p className="text-xs text-slate-400">Preguntas del examen — {preguntas.length} pregunta(s)</p>
        </div>
        <div className="flex gap-2">
          {preguntas.length > 0 && (
            <button onClick={generarPDF} className="text-xs font-semibold px-4 py-2 rounded-lg text-white transition hover:opacity-90" style={{ backgroundColor: NAVY }}>
              📄 Generar PDF del examen
            </button>
          )}
          <button
            onClick={function () { if (showForm) setShowForm(false); else openNew() }}
            className="text-xs font-semibold px-4 py-2 rounded-lg text-white transition hover:opacity-90"
            style={{ backgroundColor: GREEN }}
          >
            {showForm ? 'Cancelar' : '+ Nueva pregunta'}
          </button>
        </div>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl p-4 my-4 space-y-3" style={{ border: '1px solid #E5E9F0' }}>
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
                      <input
                        type="radio"
                        name="respuestaCorrecta"
                        checked={respuestaCorrecta === letra}
                        onChange={function () { setRespuestaCorrecta(letra) }}
                      />
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
              <p className="text-xs mt-1 text-slate-400">La verde ✓ es la que el sistema calificará como correcta automáticamente.</p>
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

          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: NAVY_DARK }}>Puntaje</label>
              <input
                type="number"
                min="0.5"
                step="0.5"
                value={puntaje}
                onChange={function (e) { setPuntaje(Number(e.target.value)) }}
                className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                style={inputStyle}
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: NAVY_DARK }}>Capacidad que evalúa (opcional)</label>
              <select
                value={capacidadId}
                onChange={function (e) { setCapacidadId(e.target.value) }}
                className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                style={inputStyle}
              >
                <option value="">-- Sin especificar --</option>
                {capacidades.map(function (c) { return <option key={c.id} value={c.id}>{c.nombre}</option> })}
              </select>
            </div>
          </div>

          {error && <p className="text-red-500 text-sm">{error}</p>}
          <button type="submit" className="text-sm font-semibold px-4 py-2 rounded-lg text-white transition hover:opacity-90" style={{ backgroundColor: GREEN }}>
            {editingId ? 'Guardar cambios' : 'Agregar pregunta'}
          </button>
        </form>
      )}

      {preguntas.length === 0 ? (
        <p className="text-slate-400 text-sm">Aún no hay preguntas en este examen.</p>
      ) : (
        <ul className="space-y-3">
          {preguntas.map(function (p, index) {
            return (
              <li key={p.id} className="bg-white rounded-xl p-4" style={{ border: '1px solid #E5E9F0' }}>
                <div className="flex justify-between items-start gap-3">
                  <div className="flex-1">
                    <p className="text-sm font-semibold" style={{ color: NAVY_DARK }}>{p.numero}. {p.enunciado}</p>
                    {p.opciones && (
                      <ul className="mt-1 space-y-0.5">
                        {p.opciones.map(function (o) {
                          return <li key={o.letra} className="text-xs text-slate-500">{o.letra}) {o.texto}</li>
                        })}
                      </ul>
                    )}
                    <p className="text-xs text-slate-400 mt-1">
                      {p.puntaje} pts{p.capacidad ? ' · ' + p.capacidad.nombre : ''}
                    </p>
                  </div>
                  <div className="flex flex-col gap-1 items-end flex-shrink-0">
                    <div className="flex gap-1">
                      <button onClick={function () { moverPregunta(index, -1) }} disabled={index === 0} className="text-xs px-2 py-1 rounded-lg transition disabled:opacity-30" style={{ backgroundColor: '#F4F6F9', color: NAVY_DARK }}>↑</button>
                      <button onClick={function () { moverPregunta(index, 1) }} disabled={index === preguntas.length - 1} className="text-xs px-2 py-1 rounded-lg transition disabled:opacity-30" style={{ backgroundColor: '#F4F6F9', color: NAVY_DARK }}>↓</button>
                    </div>
                    <div className="flex gap-1">
                      <button onClick={function () { openEdit(p) }} className="text-xs font-semibold px-2 py-1 rounded-lg transition" style={{ backgroundColor: 'white', color: NAVY, border: '1px solid #D6DCE5' }}>Editar</button>
                      <button onClick={function () { handleDelete(p.id) }} className="text-xs font-semibold px-2 py-1 rounded-lg text-white transition hover:opacity-90" style={{ backgroundColor: '#B91C1C' }}>Eliminar</button>
                    </div>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
