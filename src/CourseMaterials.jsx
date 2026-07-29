import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import { useAuth } from './AuthContext'

const NAVY_DARK = '#0F2A4A'
const NAVY = '#1d5c8f'
const GREEN = '#5DAA47'

function convertirLinkAEmbed(url) {
  const matchFile = url.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/)
  if (matchFile) return `https://drive.google.com/file/d/${matchFile[1]}/preview`

  const matchDoc = url.match(/docs\.google\.com\/(document|spreadsheets|presentation)\/d\/([a-zA-Z0-9_-]+)/)
  if (matchDoc) return `https://docs.google.com/${matchDoc[1]}/d/${matchDoc[2]}/preview`

  const matchOpen = url.match(/drive\.google\.com\/open\?id=([a-zA-Z0-9_-]+)/)
  if (matchOpen) return `https://drive.google.com/file/d/${matchOpen[1]}/preview`

  if (/onedrive\.live\.com|1drv\.ms/.test(url)) {
    if (url.includes('embed=')) return url
    const separador = url.includes('?') ? '&' : '?'
    return `${url}${separador}embed=1`
  }

  if (/\.sharepoint\.com/.test(url)) {
    if (url.includes('action=embedview')) return url
    const separador = url.includes('?') ? '&' : '?'
    return `${url}${separador}action=embedview`
  }

  return null
}

export default function CourseMaterials({ courseId, actividadId, canUpload }) {
  const { session } = useAuth()
  const [materials, setMaterials] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [titulo, setTitulo] = useState('')
  const [file, setFile] = useState(null)
  const [modo, setModo] = useState('archivo') // 'archivo' | 'link'
  const [linkUrl, setLinkUrl] = useState('')
  const [previewMaterial, setPreviewMaterial] = useState(null)

  useEffect(function () {
    loadMaterials()
  }, [courseId, actividadId])

  async function loadMaterials() {
    setLoading(true)
    let query = supabase.from('materials').select('*').order('created_at', { ascending: false })
    query = actividadId ? query.eq('actividad_id', actividadId) : query.eq('course_id', courseId)

    const result = await query
    if (result.error) setError(result.error.message)
    else setMaterials(result.data)
    setLoading(false)
  }

  async function handleUpload(e) {
    e.preventDefault()
    if (!file) return
    setError('')
    setUploading(true)

    const path = `${courseId}/${actividadId || 'general'}/${Date.now()}_${file.name}`

    const uploadResult = await supabase.storage.from('materiales').upload(path, file)

    if (uploadResult.error) {
      setError('Error al subir archivo: ' + uploadResult.error.message)
      setUploading(false)
      return
    }

    const insertResult = await supabase.from('materials').insert({
      course_id: courseId,
      actividad_id: actividadId || null,
      titulo: titulo || file.name,
      file_url: path,
      file_type: file.type,
      file_size_kb: Math.round(file.size / 1024),
      uploaded_by: session.user.id,
    })

    if (insertResult.error) {
      setError('Error al guardar: ' + insertResult.error.message)
    } else {
      setTitulo('')
      setFile(null)
      e.target.reset()
      loadMaterials()
    }
    setUploading(false)
  }

  async function handleGuardarLink(e) {
    e.preventDefault()
    if (!linkUrl.trim()) return
    setError('')
    setUploading(true)

    const insertResult = await supabase.from('materials').insert({
      course_id: courseId,
      actividad_id: actividadId || null,
      titulo: titulo || 'Material enlazado',
      link_url: linkUrl.trim(),
      uploaded_by: session.user.id,
    })

    if (insertResult.error) {
      setError('Error al guardar: ' + insertResult.error.message)
    } else {
      setTitulo('')
      setLinkUrl('')
      loadMaterials()
    }
    setUploading(false)
  }

  function handleAbrir(m) {
    if (m.link_url) {
      const embedUrl = convertirLinkAEmbed(m.link_url)
      if (embedUrl) {
        setPreviewMaterial({ titulo: m.titulo, embedUrl: embedUrl, originalUrl: m.link_url })
      } else {
        window.open(m.link_url, '_blank')
      }
    } else {
      handleDownload(m.file_url)
    }
  }

  async function handleDownload(path) {
    const result = await supabase.storage.from('materiales').createSignedUrl(path, 60)
    if (result.error) {
      alert('Error al generar el enlace de descarga: ' + result.error.message)
      return
    }
    window.open(result.data.signedUrl, '_blank')
  }

  async function handleDelete(materialId, path) {
    if (!confirm('¿Eliminar este material?')) return
    if (path) await supabase.storage.from('materiales').remove([path])
    const result = await supabase.from('materials').delete().eq('id', materialId)
    if (result.error) {
      alert('Error al eliminar: ' + result.error.message)
    } else {
      loadMaterials()
    }
  }

  return (
    <div>
      <h3 className="text-lg font-bold mb-4" style={{ color: NAVY_DARK }}>Materiales</h3>

      {canUpload && (
        <div className="rounded-xl p-4 mb-5 space-y-3" style={{ backgroundColor: '#F4F6F9', border: '1px solid #E5E9F0' }}>
          <div className="flex gap-2">
            {[{ id: 'archivo', label: 'Subir archivo' }, { id: 'link', label: 'Agregar link (Drive)' }].map(function (op) {
              const active = modo === op.id
              return (
                <button
                  key={op.id}
                  type="button"
                  onClick={function () { setModo(op.id) }}
                  className="flex-1 text-sm font-semibold py-2 rounded-lg transition"
                  style={active ? { backgroundColor: GREEN, color: 'white' } : { backgroundColor: 'white', color: NAVY_DARK, border: '1px solid #D6DCE5' }}
                >
                  {op.label}
                </button>
              )
            })}
          </div>

          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: NAVY_DARK }}>
              Título (opcional)
            </label>
            <input
              type="text"
              value={titulo}
              onChange={function (e) { setTitulo(e.target.value) }}
              className="w-full rounded-lg px-3 py-2 text-sm outline-none focus:ring-2"
              style={{ backgroundColor: 'white', border: '1px solid #D6DCE5', color: NAVY_DARK }}
              placeholder="Ej: Guía de la sesión 3"
            />
          </div>

          {modo === 'archivo' ? (
            <form onSubmit={handleUpload} className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: NAVY_DARK }}>
                  Archivo (PDF o Word)
                </label>
                <div className="flex items-center gap-3 flex-wrap">
                  <label
                    className="text-sm font-semibold px-4 py-2 rounded-lg cursor-pointer transition hover:opacity-90"
                    style={{ backgroundColor: 'white', color: NAVY, border: '1px solid #D6DCE5' }}
                  >
                    Adjuntar archivo
                    <input
                      type="file"
                      accept=".pdf,.doc,.docx"
                      onChange={function (e) { setFile(e.target.files[0]) }}
                      className="hidden"
                    />
                  </label>
                  <span className="text-sm text-slate-500">
                    {file ? file.name : 'Ningún archivo seleccionado'}
                  </span>
                </div>
              </div>
              {error && <p className="text-red-500 text-sm">{error}</p>}
              <button
                type="submit"
                disabled={uploading || !file}
                className="font-semibold px-4 py-2 rounded-lg transition disabled:opacity-50 text-white hover:opacity-90"
                style={{ backgroundColor: GREEN }}
              >
                {uploading ? 'Subiendo...' : 'Subir material'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleGuardarLink} className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: NAVY_DARK }}>
                  Link de Google Drive/Docs (o cualquier otro link)
                </label>
                <input
                  type="url"
                  value={linkUrl}
                  onChange={function (e) { setLinkUrl(e.target.value) }}
                  required
                  className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                  style={{ backgroundColor: 'white', border: '1px solid #D6DCE5', color: NAVY_DARK }}
                  placeholder="https://drive.google.com/file/d/..."
                />
                <p className="text-xs text-slate-400 mt-1">
                  Con links de Google Drive/Docs o Microsoft OneDrive/SharePoint (compartidos como "Cualquiera con el enlace"), los estudiantes lo verán directo en la plataforma. Con otros links, se abrirán en una pestaña nueva.
                </p>
              </div>
              {error && <p className="text-red-500 text-sm">{error}</p>}
              <button
                type="submit"
                disabled={uploading || !linkUrl.trim()}
                className="font-semibold px-4 py-2 rounded-lg transition disabled:opacity-50 text-white hover:opacity-90"
                style={{ backgroundColor: GREEN }}
              >
                {uploading ? 'Guardando...' : 'Agregar link'}
              </button>
            </form>
          )}
        </div>
      )}

      {loading ? (
        <p className="text-slate-400 text-sm">Cargando materiales...</p>
      ) : materials.length === 0 ? (
        <p className="text-slate-400 text-sm">Aún no hay materiales aquí.</p>
      ) : (
        <ul className="space-y-3">
          {materials.map(function (m) {
            return (
              <li
                key={m.id}
                className="flex justify-between items-center rounded-xl px-4 py-3"
                style={{ backgroundColor: '#F4F6F9', border: '1px solid #E5E9F0' }}
              >
                <div>
                  <p className="text-sm font-semibold" style={{ color: NAVY_DARK }}>{m.titulo}</p>
                  <p className="text-xs text-slate-500">
                    {m.link_url ? 'Link' : (m.file_size_kb ? `${m.file_size_kb} KB` : '')}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={function () { handleAbrir(m) }}
                    className="text-xs font-semibold px-3 py-1.5 rounded-lg transition"
                    style={{ backgroundColor: 'white', color: NAVY, border: '1px solid #D6DCE5' }}
                  >
                    {m.link_url ? 'Ver' : 'Descargar'}
                  </button>
                  {canUpload && (
                    <button
                      onClick={function () { handleDelete(m.id, m.file_url) }}
                      className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white transition hover:opacity-90"
                      style={{ backgroundColor: '#B91C1C' }}
                    >
                      Eliminar
                    </button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {previewMaterial && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(15,42,74,0.85)' }}
          onClick={function () { setPreviewMaterial(null) }}
        >
          <div
            className="bg-white rounded-2xl overflow-hidden flex flex-col"
            style={{ width: '100%', maxWidth: 900, height: '85vh' }}
            onClick={function (e) { e.stopPropagation() }}
          >
            <div className="flex justify-between items-center px-4 py-3" style={{ borderBottom: '1px solid #E5E9F0' }}>
              <p className="text-sm font-semibold truncate" style={{ color: NAVY_DARK }}>{previewMaterial.titulo}</p>
              <div className="flex gap-2 flex-shrink-0">
                <a
                  href={previewMaterial.originalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-semibold px-3 py-1.5 rounded-lg transition"
                  style={{ backgroundColor: '#F4F6F9', color: NAVY }}
                >
                  Abrir/Descargar en Drive
                </a>
                <button
                  onClick={function () { setPreviewMaterial(null) }}
                  className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white transition hover:opacity-90"
                  style={{ backgroundColor: '#B91C1C' }}
                >
                  Cerrar
                </button>
              </div>
            </div>
            <iframe src={previewMaterial.embedUrl} className="flex-1 w-full" style={{ border: 'none' }} allow="autoplay" />
          </div>
        </div>
      )}
    </div>
  )
}
