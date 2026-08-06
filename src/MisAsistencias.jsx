import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import { useAuth } from './AuthContext'

const NAVY_DARK = '#0F172A'
const NAVY = '#2563EB'
const GREEN = '#22C55E'

export default function MisAsistencias() {
  const { session } = useAuth()
  const [loading, setLoading] = useState(true)
  const [asistencias, setAsistencias] = useState([])
  const [justificandoId, setJustificandoId] = useState(null)
  const [texto, setTexto] = useState('')
  const [archivo, setArchivo] = useState(null)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')

  useEffect(function () {
    cargar()
  }, [])

  async function cargar() {
    setLoading(true)
    const result = await supabase
      .from('asistencias')
      .select('*, area:areas_curriculares(nombre)')
      .eq('student_id', session.user.id)
      .order('fecha', { ascending: false })
    if (!result.error) setAsistencias(result.data)
    setLoading(false)
  }

  function abrirJustificar(id) {
    setJustificandoId(id)
    setTexto('')
    setArchivo(null)
    setError('')
  }

  async function handleEnviarJustificacion(id) {
    if (!texto.trim()) { setError('Escribe el motivo de tu inasistencia.'); return }
    setEnviando(true)
    setError('')

    let archivoUrl = null
    if (archivo) {
      const safeName = archivo.name.replace(/[^a-zA-Z0-9.\-_]/g, '_')
      const path = `${session.user.id}/${id}_${Date.now()}_${safeName}`
      const uploadResult = await supabase.storage.from('asistencias').upload(path, archivo)
      if (uploadResult.error) { setError(uploadResult.error.message); setEnviando(false); return }
      archivoUrl = path
    }

    const updateResult = await supabase
      .from('asistencias')
      .update({
        justificacion_texto: texto.trim(),
        justificacion_archivo_url: archivoUrl,
        justificacion_estado: 'pendiente',
      })
      .eq('id', id)
      .eq('student_id', session.user.id)

    if (updateResult.error) {
      setError(updateResult.error.message)
    } else {
      setJustificandoId(null)
      cargar()
    }
    setEnviando(false)
  }

  if (loading) return <p className="text-slate-400 text-sm">Cargando...</p>

  const sinJustificar = asistencias.filter(function (a) { return a.justificacion_estado === 'ninguna' })
  const enRevision = asistencias.filter(function (a) { return a.justificacion_estado === 'pendiente' })
  const resueltas = asistencias.filter(function (a) { return a.justificacion_estado === 'aprobada' || a.justificacion_estado === 'rechazada' })

  function EstadoBadge({ a }) {
    if (a.estado === 'justificado') {
      return <span className="text-xs font-semibold px-2.5 py-1 rounded-full" style={{ backgroundColor: '#E7F3E4', color: '#16A34A' }}>Justificada</span>
    }
    if (a.justificacion_estado === 'pendiente') {
      return <span className="text-xs font-semibold px-2.5 py-1 rounded-full" style={{ backgroundColor: '#FFF7E6', color: '#B45309' }}>En revisión</span>
    }
    if (a.justificacion_estado === 'rechazada') {
      return <span className="text-xs font-semibold px-2.5 py-1 rounded-full" style={{ backgroundColor: '#FDECEC', color: '#B91C1C' }}>Rechazada</span>
    }
    return <span className="text-xs font-semibold px-2.5 py-1 rounded-full" style={{ backgroundColor: '#FDECEC', color: '#B91C1C' }}>Sin justificar</span>
  }

  return (
    <div>
      <h2 className="text-2xl font-bold mb-2" style={{ color: NAVY_DARK }}>Mi Asistencia</h2>
      <p className="text-sm text-slate-400 mb-6">
        Total de inasistencias registradas: {asistencias.length}
        {sinJustificar.length > 0 && ` · ${sinJustificar.length} sin justificar`}
      </p>

      {asistencias.length === 0 ? (
        <div className="bg-white rounded-2xl p-10 text-center" style={{ border: '1px dashed #D6DCE5' }}>
          <p className="text-slate-400 text-sm">No tienes ninguna inasistencia registrada. ¡Sigue así! 🎉</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {[...sinJustificar, ...enRevision, ...resueltas].map(function (a) {
            return (
              <li key={a.id} className="bg-white rounded-2xl p-4" style={{ border: '1px solid #E5E9F0' }}>
                <div className="flex justify-between items-start gap-3 flex-wrap">
                  <div>
                    <p className="text-sm font-semibold" style={{ color: NAVY_DARK }}>{a.area?.nombre || 'Área'}</p>
                    <p className="text-xs text-slate-400">{new Date(a.fecha + 'T00:00:00').toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
                  </div>
                  <EstadoBadge a={a} />
                </div>

                {a.justificacion_texto && (
                  <p className="text-xs text-slate-500 mt-2 italic">"{a.justificacion_texto}"</p>
                )}

                {a.justificacion_estado === 'ninguna' && justificandoId !== a.id && (
                  <button
                    onClick={function () { abrirJustificar(a.id) }}
                    className="mt-3 text-xs font-semibold px-4 py-2 rounded-lg text-white transition hover:opacity-90"
                    style={{ background: `linear-gradient(90deg, ${NAVY}, ${GREEN})` }}
                  >
                    Justificar inasistencia
                  </button>
                )}

                {justificandoId === a.id && (
                  <div className="mt-3 space-y-2">
                    <textarea
                      value={texto}
                      onChange={function (e) { setTexto(e.target.value) }}
                      placeholder="Explica el motivo de tu inasistencia..."
                      rows={3}
                      className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                      style={{ backgroundColor: 'white', border: '1px solid #D6DCE5', color: NAVY_DARK }}
                    />
                    <div>
                      <label className="text-xs font-semibold px-3 py-1.5 rounded-lg cursor-pointer inline-block" style={{ backgroundColor: '#F4F6F9', color: NAVY_DARK }}>
                        📎 Adjuntar comprobante (opcional)
                        <input type="file" className="hidden" onChange={function (e) { setArchivo(e.target.files[0]) }} />
                      </label>
                      {archivo && <span className="text-xs text-slate-500 ml-2">{archivo.name}</span>}
                    </div>
                    {error && <p className="text-red-500 text-xs">{error}</p>}
                    <div className="flex gap-2">
                      <button
                        onClick={function () { handleEnviarJustificacion(a.id) }}
                        disabled={enviando}
                        className="text-xs font-semibold px-4 py-2 rounded-lg text-white transition hover:opacity-90 disabled:opacity-50"
                        style={{ background: `linear-gradient(90deg, ${NAVY}, ${GREEN})` }}
                      >
                        {enviando ? 'Enviando...' : 'Enviar justificación'}
                      </button>
                      <button
                        onClick={function () { setJustificandoId(null) }}
                        className="text-xs font-semibold px-4 py-2 rounded-lg transition"
                        style={{ backgroundColor: 'white', color: '#5B6B82', border: '1.5px solid #D6DCE5' }}
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
