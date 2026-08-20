import { useState } from 'react'
import { supabase } from './supabaseClient'

const NAVY_DARK = '#0F172A'
const NAVY = '#2563EB'
const GREEN = '#22C55E'

const inputStyle = { backgroundColor: 'white', border: '1px solid #D6DCE5', color: NAVY_DARK }

// ============================================================
// El Coordinador sube el logo y confirma el nombre de SU institución —
// aparece automáticamente en el menú de todos los Docentes y Estudiantes
// de esa institución (y en los reportes descargables).
// ============================================================
export default function MiInstitucion({ institucion, onActualizada }) {
  const [nombre, setNombre] = useState(institucion.nombre || '')
  const [logoPreview, setLogoPreview] = useState(institucion.logo_url || '')
  const [archivoNuevo, setArchivoNuevo] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  function handleSeleccionarArchivo(file) {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      alert('Elige un archivo de imagen (PNG, JPG, etc.)')
      return
    }
    setArchivoNuevo(file)
    setLogoPreview(URL.createObjectURL(file))
  }

  async function handleGuardar() {
    if (!nombre.trim()) {
      setError('El nombre de la institución no puede quedar vacío.')
      return
    }
    setError('')
    setGuardando(true)

    let logoUrlFinal = institucion.logo_url || null

    if (archivoNuevo) {
      const extension = archivoNuevo.name.split('.').pop()
      const path = `${institucion.id}/logo.${extension}`
      const uploadResult = await supabase.storage.from('logos-instituciones').upload(path, archivoNuevo, { upsert: true })
      if (uploadResult.error) {
        setError('Error al subir el logo: ' + uploadResult.error.message)
        setGuardando(false)
        return
      }
      const urlResult = supabase.storage.from('logos-instituciones').getPublicUrl(path)
      // Se agrega la fecha al final para que el navegador no siga mostrando el logo viejo en caché
      logoUrlFinal = urlResult.data.publicUrl + '?t=' + Date.now()
    }

    const result = await supabase
      .from('instituciones_educativas')
      .update({ nombre: nombre.trim(), logo_url: logoUrlFinal })
      .eq('id', institucion.id)

    if (result.error) {
      setError('Error al guardar: ' + result.error.message)
    } else {
      alert('Guardado correctamente. El logo ya se actualizó para toda tu institución.')
      if (onActualizada) onActualizada()
    }
    setGuardando(false)
  }

  return (
    <div>
      <h2 className="text-2xl font-bold mb-2" style={{ color: NAVY_DARK }}>Mi Institución</h2>
      <p className="text-sm text-slate-400 mb-6">
        El logo y nombre que pongas aquí aparecen automáticamente en el menú de todos los Docentes y Estudiantes de tu institución.
      </p>

      <div className="bg-white rounded-2xl p-6 max-w-md" style={{ border: '1px solid #E5E9F0' }}>
        <div className="flex flex-col items-center mb-5">
          <div
            className="w-28 h-28 rounded-full flex items-center justify-center overflow-hidden mb-3"
            style={{ backgroundColor: '#F4F6F9', border: '2px solid #E5E9F0' }}
          >
            {logoPreview ? (
              <img src={logoPreview} alt="Logo de la institución" className="w-full h-full object-contain" />
            ) : (
              <span className="text-3xl" style={{ color: '#94A3B8' }}>🏫</span>
            )}
          </div>
          <label className="text-xs font-semibold px-4 py-2 rounded-lg cursor-pointer transition hover:opacity-90" style={{ backgroundColor: '#F4F6F9', color: NAVY, border: '1px solid #D6DCE5' }}>
            {archivoNuevo ? 'Cambiar imagen elegida' : 'Cambiar logo'}
            <input type="file" accept="image/*" className="hidden" onChange={function (e) { handleSeleccionarArchivo(e.target.files[0]) }} />
          </label>
        </div>

        <div className="mb-4">
          <label className="block text-xs font-medium mb-1" style={{ color: NAVY_DARK }}>Nombre de la institución</label>
          <input
            type="text"
            value={nombre}
            onChange={function (e) { setNombre(e.target.value) }}
            className="w-full rounded-lg px-3 py-2 text-sm outline-none"
            style={inputStyle}
          />
        </div>

        {error && <p className="text-red-500 text-sm mb-3">{error}</p>}

        <button
          onClick={handleGuardar}
          disabled={guardando}
          className="w-full text-sm font-semibold px-4 py-2.5 rounded-xl text-white transition hover:opacity-90 disabled:opacity-50"
          style={{ background: `linear-gradient(90deg, ${NAVY}, ${GREEN})` }}
        >
          {guardando ? 'Guardando...' : 'Guardar cambios'}
        </button>
      </div>
    </div>
  )
}
