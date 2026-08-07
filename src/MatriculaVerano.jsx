import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'

const NAVY_DARK = '#0F172A'
const NAVY = '#2563EB'
const GREEN = '#22C55E'

const inputStyle = { backgroundColor: 'white', border: '1px solid #D6DCE5', color: NAVY_DARK }

export default function MatriculaVerano() {
  const [loading, setLoading] = useState(true)
  const [talleres, setTalleres] = useState([])
  const [tallerSel, setTallerSel] = useState(null)

  const [nombreApoderado, setNombreApoderado] = useState('')
  const [dniApoderado, setDniApoderado] = useState('')
  const [telefonoApoderado, setTelefonoApoderado] = useState('')
  const [emailApoderado, setEmailApoderado] = useState('')
  const [nombreEstudiante, setNombreEstudiante] = useState('')
  const [edadGrado, setEdadGrado] = useState('')

  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')
  const [enviado, setEnviado] = useState(false)

  useEffect(function () {
    cargarTalleres()
  }, [])

  async function cargarTalleres() {
    setLoading(true)
    const result = await supabase
      .from('talleres_verano')
      .select('*')
      .eq('activo', true)
      .order('tipo')
      .order('nombre')
    if (!result.error) setTalleres(result.data)
    setLoading(false)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!tallerSel) { setError('Elige un curso o taller.'); return }
    if (!nombreApoderado.trim() || !dniApoderado.trim() || !telefonoApoderado.trim() || !nombreEstudiante.trim()) {
      setError('Completa todos los campos obligatorios.')
      return
    }
    setEnviando(true)
    const result = await supabase.from('matriculas_verano').insert({
      taller_id: tallerSel.id,
      nombre_apoderado: nombreApoderado.trim(),
      dni_apoderado: dniApoderado.trim(),
      telefono_apoderado: telefonoApoderado.trim(),
      email_apoderado: emailApoderado.trim() || null,
      nombre_estudiante: nombreEstudiante.trim(),
      edad_grado_estudiante: edadGrado.trim() || null,
    })
    if (result.error) {
      setError('No se pudo enviar tu matrícula: ' + result.error.message)
    } else {
      setEnviado(true)
    }
    setEnviando(false)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: NAVY_DARK }}>
        <p className="text-white">Cargando...</p>
      </div>
    )
  }

  if (enviado) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ backgroundColor: NAVY_DARK }}>
        <div className="bg-white rounded-2xl p-8 max-w-md text-center">
          <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: '#E7F3E4' }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={GREEN} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6L9 17l-5-5" />
            </svg>
          </div>
          <h2 className="text-xl font-bold mb-2" style={{ color: NAVY_DARK }}>¡Solicitud enviada!</h2>
          <p className="text-sm text-slate-500 mb-1">
            Registramos la matrícula de <strong>{nombreEstudiante}</strong> en <strong>{tallerSel.nombre}</strong>.
          </p>
          <p className="text-sm text-slate-500">
            Para confirmarla, realiza el depósito o transferencia según las indicaciones que te compartió el asesor. En cuanto se valide el pago, quedará habilitado.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen p-6" style={{ backgroundColor: '#F4F6F9' }}>
      <div className="max-w-lg mx-auto">
        <div className="flex items-center gap-3 mb-6 mt-6">
          <img src="/logo.png" alt="Nexoris Academy" className="w-12 h-12 object-contain rounded-full bg-white p-1" />
          <div>
            <p className="font-bold text-lg" style={{ color: NAVY_DARK }}>Nexoris Academy</p>
            <p className="text-sm" style={{ color: GREEN }}>Matrícula — Cursos de Verano</p>
          </div>
        </div>

        {!tallerSel ? (
          <>
            <h2 className="text-lg font-bold mb-1" style={{ color: NAVY_DARK }}>Elige un curso o taller</h2>
            <p className="text-sm text-slate-400 mb-5">Selecciona la opción en la que deseas matricular a tu hijo(a).</p>
            {talleres.length === 0 ? (
              <p className="text-sm text-slate-400">Todavía no hay cursos de verano publicados. Vuelve a intentarlo más adelante.</p>
            ) : (
              <div className="space-y-3">
                {talleres.map(function (t) {
                  return (
                    <button
                      key={t.id}
                      onClick={function () { setTallerSel(t) }}
                      className="w-full text-left bg-white rounded-2xl p-4 transition hover:-translate-y-0.5"
                      style={{ border: '1px solid #E5E9F0', boxShadow: '0 1px 3px rgba(15,42,74,0.06)' }}
                    >
                      <div className="flex justify-between items-start gap-3">
                        <div>
                          <p className="text-sm font-bold" style={{ color: NAVY_DARK }}>{t.nombre}</p>
                          {t.descripcion && <p className="text-xs text-slate-400 mt-0.5">{t.descripcion}</p>}
                          {t.horario && <p className="text-xs text-slate-400 mt-1">🕒 {t.horario}</p>}
                        </div>
                        <span className="text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap" style={{ backgroundColor: t.modalidad === 'virtual' ? '#EAF2FB' : '#E7F3E4', color: t.modalidad === 'virtual' ? '#185FA5' : '#16A34A' }}>
                          {t.modalidad === 'virtual' ? '💻 Virtual' : '🏫 Presencial'}
                        </span>
                      </div>
                      {t.precio != null && (
                        <p className="text-sm font-bold mt-2" style={{ color: GREEN }}>S/ {t.precio}</p>
                      )}
                    </button>
                  )
                })}
              </div>
            )}
          </>
        ) : (
          <>
            <button onClick={function () { setTallerSel(null) }} className="text-sm font-semibold mb-4 hover:underline" style={{ color: NAVY }}>← Elegir otro curso</button>
            <div className="bg-white rounded-2xl p-4 mb-5" style={{ border: '1px solid #E5E9F0' }}>
              <p className="text-sm font-bold" style={{ color: NAVY_DARK }}>{tallerSel.nombre}</p>
              <p className="text-xs text-slate-400">{tallerSel.modalidad === 'virtual' ? '💻 Virtual' : '🏫 Presencial'}{tallerSel.precio != null ? ` · S/ ${tallerSel.precio}` : ''}</p>
            </div>

            <form onSubmit={handleSubmit} className="bg-white rounded-2xl p-5 space-y-4" style={{ border: '1px solid #E5E9F0' }}>
              <div>
                <p className="text-sm font-bold mb-3" style={{ color: NAVY_DARK }}>Datos del padre/madre o apoderado</p>
                <div className="space-y-3">
                  <input type="text" value={nombreApoderado} onChange={function (e) { setNombreApoderado(e.target.value) }} placeholder="Nombre completo" required className="w-full rounded-lg px-3 py-2.5 text-sm outline-none" style={inputStyle} />
                  <input type="text" value={dniApoderado} onChange={function (e) { setDniApoderado(e.target.value) }} placeholder="DNI" required className="w-full rounded-lg px-3 py-2.5 text-sm outline-none" style={inputStyle} />
                  <input type="tel" value={telefonoApoderado} onChange={function (e) { setTelefonoApoderado(e.target.value) }} placeholder="Teléfono / WhatsApp" required className="w-full rounded-lg px-3 py-2.5 text-sm outline-none" style={inputStyle} />
                  <input type="email" value={emailApoderado} onChange={function (e) { setEmailApoderado(e.target.value) }} placeholder="Correo (opcional)" className="w-full rounded-lg px-3 py-2.5 text-sm outline-none" style={inputStyle} />
                </div>
              </div>

              <div>
                <p className="text-sm font-bold mb-3" style={{ color: NAVY_DARK }}>Datos del estudiante</p>
                <div className="space-y-3">
                  <input type="text" value={nombreEstudiante} onChange={function (e) { setNombreEstudiante(e.target.value) }} placeholder="Nombre completo del estudiante" required className="w-full rounded-lg px-3 py-2.5 text-sm outline-none" style={inputStyle} />
                  <input type="text" value={edadGrado} onChange={function (e) { setEdadGrado(e.target.value) }} placeholder="Edad o grado (opcional)" className="w-full rounded-lg px-3 py-2.5 text-sm outline-none" style={inputStyle} />
                </div>
              </div>

              {error && <p className="text-red-500 text-sm">{error}</p>}

              <button
                type="submit"
                disabled={enviando}
                className="w-full text-sm font-semibold py-3 rounded-xl text-white transition hover:opacity-90 disabled:opacity-50"
                style={{ background: `linear-gradient(90deg, ${NAVY}, ${GREEN})`, boxShadow: '0 8px 20px rgba(37,99,235,0.3)' }}
              >
                {enviando ? 'Enviando...' : 'Enviar matrícula'}
              </button>
              <p className="text-xs text-slate-400 text-center">Después de enviar, un asesor te compartirá los datos para el pago y validará tu matrícula.</p>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
