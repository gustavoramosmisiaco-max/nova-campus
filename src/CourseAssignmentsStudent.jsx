import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import { useAuth } from './AuthContext'
import { getLetterGrade, getLetterColor } from './gradeUtils'
import PreviewModal from './PreviewModal'

const NAVY_DARK = '#0F172A'
const NAVY = '#2563EB'
const GREEN = '#22C55E'

const inputStyle = { backgroundColor: 'white', border: '1px solid #D6DCE5', color: NAVY_DARK }

export default function CourseAssignmentsStudent({ courseId, actividadId }) {
  const { session, profile } = useAuth()
  const [assignments, setAssignments] = useState([])
  const [submissionsMap, setSubmissionsMap] = useState({})
  const [justificacionesMap, setJustificacionesMap] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [uploadingId, setUploadingId] = useState(null)
  const [preview, setPreview] = useState(null)
  const [justificandoId, setJustificandoId] = useState(null)
  const [justMensaje, setJustMensaje] = useState('')
  const [justFile, setJustFile] = useState(null)
  const [enviandoJust, setEnviandoJust] = useState(false)

  useEffect(function () {
    loadAssignments()
  }, [courseId, actividadId])

  async function loadAssignments() {
    setLoading(true)
    setError('')

    let query = supabase
      .from('assignments')
      .select('*, actividad:actividades(unidad:unidades(finalizada, tipo, numero))')
      .order('fecha_entrega', { ascending: false })
    query = actividadId ? query.eq('actividad_id', actividadId) : query.eq('course_id', courseId)

    const result = await query
    if (result.error) {
      setError(result.error.message)
      setLoading(false)
      return
    }

    setAssignments(result.data)

    const ids = result.data.map(function (a) { return a.id })
    if (ids.length > 0) {
      const subsResult = await supabase
        .from('submissions')
        .select('*')
        .eq('student_id', session.user.id)
        .in('assignment_id', ids)

      if (!subsResult.error) {
        const map = {}
        subsResult.data.forEach(function (s) {
          map[s.assignment_id] = s
        })

        // Traer las imágenes (varias por entrega) de todas las entregas encontradas
        const submissionIds = subsResult.data.map(function (s) { return s.id })
        if (submissionIds.length > 0) {
          const filesResult = await supabase
            .from('submission_files')
            .select('submission_id, file_url, orden')
            .in('submission_id', submissionIds)
            .order('orden')
          if (!filesResult.error) {
            filesResult.data.forEach(function (f) {
              const asgId = Object.keys(map).find(function (k) { return map[k].id === f.submission_id })
              if (asgId) {
                if (!map[asgId].files) map[asgId].files = []
                map[asgId].files.push(f.file_url)
              }
            })
          }
        }

        setSubmissionsMap(map)
      }

      const justResult = await supabase
        .from('justificaciones')
        .select('*')
        .eq('student_id', session.user.id)
        .in('assignment_id', ids)

      if (!justResult.error) {
        const jmap = {}
        justResult.data.forEach(function (j) {
          jmap[j.assignment_id] = j
        })
        setJustificacionesMap(jmap)
      }
    }

    setLoading(false)
  }

  function getFileExtension(path) {
    const clean = path.split('?')[0]
    const parts = clean.split('.')
    const last = parts[parts.length - 1]
    return last ? last.toLowerCase() : ''
  }

  async function handleUpload(assignment, filesList) {
    if (!filesList || filesList.length === 0) return
    const files = Array.from(filesList)
    setUploadingId(assignment.id)
    setError('')

    // 1. Crear o reutilizar la fila de entrega (submissions), sin depender de un solo archivo
    const existing = submissionsMap[assignment.id]
    let submissionId = existing?.id
    let dbResult

    if (existing) {
      dbResult = await supabase
        .from('submissions')
        .update({ submitted_at: new Date().toISOString() })
        .eq('id', existing.id)
    } else {
      dbResult = await supabase.from('submissions').insert({
        assignment_id: assignment.id,
        student_id: session.user.id,
        submitted_at: new Date().toISOString(),
      }).select('id').single()
      if (!dbResult.error) submissionId = dbResult.data.id
    }

    if (dbResult.error) {
      setError('Error al registrar la entrega: ' + dbResult.error.message)
      setUploadingId(null)
      return
    }

    // 2. Si ya tenía fotos de antes, las quitamos — cada vez que suben, reemplaza el set completo
    if (existing) {
      await supabase.from('submission_files').delete().eq('submission_id', submissionId)
    }

    // 3. Subir cada foto y guardar su fila
    const rutasSubidas = []
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_')
      const path = `${assignment.course_id}/${session.user.id}/${assignment.id}_${Date.now()}_${i}_${safeName}`
      const uploadResult = await supabase.storage.from('entregas').upload(path, file, { upsert: true })
      if (uploadResult.error) {
        setError(`Error al subir la imagen ${i + 1}: ` + uploadResult.error.message)
        setUploadingId(null)
        return
      }
      rutasSubidas.push(path)
    }

    const filesPayload = rutasSubidas.map(function (path, i) {
      return { submission_id: submissionId, file_url: path, orden: i }
    })
    const filesInsertResult = await supabase.from('submission_files').insert(filesPayload)
    if (filesInsertResult.error) {
      setError('Las fotos se subieron, pero no se pudieron registrar: ' + filesInsertResult.error.message)
      setUploadingId(null)
      return
    }

    if (assignment.tipo_entrega === 'grupal') {
      await cascadearEntregaAGrupo(assignment, rutasSubidas)
    }
    if (existing) {
      const courseResult = await supabase.from('courses').select('docente_id').eq('id', assignment.course_id).single()
      if (courseResult.data?.docente_id) {
        await supabase.from('notificaciones').insert({
          user_id: courseResult.data.docente_id,
          tipo: 'tarea_nueva',
          titulo: 'Un estudiante volvió a subir una tarea',
          mensaje: `${profile?.full_name || 'Un estudiante'} resubió: ${assignment.titulo}. Revisa y vuelve a calificarla.`,
        })
      }
    }
    loadAssignments()
    setUploadingId(null)
  }

  async function cascadearEntregaAGrupo(assignment, rutasSubidas) {
    const miembroResult = await supabase
      .from('grupos_trabajo_miembros')
      .select('grupo_id, grupo:grupos_trabajo!inner(course_id)')
      .eq('student_id', session.user.id)
      .eq('grupo.course_id', assignment.course_id)
    const grupoIds = (miembroResult.data || []).map(function (m) { return m.grupo_id })
    if (grupoIds.length === 0) return

    const otrosMiembrosResult = await supabase
      .from('grupos_trabajo_miembros')
      .select('student_id')
      .in('grupo_id', grupoIds)
      .neq('student_id', session.user.id)
    const idsCompaneros = [...new Set((otrosMiembrosResult.data || []).map(function (m) { return m.student_id }))]
    if (idsCompaneros.length === 0) return

    const existentesResult = await supabase
      .from('submissions')
      .select('student_id')
      .eq('assignment_id', assignment.id)
      .in('student_id', idsCompaneros)
    const yaTienen = new Set((existentesResult.data || []).map(function (s) { return s.student_id }))
    const faltantes = idsCompaneros.filter(function (id) { return !yaTienen.has(id) })

    if (faltantes.length > 0) {
      const nuevas = faltantes.map(function (studentId) {
        return { assignment_id: assignment.id, student_id: studentId, submitted_at: new Date().toISOString() }
      })
      const cascadaResult = await supabase.from('submissions').insert(nuevas).select('id, student_id')
      if (cascadaResult.error) {
        setError('Tu entrega se guardó, pero no se pudo copiar a tus compañeros de grupo: ' + cascadaResult.error.message)
        return
      }
      const filesParaCompaneros = cascadaResult.data.flatMap(function (s) {
        return rutasSubidas.map(function (path, i) { return { submission_id: s.id, file_url: path, orden: i } })
      })
      if (filesParaCompaneros.length > 0) {
        await supabase.from('submission_files').insert(filesParaCompaneros)
      }
    }
  }

  async function handlePreview(path) {
    const result = await supabase.storage.from('entregas').createSignedUrl(path, 300)
    if (result.error) {
      alert('Error al abrir el archivo: ' + result.error.message)
      return
    }
    const ext = getFileExtension(path)
    const parts = path.split('/')
    const name = parts[parts.length - 1]
    setPreview({ url: result.data.signedUrl, type: ext, name: name })
  }

  function abrirJustificacion(assignmentId) {
    setJustificandoId(assignmentId)
    setJustMensaje('')
    setJustFile(null)
  }

  async function enviarJustificacion(assignment) {
    if (!justMensaje.trim()) {
      alert('Escribe un mensaje explicando tu justificación.')
      return
    }
    setEnviandoJust(true)

    let filePath = null
    if (justFile) {
      const safeName = justFile.name.replace(/[^a-zA-Z0-9.\-_]/g, '_')
      filePath = `${assignment.course_id}/${session.user.id}/justificacion_${assignment.id}_${Date.now()}_${safeName}`
      const uploadResult = await supabase.storage.from('entregas').upload(filePath, justFile, { upsert: true })
      if (uploadResult.error) {
        alert('Error al subir la evidencia: ' + uploadResult.error.message)
        setEnviandoJust(false)
        return
      }
    }

    const result = await supabase.from('justificaciones').upsert(
      {
        assignment_id: assignment.id,
        student_id: session.user.id,
        mensaje: justMensaje,
        file_url: filePath,
        estado: 'pendiente',
        reviewed_by: null,
        reviewed_at: null,
      },
      { onConflict: 'assignment_id,student_id' }
    )

    if (result.error) {
      alert('Error al enviar la justificación: ' + result.error.message)
    } else {
      const courseResult = await supabase.from('courses').select('docente_id').eq('id', assignment.course_id).single()
      if (courseResult.data?.docente_id) {
        await supabase.from('notificaciones').insert({
          user_id: courseResult.data.docente_id,
          tipo: 'justificacion',
          titulo: 'Nueva justificación recibida',
          mensaje: `${profile?.full_name || 'Un estudiante'} justificó: ${assignment.titulo}`,
          referencia_id: assignment.id,
        })
      }
      setJustificandoId(null)
      loadAssignments()
    }
    setEnviandoJust(false)
  }

  if (loading) return <p className="text-slate-400 text-sm">Cargando tareas...</p>

  return (
    <div>
      <h3 className="text-lg font-bold mb-4" style={{ color: NAVY_DARK }}>Tareas</h3>

      {error && <p className="text-red-500 text-sm mb-3">{error}</p>}

      {assignments.length === 0 ? (
        <p className="text-slate-400 text-sm">Aún no hay tareas aquí.</p>
      ) : (
        <ul className="space-y-3">
          {assignments.map(function (a) {
            const submission = submissionsMap[a.id]
            const justificacion = justificacionesMap[a.id]
            const dueDate = new Date(a.fecha_entrega)
            const isPast = dueDate < new Date()
            const hasSubmission = Boolean(submission)
            const misFotos = submission?.files || []
            const hasRealSubmission = Boolean(submission) && (misFotos.length > 0 || submission.file_url != null)
            const isGraded = hasSubmission && submission.score != null
            const isUploading = uploadingId === a.id
            const justificacionAprobada = justificacion?.estado === 'aprobada'
            const habilitadoParaSubir = !isPast || justificacionAprobada
            const unidadFinalizada = a.actividad?.unidad?.finalizada || false

            return (
              <li
                key={a.id}
                className="rounded-xl p-4"
                style={{ backgroundColor: '#F4F6F9', border: '1px solid #E5E9F0' }}
              >
                <div className="flex justify-between items-start gap-4 flex-wrap">
                  <div>
                    <p className="text-sm font-semibold" style={{ color: NAVY_DARK }}>{a.titulo}</p>
                    {a.descripcion && (
                      <p className="text-sm text-slate-500 mt-1">{a.descripcion}</p>
                    )}
                    {a.instrumento_evaluacion && (
                      <p className="text-xs text-slate-500 mt-1">Instrumento: {a.instrumento_evaluacion}</p>
                    )}
                    {a.link_url && (
                      <a href={a.link_url} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold inline-block mt-1" style={{ color: NAVY }}>
                        📎 Ver material de apoyo (Drive)
                      </a>
                    )}
                    <p className="text-xs text-slate-500 mt-1">
                      Entrega: {dueDate.toLocaleString('es-PE')}
                      {isPast && !hasSubmission ? (
                        <span className="ml-2 font-semibold text-red-500">Vencida</span>
                      ) : null}
                    </p>
                  </div>

                  <div className="text-right">
                    {isGraded ? (
                      <p className={'text-sm font-bold ' + getLetterColor(submission.score)}>
                        {getLetterGrade(submission.score)}
                      </p>
                    ) : hasSubmission ? (
                      <span
                        className="text-xs font-semibold px-3 py-1 rounded-full"
                        style={{ backgroundColor: '#E7F3E4', color: '#16A34A' }}
                      >
                        Tarea enviada
                      </span>
                    ) : (
                      <span
                        className="text-xs font-semibold px-3 py-1 rounded-full"
                        style={{ backgroundColor: '#FDECEC', color: '#B91C1C' }}
                      >
                        Sin entregar
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3 mt-3 flex-wrap">
                  {hasRealSubmission && misFotos.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {misFotos.map(function (path, i) {
                        const esPdf = path.toLowerCase().endsWith('.pdf')
                        return (
                          <button
                            key={path}
                            onClick={function () { handlePreview(path) }}
                            className="text-xs font-semibold px-3 py-1.5 rounded-lg transition"
                            style={{ backgroundColor: 'white', color: NAVY, border: '1px solid #D6DCE5' }}
                          >
                            {esPdf ? '📄' : '📷'} Archivo {i + 1}
                          </button>
                        )
                      })}
                    </div>
                  )}
                  {hasRealSubmission && misFotos.length === 0 && submission.file_url && (
                    <button
                      onClick={function () { handlePreview(submission.file_url) }}
                      className="text-xs font-semibold px-3 py-1.5 rounded-lg transition"
                      style={{ backgroundColor: 'white', color: NAVY, border: '1px solid #D6DCE5' }}
                    >
                      Ver mi archivo
                    </button>
                  )}

                  {(!isGraded || justificacionAprobada) && habilitadoParaSubir && (
                    <label
                      className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white cursor-pointer transition hover:opacity-90"
                      style={{ backgroundColor: isUploading ? '#94A3B8' : GREEN }}
                    >
                      {isUploading ? 'Subiendo...' : hasSubmission ? 'Reemplazar entrega' : 'Subir tarea (fotos o PDF)'}
                      <input
                        type="file"
                        accept="image/*,application/pdf"
                        multiple
                        className="hidden"
                        disabled={isUploading}
                        onChange={function (e) { handleUpload(a, e.target.files) }}
                      />
                    </label>
                  )}
                </div>
                {(!isGraded || justificacionAprobada) && habilitadoParaSubir && (
                  <p className="text-[11px] text-slate-400 mt-1.5">Puedes elegir varias fotos a la vez, tomar fotos con tu cámara, o subir un PDF.</p>
                )}

                {isPast && !hasRealSubmission && !justificacionAprobada && (
                  <div className="mt-3 rounded-lg p-3" style={{ backgroundColor: '#FDECEC', border: '1px solid #F5C6C6' }}>
                    <p className="text-xs" style={{ color: '#B91C1C' }}>
                      El plazo de entrega venció el {dueDate.toLocaleDateString('es-PE')}. Ya no puedes subir tu tarea directamente{unidadFinalizada ? '.' : ', pero puedes enviar una justificación a tu docente.'}
                    </p>

                    {unidadFinalizada ? (
                      <p className="text-xs mt-2 font-semibold" style={{ color: '#B91C1C' }}>
                        {a.actividad?.unidad?.tipo} {a.actividad?.unidad?.numero} ya fue cerrada por tu docente — no se pueden presentar justificaciones para esta unidad.
                      </p>
                    ) : (
                      <>
                        {justificacion?.estado === 'pendiente' ? (
                          <p className="text-xs mt-2 font-semibold" style={{ color: '#B45309' }}>
                            Justificación enviada, en espera de revisión del docente.
                          </p>
                        ) : justificacion?.estado === 'rechazada' ? (
                          <div className="mt-2">
                            <p className="text-xs font-semibold" style={{ color: '#B91C1C' }}>
                              Tu justificación anterior fue rechazada. Puedes enviar una nueva.
                            </p>
                          </div>
                        ) : null}

                        {(!justificacion || justificacion.estado === 'rechazada') && justificandoId !== a.id && (
                          <button
                            onClick={function () { abrirJustificacion(a.id) }}
                            className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white transition hover:opacity-90 mt-2"
                            style={{ backgroundColor: '#B45309' }}
                          >
                            Presentar justificación
                          </button>
                        )}
                      </>
                    )}

                    {justificandoId === a.id && (
                      <div className="mt-3 space-y-2">
                        <textarea
                          value={justMensaje}
                          onChange={function (e) { setJustMensaje(e.target.value) }}
                          placeholder="Explica por qué no pudiste entregar a tiempo..."
                          rows={3}
                          className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                          style={inputStyle}
                        />
                        <div className="flex items-center gap-3 flex-wrap">
                          <label
                            className="text-xs font-semibold px-3 py-1.5 rounded-lg cursor-pointer transition hover:opacity-90"
                            style={{ backgroundColor: 'white', color: NAVY, border: '1px solid #D6DCE5' }}
                          >
                            Adjuntar evidencia
                            <input
                              type="file"
                              className="hidden"
                              onChange={function (e) { setJustFile(e.target.files[0]) }}
                            />
                          </label>
                          <span className="text-xs text-slate-500">
                            {justFile ? justFile.name : 'Ningún archivo (opcional)'}
                          </span>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={function () { setJustificandoId(null) }}
                            className="text-xs font-semibold px-3 py-1.5 rounded-lg transition"
                            style={{ backgroundColor: 'white', color: NAVY_DARK, border: '1px solid #D6DCE5' }}
                          >
                            Cancelar
                          </button>
                          <button
                            onClick={function () { enviarJustificacion(a) }}
                            disabled={enviandoJust}
                            className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white transition hover:opacity-90 disabled:opacity-50"
                            style={{ backgroundColor: GREEN }}
                          >
                            {enviandoJust ? 'Enviando...' : 'Enviar justificación'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {justificacionAprobada && !hasSubmission && (
                  <p className="text-xs mt-2 font-semibold" style={{ color: '#16A34A' }}>
                    Tu docente aprobó la justificación. Ya puedes subir tu tarea.
                  </p>
                )}
              </li>
            )
          })}
        </ul>
      )}

      <PreviewModal preview={preview} onClose={function () { setPreview(null) }} />
    </div>
  )
}
