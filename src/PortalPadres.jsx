import { useState } from 'react'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { getLetterGrade } from './gradeUtils'

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
              <p className="text-sm font-bold mb-3" style={{ color: NAVY_DARK }}>Asignaturas</p>
              <ul className="space-y-2">
                {datos.cursos.map(function (c, i) {
                  return (
                    <li key={i} className="text-sm flex justify-between items-center rounded-lg px-3 py-2" style={{ backgroundColor: '#F4F6F9' }}>
                      <div>
                        <p style={{ color: NAVY_DARK }}>{c.nombre}</p>
                        <p className="text-xs text-slate-400">{c.area} · {c.grado}° "{c.grupo}" · {c.docente}</p>
                      </div>
                    </li>
                  )
                })}
              </ul>
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

            {datos.docentes.filter(function (d) { return d.whatsapp }).length > 0 && (
              <div className="bg-white rounded-2xl p-5" style={{ border: '1px solid #E5E9F0' }}>
                <p className="text-sm font-bold mb-3" style={{ color: NAVY_DARK }}>Escribir a un docente</p>
                <div className="space-y-2">
                  {datos.docentes.filter(function (d) { return d.whatsapp }).map(function (d, i) {
                    return (
                      <a
                        key={i}
                        href={`https://wa.me/${d.whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(`Hola ${d.nombre}, soy el padre/apoderado de ${datos.nombre}, quisiera hacer una consulta.`)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 text-sm font-semibold px-3 py-2 rounded-lg text-white transition hover:opacity-90"
                        style={{ backgroundColor: '#25D366' }}
                      >
                        💬 Escribir a {d.nombre}
                      </a>
                    )
                  })}
                </div>
              </div>
            )}

            <button
              onClick={function () { setDatos(null); setCodigo('') }}
              className="w-full text-sm font-semibold py-2.5 rounded-lg transition"
              style={{ backgroundColor: 'white', color: NAVY_DARK, border: '1px solid #D6DCE5' }}
            >
              Consultar otro código
            </button>
          </div>
        )}

        <button
          onClick={onBack}
          className="w-full mt-4 text-xs font-semibold text-center hover:underline"
          style={{ color: NAVY }}
        >
          ← Volver al inicio de sesión
        </button>
      </div>
    </div>
  )
}
