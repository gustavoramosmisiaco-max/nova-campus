import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import { useAuth } from './AuthContext'
import PreviewModal from './PreviewModal'

const NAVY_DARK = '#0F2A4A'
const NAVY = '#1d5c8f'
const GREEN = '#5DAA47'

const inputStyle = { backgroundColor: 'white', border: '1px solid #D6DCE5', color: NAVY_DARK }

export default function TareasPendientes() {
  const { session, profile } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [pendientes, setPendientes] = useState([])
  const [vencidas, setVencidas] = useState([])
  const [enRevision, setEnRevision] = useState([])
  const [habilitadas, setHabilitadas] = useState([])
  const [uploadingId, setUploadingId] = useState(null)
  const [preview, setPreview] = useState(null)
  const [justificandoId, setJustificandoId] = useState(null)
  const [justMensaje, setJustMensaje] = useState('')
  const [justFile, setJustFile] = useState(null)
  const [enviandoJust, setEnviandoJust] = useState(false)

  useEffect(function () {
    cargarTodo()
  }, [])

  async function cargarTodo() {
    setLoading(true)
    setError('')

    const enrollResult = await supabase
      .from('enrollments')
      .select('course:courses!inner(id, nombre, grado, grupo, asignaturas!inner(activo))')
      .eq('student_id', session.user.id)
      .eq('status', 'activo')
      .eq('course.asignaturas.activo', true)

    if (enrollResult.error) {
      setError(enrollResult.error.message)
      setLoading(false)
      return
    }

    const courseIds = enrollResult.data.map(function (e) { return e.course.id })
    const courseMap = {}
    enrollResult.data.forEach(function (e) { courseMap[e.course.id] = e.course })

    if (courseIds.length === 0) {
      setPendientes([])
      setVencidas([])
      setEnRevision([])
      setHabilitadas([])
      setLoading(false)
      return
    }

    const assignResult = await supabase
      .from('assignments')
      .select('id, titulo, tema, fecha_entrega, course_id, actividad_id, tipo_entrega, actividad:actividades(nombre, numero_actividad, unidad:unidades(tipo, numero, finalizada))')
      .in('course_id', courseIds)
      .order('fecha_entrega', { ascending: true })

    if (assignResult.error) {
      setError(assignResult.error.message)
      setLoading(false)
      return
    }

    const assignmentIds = assignResult.data.map(function (a) { return a.id })

    let submissionsMap = {}
    let justMap = {}
    if (assignmentIds.length > 0) {
      const subsResult = await supabase
        .from('submissions')
        .select('id, assignment_id, file_url')
        .eq('student_id', session.user.id)
        .in('assignment_id', assignmentIds)
      if (!subsResult.error) {
        subsResult.data.forEach(function (s) { submissionsMap[s.assignment_id] = s })
      }

      const justResult = await supabase
        .from('justificaciones')
        .select('*')
        .eq('student_id', session.user.id)
        .in('assignment_id', assignmentIds)
      if (!justResult.error) {
        justResult.data.forEach(function (j) { justMap[j.assignment_id] = j })
      }
    }

    const now = new Date()
    const pend = []
    const venc = []
    const rev = []
    const hab = []

    assignResult.data.forEach(function (a) {
      const submission = submissionsMap[a.id]
      if (submission && submission.file_url != null) return // ya lo entregó de verdad, no aparece aquí

      const isPastDue = new Date(a.fecha_entrega) < now
      const justificacion = justMap[a.id]
      const course = courseMap[a.course_id]
      const item = { ...a, course: course, submission: submission || null }

      if (!isPastDue) {
        pend.push(item)
        return
      }

      if (justificacion?.estado === 'aprobada') {
        hab.push({ ...item, justificacion })
      } else if (justificacion?.estado === 'pendiente') {
        rev.push({ ...item, justificacion })
      } else {
        venc.push({ ...item, justificacion })
      }
    })

    setPendientes(pend)
    setVencidas(venc)
    setEnRevision(rev)
    setHabilitadas(hab)
    setLoading(false)
  }

  async function handleUpload(assignment, file) {
    if (!file) return
    setUploadingId(assignment.id)
    setError('')

    const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_')
    const path = `${assignment.course_id}/${session.user.id}/${assignment.id}_${Date.now()}_${safeName}`

    const uploadResult = await supabase.storage.from('entregas').upload(path, file, { upsert: true })
    if (uploadResult.error) {
      setError('Error al subir el archivo: ' + uploadResult.error.message)
      setUploadingId(null)
      return
    }

    const existing = assignment.submission || null
    let dbResult
    if (existing) {
      dbResult = await supabase
        .from('submissions')
        .update({ file_url: path, submitted_at: new Date().toISOString() })
        .eq('id', existing.id)
    } else {
      dbResult = await supabase.from('submissions').insert({
        assignment_id: assignment.id,
        student_id: session.user.id,
        file_url: path,
        submitted_at: new Date().toISOString(),
      })
    }

    if (dbResult.error) {
      setError('Error al registrar la entrega: ' + dbResult.error.message)
    } else {
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
      if (assignment.tipo_entrega === 'grupal') {
        await cascadearEntregaAGrupo(assignment, path)
      }
      cargarTodo()
    }
    setUploadingId(null)
  }

  async function cascadearEntregaAGrupo(assignment, path) {
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
        return { assignment_id: assignment.id, student_id: studentId, file_url: path, submitted_at: new Date().toISOString() }
      })
      const cascadaResult = await supabase.from('submissions').insert(nuevas)
      if (cascadaResult.error) {
        setError('Tu entrega se guardó, pero no se pudo copiar a tus compañeros de grupo: ' + cascadaResult.error.message)
      }
    }
  }

  async function handlePreview(path) {
    const result = await supabase.storage.from('entregas').createSignedUrl(path, 300)
    if (result.error) {
      alert('Error al abrir el archivo: ' + result.error.message)
      return
    }
    const parts = path.split('/')
    const name = parts[parts.length - 1]
    const ext = name.split('.').pop().toLowerCase()
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
      setJustificandoId(null)
      cargarTodo()
    }
    setEnviandoJust(false)
  }

  function ubicacionTexto(item) {
    const act = item.actividad
    const unidad = act?.unidad
    const partes = []
    if (item.course?.nombre) partes.push(item.course.nombre)
    if (unidad) partes.push(`${unidad.tipo} ${unidad.numero}`)
    if (act) partes.push(`Actividad ${act.numero_actividad} · ${act.nombre}`)
    return partes.join(' — ')
  }

  function TareaCard({ item, tipo }) {
    const isUploading = uploadingId === item.id
    return (
      <li className="rounded-xl p-4" style={{ backgroundColor: '#F4F6F9', border: '1px solid #E5E9F0' }}>
        <p className="text-xs text-slate-400 mb-1">{ubicacionTexto(item)}</p>
        <p className="text-sm font-semibold" style={{ color: NAVY_DARK }}>{item.titulo}</p>
        <p className="text-xs text-slate-500 mt-1">
          Entrega: {new Date(item.fecha_entrega).toLocaleString('es-PE')}
        </p>

        {(tipo === 'pendiente' || tipo === 'habilitada') && (
          <label
            className="mt-3 inline-block text-xs font-semibold px-3 py-1.5 rounded-lg text-white cursor-pointer transition hover:opacity-90"
            style={{ backgroundColor: isUploading ? '#94A3B8' : GREEN }}
          >
            {isUploading ? 'Subiendo...' : 'Subir entrega'}
            <input
              type="file"
              className="hidden"
              disabled={isUploading}
              onChange={function (e) { handleUpload(item, e.target.files[0]) }}
            />
          </label>
        )}

        {tipo === 'vencida' && (
          <div className="mt-3 rounded-lg p-3" style={{ backgroundColor: '#FDECEC', border: '1px solid #F5C6C6' }}>
            <p className="text-xs" style={{ color: '#B91C1C' }}>
              El plazo venció. Ya no puedes subir tu tarea directamente{item.actividad?.unidad?.finalizada ? '.' : ', pero puedes enviar una justificación.'}
            </p>
            {item.actividad?.unidad?.finalizada ? (
              <p className="text-xs mt-2 font-semibold" style={{ color: '#B91C1C' }}>
                {item.actividad.unidad.tipo} {item.actividad.unidad.numero} ya fue cerrada por tu docente — no se pueden presentar justificaciones.
              </p>
            ) : (
              <>
                {item.justificacion?.estado === 'rechazada' && (
                  <p className="text-xs mt-1 font-semibold" style={{ color: '#B91C1C' }}>
                    Tu justificación anterior fue rechazada. Puedes enviar una nueva.
                  </p>
                )}
                {justificandoId !== item.id ? (
                  <button
                    onClick={function () { abrirJustificacion(item.id) }}
                    className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white transition hover:opacity-90 mt-2"
                    style={{ backgroundColor: '#B45309' }}
                  >
                    Presentar justificación
                  </button>
                ) : (
              <div className="mt-2 space-y-2">
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
                    <input type="file" className="hidden" onChange={function (e) { setJustFile(e.target.files[0]) }} />
                  </label>
                  <span className="text-xs text-slate-500">{justFile ? justFile.name : 'Ningún archivo (opcional)'}</span>
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
                    onClick={function () { enviarJustificacion(item) }}
                    disabled={enviandoJust}
                    className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white transition hover:opacity-90 disabled:opacity-50"
                    style={{ backgroundColor: GREEN }}
                  >
                    {enviandoJust ? 'Enviando...' : 'Enviar justificación'}
                  </button>
                </div>
              </div>
            )}
              </>
            )}
          </div>
        )}

        {tipo === 'revision' && (
          <p className="text-xs mt-2 font-semibold" style={{ color: '#B45309' }}>
            Justificación enviada, en espera de revisión del docente.
          </p>
        )}

        {tipo === 'habilitada' && (
          <p className="text-xs mt-2 font-semibold" style={{ color: '#2f7a1f' }}>
            Tu docente aprobó tu justificación. Ya puedes subir tu tarea.
          </p>
        )}
      </li>
    )
  }

  if (loading) return <p className="text-slate-400 text-sm">Cargando tus tareas...</p>
  if (error) return <p className="text-red-500 text-sm">Error: {error}</p>

  const totalPendientesYVencidas = pendientes.length + vencidas.length

  return (
    <div>
      <h2 className="text-2xl font-bold mb-2" style={{ color: NAVY_DARK }}>Tareas Pendientes</h2>
      <p className="text-sm text-slate-400 mb-6">
        Aquí ves todas tus tareas de todos tus cursos que aún no has entregado, sin entrar carpeta por carpeta.
        Las que ya subiste no aparecen aquí.
      </p>

      {totalPendientesYVencidas === 0 && habilitadas.length === 0 && enRevision.length === 0 && (
        <div className="bg-white rounded-2xl p-10 text-center" style={{ border: '1px dashed #D6DCE5' }}>
          <p className="text-slate-400 text-sm">🎉 Estás al día, no tienes tareas pendientes.</p>
        </div>
      )}

      {vencidas.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-bold mb-3" style={{ color: '#B91C1C' }}>Vencidas sin entregar ({vencidas.length})</h3>
          <ul className="space-y-3">
            {vencidas.map(function (item) { return <TareaCard key={item.id} item={item} tipo="vencida" /> })}
          </ul>
        </div>
      )}

      {habilitadas.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-bold mb-3" style={{ color: '#2f7a1f' }}>Habilitadas para entregar ({habilitadas.length})</h3>
          <ul className="space-y-3">
            {habilitadas.map(function (item) { return <TareaCard key={item.id} item={item} tipo="habilitada" /> })}
          </ul>
        </div>
      )}

      {enRevision.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-bold mb-3" style={{ color: '#B45309' }}>Justificación en revisión ({enRevision.length})</h3>
          <ul className="space-y-3">
            {enRevision.map(function (item) { return <TareaCard key={item.id} item={item} tipo="revision" /> })}
          </ul>
        </div>
      )}

      {pendientes.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-bold mb-3" style={{ color: NAVY_DARK }}>Pendientes, aún no vencen ({pendientes.length})</h3>
          <ul className="space-y-3">
            {pendientes.map(function (item) { return <TareaCard key={item.id} item={item} tipo="pendiente" /> })}
          </ul>
        </div>
      )}

      <PreviewModal preview={preview} onClose={function () { setPreview(null) }} />
    </div>
  )
}
