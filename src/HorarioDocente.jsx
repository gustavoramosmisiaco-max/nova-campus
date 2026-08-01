import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import { useAuth } from './AuthContext'

const NAVY_DARK = '#0F2A4A'

const DIAS = [null, 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
const COLORES = ['#1d5c8f', '#5DAA47', '#B45309', '#8a5cb0', '#B91C1C', '#0891B2']

function horaAMinutos(horaStr) {
  const [h, m] = horaStr.split(':').map(Number)
  return h * 60 + m
}

function formatearHora(horaStr) {
  const [h, m] = horaStr.split(':').map(Number)
  const ampm = h >= 12 ? 'pm' : 'am'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m).padStart(2, '0')}${ampm}`
}

export default function HorarioDocente() {
  const { session } = useAuth()
  const [loading, setLoading] = useState(true)
  const [bloques, setBloques] = useState([])

  useEffect(function () {
    cargar()
  }, [])

  async function cargar() {
    setLoading(true)
    const result = await supabase
      .from('courses')
      .select('id, nombre, grado, grupo, course_schedules(dia_semana, hora_inicio, hora_fin)')
      .eq('docente_id', session.user.id)

    const lista = []
    if (!result.error) {
      result.data.forEach(function (c, idx) {
        ;(c.course_schedules || []).forEach(function (h) {
          lista.push({
            courseNombre: `${c.nombre} (${c.grado}°${c.grupo})`,
            dia: h.dia_semana,
            inicio: h.hora_inicio,
            fin: h.hora_fin,
            color: COLORES[idx % COLORES.length],
          })
        })
      })
    }
    setBloques(lista)
    setLoading(false)
  }

  if (loading) return <p className="text-slate-400 text-sm">Cargando horario...</p>

  if (bloques.length === 0) {
    return (
      <div>
        <h2 className="text-2xl font-bold mb-2" style={{ color: NAVY_DARK }}>Mi Horario</h2>
        <div className="bg-white rounded-2xl p-10 text-center" style={{ border: '1px dashed #D6DCE5' }}>
          <p className="text-slate-400 text-sm">Todavía no hay horario cargado para tus cursos.</p>
        </div>
      </div>
    )
  }

  const diasConClases = [...new Set(bloques.map(function (b) { return b.dia }))].sort()
  const minInicio = Math.min(...bloques.map(function (b) { return horaAMinutos(b.inicio) }))
  const maxFin = Math.max(...bloques.map(function (b) { return horaAMinutos(b.fin) }))
  const rangoTotal = maxFin - minInicio
  const PX_POR_MINUTO = 1.3

  const horasMarcador = []
  for (let m = Math.floor(minInicio / 60) * 60; m <= maxFin; m += 60) {
    horasMarcador.push(m)
  }

  return (
    <div>
      <h2 className="text-2xl font-bold mb-5" style={{ color: NAVY_DARK }}>Mi Horario</h2>

      <div className="bg-white rounded-2xl p-4 overflow-x-auto" style={{ border: '1px solid #E5E9F0' }}>
        <div className="flex" style={{ minWidth: diasConClases.length * 160 + 50 }}>
          {/* Columna de horas */}
          <div style={{ width: 50, flexShrink: 0, position: 'relative', height: rangoTotal * PX_POR_MINUTO }}>
            {horasMarcador.map(function (m) {
              return (
                <div key={m} className="absolute text-xs text-slate-400" style={{ top: (m - minInicio) * PX_POR_MINUTO - 6 }}>
                  {String(Math.floor(m / 60)).padStart(2, '0')}:00
                </div>
              )
            })}
          </div>

          {/* Columnas de días */}
          {diasConClases.map(function (dia) {
            const bloquesDia = bloques.filter(function (b) { return b.dia === dia })
            return (
              <div key={dia} className="flex-1 px-1" style={{ minWidth: 160 }}>
                <p className="text-xs font-bold text-center mb-2 sticky top-0 py-1" style={{ color: NAVY_DARK, backgroundColor: 'white' }}>{DIAS[dia]}</p>
                <div className="relative" style={{ height: rangoTotal * PX_POR_MINUTO, borderLeft: '1px solid #F4F6F9' }}>
                  {horasMarcador.map(function (m) {
                    return <div key={m} className="absolute w-full" style={{ top: (m - minInicio) * PX_POR_MINUTO, borderTop: '1px dashed #F4F6F9' }} />
                  })}
                  {bloquesDia.map(function (b, i) {
                    const top = (horaAMinutos(b.inicio) - minInicio) * PX_POR_MINUTO
                    const height = (horaAMinutos(b.fin) - horaAMinutos(b.inicio)) * PX_POR_MINUTO
                    return (
                      <div
                        key={i}
                        className="absolute left-0 right-0 rounded-lg px-2 py-1 mx-0.5 overflow-hidden"
                        style={{ top: top, height: Math.max(height, 24), backgroundColor: b.color, opacity: 0.9 }}
                      >
                        <p className="text-white text-xs font-semibold leading-tight">{b.courseNombre}</p>
                        <p className="text-white text-xs" style={{ opacity: 0.85 }}>{formatearHora(b.inicio)}-{formatearHora(b.fin)}</p>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
