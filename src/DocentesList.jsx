import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import { compararPorApellido } from './gradeUtils'
import { estaEnLinea } from './PresenceHeartbeat'

const NAVY_DARK = '#0F2A4A'
const GREEN_DARK = '#2f7a1f'

export default function DocentesList() {
  const [docentes, setDocentes] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [deletingId, setDeletingId] = useState(null)

  useEffect(function () {
    loadDocentes()
  }, [])

  async function loadDocentes() {
    setLoading(true)
    setError('')

    const profilesResult = await supabase
      .from('profiles')
      .select('id, full_name, whatsapp, last_active_at')
      .eq('role', 'docente')
      .order('full_name', { ascending: true })

    if (profilesResult.error) {
      setError(profilesResult.error.message)
      setLoading(false)
      return
    }

    const coursesResult = await supabase
      .from('courses')
      .select('docente_id, nombre, grado, grupo, asignaturas(areas_curriculares(nombre))')
      .not('docente_id', 'is', null)

    const areaMap = {}
    const cursosMap = {}
    if (!coursesResult.error) {
      coursesResult.data.forEach(function (c) {
        if (!areaMap[c.docente_id]) {
          areaMap[c.docente_id] = c.asignaturas?.areas_curriculares?.nombre || null
        }
        if (!cursosMap[c.docente_id]) cursosMap[c.docente_id] = []
        cursosMap[c.docente_id].push(`${c.nombre} ${c.grado}°${c.grupo}`)
      })
    }

    const enriched = profilesResult.data.map(function (d) {
      return {
        ...d,
        area: areaMap[d.id] || null,
        cursos: cursosMap[d.id] || [],
      }
    })

    enriched.sort(function (a, b) { return compararPorApellido(a.full_name, b.full_name) })
    setDocentes(enriched)
    setLoading(false)
  }

  async function guardarWhatsapp(id, valor) {
    const result = await supabase.from('profiles').update({ whatsapp: valor }).eq('id', id)
    if (result.error) alert('Error: ' + result.error.message)
    else setDocentes(function (prev) { return prev.map(function (d) { return d.id === id ? { ...d, whatsapp: valor } : d }) })
  }

  async function handleDelete(id, nombre) {
    if (!confirm(`¿Eliminar la cuenta de "${nombre}"? Esta acción no se puede deshacer.`)) return
    setDeletingId(id)
    const { data, error: fnError } = await supabase.functions.invoke('delete-user', {
      body: { userId: id },
    })

    if (fnError) {
      alert('Error al eliminar: ' + fnError.message)
    } else if (data.error) {
      alert('Error al eliminar: ' + data.error)
    } else {
      setDocentes(function (prev) { return prev.filter(function (d) { return d.id !== id }) })
    }
    setDeletingId(null)
  }

  if (loading) return <p className="text-slate-400 text-sm">Cargando docentes...</p>
  if (error) return <p className="text-red-500 text-sm">Error: {error}</p>

  const areasUnicas = [...new Set(docentes.map(function (d) { return d.area }).filter(Boolean))].sort()
  const grupos = areasUnicas.map(function (area) {
    return { area: area, items: docentes.filter(function (d) { return d.area === area }) }
  })
  const sinArea = docentes.filter(function (d) { return !d.area })

  function renderTable(items) {
    return (
      <table className="w-full text-sm">
        <thead>
          <tr style={{ borderBottom: '1px solid #E5E9F0' }}>
            <th className="text-left py-2 pr-3 font-semibold" style={{ color: NAVY_DARK }}>Nombre</th>
            <th className="text-left py-2 pr-3 font-semibold" style={{ color: NAVY_DARK }}>Cursos a cargo</th>
            <th className="text-left py-2 pr-3 font-semibold" style={{ color: NAVY_DARK }}>Grupo de WhatsApp (padres)</th>
            <th className="text-right py-2 font-semibold" style={{ color: NAVY_DARK }}></th>
          </tr>
        </thead>
        <tbody>
          {items.map(function (d) {
            return (
              <tr key={d.id} style={{ borderBottom: '1px solid #F4F6F9' }}>
                <td className="py-2 pr-3" style={{ color: NAVY_DARK }}>
                  <span className="flex items-center gap-1.5">
                    {estaEnLinea(d.last_active_at) && <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: '#5DAA47' }} title="En línea" />}
                    {d.full_name}
                  </span>
                </td>
                <td className="py-2 pr-3 text-slate-500 text-xs">
                  {d.cursos.length > 0 ? d.cursos.join(' · ') : '—'}
                </td>
                <td className="py-2 pr-3">
                  <input
                    type="text"
                    defaultValue={d.whatsapp || ''}
                    placeholder="https://chat.whatsapp.com/..."
                    className="w-56 rounded-lg px-2 py-1 text-xs outline-none"
                    style={{ backgroundColor: 'white', border: '1px solid #D6DCE5', color: NAVY_DARK }}
                    onBlur={function (e) { if (e.target.value !== (d.whatsapp || '')) guardarWhatsapp(d.id, e.target.value) }}
                  />
                </td>
                <td className="py-2 text-right">
                  <button
                    onClick={function () { handleDelete(d.id, d.full_name) }}
                    disabled={deletingId === d.id}
                    className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white transition hover:opacity-90 disabled:opacity-50"
                    style={{ backgroundColor: '#B91C1C' }}
                  >
                    {deletingId === d.id ? 'Eliminando...' : 'Eliminar'}
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    )
  }

  return (
    <div>
      <h2 className="text-2xl font-bold mb-2" style={{ color: NAVY_DARK }}>Docentes</h2>
      <p className="text-sm text-slate-400 mb-6">{docentes.length} docente(s) registrado(s) en total.</p>

      {docentes.length === 0 ? (
        <p className="text-slate-400 text-sm">Aún no hay docentes registrados.</p>
      ) : (
        <div className="space-y-6">
          {grupos.map(function (grupo) {
            return (
              <div key={grupo.area} className="bg-white rounded-2xl p-5" style={{ border: '1px solid #E5E9F0' }}>
                <h3
                  className="text-xs font-bold uppercase tracking-wide mb-3 px-3 py-1.5 rounded-lg inline-block"
                  style={{ backgroundColor: '#E7F3E4', color: GREEN_DARK }}
                >
                  {grupo.area} ({grupo.items.length})
                </h3>
                {renderTable(grupo.items)}
              </div>
            )
          })}

          {sinArea.length > 0 && (
            <div className="bg-white rounded-2xl p-5" style={{ border: '1px solid #E5E9F0' }}>
              <h3
                className="text-xs font-bold uppercase tracking-wide mb-3 px-3 py-1.5 rounded-lg inline-block"
                style={{ backgroundColor: '#FDECEC', color: '#B91C1C' }}
              >
                Sin curso asignado ({sinArea.length})
              </h3>
              {renderTable(sinArea)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
