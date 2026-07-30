import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import { useAuth } from './AuthContext'

const NAVY_DARK = '#0F2A4A'
const GREEN = '#5DAA47'

export default function ComunicadoPopup() {
  const { session } = useAuth()
  const [cola, setCola] = useState([])

  useEffect(function () {
    if (session?.user?.id) cargar()
  }, [session?.user?.id])

  async function cargar() {
    const enrollResult = await supabase
      .from('enrollments')
      .select('course:courses(grado, grupo, asignaturas(area_id))')
      .eq('student_id', session.user.id)
      .eq('status', 'activo')
    if (enrollResult.error || enrollResult.data.length === 0) return

    const combos = enrollResult.data.map(function (e) {
      return { grado: e.course.grado, grupo: e.course.grupo, areaId: e.course.asignaturas?.area_id }
    })
    const gradosGrupos = [...new Set(combos.map(function (c) { return `${c.grado}__${c.grupo}` }))]

    let query = supabase
      .from('comunicados')
      .select('*')
      .or(`student_id.eq.${session.user.id},student_id.is.null`)
      .order('created_at', { ascending: true })

    const result = await query
    if (result.error) return

    const relevantes = result.data.filter(function (c) {
      if (c.student_id === session.user.id) return true
      const enCombo = gradosGrupos.includes(`${c.grado}__${c.grupo}`)
      if (!enCombo) return false
      if (!c.area_id) return true
      return combos.some(function (combo) { return combo.grado === c.grado && combo.grupo === c.grupo && combo.areaId === c.area_id })
    })

    if (relevantes.length === 0) return

    const leidasResult = await supabase.from('comunicados_lecturas').select('comunicado_id').eq('student_id', session.user.id)
    const idsLeidos = new Set((leidasResult.data || []).map(function (l) { return l.comunicado_id }))

    const pendientes = relevantes.filter(function (c) { return !idsLeidos.has(c.id) })
    setCola(pendientes)
  }

  async function handleCerrar() {
    const actual = cola[0]
    await supabase.from('comunicados_lecturas').insert({ comunicado_id: actual.id, student_id: session.user.id })
    setCola(function (prev) { return prev.slice(1) })
  }

  if (cola.length === 0) return null
  const comunicado = cola[0]

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(15,42,74,0.75)' }}>
      <div className="bg-white rounded-2xl p-6 max-w-md w-full text-center" style={{ animation: 'nova-popin 0.3s ease' }}>
        <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: '#FFF7E6' }}>
          <span style={{ fontSize: 28 }}>📢</span>
        </div>
        <h2 className="text-lg font-bold mb-2" style={{ color: NAVY_DARK }}>{comunicado.titulo}</h2>
        <p className="text-sm text-slate-600 whitespace-pre-wrap">{comunicado.mensaje}</p>
        <p className="text-xs text-slate-400 mt-3">{new Date(comunicado.created_at).toLocaleDateString('es-PE')}</p>
        <button
          onClick={handleCerrar}
          className="mt-5 text-sm font-semibold px-6 py-2.5 rounded-xl text-white transition hover:opacity-90"
          style={{ backgroundColor: GREEN }}
        >
          Entendido{cola.length > 1 ? ` (${cola.length - 1} más)` : ''}
        </button>
        <style>{`@keyframes nova-popin { from { opacity: 0; transform: scale(0.9); } to { opacity: 1; transform: scale(1); } }`}</style>
      </div>
    </div>
  )
}
