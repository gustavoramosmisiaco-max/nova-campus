import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import { compararPorApellido } from './gradeUtils'
import { estaEnLinea } from './PresenceHeartbeat'
import { usePresence } from './PresenceContext'

const NAVY_DARK = '#0F172A'
const NAVY = '#2563EB'
const GREEN = '#22C55E'
const GREEN_DARK = '#16A34A'

async function extraerMensajeError(fnError) {
  if (!fnError) return 'Error desconocido'
  try {
    if (fnError.context && typeof fnError.context.json === 'function') {
      const body = await fnError.context.json()
      if (body?.error) return body.error
    }
  } catch (_e) { /* si no se puede leer el detalle, usamos el mensaje genérico */ }
  return fnError.message || 'Error desconocido'
}

export default function DocentesList({ institucionFija } = {}) {
  const { isOnline } = usePresence()
  const [docentes, setDocentes] = useState([])
  const [instituciones, setInstituciones] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [deletingId, setDeletingId] = useState(null)
  const [editandoInstId, setEditandoInstId] = useState(null)
  const [guardandoInst, setGuardandoInst] = useState(false)

  useEffect(function () {
    loadDocentes()
  }, [])

  async function loadDocentes() {
    setLoading(true)
    setError('')

    const [profilesResult, instResult, relResult, coursesResult] = await Promise.all([
      supabase.from('profiles').select('id, full_name, email, whatsapp, last_active_at').eq('role', 'docente').order('full_name'),
      supabase.from('instituciones_educativas').select('id, nombre').order('nombre'),
      supabase.from('docente_instituciones').select('docente_id, institucion_id'),
      supabase.from('courses').select('id, docente_id, nombre, grado, grupo, asignaturas(areas_curriculares(nombre))').not('docente_id', 'is', null),
    ])

    if (profilesResult.error) {
      setError(profilesResult.error.message)
      setLoading(false)
      return
    }

    setInstituciones(instResult.error ? [] : instResult.data)

    const institucionesPorDocente = {} // docenteId -> [institucionId, ...]
    if (!relResult.error) {
      relResult.data.forEach(function (r) {
        if (!institucionesPorDocente[r.docente_id]) institucionesPorDocente[r.docente_id] = []
        institucionesPorDocente[r.docente_id].push(r.institucion_id)
      })
    }

    const areaMap = {}
    const cursosMap = {}
    if (!coursesResult.error) {
      coursesResult.data.forEach(function (c) {
        if (!areaMap[c.docente_id]) areaMap[c.docente_id] = c.asignaturas?.areas_curriculares?.nombre || null
        if (!cursosMap[c.docente_id]) cursosMap[c.docente_id] = []
        cursosMap[c.docente_id].push({ id: c.id, texto: `${c.nombre} ${c.grado}°${c.grupo}` })
      })
    }

    const enriched = profilesResult.data.map(function (d) {
      return {
        ...d,
        area: areaMap[d.id] || null,
        cursos: cursosMap[d.id] || [],
        institucionIds: institucionesPorDocente[d.id] || [],
      }
    })
    enriched.sort(function (a, b) { return compararPorApellido(a.full_name, b.full_name) })

    setDocentes(enriched)
    setLoading(false)
  }

  const [quitandoCursoId, setQuitandoCursoId] = useState(null)

  async function quitarDeAsignatura(docenteId, cursoId, textoAsignatura) {
    if (!confirm(`¿Quitar al docente de "${textoAsignatura}"? La Asignatura queda sin docente, no se borra nada más.`)) return
    setQuitandoCursoId(cursoId)
    const result = await supabase.from('courses').update({ docente_id: null }).eq('id', cursoId)
    if (result.error) {
      alert('Error: ' + result.error.message)
    } else {
      await loadDocentes()
    }
    setQuitandoCursoId(null)
  }

  async function guardarWhatsapp(id, valor) {
    const result = await supabase.from('profiles').update({ whatsapp: valor }).eq('id', id)
    if (result.error) alert('Error: ' + result.error.message)
    else setDocentes(function (prev) { return prev.map(function (d) { return d.id === id ? { ...d, whatsapp: valor } : d } ) })
  }

  async function toggleInstitucionDocente(docenteId, institucionId, yaLaTiene) {
    setGuardandoInst(true)
    if (yaLaTiene) {
      await supabase.from('docente_instituciones').delete().eq('docente_id', docenteId).eq('institucion_id', institucionId)
    } else {
      await supabase.from('docente_instituciones').insert({ docente_id: docenteId, institucion_id: institucionId })
    }
    await loadDocentes()
    setGuardandoInst(false)
  }

  async function handleDelete(id, nombre) {
    if (!confirm(`¿Eliminar la cuenta de "${nombre}"? Esta acción no se puede deshacer.`)) return
    setDeletingId(id)
    const { data, error: fnError } = await supabase.functions.invoke('delete-user', {
      body: { userId: id },
    })

    if (fnError) {
      const mensaje = await extraerMensajeError(fnError)
      alert('Error al eliminar: ' + mensaje)
    } else if (data.error) {
      alert('Error al eliminar: ' + data.error)
    } else {
      setDocentes(function (prev) { return prev.filter(function (d) { return d.id !== id }) })
    }
    setDeletingId(null)
  }

  const [reseteandoId, setReseteandoId] = useState(null)

  async function handleResetPassword(id, nombre) {
    if (!confirm(`¿Resetear la contraseña de "${nombre}"? Se va a generar una contraseña nueva.`)) return
    setReseteandoId(id)
    const { data, error: fnError } = await supabase.functions.invoke('reset-password', {
      body: { userId: id },
    })

    if (fnError) {
      const mensaje = await extraerMensajeError(fnError)
      alert('Error al resetear: ' + mensaje)
    } else if (data.error) {
      alert('Error al resetear: ' + data.error)
    } else {
      alert(`Nueva contraseña de ${nombre}:\n\n${data.password}\n\nCópiala ahora — no se va a volver a mostrar.`)
    }
    setReseteandoId(null)
  }

  if (loading) return <p className="text-slate-400 text-sm">Cargando docentes...</p>
  if (error) return <p className="text-red-500 text-sm">Error: {error}</p>

  const sinInstitucion = docentes.filter(function (d) { return d.institucionIds.length === 0 })

  function renderTable(items) {
    return (
      <table className="w-full text-sm">
        <thead>
          <tr style={{ borderBottom: '1px solid #E5E9F0' }}>
            <th className="text-left py-2 pr-3 font-semibold" style={{ color: NAVY_DARK }}>Nombre</th>
            <th className="text-left py-2 pr-3 font-semibold" style={{ color: NAVY_DARK }}>Correo</th>
            <th className="text-left py-2 pr-3 font-semibold" style={{ color: NAVY_DARK }}>Cursos a cargo</th>
            <th className="text-left py-2 pr-3 font-semibold" style={{ color: NAVY_DARK }}>Grupo de WhatsApp (padres)</th>
            <th className="text-right py-2 font-semibold" style={{ color: NAVY_DARK }}></th>
          </tr>
        </thead>
        <tbody>
          {items.map(function (d) {
            return (
              <tr key={d.id} style={{ borderBottom: '1px solid #F4F6F9' }}>
                <td className="py-2 pr-3 align-top" style={{ color: NAVY_DARK }}>
                  <span className="flex items-center gap-1.5">
                    {isOnline(d.id) && <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: '#22C55E' }} title="En línea" />}
                    {d.full_name}
                  </span>
                  {!institucionFija && (
                    <button
                      onClick={function () { setEditandoInstId(editandoInstId === d.id ? null : d.id) }}
                      className="text-[11px] font-semibold hover:underline mt-0.5 block"
                      style={{ color: NAVY }}
                    >
                      {editandoInstId === d.id ? 'Cerrar' : 'Editar instituciones'}
                    </button>
                  )}
                  {!institucionFija && editandoInstId === d.id && (
                    <div className="mt-2 p-2 rounded-lg space-y-1" style={{ backgroundColor: '#F4F6F9' }}>
                      {instituciones.map(function (inst) {
                        const marcado = d.institucionIds.includes(inst.id)
                        return (
                          <label key={inst.id} className="flex items-center gap-2 text-xs cursor-pointer">
                            <input
                              type="checkbox"
                              checked={marcado}
                              disabled={guardandoInst}
                              onChange={function () { toggleInstitucionDocente(d.id, inst.id, marcado) }}
                            />
                            <span style={{ color: NAVY_DARK }}>{inst.nombre}</span>
                          </label>
                        )
                      })}
                    </div>
                  )}
                </td>
                <td className="py-2 pr-3 align-top text-xs text-slate-500">{d.email || '—'}</td>
                <td className="py-2 pr-3 align-top">
                  {d.cursos.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {d.cursos.map(function (curso) {
                        return (
                          <span key={curso.id} className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: '#F4F6F9', color: NAVY_DARK, border: '1px solid #E5E9F0' }}>
                            {curso.texto}
                            <button
                              onClick={function () { quitarDeAsignatura(d.id, curso.id, curso.texto) }}
                              disabled={quitandoCursoId === curso.id}
                              title="Quitar de esta Asignatura"
                              className="w-3.5 h-3.5 rounded-full flex items-center justify-center leading-none disabled:opacity-50"
                              style={{ backgroundColor: '#B91C1C', color: 'white', fontSize: 9 }}
                            >
                              ×
                            </button>
                          </span>
                        )
                      })}
                    </div>
                  ) : '—'}
                </td>
                <td className="py-2 pr-3 align-top">
                  <input
                    type="text"
                    defaultValue={d.whatsapp || ''}
                    placeholder="https://chat.whatsapp.com/..."
                    className="w-56 rounded-lg px-2 py-1 text-xs outline-none"
                    style={{ backgroundColor: 'white', border: '1px solid #D6DCE5', color: NAVY_DARK }}
                    onBlur={function (e) { if (e.target.value !== (d.whatsapp || '')) guardarWhatsapp(d.id, e.target.value) }}
                  />
                </td>
                <td className="py-2 text-right align-top">
                  <div className="flex gap-2 justify-end">
                    <button
                      onClick={function () { handleResetPassword(d.id, d.full_name) }}
                      disabled={reseteandoId === d.id}
                      className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white transition hover:opacity-90 disabled:opacity-50"
                      style={{ backgroundColor: '#B45309' }}
                    >
                      {reseteandoId === d.id ? '...' : 'Resetear contraseña'}
                    </button>
                    <button
                      onClick={function () { handleDelete(d.id, d.full_name) }}
                      disabled={deletingId === d.id}
                      className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white transition hover:opacity-90 disabled:opacity-50"
                      style={{ backgroundColor: '#B91C1C' }}
                    >
                      {deletingId === d.id ? 'Eliminando...' : 'Eliminar'}
                    </button>
                  </div>
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
      <p className="text-sm text-slate-400 mb-6">
        {docentes.length} docente(s) registrado(s) en total.
      </p>

      {docentes.length === 0 ? (
        <p className="text-slate-400 text-sm">Aún no hay docentes registrados.</p>
      ) : (
        <div className="space-y-6">
          {instituciones.map(function (inst) {
            const items = docentes.filter(function (d) { return d.institucionIds.includes(inst.id) })
            if (items.length === 0) return null
            return (
              <div key={inst.id} className="bg-white rounded-2xl p-5" style={{ border: '1px solid #E5E9F0' }}>
                <h3
                  className="text-xs font-bold uppercase tracking-wide mb-3 px-3 py-1.5 rounded-lg inline-block"
                  style={{ backgroundColor: '#E7F3E4', color: GREEN_DARK }}
                >
                  {inst.nombre} ({items.length})
                </h3>
                {renderTable(items)}
              </div>
            )
          })}

          {!institucionFija && sinInstitucion.length > 0 && (
            <div className="bg-white rounded-2xl p-5" style={{ border: '1px solid #E5E9F0' }}>
              <h3
                className="text-xs font-bold uppercase tracking-wide mb-3 px-3 py-1.5 rounded-lg inline-block"
                style={{ backgroundColor: '#FDECEC', color: '#B91C1C' }}
              >
                Sin institución asignada ({sinInstitucion.length})
              </h3>
              {renderTable(sinInstitucion)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
