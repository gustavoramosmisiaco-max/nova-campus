import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import { useAuth } from './AuthContext'

const NAVY_DARK = '#0F2A4A'
const GREEN = '#5DAA47'

const inputStyle = { backgroundColor: 'white', border: '1px solid #D6DCE5', color: NAVY_DARK }

export default function BloqueoPanel({ children }) {
  const { session, profile } = useAuth()
  const [checking, setChecking] = useState(true)
  const [bloqueo, setBloqueo] = useState(null) // { unidadTexto, tareas: [{titulo, asignatura, docenteWhatsapp}] }
  const [codigo, setCodigo] = useState('')
  const [errorCodigo, setErrorCodigo] = useState('')

  useEffect(function () {
    if (profile?.role === 'estudiante') verificarBloqueo()
    else setChecking(false)
  }, [profile])

  async function verificarBloqueo() {
    setChecking(true)

    const enrollResult = await supabase
      .from('enrollments')
      .select('course:courses!inner(id, nombre, grado, grupo, docente:profiles(full_name, whatsapp), asignaturas!inner(area_id, areas_curriculares(nombre)))')
      .eq('student_id', session.user.id)
      .eq('status', 'activo')

    if (enrollResult.error || enrollResult.data.length === 0) {
      setChecking(false)
      return
    }

    // Agrupar cursos por Área+Grado+Sección (para saber sus unidades compartidas)
    const gruposArea = {}
    const courseInfoMap = {}
    enrollResult.data.forEach(function (e) {
      const c = e.course
      courseInfoMap[c.id] = c
      const key = `${c.asignaturas.area_id}__${c.grado}__${c.grupo}`
      if (!gruposArea[key]) gruposArea[key] = { areaId: c.asignaturas.area_id, grado: c.grado, grupo: c.grupo, courseIds: [] }
      gruposArea[key].courseIds.push(c.id)
    })

    for (const key of Object.keys(gruposArea)) {
      const grupo = gruposArea[key]

      const unidResult = await supabase
        .from('unidades')
        .select('id, tipo, numero, nombre')
        .eq('area_id', grupo.areaId)
        .eq('grado', grupo.grado)
        .eq('grupo', grupo.grupo)
      if (unidResult.error) continue

      for (const unidad of unidResult.data) {
        const actResult = await supabase
          .from('actividades')
          .select('id, course_id')
          .eq('unidad_id', unidad.id)
          .in('course_id', grupo.courseIds)
        if (actResult.error || actResult.data.length === 0) continue

        const actIds = actResult.data.map(function (a) { return a.id })
        const assignResult = await supabase
          .from('assignments')
          .select('id, titulo, fecha_entrega, course_id')
          .in('actividad_id', actIds)
          .lt('fecha_entrega', new Date().toISOString())
        if (assignResult.error || assignResult.data.length === 0) continue

        const assignmentIds = assignResult.data.map(function (a) { return a.id })
        const subsResult = await supabase
          .from('submissions')
          .select('assignment_id')
          .eq('student_id', session.user.id)
          .in('assignment_id', assignmentIds)
        const entregadas = new Set((subsResult.data || []).map(function (s) { return s.assignment_id }))

        const faltantes = assignResult.data.filter(function (a) { return !entregadas.has(a.id) })

        if (faltantes.length >= 2) {
          const unidadTexto = `${unidad.tipo} ${unidad.numero}${unidad.nombre ? ' · ' + unidad.nombre : ''}`
          const tareas = faltantes.map(function (a) {
            const course = courseInfoMap[a.course_id]
            return {
              titulo: a.titulo,
              asignatura: course?.nombre || '',
              docenteNombre: course?.docente?.full_name || '',
              docenteWhatsapp: course?.docente?.whatsapp || '',
            }
          })

          // ¿Ya fue destrabado antes con el mismo número de faltantes?
          const storageKey = `nova_desbloqueo_${unidad.id}`
          const guardado = localStorage.getItem(storageKey)
          if (guardado === String(faltantes.length)) {
            continue // sigue destrabado, no bloquea de nuevo
          }

          setBloqueo({ unidadId: unidad.id, unidadTexto: unidadTexto, tareas: tareas, cantidadFaltantes: faltantes.length })
          setChecking(false)
          return
        }
      }
    }

    setChecking(false)
  }

  async function handleVerificarCodigo(e) {
    e.preventDefault()
    setErrorCodigo('')

    const result = await supabase.from('profiles').select('codigo_padre').eq('id', session.user.id).single()
    if (result.error || !result.data.codigo_padre) {
      setErrorCodigo('No se pudo verificar el código. Contacta al colegio.')
      return
    }

    if (codigo.trim().toUpperCase() === result.data.codigo_padre.toUpperCase()) {
      localStorage.setItem(`nova_desbloqueo_${bloqueo.unidadId}`, String(bloqueo.cantidadFaltantes))
      setBloqueo(null)
      setCodigo('')
    } else {
      setErrorCodigo('Código incorrecto. Verifica con tu padre/apoderado.')
    }
  }

  if (checking) return <p className="text-slate-400 text-sm p-6">Cargando...</p>

  if (!bloqueo) return children

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(15,42,74,0.92)' }}>
      <div className="bg-white rounded-2xl p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="text-center mb-4">
          <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-3" style={{ backgroundColor: '#FDECEC' }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#B91C1C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>
          <h2 className="text-lg font-bold" style={{ color: NAVY_DARK }}>Panel bloqueado</h2>
          <p className="text-sm text-slate-500 mt-1">
            No se presentaron {bloqueo.cantidadFaltantes} tareas en <strong>{bloqueo.unidadTexto}</strong>.
          </p>
        </div>

        <div className="rounded-xl p-3 mb-4" style={{ backgroundColor: '#F4F6F9' }}>
          <ul className="space-y-1.5">
            {bloqueo.tareas.map(function (t, i) {
              return (
                <li key={i} className="text-xs">
                  <p style={{ color: NAVY_DARK }}><strong>{t.titulo}</strong> — {t.asignatura}</p>
                  {t.docenteWhatsapp && (
                    <a
                      href={t.docenteWhatsapp}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 mt-1 text-xs font-semibold px-2 py-1 rounded-lg text-white transition hover:opacity-90"
                      style={{ backgroundColor: '#25D366' }}
                    >
                      💬 Grupo de padres — {t.docenteNombre}
                    </a>
                  )}
                </li>
              )
            })}
          </ul>
        </div>

        <form onSubmit={handleVerificarCodigo}>
          <label className="block text-xs font-medium mb-1" style={{ color: NAVY_DARK }}>
            Código de padre/apoderado (pídeselo a él)
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={codigo}
              onChange={function (e) { setCodigo(e.target.value) }}
              placeholder="Ej: A3F9K2"
              required
              className="flex-1 rounded-lg px-3 py-2 text-sm outline-none uppercase"
              style={inputStyle}
            />
            <button type="submit" className="text-sm font-semibold px-4 py-2 rounded-lg text-white transition hover:opacity-90" style={{ backgroundColor: GREEN }}>
              Ingresar
            </button>
          </div>
          {errorCodigo && <p className="text-xs mt-2" style={{ color: '#B91C1C' }}>{errorCodigo}</p>}
        </form>
      </div>
    </div>
  )
}
