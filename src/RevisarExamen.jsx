import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import { useAuth } from './AuthContext'
import { compararPorApellido, getLetterGrade } from './gradeUtils'
import PreviewModal from './PreviewModal'

const NAVY_DARK = '#0F2A4A'
const NAVY = '#1d5c8f'
const GREEN = '#5DAA47'

const inputStyle = { backgroundColor: 'white', border: '1px solid #D6DCE5', color: NAVY_DARK }

export default function RevisarExamen({ evaluacionId, evaluacionNombre, unidad, onCerrar }) {
  const { session } = useAuth()
  const [loading, setLoading] = useState(true)
  const [preguntas, setPreguntas] = useState([])
  const [intentos, setIntentos] = useState([])
  const [intentoSel, setIntentoSel] = useState(null)
  const [respuestas, setRespuestas] = useState([])
  const [puntajesEditados, setPuntajesEditados] = useState({})
  const [guardando, setGuardando] = useState(false)
  const [preview, setPreview] = useState(null)
  const [matriculados, setMatriculados] = useState([])
  const [marcandoAusente, setMarcandoAusente] = useState(null)
  const [errorCarga, setErrorCarga] = useState('')

  useEffect(function () {
    cargar()
  }, [evaluacionId])

  async function cargar() {
    setLoading(true)

    const preguntasResult = await supabase
      .from('examen_preguntas')
      .select('*, competencia:competencias(id, nombre)')
      .eq('evaluacion_id', evaluacionId)
      .order('numero')
    if (!preguntasResult.error) setPreguntas(preguntasResult.data)

    const intentosResult = await supabase
      .from('examen_intentos')
      .select('*, student:profiles(full_name)')
      .eq('evaluacion_id', evaluacionId)
      .eq('estado', 'finalizado')
      .order('finalizado_at', { ascending: false })
    if (!intentosResult.error) {
      const lista = intentosResult.data.sort(function (a, b) { return compararPorApellido(a.student?.full_name || '', b.student?.full_name || '') })
      setIntentos(lista)
    } else {
      setErrorCarga('Error al cargar intentos: ' + intentosResult.error.message)
    }

    const enrollResult = await supabase
      .from('enrollments')
      .select('student:profiles(id, full_name)')
      .eq('course_id', unidad.course_id)
      .eq('status', 'activo')
    if (!enrollResult.error) {
      const lista = enrollResult.data.map(function (e) { return e.student }).filter(Boolean)
      lista.sort(function (a, b) { return compararPorApellido(a.full_name, b.full_name) })
      setMatriculados(lista)
    }

    setLoading(false)
  }

  async function handleMarcarAusente(estudiante) {
    if (!confirm(`¿Registrar C (0) a ${estudiante.full_name} por no presentar el examen?`)) return
    setMarcandoAusente(estudiante.id)

    const competenciasUnicas = [...new Map(preguntas.map(function (p) { return [p.competencia_id, p.competencia] })).values()]
    const bimestre = Math.ceil(unidad.numero / 2)

    for (const comp of competenciasUnicas) {
      if (!comp) continue
      await supabase.from('evaluacion_cierre').upsert({
        student_id: estudiante.id,
        course_id: unidad.course_id,
        unidad_id: unidad.id,
        competencia_id: comp.id,
        evaluacion_id: evaluacionId,
        bimestre: bimestre,
        nota_numerica: 0,
        nota_letra: 'C',
        estado: 'confirmada',
        graded_by: session.user.id,
        graded_at: new Date().toISOString(),
      }, { onConflict: 'student_id,unidad_id,competencia_id' })
    }

    setMarcandoAusente(null)
    alert('Registrado. La nota C ya cuenta en el Registro.')
    cargar()
  }

  async function abrirIntento(intento) {
    setIntentoSel(intento)
    setPuntajesEditados({})
    const result = await supabase
      .from('examen_respuestas')
      .select('*')
      .eq('intento_id', intento.id)
    if (!result.error) setRespuestas(result.data)
  }

  async function handleVerAdjunto(path) {
    const result = await supabase.storage.from('examenes').createSignedUrl(path, 300)
    if (result.error) { alert('Error: ' + result.error.message); return }
    const parts = path.split('/')
    const name = parts[parts.length - 1]
    const ext = name.split('.').pop().toLowerCase()
    setPreview({ url: result.data.signedUrl, type: ext, name: name })
  }

  async function handleGuardarYConfirmar() {
    setGuardando(true)

    for (const preguntaId of Object.keys(puntajesEditados)) {
      const respuesta = respuestas.find(function (r) { return r.pregunta_id === preguntaId })
      if (respuesta) {
        await supabase.from('examen_respuestas').update({ puntaje_obtenido: puntajesEditados[preguntaId] }).eq('id', respuesta.id)
      }
    }

    const respuestasActualizadas = respuestas.map(function (r) {
      return puntajesEditados[r.pregunta_id] != null ? { ...r, puntaje_obtenido: puntajesEditados[r.pregunta_id] } : r
    })

    const competenciasUnicas = [...new Map(preguntas.map(function (p) { return [p.competencia_id, p.competencia] })).values()]
    const bimestre = Math.ceil(unidad.numero / 2)

    for (const comp of competenciasUnicas) {
      if (!comp) continue
      const preguntasComp = preguntas.filter(function (p) { return p.competencia_id === comp.id })
      const puntosObtenidos = preguntasComp.reduce(function (a, p) {
        const r = respuestasActualizadas.find(function (x) { return x.pregunta_id === p.id })
        return a + (r?.puntaje_obtenido != null ? Number(r.puntaje_obtenido) : 0)
      }, 0)
      const puntosTotal = preguntasComp.reduce(function (a, p) { return a + Number(p.puntaje) }, 0)
      const notaNumerica = puntosTotal > 0 ? Math.round((puntosObtenidos / puntosTotal) * 20 * 10) / 10 : 0

      await supabase.from('evaluacion_cierre').upsert({
        student_id: intentoSel.student_id,
        course_id: unidad.course_id,
        unidad_id: unidad.id,
        competencia_id: comp.id,
        evaluacion_id: evaluacionId,
        bimestre: bimestre,
        nota_numerica: notaNumerica,
        nota_letra: getLetterGrade(notaNumerica),
        estado: 'confirmada',
        graded_by: session.user.id,
        graded_at: new Date().toISOString(),
      }, { onConflict: 'student_id,unidad_id,competencia_id' })
    }

    setGuardando(false)
    alert('Calificación confirmada. Ya cuenta en el Registro Auxiliar.')
    abrirIntento(intentoSel)
  }

  async function handleEliminarExamen() {
    if (!confirm(`¿Eliminar el examen de ${intentoSel.student?.full_name}? Podrá volver a rendirlo desde cero. Sus notas pendientes/confirmadas de este examen también se borrarán.`)) return
    setGuardando(true)

    await supabase.from('evaluacion_cierre').delete().eq('evaluacion_id', evaluacionId).eq('student_id', intentoSel.student_id)
    await supabase.from('examen_intentos').delete().eq('id', intentoSel.id)

    setGuardando(false)
    setIntentoSel(null)
    cargar()
  }

  if (loading) return <p className="text-slate-400 text-sm">Cargando...</p>

  if (intentoSel) {
    return (
      <div>
        <button onClick={function () { setIntentoSel(null) }} className="text-sm font-semibold mb-4 hover:underline" style={{ color: NAVY }}>← Volver a la lista</button>
        <h3 className="text-lg font-bold mb-1" style={{ color: NAVY_DARK }}>{intentoSel.student?.full_name}</h3>
        <p className="text-xs text-slate-400 mb-5">
          Puntaje automático: {intentoSel.puntaje_auto} / {intentoSel.puntaje_total} · Entregado el {new Date(intentoSel.finalizado_at).toLocaleString('es-PE')}
        </p>

        <div className="space-y-3 mb-6">
          {preguntas.map(function (p, index) {
            const respuesta = respuestas.find(function (r) { return r.pregunta_id === p.id })
            const esAutocorregible = p.tipo !== 'abierta'
            const puntajeActual = puntajesEditados[p.id] != null ? puntajesEditados[p.id] : respuesta?.puntaje_obtenido

            return (
              <div key={p.id} className="bg-white rounded-xl p-4" style={{ border: '1px solid #E5E9F0' }}>
                <p className="text-xs text-slate-400 mb-1">{p.competencia?.nombre} · {p.puntaje} pts</p>
                <p className="text-sm font-semibold mb-2" style={{ color: NAVY_DARK }}>{index + 1}. {p.enunciado}</p>

                {esAutocorregible ? (
                  <div>
                    <p className="text-xs" style={{ color: respuesta?.es_correcta ? '#2f7a1f' : '#B91C1C' }}>
                      Respondió: {(p.opciones || []).find(function (o) { return o.letra === respuesta?.respuesta_texto })?.texto || respuesta?.respuesta_texto || '(sin responder)'}
                      {respuesta?.es_correcta ? ' ✓ Correcta' : ' ✗ Incorrecta'}
                    </p>
                    <p className="text-xs text-slate-400 mt-1">Puntos: {respuesta?.puntaje_obtenido ?? 0} / {p.puntaje}</p>
                  </div>
                ) : (
                  <div className="rounded-lg p-3" style={{ backgroundColor: '#F4F6F9' }}>
                    <p className="text-xs whitespace-pre-wrap" style={{ color: NAVY_DARK }}>{respuesta?.respuesta_texto || '(sin respuesta de texto)'}</p>
                    {respuesta?.respuesta_archivo_url && (
                      <button onClick={function () { handleVerAdjunto(respuesta.respuesta_archivo_url) }} className="text-xs font-semibold px-3 py-1.5 rounded-lg mt-2 transition" style={{ backgroundColor: 'white', color: NAVY, border: '1px solid #D6DCE5' }}>
                        📎 Ver adjunto
                      </button>
                    )}
                    <div className="flex items-center gap-2 mt-3">
                      <label className="text-xs font-medium" style={{ color: NAVY_DARK }}>Puntaje asignado:</label>
                      <input
                        type="number"
                        min="0"
                        max={p.puntaje}
                        step="0.5"
                        defaultValue={puntajeActual != null ? puntajeActual : ''}
                        placeholder="0"
                        className="w-20 rounded-lg text-sm px-2 py-1 outline-none"
                        style={inputStyle}
                        onBlur={function (e) {
                          const val = Number(e.target.value)
                          setPuntajesEditados(function (prev) { return { ...prev, [p.id]: isNaN(val) ? 0 : val } })
                        }}
                      />
                      <span className="text-xs text-slate-400">/ {p.puntaje}</span>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <div className="flex gap-2 flex-wrap">
          <button
            onClick={handleGuardarYConfirmar}
            disabled={guardando}
            className="text-sm font-semibold px-6 py-2.5 rounded-xl text-white transition hover:opacity-90 disabled:opacity-50"
            style={{ backgroundColor: GREEN }}
          >
            {guardando ? 'Guardando...' : '✓ Guardar / actualizar nota en el Registro'}
          </button>
          <button
            onClick={handleEliminarExamen}
            disabled={guardando}
            className="text-sm font-semibold px-6 py-2.5 rounded-xl text-white transition hover:opacity-90 disabled:opacity-50"
            style={{ backgroundColor: '#B91C1C' }}
          >
            🗑️ Eliminar examen (permitir repetir)
          </button>
        </div>

        <PreviewModal preview={preview} onClose={function () { setPreview(null) }} />
      </div>
    )
  }

  return (
    <div>
      {onCerrar && <button onClick={onCerrar} className="text-sm font-semibold mb-4 hover:underline" style={{ color: NAVY }}>← Volver</button>}
      <h2 className="text-xl font-bold mb-1" style={{ color: NAVY_DARK }}>Revisar examen: {evaluacionNombre}</h2>
      <p className="text-sm text-slate-400 mb-6">{intentos.length} estudiante(s) han rendido este examen.</p>
      {errorCarga && <p className="text-red-500 text-sm mb-4">{errorCarga}</p>}

      {intentos.length === 0 ? (
        <p className="text-slate-400 text-sm">Ningún estudiante ha rendido este examen todavía.</p>
      ) : (
        <ul className="space-y-2">
          {intentos.map(function (i) {
            return (
              <li key={i.id}>
                <button
                  onClick={function () { abrirIntento(i) }}
                  className="w-full text-left bg-white rounded-xl p-4 flex justify-between items-center transition hover:opacity-90"
                  style={{ border: '1px solid #E5E9F0' }}
                >
                  <div>
                    <p className="text-sm font-semibold" style={{ color: NAVY_DARK }}>{i.student?.full_name}</p>
                    <p className="text-xs text-slate-400">Entregado el {new Date(i.finalizado_at).toLocaleString('es-PE')}</p>
                  </div>
                  <span className="text-xs font-semibold px-3 py-1 rounded-full" style={{ backgroundColor: '#E7F3E4', color: '#2f7a1f' }}>
                    {i.puntaje_auto} / {i.puntaje_total} auto
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {(function () {
        const idsRindieron = new Set(intentos.map(function (i) { return i.student_id }))
        const noRindieron = matriculados.filter(function (m) { return !idsRindieron.has(m.id) })
        if (noRindieron.length === 0) return null
        return (
          <div className="mt-8">
            <p className="text-sm font-bold mb-3" style={{ color: '#B91C1C' }}>No han rendido ({noRindieron.length})</p>
            <ul className="space-y-2">
              {noRindieron.map(function (m) {
                return (
                  <li key={m.id} className="bg-white rounded-xl p-4 flex justify-between items-center" style={{ border: '1px solid #F5C6C6' }}>
                    <p className="text-sm font-semibold" style={{ color: NAVY_DARK }}>{m.full_name}</p>
                    <button
                      onClick={function () { handleMarcarAusente(m) }}
                      disabled={marcandoAusente === m.id}
                      className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white transition hover:opacity-90 disabled:opacity-50"
                      style={{ backgroundColor: '#B91C1C' }}
                    >
                      {marcandoAusente === m.id ? 'Guardando...' : 'Registrar C (no presentó)'}
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        )
      })()}
    </div>
  )
}
