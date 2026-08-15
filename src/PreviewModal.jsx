import { useState, useEffect } from 'react'

const EXTENSIONES_IMAGEN = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg']

function convertirLinkDriveAEmbed(url) {
  const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/) || url.match(/[?&]id=([a-zA-Z0-9_-]+)/)
  if (match) return `https://drive.google.com/file/d/${match[1]}/preview`
  return null
}

// preview puede venir en 2 formatos, para no romper pantallas que todavía no se actualizaron:
// - Formato viejo: { url, type, name } → un solo elemento
// - Formato nuevo: { items: [{ url, type, name, esLink }], startIndex } → galería completa
export default function PreviewModal({ preview, onClose }) {
  const items = preview ? (preview.items || [{ url: preview.url, type: preview.type, name: preview.name, esLink: false }]) : []
  const [indice, setIndice] = useState(preview?.startIndex || 0)

  useEffect(function () {
    setIndice(preview?.startIndex || 0)
  }, [preview])

  if (!preview || items.length === 0) return null

  const actual = items[indice]
  const isPdf = actual.type === 'pdf'
  const isImagen = EXTENSIONES_IMAGEN.includes((actual.type || '').toLowerCase())
  const isLink = actual.esLink === true
  const driveEmbedUrl = isLink ? convertirLinkDriveAEmbed(actual.url) : null
  const gviewUrl = 'https://docs.google.com/gview?url=' + encodeURIComponent(actual.url) + '&embedded=true'

  function anterior() { setIndice(function (i) { return i === 0 ? items.length - 1 : i - 1 }) }
  function siguiente() { setIndice(function (i) { return i === items.length - 1 ? 0 : i + 1 }) }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
      <div className="bg-slate-800 rounded-2xl w-full max-w-4xl h-[85vh] flex flex-col">
        <div className="flex justify-between items-center p-4 border-b border-slate-700">
          <p className="text-sm text-slate-300 truncate">
            {actual.name}{items.length > 1 ? ` (${indice + 1}/${items.length})` : ''}
          </p>
          <div className="flex gap-2">
            <a href={actual.url} target="_blank" rel="noreferrer" className="text-xs bg-slate-700 hover:bg-slate-600 px-3 py-1.5 rounded">
              Abrir en pestaña nueva
            </a>
            <button onClick={onClose} className="text-xs bg-red-900 hover:bg-red-800 px-3 py-1.5 rounded">
              Cerrar
            </button>
          </div>
        </div>

        <div className="flex-1 bg-white overflow-hidden flex items-center justify-center relative">
          {items.length > 1 && (
            <>
              <button
                onClick={anterior}
                className="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-slate-800/70 hover:bg-slate-800 text-white flex items-center justify-center z-10"
              >
                ‹
              </button>
              <button
                onClick={siguiente}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-slate-800/70 hover:bg-slate-800 text-white flex items-center justify-center z-10"
              >
                ›
              </button>
            </>
          )}

          {isPdf && <iframe src={actual.url} title="preview" className="w-full h-full" />}
          {isImagen && (
            <img src={actual.url} alt={actual.name} className="max-w-full max-h-full object-contain" />
          )}
          {isLink && driveEmbedUrl && (
            <iframe src={driveEmbedUrl} title="preview" className="w-full h-full" allow="autoplay" />
          )}
          {isLink && !driveEmbedUrl && (
            <div className="text-center p-6">
              <p className="text-sm text-slate-500 mb-3">No se pudo generar una vista previa automática de este link.</p>
              <a href={actual.url} target="_blank" rel="noreferrer" className="text-sm font-semibold text-blue-600 underline">
                Abrir el link directamente
              </a>
            </div>
          )}
          {!isPdf && !isImagen && !isLink && <iframe src={gviewUrl} title="preview" className="w-full h-full" />}
        </div>

        {items.length > 1 && (
          <div className="flex gap-1.5 p-3 overflow-x-auto border-t border-slate-700">
            {items.map(function (it, i) {
              return (
                <button
                  key={i}
                  onClick={function () { setIndice(i) }}
                  className="text-[11px] font-semibold px-2.5 py-1 rounded-full flex-shrink-0 transition"
                  style={i === indice ? { backgroundColor: 'white', color: '#0F172A' } : { backgroundColor: '#334155', color: '#CBD5E1' }}
                >
                  {it.esLink ? '🔗 Link' : it.type === 'pdf' ? `📄 ${i + 1}` : `📷 ${i + 1}`}
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
