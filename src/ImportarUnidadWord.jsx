import { useState } from 'react'
import mammoth from 'mammoth'
import { supabase } from './supabaseClient'
import { useAuth } from './AuthContext'
import { llamarIA } from './aiClient'

const NAVY_DARK = '#0F172A'
const NAVY = '#2563EB'
const GREEN = '#22C55E'

const inputStyle = { backgroundColor: 'white', border: '1px solid #D6DCE5', color: NAVY_DARK }

// ============================================================
// Importar Unidad/Experiencia desde un Word, con ayuda de IA — Función 1 del plan de IA.
// La IA extrae Unidad + Actividades del documento. Las Tareas NO se crean automático
// (necesitan que la Actividad tenga sus Capacidades asignadas primero), se muestran
// como sugerencia para que el docente las cree en un paso aparte, ya bien configuradas.
// ============================================================
export default function ImportarUnidadWord({ areaId, grado, grupo, cursos, onImportado, onCerrar }) {
  const [cursoId, setCursoId] = useState(cursos.length === 1 ? cursos[0].id : '')
  const { session } = useAuth()
  const [archivo, setArchivo] = useState(null)
  const [extrayendo, setExtrayendo] = useState(false)
  const [error, setError] = useState('')
  const [estructura, setEstructura] = useState(null)
  const [competencias, setCompetencias] = useState([])
  const [competenciaPorActividad, setCompetenciaPorActividad] = useState({}) // índice -> competenciaId
  const [creando, setCreando] = useState(false)

  async function manejarArchivo(file) {
    if (!file) return
    setArchivo(file)
    setError('')
    setEstructura(null)
    setExtrayendo(true)
    try {
      // 1. Extraer el texto plano del Word directo en el navegador
      const arrayBuffer = await file.arrayBuffer()
      const resultadoMammoth = await mammoth.extractRawText({ arrayBuffer: arrayBuffer })
      const textoDocumento = resultadoMammoth.value

      if (!textoDocumento || textoDocumento.trim().length < 20) {
        setError('No se pudo leer texto de ese documento, o está casi vacío.')
        setExtrayendo(false)
        return
      }

      // 2. Traer el nombre del Área y sus Competencias (para que el docente elija cuál va en cada Actividad)
      const areaResult = await supabase.from('areas_curriculares').select('nombre').eq('id', areaId).single()
      const areaNombre = areaResult.data?.nombre || ''

      const compResult = await supabase.from('competencias').select('id, nombre, codigo').eq('area', areaNombre).order('codigo')
      setCompetencias(compResult.data || [])

      // 3. Pedirle a la IA que extraiga la estructura
      const resultado = await llamarIA('importar_word_unidad', {
        textoDocumento: textoDocumento,
        areaNombre: areaNombre,
        anioActual: new Date().getFullYear(),
      })

      if (resultado.error) {
        setError(resultado.error)
        setExtrayendo(false)
        return
      }

      setEstructura(resultado.data)
      setCompetenciaPorActividad({})
    } catch (err) {
      setError('Error al leer el documento: ' + err.message)
    }
    setExtrayendo(false)
  }

  async function confirmarCreacion() {
    if (!estructura) return

    if (!cursoId) {
      alert('Elige a qué asignatura pertenecen estas actividades.')
      return
    }

    const actividadesSinCompetencia = estructura.actividades.filter(function (_a, i) { return !competenciaPorActividad[i] })
    if (actividadesSinCompetencia.length > 0) {
      alert('Falta elegir la Competencia de ' + actividadesSinCompetencia.length + ' actividad(es) antes de crear.')
      return
    }

    setCreando(true)
    try {
      // 1. Crear (o encontrar) la Unidad
      let unidadId = null
      const numeroUnidad = estructura.unidad?.numero
      const tipoUnidad = 'Experiencia de aprendizaje'

      if (numeroUnidad) {
        const existenteResult = await supabase
          .from('unidades')
          .select('id')
          .eq('area_id', areaId)
          .eq('grado', grado)
          .eq('grupo', grupo)
          .eq('numero', numeroUnidad)
          .maybeSingle()
        if (existenteResult.data) unidadId = existenteResult.data.id
      }

      if (!unidadId) {
        const unidadPayload = {
          area_id: areaId,
          grado: grado,
          grupo: grupo,
          tipo: tipoUnidad,
          numero: numeroUnidad || 1,
          nombre: estructura.unidad?.titulo || null,
          fecha_inicio: estructura.unidad?.fechaInicio || null,
          fecha_fin: estructura.unidad?.fechaFin || null,
          created_by: session.user.id,
        }
        const crearUnidadResult = await supabase.from('unidades').insert(unidadPayload).select('id').single()
        if (crearUnidadResult.error) {
          alert('Error al crear la Unidad: ' + crearUnidadResult.error.message)
          setCreando(false)
          return
        }
        unidadId = crearUnidadResult.data.id
      }

      // 2. Crear cada Actividad
      let numeroActividadInicial = 1
      const conteoResult = await supabase.from('actividades').select('id', { count: 'exact', head: true }).eq('unidad_id', unidadId).eq('course_id', cursoId)
      numeroActividadInicial = (conteoResult.count || 0) + 1

      let creadas = 0
      for (let i = 0; i < estructura.actividades.length; i++) {
        const act = estructura.actividades[i]
        const payload = {
          course_id: cursoId,
          unidad_id: unidadId,
          tipo_unidad: tipoUnidad,
          numero_unidad: String(numeroUnidad || 1),
          numero_actividad: numeroActividadInicial + i,
          nombre: act.titulo,
          fecha_clase: null,
          tipo_instrumento: 'Lista de cotejo',
          proposito: act.tarea ? `Producto/tarea sugerida por el documento: "${act.tarea.titulo}"` : '',
          competencia_id: competenciaPorActividad[i],
          created_by: session.user.id,
        }
        const result = await supabase.from('actividades').insert(payload)
        if (!result.error) creadas++
      }

      alert(`Listo: se creó la Unidad y ${creadas} Actividad(es). Entra a cada una para asignarle sus Capacidades y, si corresponde, crear la Tarea sugerida por el documento.`)
      if (onImportado) onImportado()
    } catch (err) {
      alert('Error al crear: ' + err.message)
    }
    setCreando(false)
  }

  return (
    <div className="rounded-xl p-4 mb-5 space-y-3" style={{ backgroundColor: '#F0F0FF', border: '1px solid #D6D0FA' }}>
      <div className="flex justify-between items-center">
        <h4 className="text-sm font-semibold" style={{ color: '#4A2E9E' }}>📄 Importar Unidad desde Word (con IA)</h4>
        <button onClick={onCerrar} className="text-xs font-semibold hover:underline" style={{ color: '#4A2E9E' }}>Cerrar</button>
      </div>

      {!estructura && (
        <>
          <p className="text-xs" style={{ color: '#4A2E9E' }}>
            Sube tu documento de Word con la Unidad o Experiencia de Aprendizaje ya redactada — la IA va a proponer la Unidad y sus Actividades para que las revises antes de crearlas.
          </p>
          <label className="inline-block text-xs font-semibold px-4 py-2.5 rounded-lg cursor-pointer transition hover:opacity-90" style={{ backgroundColor: 'white', color: '#4A2E9E', border: '1px solid #D6D0FA' }}>
            {extrayendo ? 'Leyendo y analizando...' : '📎 Subir documento (.docx)'}
            <input
              type="file"
              accept=".docx"
              className="hidden"
              onChange={function (e) { if (e.target.files[0]) manejarArchivo(e.target.files[0]) }}
              disabled={extrayendo}
            />
          </label>
          {error && <p className="text-xs" style={{ color: '#B91C1C' }}>{error}</p>}
        </>
      )}

      {estructura && (
        <div className="space-y-4">
          {cursos.length > 1 && (
            <div className="bg-white rounded-lg p-3" style={{ border: '1px solid #D6D0FA' }}>
              <label className="block text-xs font-bold mb-1" style={{ color: NAVY_DARK }}>¿Para cuál asignatura son estas actividades?</label>
              <select
                value={cursoId}
                onChange={function (e) { setCursoId(e.target.value) }}
                className="w-full rounded-lg px-2 py-1.5 text-xs outline-none"
                style={inputStyle}
              >
                <option value="">-- Elige --</option>
                {cursos.map(function (c) { return <option key={c.id} value={c.id}>{c.nombre}</option> })}
              </select>
            </div>
          )}

          <div className="bg-white rounded-lg p-3" style={{ border: '1px solid #D6D0FA' }}>
            <p className="text-xs font-bold mb-2" style={{ color: NAVY_DARK }}>Unidad detectada</p>
            <p className="text-xs text-slate-500">
              N.° {estructura.unidad?.numero ?? '(no detectado, revisar)'} — {estructura.unidad?.titulo || '(sin título detectado)'}
            </p>
            <p className="text-xs text-slate-400">
              {estructura.unidad?.fechaInicio || '(sin fecha inicio)'} → {estructura.unidad?.fechaFin || '(sin fecha fin)'}
            </p>
          </div>

          <div>
            <p className="text-xs font-bold mb-2" style={{ color: NAVY_DARK }}>
              Actividades detectadas ({estructura.actividades.length}) — elige la Competencia de cada una
            </p>
            <div className="space-y-2">
              {estructura.actividades.map(function (act, i) {
                return (
                  <div key={i} className="bg-white rounded-lg p-3" style={{ border: '1px solid #D6D0FA' }}>
                    <p className="text-xs font-semibold" style={{ color: NAVY_DARK }}>Actividad {i + 1}: {act.titulo}</p>
                    {act.tarea && (
                      <p className="text-[11px] mt-1" style={{ color: '#B45309' }}>
                        📌 El documento sugiere una tarea aquí: "{act.tarea.titulo}"{act.tarea.fechaEntrega ? ` (entrega: ${act.tarea.fechaEntrega})` : ''} — la crearás después de asignar Capacidades.
                      </p>
                    )}
                    <select
                      value={competenciaPorActividad[i] || ''}
                      onChange={function (e) { setCompetenciaPorActividad(function (prev) { return { ...prev, [i]: e.target.value } }) }}
                      className="w-full rounded-lg px-2 py-1.5 text-xs outline-none mt-2"
                      style={inputStyle}
                    >
                      <option value="">-- Elige la Competencia --</option>
                      {competencias.map(function (c) { return <option key={c.id} value={c.id}>{c.codigo} — {c.nombre}</option> })}
                    </select>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={confirmarCreacion}
              disabled={creando}
              className="text-xs font-semibold px-4 py-2 rounded-lg text-white transition hover:opacity-90 disabled:opacity-50"
              style={{ backgroundColor: GREEN }}
            >
              {creando ? 'Creando...' : '✓ Confirmar y crear'}
            </button>
            <button
              onClick={function () { setEstructura(null); setArchivo(null) }}
              className="text-xs font-semibold px-4 py-2 rounded-lg transition"
              style={{ backgroundColor: 'white', color: NAVY_DARK, border: '1px solid #D6DCE5' }}
            >
              Empezar de nuevo
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
