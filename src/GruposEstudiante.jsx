import { useEffect, useState, useRef } from 'react'
import { supabase } from './supabaseClient'
import { useAuth } from './AuthContext'
import PreviewModal from './PreviewModal'

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

export default function GruposEstudiante({ courseId }) {
  const { session } = useAuth()
  const [grupos, setGrupos] = useState([])
  const [loading, setLoading] = useState(true)
  const [seleccionado, setSeleccionado] = useState(null)

  useEffect(function () {
    cargar()
  }, [courseId])

  async function cargar() {
    setLoading(true)
    const result = await supabase
      .from('grupos_trabajo_miembros')
      .select('grupo:grupos_trabajo!inner(id, nombre, course_id, grupos_trabajo_miembros(student:profiles(full_name)))')
      .eq('student_id', session.user.id)
      .eq('grupo.course_id', courseId)
    if (!result.error) setGrupos(result.data.map(function (r) { return r.grupo }))
    setLoading(false)
  }

  if (loading) return <p className="text-slate-400 text-sm">Cargando...</p>

  if (seleccionado) {
    return <ChatGrupo grupo={seleccionado} onBack={function () { setSeleccionado(null) }} />
  }

  return (
    <div>
      <h3 className="text-lg font-bold mb-1" style={{ color: NAVY_DARK }}>Grupos de Trabajo</h3>
      <p className="text-sm text-slate-400 mb-4">Coordina con tus compañeros de grupo.</p>

      {grupos.length === 0 ? (
        <p className="text-slate-400 text-sm">Tu docente aún no te asignó a ningún grupo de trabajo.</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {grupos.map(function (g) {
            return (
              <button
                key={g.id}
                onClick={function () { setSeleccionado(g) }}
                className="text-left bg-white rounded-2xl p-4 transition hover:-translate-y-0.5"
                style={{ border: '1px solid #E5E9F0' }}
              >
                <p className="text-sm font-bold" style={{ color: NAVY_DARK }}>{g.nombre}</p>
                <p className="text-xs text-slate-400 mt-1">
                  {g.grupos_trabajo_miembros.map(function (m) { return m.student?.full_name }).join(', ')}
                </p>
                <p className="text-xs mt-2" style={{ color: '#2f7a1f' }}>Abrir chat grupal →</p>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function ChatGrupo({ grupo, onBack }) {
  const { session } = useAuth()
  const [mensajes, setMensajes] = useState([])
  const [loading, setLoading] = useState(true)
  const [texto, setTexto] = useState('')
  const [archivo, setArchivo] = useState(null)
  const [enviando, setEnviando] = useState(false)
  const [preview, setPreview] = useState(null)
  const bottomRef = useRef(null)

  useEffect(function () {
    cargar()
  }, [grupo.id])

  useEffect(function () {
    const channel = supabase
      .channel(`mensajes-grupo-${grupo.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'mensajes_grupo', filter: `grupo_id=eq.${grupo.id}` }, async function (payload) {
        const m = payload.new
        const remitenteResult = await supabase.from('profiles').select('full_name').eq('id', m.remitente_id).single()
        setMensajes(function (prev) {
          if (prev.some(function (existing) { return existing.id === m.id })) return prev
          return [...prev, { ...m, remitente: remitenteResult.data }]
        })
        setTimeout(function () { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, 100)
      })
      .subscribe()

    return function () { supabase.removeChannel(channel) }
  }, [grupo.id])

  async function cargar() {
    setLoading(true)
    const result = await supabase
      .from('mensajes_grupo')
      .select('*, remitente:profiles(full_name)')
      .eq('grupo_id', grupo.id)
      .order('created_at', { ascending: true })
    if (!result.error) setMensajes(result.data)
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

    const result = await supabase.from('mensajes_grupo').insert({
      grupo_id: grupo.id,
      remitente_id: session.user.id,
      contenido: contenido,
      archivo_url: archivoUrl,
    })

    if (!result.error) cargar()
    else alert('Error al enviar: ' + result.error.message)
    setEnviando(false)
  }

  async function handleVerArchivo(path) {
    const result = await supabase.storage.from('mensajes').createSignedUrl(path, 300)
    if (result.error) { alert('Error: ' + result.error.message); return }
    const parts = path.split('/')
    const name = parts[parts.length - 1]
    const ext = name.split('.').pop().toLowerCase()
    setPreview({ url: result.data.signedUrl, type: ext, name: name })
  }

  return (
    <div className="flex flex-col" style={{ height: '70vh' }}>
      <button onClick={onBack} className="text-sm font-semibold mb-3 hover:underline flex-shrink-0" style={{ color: NAVY }}>
        ← Volver a Grupos
      </button>
      <p className="text-base font-bold mb-3 flex-shrink-0" style={{ color: NAVY_DARK }}>{grupo.nombre}</p>

      <div className="flex-1 overflow-y-auto rounded-2xl p-4 mb-3" style={{ backgroundColor: '#F4F6F9' }}>
        {loading ? (
          <p className="text-xs text-slate-400">Cargando...</p>
        ) : mensajes.length === 0 ? (
          <p className="text-xs text-slate-400">Sé el primero en escribir en el grupo.</p>
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
                    {!esMio && <p className="text-xs font-bold mb-0.5" style={{ color: NAVY }}>{m.remitente?.full_name}</p>}
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
          <label className="w-10 h-10 rounded-xl flex items-center justify-center cursor-pointer flex-shrink-0" style={{ backgroundColor: 'white', border: '1px solid #D6DCE5' }}>
            📎
            <input type="file" accept="image/*,application/pdf" className="hidden" onChange={function (e) { setArchivo(e.target.files[0]) }} />
          </label>
          <textarea
            value={texto}
            onChange={function (e) { setTexto(e.target.value) }}
            onKeyDown={function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleEnviar() } }}
            placeholder="Escribe al grupo..."
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
