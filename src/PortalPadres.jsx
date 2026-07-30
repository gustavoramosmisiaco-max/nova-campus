import { useState } from 'react'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { getLetterGrade } from './gradeUtils'
import WelcomeAnimation from './WelcomeAnimation'
import FarewellAnimation from './FarewellAnimation'

const NAVY_DARK = '#0F2A4A'
const NAVY = '#1d5c8f'
const GREEN = '#5DAA47'

const inputStyle = { backgroundColor: 'white', border: '1px solid #D6DCE5', color: NAVY_DARK }

const SUPABASE_URL = 'https://vwiwvwxyixehnzaallzt.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ3aXd2d3h5aXhlaG56YWFsbHp0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUwMjUzMTIsImV4cCI6MjEwMDYwMTMxMn0.dfiQpAt0fh5i61VuBR9bz7rxN7RV0XmmxAYlcSFu6TQ'

function formatearFecha(fecha) {
  return new Date(fecha).toLocaleDateString('es-PE', { day: '2-digit', month: 'short' })
}

function generarPDF(datos) {
  const doc = new jsPDF()
  doc.setFontSize(14)
  doc.setTextColor(15, 42, 74)
  doc.text('Reporte de Notas', 14, 15)
  doc.setFontSize(10)
  doc.setTextColor(100, 100, 100)
  doc.text(`${datos.nombre}  —  ${datos.bimestre}° Bimestre`, 14, 22)

  let y = 30
  datos.notas.forEach(function (area) {
    if (y > 260) { doc.addPage(); y = 20 }
    doc.setFontSize(11)
    doc.setTextColor(15, 42, 74)
    doc.setFont(undefined, 'bold')
    doc.text(`${area.areaNombre}  —  Promedio: ${area.promedio != null ? getLetterGrade(area.promedio) : '—'}`, 14, y)
    doc.setFont(undefined, 'normal')
    y += 4

    const filas = []
    area.competencias.forEach(function (comp) {
      filas.push([comp.nombre, '', comp.promedio != null ? getLetterGrade(comp.promedio) : '—'])
      comp.capacidades.forEach(function (cap) {
        filas.push(['', cap.nombre, cap.promedio != null ? getLetterGrade(cap.promedio) : '—'])
      })
    })

    autoTable(doc, {
      startY: y,
      head: [['Competencia', 'Capacidad', 'Promedio']],
      body: filas,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [93, 170, 71] },
      margin: { left: 14, right: 14 },
    })
    y = doc.lastAutoTable.finalY + 10
  })

  doc.save(`Notas_${datos.nombre.replace(/\s+/g, '_')}_Bim${datos.bimestre}.pdf`)
}

export default function PortalPadres({ onBack }) {
  const [codigo, setCodigo] = useState('')
  const [bimestre, setBimestre] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [datos, setDatos] = useState(null)
  const [areaSeleccionada, setAreaSeleccionada] = useState(null)
  const [despidiendo, setDespidiendo] = useState(false)

  function handleVolverConDespedida() {
    setDespidiendo(true)
  }

  async function handleBuscar(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    setDatos(null)

    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/portal-padres`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'apikey': SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ codigo: codigo.trim(), bimestre: bimestre }),
      })
      const json = await response.json()
      if (!response.ok) {
        setError(json.error || 'No se pudo verificar el código.')
      } else {
        setDatos(json)
      }
    } catch (err) {
      setError('Error de conexión. Intenta de nuevo.')
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: '#F4F6F9' }}>
      {datos && <WelcomeAnimation role="padre" nombre="" />}
      <FarewellAnimation visible={despidiendo} role="padre" nombre="" onComplete={onBack} />
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <img src="/logo.png" alt="Nova Campus" className="w-14 h-14 object-contain rounded-full bg-white p-1 mx-auto mb-3" style={{ boxShadow: '0 2px 8px rgba(15,42,74,0.15)' }} />
          <h1 className="text-lg font-bold" style={{ color: NAVY_DARK }}>Portal de Padres de Familia</h1>
          <p className="text-sm text-slate-400 mt-1">Ingresa el código de tu hijo(a) para ver su progreso</p>
        </div>

        {!datos ? (
          <div className="bg-white rounded-2xl p-6" style={{ border: '1px solid #E5E9F0' }}>
            <form onSubmit={handleBuscar}>
              <label className="block text-xs font-medium mb-1" style={{ color: NAVY_DARK }}>Código de acceso</label>
              <input
                type="text"
                value={codigo}
                onChange={function (e) { setCodigo(e.target.value) }}
                placeholder="Ej: A3F9K2"
                required
                className="w-full rounded-lg px-3 py-2.5 text-sm outline-none uppercase text-center tracking-widest font-semibold"
                style={inputStyle}
              />
              <label className="block text-xs font-medium mb-1 mt-3" style={{ color: NAVY_DARK }}>Bimestre</label>
              <div className="flex gap-2">
                {[1, 2, 3, 4].map(function (b) {
                  const active = bimestre === b
                  return (
                    <button
                      key={b}
                      type="button"
                      onClick={function () { setBimestre(b) }}
                      className="flex-1 text-sm font-semibold py-2 rounded-lg transition"
                      style={active ? { backgroundColor: GREEN, color: 'white' } : { backgroundColor: 'white', color: NAVY_DARK, border: '1px solid #D6DCE5' }}
                    >
                      {b}°
                    </button>
                  )
                })}
              </div>
              {error && <p className="text-xs mt-2" style={{ color: '#B91C1C' }}>{error}</p>}
              <button
                type="submit"
                disabled={loading}
                className="w-full mt-4 text-sm font-semibold py-2.5 rounded-lg text-white transition hover:opacity-90 disabled:opacity-50"
                style={{ backgroundColor: GREEN }}
              >
                {loading ? 'Buscando...' : 'Ver progreso'}
              </button>
            </form>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl p-5" style={{ border: '1px solid #E5E9F0' }}>
              <p className="text-xs text-slate-400">Estudiante</p>
              <p className="text-lg font-bold" style={{ color: NAVY_DARK }}>{datos.nombre}</p>
              <button
                onClick={function () { generarPDF(datos) }}
                className="w-full mt-3 text-sm font-semibold py-2.5 rounded-lg text-white transition hover:opacity-90"
                style={{ backgroundColor: NAVY }}
              >
                📄 Ver reporte de notas en PDF ({datos.bimestre}° Bim.)
              </button>
            </div>

            <div className="bg-white rounded-2xl p-5" style={{ border: '1px solid #E5E9F0' }}>
              <p className="text-sm font-bold mb-3" style={{ color: NAVY_DARK }}>
                Áreas y Asignaturas — {datos.bimestre}° Bimestre
              </p>

              {areaSeleccionada == null ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  {datos.notas.map(function (area, i) {
                    const letra = area.promedio != null ? getLetterGrade(area.promedio) : null
                    return (
                      <button
                        key={i}
                        onClick={function () { setAreaSeleccionada(i) }}
                        className="text-left rounded-xl p-3 transition hover:-translate-y-0.5"
                        style={{ backgroundColor: '#F4F6F9', border: '1px solid #E5E9F0' }}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span style={{ color: GREEN }}>📁</span>
                          <p className="text-sm font-semibold" style={{ color: NAVY_DARK }}>{area.areaNombre}</p>
                        </div>
                        <p className="text-xs text-slate-500">
                          {datos.cursos.filter(function (c) { return c.area === area.areaNombre }).map(function (c) { return c.nombre }).join(', ')}
                        </p>
                        <p className="text-xs mt-1">
                          Promedio: <strong style={{ color: NAVY_DARK }}>{letra || '—'}</strong>
                        </p>
                      </button>
                    )
                  })}
                </div>
              ) : (function () {
                const area = datos.notas[areaSeleccionada]
                const cursosDeArea = datos.cursos.filter(function (c) { return c.area === area.areaNombre })
                return (
                  <div>
                    <button onClick={function () { setAreaSeleccionada(null) }} className="text-xs font-semibold mb-3 hover:underline" style={{ color: NAVY }}>
                      ← Volver a Áreas
                    </button>
                    <p className="text-sm font-bold mb-1" style={{ color: NAVY_DARK }}>{area.areaNombre}</p>
                    <p className="text-xs text-slate-400 mb-3">
                      {cursosDeArea.map(function (c) { return `${c.nombre} (${c.docente})` }).join(' · ')}
                    </p>
                    <div className="space-y-2">
                      {area.competencias.map(function (comp, ci) {
                        const letraComp = comp.promedio != null ? getLetterGrade(comp.promedio) : null
                        return (
                          <div key={ci} className="rounded-lg p-3" style={{ backgroundColor: '#F4F6F9' }}>
                            <div className="flex justify-between items-start gap-2">
                              <p className="text-xs font-semibold flex-1 min-w-0" style={{ color: '#2f7a1f' }}>{comp.nombre}</p>
                              <p className="text-xs font-bold flex-shrink-0" style={{ color: NAVY_DARK }}>{letraComp || '—'}</p>
                            </div>
                            <ul className="mt-1.5 space-y-1">
                              {comp.capacidades.map(function (cap, capi) {
                                const letraCap = cap.promedio != null ? getLetterGrade(cap.promedio) : null
                                return (
                                  <li key={capi} className="text-xs flex justify-between items-start gap-2" style={{ color: '#5F5E5A' }}>
                                    <span className="flex-1 min-w-0">{cap.nombre}</span>
                                    <span className="font-semibold flex-shrink-0">{letraCap || '—'}</span>
                                  </li>
                                )
                              })}
                            </ul>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })()}
            </div>

            <div className="bg-white rounded-2xl p-5" style={{ border: '1px solid #E5E9F0' }}>
              <p className="text-sm font-bold mb-3" style={{ color: datos.pendientes.length > 0 ? '#B91C1C' : NAVY_DARK }}>
                Tareas vencidas sin presentar ({datos.pendientes.length})
              </p>
              {datos.pendientes.length === 0 ? (
                <p className="text-xs text-slate-400">🎉 No tiene tareas pendientes vencidas.</p>
              ) : (
                <ul className="space-y-2">
                  {datos.pendientes.map(function (p, i) {
                    return (
                      <li key={i} className="text-xs rounded-lg px-3 py-2" style={{ backgroundColor: '#FDECEC' }}>
                        <p className="font-semibold" style={{ color: '#B91C1C' }}>{p.titulo}</p>
                        <p className="text-slate-500">{p.asignatura} · venció el {formatearFecha(p.fecha_entrega)}</p>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>

            {datos.conductas && datos.conductas.length > 0 && (
              <div className="bg-white rounded-2xl p-5" style={{ border: '1px solid #E5E9F0' }}>
                <p className="text-sm font-bold mb-3" style={{ color: '#B45309' }}>
                  Registro de Conducta ({datos.conductas.length})
                </p>
                {(function () {
                  const porArea = {}
                  datos.conductas.forEach(function (c) {
                    const key = c.areaNombre || 'Sin área'
                    if (!porArea[key]) porArea[key] = []
                    porArea[key].push(c)
                  })
                  return Object.keys(porArea).map(function (areaNombre) {
                    return (
                      <div key={areaNombre} className="mb-4 last:mb-0">
                        <p className="text-xs font-bold mb-2" style={{ color: NAVY_DARK }}>{areaNombre}</p>
                        <ul className="space-y-2">
                          {porArea[areaNombre].map(function (c, i) {
                            return (
                              <li key={i} className="text-xs rounded-lg px-3 py-2" style={{ backgroundColor: '#FFF7E6' }}>
                                <div className="flex justify-between items-start gap-2">
                                  <div>
                                    <p className="font-semibold" style={{ color: '#B45309' }}>{c.tipo}</p>
                                    <p className="text-slate-600 mt-0.5">{c.descripcion}</p>
                                    <p className="text-slate-400 mt-1">
                                      {new Date(c.fecha + 'T00:00:00').toLocaleDateString('es-PE')}
                                      {c.unidadTexto && ` · ${c.unidadTexto}${c.bimestre ? ' (Bim. ' + c.bimestre + ')' : ''}`}
                                      {' · Registrado por ' + c.docente}
                                    </p>
                                  </div>
                                  {c.adjuntoUrl && (
                                    <a href={c.adjuntoUrl} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold px-2 py-1 rounded-lg flex-shrink-0" style={{ backgroundColor: 'white', color: NAVY, border: '1px solid #D6DCE5' }}>
                                      Ver adjunto
                                    </a>
                                  )}
                                </div>
                              </li>
                            )
                          })}
                        </ul>
                      </div>
                    )
                  })
                })()}
              </div>
            )}

            {datos.docentes.filter(function (d) { return d.whatsapp }).length > 0 && (
              <div className="bg-white rounded-2xl p-5" style={{ border: '1px solid #E5E9F0' }}>
                <p className="text-sm font-bold mb-3" style={{ color: NAVY_DARK }}>Grupos de WhatsApp de padres</p>
                <div className="space-y-2">
                  {datos.docentes.filter(function (d) { return d.whatsapp }).map(function (d, i) {
                    return (
                      <a
                        key={i}
                        href={d.whatsapp}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 text-sm font-semibold px-3 py-2 rounded-lg text-white transition hover:opacity-90"
                        style={{ backgroundColor: '#25D366' }}
                      >
                        💬 Grupo de {d.nombre}
                      </a>
                    )
                  })}
                </div>
              </div>
            )}

            <button
              onClick={function () { setDatos(null); setCodigo(''); setAreaSeleccionada(null) }}
              className="w-full text-sm font-semibold py-2.5 rounded-lg transition"
              style={{ backgroundColor: 'white', color: NAVY_DARK, border: '1px solid #D6DCE5' }}
            >
              Consultar otro código
            </button>
          </div>
        )}

        <button
          onClick={handleVolverConDespedida}
          className="w-full mt-4 text-xs font-semibold text-center hover:underline"
          style={{ color: NAVY }}
        >
          ← Volver al inicio de sesión
        </button>
      </div>
    </div>
  )
}
