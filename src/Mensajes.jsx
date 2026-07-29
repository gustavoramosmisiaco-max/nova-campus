import { useEffect, useState, useRef } from 'react'
import { supabase } from './supabaseClient'
import { useAuth } from './AuthContext'
import { compararPorApellido } from './gradeUtils'
import PreviewModal from './PreviewModal'
import { estaEnLinea } from './PresenceHeartbeat'
import { usePresence } from './PresenceContext'

const NAVY_DARK = '#0F2A4A'
const NAVY = '#1d5c8f'
const GREEN = '#5DAA47'

const inputStyle = { backgroundColor: 'white', border: '1px solid #D6DCE5', color: NAVY_DARK }

function tiempoRelativo(fecha) {
  const ahora = new Date()
  const then = new Date(fecha)
  const segundos = Math.floor((ahora - then) / 1000)
  if (segundos < 60) return 'ahora'
  const minutos = Math.floor(segundos / 60)
  if (minutos < 60) return `${minutos} min`
  const horas = Math.floor(minutos / 60)
  if (horas < 24) return `${horas} h`
  const dias = Math.floor(horas / 24)
  if (dias === 1) return 'ayer'
  return `${dias} días`
}

export default function Mensajes() {
  const { session, profile } = useAuth()
  const { isOnline } = usePresence()
  const esDocente = profile?.role === 'docente'

  const [loading, setLoading] = useState(true)
  const [contactos, setContactos] = useState([]) // { personaId, personaNombre, courseId, courseNombre }
  const [conversaciones, setConversaciones] = useState({}) // key personaId__courseId -> { ultimoMensaje, noLeidos }
  const [seleccionado, setSeleccionado] = useState(null) // { personaId, personaNombre, courseId, courseNombre }
  const [mostrarNueva, setMostrarNueva] = useState(false)

  useEffect(function () {
    cargarContactosYConversaciones()
  }, [])

  async function cargarContactosYConversaciones() {
    setLoading(true)

    let listaContactos = []
    if (esDocente) {
      const coursesResult = await supabase
        .from('courses')
        .select('id, nombre, grado, grupo, enrollments(student:profiles(id, full_name))')
        .eq('docente_id', session.user.id)
      if (!coursesResult.error) {
        coursesResult.data.forEach(function (c) {
          c.enrollments.forEach(function (e) {
            if (!e.student) return
            listaContactos.push({
              personaId: e.student.id,
              personaNombre: e.student.full_name,
              courseId: c.id,
              courseNombre: `${c.nombre} — ${c.grado}° "${c.grupo}"`,
            })
          })
        })
      }
    } else {
      const enrollResult = await supabase
        .from('enrollments')
        .select('course:courses(id, nombre, grado, grupo, docente:profiles(id, full_name))')
        .eq('student_id', session.user.id)
        .eq('status', 'activo')
      if (!enrollResult.error) {
        enrollResult.data.forEach(function (e) {
          if (!e.course?.docente) return
          listaContactos.push({
            personaId: e.course.docente.id,
            personaNombre: e.course.docente.full_name,
            courseId: e.course.id,
            courseNombre: `${e.course.nombre} — ${e.course.grado}° "${e.course.grupo}"`,
          })
        })
      }
    }
    listaContactos.sort(function (a, b) { return compararPorApellido(a.personaNombre, b.personaNombre) })
    setContactos(listaContactos)

    const mensajesResult = await supabase
      .from('mensajes')
      .select('*')
      .or(`remitente_id.eq.${session.user.id},destinatario_id.eq.${session.user.id}`)
      .order('created_at', { ascending: true })

    const convMap = {}
    if (!mensajesResult.error) {
      mensajesResult.data.forEach(function (m) {
        const otraPersona = m.remitente_id === session.user.id ? m.destinatario_id : m.remitente_id
        const key = `${otraPersona}__${m.course_id}`
        if (!convMap[key]) convMap[key] = { ultimoMensaje: m, noLeidos: 0 }
        convMap[key].ultimoMensaje = m
        if (m.destinatario_id === session.user.id && !m.leido) convMap[key].noLeidos++
      })
    }
    setConversaciones(convMap)
    setLoading(false)
  }

  if (loading) return <p className="text-slate-400 text-sm">Cargando mensajes...</p>

  if (seleccionado) {
    return (
      <HiloConversacion
        contacto={seleccionado}
        onBack={function () { setSeleccionado(null); cargarContactosYConversaciones() }}
      />
    )
  }

  const conListaKeys = Object.keys(conversaciones).sort(function (a, b) {
    return new Date(conversaciones[b].ultimoMensaje.created_at) - new Date(conversaciones[a].ultimoMensaje.created_at)
  })

  return (
    <div>
      <div className="flex justify-between items-center mb-1">
        <h2 className="text-2xl font-bold" style={{ color: NAVY_DARK }}>Mensajes</h2>
        <button
          onClick={function () { setMostrarNueva(!mostrarNueva) }}
          className="text-xs font-semibold px-4 py-2 rounded-lg text-white transition hover:opacity-90"
          style={{ backgroundColor: GREEN }}
        >
          {mostrarNueva ? 'Cancelar' : '+ Nuevo mensaje'}
        </button>
      </div>
      <p className="text-sm text-slate-400 mb-6">
        {esDocente ? 'Consultas de tus estudiantes sobre tareas o el área.' : 'Escribe a tu docente sobre una tarea o el área.'}
      </p>

      {mostrarNueva && (
        <div className="bg-white rounded-2xl p-4 mb-6" style={{ border: '1px solid #E5E9F0' }}>
          <p className="text-sm font-bold mb-3" style={{ color: NAVY_DARK }}>
            {esDocente ? 'Elige un estudiante' : 'Elige un docente'}
          </p>
          {contactos.length === 0 ? (
            <p className="text-xs text-slate-400">No hay contactos disponibles todavía.</p>
          ) : (
            <ul className="space-y-2 max-h-72 overflow-y-auto">
              {contactos.map(function (c) {
                return (
                  <li key={c.personaId + c.courseId}>
                    <button
                      onClick={function () { setSeleccionado(c); setMostrarNueva(false) }}
                      className="w-full text-left rounded-lg px-3 py-2 transition hover:opacity-80"
                      style={{ backgroundColor: '#F4F6F9' }}
                    >
                      <p className="text-sm font-semibold flex items-center gap-1.5" style={{ color: NAVY_DARK }}>
                        {c.personaNombre}
                        {isOnline(c.personaId) && <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: '#5DAA47' }} title="En línea" />}
                      </p>
                      <p className="text-xs text-slate-400">{c.courseNombre}{isOnline(c.personaId) ? ' · En línea' : ''}</p>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}

      {conListaKeys.length === 0 ? (
        <p className="text-slate-400 text-sm">Aún no tienes conversaciones.</p>
      ) : (
        <ul className="space-y-2">
          {conListaKeys.map(function (key) {
            const [personaId, courseId] = key.split('__')
            const conv = conversaciones[key]
            const contacto = contactos.find(function (c) { return c.personaId === personaId && c.courseId === courseId })
            const nombre = contacto?.personaNombre || 'Usuario'
            const courseNombre = contacto?.courseNombre || ''
            const esMio = conv.ultimoMensaje.remitente_id === session.user.id
            return (
              <li key={key}>
                <button
                  onClick={function () { setSeleccionado(contacto || { personaId: personaId, personaNombre: nombre, courseId: courseId === 'null' ? null : courseId, courseNombre: courseNombre }) }}
                  className="w-full text-left bg-white rounded-xl p-4 transition hover:opacity-90 flex justify-between items-start gap-3"
                  style={{ border: '1px solid #E5E9F0' }}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold truncate" style={{ color: NAVY_DARK }}>{nombre}</p>
                      {contacto && isOnline(contacto.personaId) && <span className="w-2 h-2 rounded-full inline-block flex-shrink-0" style={{ backgroundColor: '#5DAA47' }} title="En línea" />}
                      {conv.noLeidos > 0 && (
                        <span className="text-xs font-bold px-1.5 rounded-full text-white" style={{ backgroundColor: '#B91C1C' }}>{conv.noLeidos}</span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400">{courseNombre}</p>
                    <p className="text-xs text-slate-500 mt-1 truncate">{esMio ? 'Tú: ' : ''}{conv.ultimoMensaje.contenido}</p>
                  </div>
                  <span className="text-xs text-slate-400 flex-shrink-0">{tiempoRelativo(conv.ultimoMensaje.created_at)}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function HiloConversacion({ contacto, onBack }) {
  const { session } = useAuth()
  const { isOnline } = usePresence()
  const [mensajes, setMensajes] = useState([])
  const [loading, setLoading] = useState(true)
  const [texto, setTexto] = useState('')
  const [archivo, setArchivo] = useState(null)
  const [enviando, setEnviando] = useState(false)
  const [preview, setPreview] = useState(null)
  const bottomRef = useRef(null)

  useEffect(function () {
    cargar()
  }, [contacto.personaId, contacto.courseId])

  async function cargar() {
    setLoading(true)
    let query = supabase
      .from('mensajes')
      .select('*')
      .or(`and(remitente_id.eq.${session.user.id},destinatario_id.eq.${contacto.personaId}),and(remitente_id.eq.${contacto.personaId},destinatario_id.eq.${session.user.id})`)
      .order('created_at', { ascending: true })

    if (contacto.courseId) query = query.eq('course_id', contacto.courseId)
    else query = query.is('course_id', null)

    const result = await query
    if (!result.error) {
      setMensajes(result.data)
      const noLeidosIds = result.data.filter(function (m) { return m.destinatario_id === session.user.id && !m.leido }).map(function (m) { return m.id })
      if (noLeidosIds.length > 0) {
        await supabase.from('mensajes').update({ leido: true }).in('id', noLeidosIds)
      }
    }
    setLoading(false)
    setTimeout(function () { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, 100)
  }

  async function handleEnviar() {
    if (!texto.trim() && !archivo) return
    setEnviando(true)
    const contenido = texto.trim()
    const archivoAEnviar = archivo
    setTexto('')
    setArchivo(null)

    let archivoUrl = null
    if (archivoAEnviar) {
      const safeName = archivoAEnviar.name.replace(/[^a-zA-Z0-9.\-_]/g, '_')
      const path = `${session.user.id}/${Date.now()}_${safeName}`
      const uploadResult = await supabase.storage.from('mensajes').upload(path, archivoAEnviar)
      if (uploadResult.error) {
        alert('Error al subir el archivo: ' + uploadResult.error.message)
        setEnviando(false)
        return
      }
      archivoUrl = path
    }

    const result = await supabase.from('mensajes').insert({
      remitente_id: session.user.id,
      destinatario_id: contacto.personaId,
      course_id: contacto.courseId || null,
      contenido: contenido,
      archivo_url: archivoUrl,
    })

    if (!result.error) {
      await supabase.from('notificaciones').insert({
        user_id: contacto.personaId,
        tipo: 'mensaje',
        titulo: 'Nuevo mensaje',
        mensaje: contenido ? (contenido.length > 60 ? contenido.slice(0, 60) + '...' : contenido) : 'Te enviaron un archivo',
      })
      cargar()
    } else {
      alert('Error al enviar: ' + result.error.message)
    }
    setEnviando(false)
  }

  async function handleVerArchivo(path) {
    const result = await supabase.storage.from('mensajes').createSignedUrl(path, 300)
    if (result.error) { alert('Error al abrir el archivo: ' + result.error.message); return }
    const parts = path.split('/')
    const name = parts[parts.length - 1]
    const ext = name.split('.').pop().toLowerCase()
    setPreview({ url: result.data.signedUrl, type: ext, name: name })
  }

  return (
    <div className="flex flex-col" style={{ height: '70vh' }}>
      <button onClick={onBack} className="text-sm font-semibold mb-3 hover:underline flex-shrink-0" style={{ color: NAVY }}>
        ← Volver a Mensajes
      </button>
      <div className="flex-shrink-0 mb-3">
        <p className="text-base font-bold flex items-center gap-2" style={{ color: NAVY_DARK }}>
          {contacto.personaNombre}
          {isOnline(contacto.personaId) && (
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full flex items-center gap-1" style={{ backgroundColor: '#E7F3E4', color: '#2f7a1f' }}>
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: '#5DAA47' }} />
              En línea
            </span>
          )}
        </p>
        {contacto.courseNombre && <p className="text-xs text-slate-400">{contacto.courseNombre}</p>}
      </div>

      <div className="flex-1 overflow-y-auto rounded-2xl p-4 mb-3" style={{ backgroundColor: '#F4F6F9' }}>
        {loading ? (
          <p className="text-xs text-slate-400">Cargando...</p>
        ) : mensajes.length === 0 ? (
          <p className="text-xs text-slate-400">Escribe el primer mensaje.</p>
        ) : (
          <div className="space-y-2">
            {mensajes.map(function (m) {
              const esMio = m.remitente_id === session.user.id
              const esImagen = m.archivo_url && /\.(jpg|jpeg|png|gif|webp)$/i.test(m.archivo_url)
              return (
                <div key={m.id} className="flex" style={{ justifyContent: esMio ? 'flex-end' : 'flex-start' }}>
                  <div
                    className="rounded-2xl px-3 py-2 max-w-[75%]"
                    style={esMio ? { backgroundColor: GREEN, color: 'white' } : { backgroundColor: 'white', color: NAVY_DARK, border: '1px solid #E5E9F0' }}
                  >
                    {m.archivo_url && (
                      esImagen ? (
                        <button onClick={function () { handleVerArchivo(m.archivo_url) }} className="block mb-1">
                          <span className="text-xs underline">🖼️ Ver imagen</span>
                        </button>
                      ) : (
                        <button
                          onClick={function () { handleVerArchivo(m.archivo_url) }}
                          className="flex items-center gap-2 rounded-lg px-2 py-1.5 mb-1 text-xs"
                          style={esMio ? { backgroundColor: 'rgba(255,255,255,0.2)' } : { backgroundColor: '#F4F6F9' }}
                        >
                          📄 Ver archivo
                        </button>
                      )
                    )}
                    {m.contenido && <p className="text-sm whitespace-pre-wrap">{m.contenido}</p>}
                    <p className="text-xs mt-1" style={{ opacity: 0.7 }}>{tiempoRelativo(m.created_at)}</p>
                  </div>
                </div>
              )
            })}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      <div className="flex-shrink-0">
        {archivo && (
          <div className="flex items-center gap-2 mb-2 text-xs rounded-lg px-3 py-1.5" style={{ backgroundColor: '#E7F3E4', color: '#2f7a1f' }}>
            📎 {archivo.name}
            <button onClick={function () { setArchivo(null) }} className="font-bold ml-1">✕</button>
          </div>
        )}
        <div className="flex gap-2 items-end">
          <label className="w-10 h-10 rounded-xl flex items-center justify-center cursor-pointer flex-shrink-0" style={{ backgroundColor: '#F4F6F9', border: '1px solid #D6DCE5' }}>
            📎
            <input type="file" accept="image/*,application/pdf" className="hidden" onChange={function (e) { setArchivo(e.target.files[0]) }} />
          </label>
          <textarea
            value={texto}
            onChange={function (e) { setTexto(e.target.value) }}
            onKeyDown={function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleEnviar() } }}
            placeholder="Escribe tu mensaje..."
            rows={2}
            className="flex-1 rounded-xl px-3 py-2 text-sm outline-none resize-none"
            style={inputStyle}
          />
          <button
            onClick={handleEnviar}
            disabled={enviando || (!texto.trim() && !archivo)}
            className="px-4 h-10 rounded-xl text-white font-semibold text-sm transition hover:opacity-90 disabled:opacity-50"
            style={{ backgroundColor: GREEN }}
          >
            Enviar
          </button>
        </div>
      </div>

      <PreviewModal preview={preview} onClose={function () { setPreview(null) }} />
    </div>
  )
}
