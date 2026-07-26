export default function PreviewModal({ preview, onClose }) {
  if (!preview) return null

  const isPdf = preview.type === 'pdf'
  const gviewUrl = 'https://docs.google.com/gview?url=' + encodeURIComponent(preview.url) + '&embedded=true'

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
      <div className="bg-slate-800 rounded-2xl w-full max-w-4xl h-[85vh] flex flex-col">
        <div className="flex justify-between items-center p-4 border-b border-slate-700">
          <p className="text-sm text-slate-300 truncate">{preview.name}</p>
          <div className="flex gap-2">
            <a href={preview.url} target="_blank" rel="noreferrer" className="text-xs bg-slate-700 hover:bg-slate-600 px-3 py-1.5 rounded">
              Abrir en pestaña nueva
            </a>
            <button onClick={onClose} className="text-xs bg-red-900 hover:bg-red-800 px-3 py-1.5 rounded">
              Cerrar
            </button>
          </div>
        </div>
        <div className="flex-1 bg-white rounded-b-2xl overflow-hidden">
          {isPdf && <iframe src={preview.url} title="preview" className="w-full h-full" />}
          {!isPdf && <iframe src={gviewUrl} title="preview" className="w-full h-full" />}
        </div>
      </div>
    </div>
  )
}