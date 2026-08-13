import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'

const NAVY_DARK = '#0F172A'
const NAVY = '#2563EB'
const GREEN = '#22C55E'
const GREEN_DARK = '#16A34A'

const inputStyle = { backgroundColor: 'white', border: '1px solid #D6DCE5', color: NAVY_DARK }

export default function AsignaturasManager({ institucionFija } = {}) {
  const [areas, setAreas] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(null)
  const [showNueva, setShowNueva] = useState(false)
  const [nuevaAreaId, setNuevaAreaId] = useState('')
  const [nuevaNombre, setNuevaNombre] = useState('')
  const [creando, setCreando] = useState(false)

  useEffect(function () {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    const areasResult = await supabase
      .from('areas_curriculares')
      .select('*, asignaturas(id, nombre, activo, institucion_id)')
      .order('orden', { ascending: true })

    if (areasResult.error) {
      setError(areasResult.error.message)
    } else {
      const sorted = areasResult.data.map(function (area) {
        const asignaturasVisibles = institucionFija
          ? area.asignaturas.filter(function (a) { return !a.institucion_id || a.institucion_id === institucionFija })
          : area.asignaturas
        return {
          ...area,
          asignaturas: [...asignaturasVisibles].sort(function (a, b) { return a.nombre.localeCompare(b.nombre) }),
        }
      })
      setAreas(sorted)
      if (!nuevaAreaId && sorted.length > 0) setNuevaAreaId(sorted[0].id)
    }
    setLoading(false)
  }

  async function crearAsignatura() {
    if (!nuevaNombre.trim() || !nuevaAreaId) return
    setCreando(true)
    const result = await supabase.from('asignaturas').insert({
      nombre: nuevaNombre.trim(),
      area_id: nuevaAreaId,
      activo: true,
      institucion_id: institucionFija || null,
    })
    if (result.error) {
      alert('Error al crear: ' + result.error.message)
    } else {
      setNuevaNombre('')
      setShowNueva(false)
      loadData()
    }
    setCreando(false)
  }

  async function toggleAsignatura(asignaturaId, currentValue) {
    setSaving(asignaturaId)
    const result = await supabase
      .from('asignaturas')
      .update({ activo: !currentValue })
      .eq('id', asignaturaId)

    if (result.error) {
      alert('Error al actualizar: ' + result.error.message)
    } else {
      setAreas(function (prev) {
        return prev.map(function (area) {
          return {
            ...area,
            asignaturas: area.asignaturas.map(function (a) {
              return a.id === asignaturaId ? { ...a, activo: !currentValue } : a
            }),
          }
        })
      })
    }
    setSaving(null)
  }

  async function toggleArea(areaId, currentValue) {
    setSaving('area_' + areaId)
    const nuevoValor = !currentValue

    const areaResult = await supabase.from('areas_curriculares').update({ activo: nuevoValor }).eq('id', areaId)
    if (areaResult.error) {
      alert('Error al actualizar el área: ' + areaResult.error.message)
      setSaving(null)
      return
    }

    // Se apagan/prenden todas las asignaturas de esta área en cascada
    const asigResult = await supabase.from('asignaturas').update({ activo: nuevoValor }).eq('area_id', areaId)
    if (asigResult.error) {
      alert('Error al actualizar las asignaturas: ' + asigResult.error.message)
      setSaving(null)
      return
    }

    setAreas(function (prev) {
      return prev.map(function (area) {
        if (area.id !== areaId) return area
        return {
          ...area,
          activo: nuevoValor,
          asignaturas: area.asignaturas.map(function (a) { return { ...a, activo: nuevoValor } }),
        }
      })
    })
    setSaving(null)
  }

  if (loading) return <p className="text-slate-400 text-sm">Cargando asignaturas...</p>
  if (error) return <p className="text-red-500 text-sm">Error: {error}</p>

  return (
    <div>
      <div className="flex justify-between items-start gap-3 flex-wrap mb-2">
        <h2 className="text-2xl font-bold" style={{ color: NAVY_DARK }}>Asignaturas</h2>
        <button
          onClick={function () { setShowNueva(!showNueva) }}
          className="text-sm font-semibold px-4 py-2 rounded-lg text-white transition hover:opacity-90"
          style={{ backgroundColor: GREEN }}
        >
          {showNueva ? 'Cancelar' : '+ Nueva Asignatura'}
        </button>
      </div>
      <p className="text-sm text-slate-400 mb-6">
        {institucionFija
          ? 'Aquí puedes agregar Asignaturas nuevas al catálogo (por ejemplo, "Botánica"). Para activarlas o desactivarlas en tu institución, usa "Habilitar Cursos".'
          : 'Activa o desactiva qué asignaturas están disponibles en la plataforma. Las desactivadas dejan de mostrarse a docentes y estudiantes, sin borrar nada.'}
      </p>

      {showNueva && (
        <div className="bg-white rounded-2xl p-5 mb-6" style={{ border: '1px solid #E5E9F0' }}>
          <p className="text-sm font-bold mb-3" style={{ color: NAVY_DARK }}>Nueva Asignatura</p>
          <div className="grid sm:grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: NAVY_DARK }}>Área</label>
              <select value={nuevaAreaId} onChange={function (e) { setNuevaAreaId(e.target.value) }} className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={inputStyle}>
                {areas.map(function (a) { return <option key={a.id} value={a.id}>{a.nombre}</option> })}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: NAVY_DARK }}>Nombre de la Asignatura</label>
              <input type="text" value={nuevaNombre} onChange={function (e) { setNuevaNombre(e.target.value) }} placeholder="Ej: Botánica" className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={inputStyle} />
            </div>
          </div>
          <button
            onClick={crearAsignatura}
            disabled={creando || !nuevaNombre.trim()}
            className="text-sm font-semibold px-4 py-2 rounded-lg text-white transition hover:opacity-90 disabled:opacity-50"
            style={{ background: `linear-gradient(90deg, ${NAVY}, ${GREEN})` }}
          >
            {creando ? 'Creando...' : 'Crear Asignatura'}
          </button>
        </div>
      )}

      <div className="space-y-5">
        {areas.map(function (area) {
          const areaSaving = saving === 'area_' + area.id
          return (
            <div key={area.id} className="bg-white rounded-2xl p-5" style={{ border: '1px solid #E5E9F0', opacity: area.activo ? 1 : 0.6 }}>
              <div className="flex justify-between items-center mb-3">
                <h3 className="text-sm font-bold" style={{ color: GREEN_DARK }}>{area.nombre}</h3>
                {!institucionFija && (
                  <button
                    onClick={function () { toggleArea(area.id, area.activo) }}
                    disabled={areaSaving}
                    className="flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-lg transition disabled:opacity-60"
                    style={{ backgroundColor: area.activo ? '#E7F3E4' : '#FDECEC', color: area.activo ? GREEN_DARK : '#B91C1C' }}
                  >
                    {area.activo ? 'Área activa' : 'Área desactivada'}
                    <span
                      className="relative inline-flex items-center rounded-full transition-colors flex-shrink-0"
                      style={{ width: 34, height: 19, backgroundColor: area.activo ? GREEN : '#CBD5E1' }}
                    >
                      <span
                        className="absolute rounded-full bg-white transition-transform"
                        style={{ width: 14, height: 14, top: 2.5, transform: area.activo ? 'translateX(17px)' : 'translateX(3px)' }}
                      />
                    </span>
                  </button>
                )}
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {area.asignaturas.map(function (a) {
                  const isSaving = saving === a.id
                  if (institucionFija) {
                    return (
                      <div
                        key={a.id}
                        className="rounded-xl px-3 py-2.5"
                        style={{ backgroundColor: '#F4F6F9', border: '1px solid #E5E9F0' }}
                      >
                        <span className="text-sm font-medium" style={{ color: NAVY_DARK }}>{a.nombre}</span>
                      </div>
                    )
                  }
                  return (
                    <button
                      key={a.id}
                      onClick={function () { toggleAsignatura(a.id, a.activo) }}
                      disabled={isSaving}
                      className="flex items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-left transition disabled:opacity-60"
                      style={{
                        backgroundColor: a.activo ? '#F4F6F9' : '#FDECEC',
                        border: `1px solid ${a.activo ? '#E5E9F0' : '#F5C6C6'}`,
                      }}
                    >
                      <span className="text-sm font-medium" style={{ color: NAVY_DARK }}>{a.nombre}</span>
                      <span
                        className="relative inline-flex items-center rounded-full transition-colors flex-shrink-0"
                        style={{ width: 38, height: 21, backgroundColor: a.activo ? GREEN : '#CBD5E1' }}
                      >
                        <span
                          className="absolute rounded-full bg-white transition-transform"
                          style={{
                            width: 16, height: 16, top: 2.5,
                            transform: a.activo ? 'translateX(19px)' : 'translateX(3px)',
                          }}
                        />
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
