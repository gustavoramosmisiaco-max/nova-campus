import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'

const NAVY_DARK = '#0F172A'
const NAVY = '#2563EB'
const GREEN = '#22C55E'

const inputStyle = { backgroundColor: 'white', border: '1px solid #D6DCE5', color: NAVY_DARK }

const DIAS = [null, 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
const COLORES = ['#EAF2FB', '#EDF9F1', '#FFF8ED', '#F2F0FE', '#FCEDF3', '#F0F6E4', '#FBEEE8']

// Cada combinación define qué días se muestran y a qué hora empieza el primer bloque
const CONFIG_CALENDARIO = {
  'interdiario__presencial': { dias: [1, 3, 5], horaInicioMin: 8 * 60, label: 'Interdiario (L-M-V) · Presencial · 8:00 a.m.' },
  'interdiario__virtual': { dias: [1, 2, 3, 4, 5], horaInicioMin: 15 * 60, label: 'Lunes a Viernes · Virtual · 3:00 p.m.' },
  'sabado__presencial': { dias: [6], horaInicioMin: 8 * 60, label: 'Solo Sábado · Presencial · 8:00 a.m.' },
  'sabado__virtual': { dias: [6], horaInicioMin: 14 * 60, label: 'Solo Sábado · Virtual · 2:00 p.m.' },
}

function horaBloque(horaInicioMin, bloque) {
  const inicioMin = horaInicioMin + (bloque - 1) * 45
  const finMin = inicioMin + 45
  function fmt(min) {
    const h = Math.floor(min / 60)
    const m = min % 60
    const h12 = h > 12 ? h - 12 : (h === 0 ? 12 : h)
    const ampm = h >= 12 ? 'p.m.' : 'a.m.'
    return `${h12}:${m.toString().padStart(2, '0')} ${ampm}`
  }
  return `${fmt(inicioMin)} - ${fmt(finMin)}`
}

export default function HorarioVerano() {
  const [loading, setLoading] = useState(true)
  const [talleres, setTalleres] = useState([])
  const [horarioTodo, setHorarioTodo] = useState([])
  const [nivel, setNivel] = useState('primaria')
  const [tipoHorario, setTipoHorario] = useState('interdiario')
  const [modalidad, setModalidad] = useState('presencial')
  const [arrastrando, setArrastrando] = useState(null)
  const [mensaje, setMensaje] = useState('')

  useEffect(function () {
    cargar()
  }, [])

  async function cargar() {
    setLoading(true)
    const [talResult, horResult] = await Promise.all([
      supabase.from('talleres_verano').select('id, nombre, docente_id, modalidad, docente:profiles!talleres_verano_docente_id_fkey(full_name)').eq('activo', true).order('nombre'),
      supabase.from('horario_verano').select('*'),
    ])
    if (!talResult.error) setTalleres(talResult.data)
    if (!horResult.error) setHorarioTodo(horResult.data)
    setLoading(false)
  }

  const configKey = `${tipoHorario}__${modalidad}`
  const config = CONFIG_CALENDARIO[configKey]
  const horario = horarioTodo.filter(function (h) { return h.nivel === nivel && h.modalidad === modalidad && h.tipo_horario === tipoHorario })
  // Solo se pueden usar talleres que coincidan con la modalidad del calendario actual
  const talleresDisponibles = talleres.filter(function (t) { return t.modalidad === modalidad })

  function celda(dia, bloque) {
    return horario.find(function (h) { return h.dia_semana === dia && h.bloque === bloque })
  }

  function tallerDe(id) {
    return talleres.find(function (t) { return t.id === id })
  }

  function hayChoqueDocente(dia, bloque, tallerId, excluirHorarioId) {
    const t = tallerDe(tallerId)
    if (!t || !t.docente_id) return false
    return horarioTodo.some(function (h) {
      if (h.id === excluirHorarioId) return false
      if (h.dia_semana !== dia || h.bloque !== bloque) return false
      const otro = tallerDe(h.taller_id)
      return otro && otro.docente_id === t.docente_id
    })
  }

  function handleDragStartSidebar(tallerId) {
    setArrastrando({ tallerId: tallerId, origenId: null })
  }

  function handleDragStartCelda(h) {
    setArrastrando({ tallerId: h.taller_id, origenId: h.id })
  }

  async function handleDrop(dia, bloque) {
    if (!arrastrando) return
    setMensaje('')

    if (hayChoqueDocente(dia, bloque, arrastrando.tallerId, arrastrando.origenId)) {
      setMensaje('⚠️ El docente de ese taller ya tiene otra clase en ese mismo horario (en cualquiera de los 8 calendarios). No se movió.')
      setArrastrando(null)
      return
    }

    const existente = celda(dia, bloque)
    if (existente && existente.taller_id !== arrastrando.tallerId) {
      setMensaje('Ya hay un taller en esa casilla. Quítalo primero.')
      setArrastrando(null)
      return
    }

    if (arrastrando.origenId) {
      await supabase.from('horario_verano').delete().eq('id', arrastrando.origenId)
    }
    const insertResult = await supabase.from('horario_verano').insert({
      taller_id: arrastrando.tallerId, dia_semana: dia, bloque: bloque,
      nivel: nivel, modalidad: modalidad, tipo_horario: tipoHorario,
    })
    if (insertResult.error) {
      setMensaje('No se pudo colocar: ' + insertResult.error.message)
    }
    setArrastrando(null)
    cargar()
  }

  async function quitarDeCelda(horarioId) {
    await supabase.from('horario_verano').delete().eq('id', horarioId)
    cargar()
  }

  if (loading) return <p className="text-slate-400 text-sm">Cargando...</p>

  return (
    <div>
      <h2 className="text-2xl font-bold mb-2" style={{ color: NAVY_DARK }}>Horario — Cursos de Verano</h2>
      <p className="text-sm text-slate-400 mb-5">Son 8 calendarios independientes. Elige cuál estás armando, y arrastra los talleres a las casillas.</p>

      <div className="grid sm:grid-cols-3 gap-3 mb-5 max-w-2xl">
        <div>
          <label className="block text-xs font-medium mb-1" style={{ color: NAVY_DARK }}>Nivel</label>
          <select value={nivel} onChange={function (e) { setNivel(e.target.value) }} className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={inputStyle}>
            <option value="primaria">Primaria</option>
            <option value="secundaria">Secundaria</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium mb-1" style={{ color: NAVY_DARK }}>Tipo de horario</label>
          <select value={tipoHorario} onChange={function (e) { setTipoHorario(e.target.value) }} className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={inputStyle}>
            <option value="interdiario">Interdiario (L-M-V)</option>
            <option value="sabado">Solo Sábado</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium mb-1" style={{ color: NAVY_DARK }}>Modalidad</label>
          <select value={modalidad} onChange={function (e) { setModalidad(e.target.value) }} className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={inputStyle}>
            <option value="presencial">Presencial</option>
            <option value="virtual">Virtual</option>
          </select>
        </div>
      </div>

      <p className="text-sm font-semibold mb-4" style={{ color: NAVY }}>
        Editando: {nivel === 'primaria' ? 'Primaria' : 'Secundaria'} · {config.label}
      </p>

      {mensaje && (
        <p className="text-sm rounded-lg p-3 mb-4" style={{ backgroundColor: '#FDECEC', color: '#B91C1C' }}>{mensaje}</p>
      )}

      <div className="flex gap-5 flex-col lg:flex-row">
        <div className="lg:w-64 flex-shrink-0">
          <p className="text-sm font-bold mb-3" style={{ color: NAVY_DARK }}>
            Talleres {modalidad === 'virtual' ? 'virtuales' : 'presenciales'} disponibles
          </p>
          {talleresDisponibles.length === 0 ? (
            <p className="text-xs text-slate-400">No tienes talleres con modalidad "{modalidad}" creados todavía.</p>
          ) : (
            <div className="space-y-2">
              {talleresDisponibles.map(function (t, i) {
                return (
                  <div
                    key={t.id}
                    draggable
                    onDragStart={function () { handleDragStartSidebar(t.id) }}
                    className="rounded-xl p-3 cursor-grab active:cursor-grabbing"
                    style={{ backgroundColor: COLORES[i % COLORES.length], border: '1px solid #E5E9F0' }}
                  >
                    <p className="text-xs font-semibold" style={{ color: NAVY_DARK }}>{t.nombre}</p>
                    {t.docente && <p className="text-[10px] text-slate-500 mt-0.5">👤 {t.docente.full_name}</p>}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-x-auto">
          <table className="w-full text-xs border-collapse" style={{ minWidth: config.dias.length > 3 ? 700 : 400 }}>
            <thead>
              <tr>
                <th className="p-2"></th>
                {config.dias.map(function (dia) {
                  return <th key={dia} className="p-2 text-center font-semibold" style={{ color: NAVY_DARK }}>{DIAS[dia]}</th>
                })}
              </tr>
            </thead>
            <tbody>
              {[1, 2, 3, 4, 5, 6].map(function (bloque) {
                return (
                  <tr key={bloque}>
                    <td className="p-2 text-right font-medium whitespace-nowrap" style={{ color: '#94A3B8' }}>{horaBloque(config.horaInicioMin, bloque)}</td>
                    {config.dias.map(function (dia) {
                      const h = celda(dia, bloque)
                      const t = h ? tallerDe(h.taller_id) : null
                      const idx = t ? talleres.findIndex(function (x) { return x.id === t.id }) : 0
                      return (
                        <td
                          key={dia}
                          onDragOver={function (e) { e.preventDefault() }}
                          onDrop={function () { handleDrop(dia, bloque) }}
                          className="p-1 align-top"
                          style={{ border: '1px solid #F0F0F0', height: 56, minWidth: 100 }}
                        >
                          {t ? (
                            <div
                              draggable
                              onDragStart={function () { handleDragStartCelda(h) }}
                              className="rounded-lg p-1.5 h-full cursor-grab active:cursor-grabbing relative group"
                              style={{ backgroundColor: COLORES[idx % COLORES.length], border: '1px solid #D6DCE5' }}
                            >
                              <p className="text-[10px] font-semibold leading-tight" style={{ color: NAVY_DARK }}>{t.nombre}</p>
                              <button
                                onClick={function () { quitarDeCelda(h.id) }}
                                className="absolute top-0.5 right-0.5 text-[10px] w-4 h-4 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
                                style={{ backgroundColor: '#B91C1C', color: 'white' }}
                              >
                                ×
                              </button>
                            </div>
                          ) : null}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
