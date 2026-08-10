import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import { useAuth } from './AuthContext'
import RegistroAuxiliarPorArea from './RegistroAuxiliarPorArea'
import ImportarEstudiantes from './ImportarEstudiantes'

const NAVY_DARK = '#0F172A'
const NAVY = '#2563EB'
const GREEN = '#22C55E'
const GREEN_DARK = '#16A34A'

function gradoLabel(g) {
  return g ? `${g}° Secundaria` : 'Sin grado'
}

export default function CoordinadorDashboard() {
  const { session, profile, logout } = useAuth()
  const [loading, setLoading] = useState(true)
  const [institucion, setInstitucion] = useState(null)
  const [cursos, setCursos] = useState([])
  const [conducta, setConducta] = useState([])
  const [tab, setTab] = useState('docentes')
  const [cursoSel, setCursoSel] = useState(null)

  useEffect(function () {
    cargar()
  }, [])

  async function cargar() {
    setLoading(true)
    const instResult = await supabase.from('profiles').select('institucion_id, instituciones_educativas!profiles_institucion_id_fkey(nombre)').eq('id', session.user.id).single()
    const institucionId = instResult.data?.institucion_id
    setInstitucion(instResult.data?.instituciones_educativas || null)

    if (institucionId) {
      const cursosResult = await supabase
        .from('courses')
        .select('id, nombre, grado, grupo, docente:profiles(id, full_name), asignaturas(areas_curriculares(nombre)), enrollments(count)')
        .eq('institucion_id', institucionId)
        .order('grado')
        .order('grupo')
      if (!cursosResult.error) setCursos(cursosResult.data)

      const conductaResult = await supabase
        .from('conductas_registro')
        .select('id, descripcion, created_at, student_id, course_id')
        .in('course_id', (cursosResult.data || []).map(function (c) { return c.id }))
        .order('created_at', { ascending: false })
        .limit(50)
      if (!conductaResult.error) {
        const studentIds = [...new Set(conductaResult.data.map(function (r) { return r.student_id }))]
        const cursosPorId = {}
        ;(cursosResult.data || []).forEach(function (c) { cursosPorId[c.id] = c })
        let nombresMap = {}
        if (studentIds.length > 0) {
          const nombresResult = await supabase.from('profiles').select('id, full_name').in('id', studentIds)
          if (!nombresResult.error) nombresResult.data.forEach(function (p) { nombresMap[p.id] = p.full_name })
        }
        setConducta(conductaResult.data.map(function (r) {
          return { ...r, studentNombre: nombresMap[r.student_id] || 'Estudiante', curso: cursosPorId[r.course_id] }
        }))
      }
    }
    setLoading(false)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#F4F6F9' }}>
        <p className="text-slate-400 text-sm">Cargando...</p>
      </div>
    )
  }

  if (!institucion) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ backgroundColor: '#F4F6F9' }}>
        <div className="bg-white rounded-2xl p-8 max-w-md text-center" style={{ border: '1px solid #E5E9F0' }}>
          <p className="text-sm text-slate-500 mb-4">Tu cuenta de Coordinador todavía no tiene una institución asignada. Pídele al Admin que la configure.</p>
          <button onClick={logout} className="text-sm font-semibold px-4 py-2 rounded-lg text-white" style={{ backgroundColor: NAVY }}>Salir</button>
        </div>
      </div>
    )
  }

  // Agrupar cursos por docente
  const docentesMap = {}
  cursos.forEach(function (c) {
    if (!c.docente) return
    if (!docentesMap[c.docente.id]) docentesMap[c.docente.id] = { docente: c.docente, cursos: [] }
    docentesMap[c.docente.id].cursos.push(c)
  })
  const docentesLista = Object.values(docentesMap)
  const sinDocente = cursos.filter(function (c) { return !c.docente })

  if (cursoSel) {
    return (
      <div className="min-h-screen" style={{ backgroundColor: '#F4F6F9' }}>
        <header className="flex items-center justify-between px-6 py-4 bg-white" style={{ borderBottom: '1px solid #E5E9F0' }}>
          <p className="font-bold text-sm" style={{ color: NAVY_DARK }}>Nexoris Academy — Coordinador</p>
          <button onClick={logout} className="text-xs font-semibold px-4 py-2 rounded-lg transition" style={{ backgroundColor: '#F4F6F9', color: NAVY_DARK, border: '1px solid #D6DCE5' }}>Salir</button>
        </header>
        <main className="p-6 max-w-5xl mx-auto">
          <button onClick={function () { setCursoSel(null) }} className="text-sm font-semibold mb-4 hover:underline" style={{ color: NAVY }}>← Volver</button>
          <div className="bg-white rounded-2xl p-6" style={{ border: '1px solid #E5E9F0' }}>
            <RegistroAuxiliarPorArea courseId={cursoSel.id} />
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#F4F6F9' }}>
      <header className="flex items-center justify-between px-6 py-4 bg-white" style={{ borderBottom: '1px solid #E5E9F0' }}>
        <div>
          <p className="font-bold text-sm" style={{ color: NAVY_DARK }}>Nexoris Academy — Coordinador</p>
          <p className="text-xs" style={{ color: GREEN_DARK }}>{institucion.nombre} · {profile?.full_name}</p>
        </div>
        <button onClick={logout} className="text-xs font-semibold px-4 py-2 rounded-lg transition" style={{ backgroundColor: '#F4F6F9', color: NAVY_DARK, border: '1px solid #D6DCE5' }}>Salir</button>
      </header>

      <main className="p-6 max-w-5xl mx-auto">
        <h2 className="text-2xl font-bold mb-1" style={{ color: NAVY_DARK }}>Panel de Supervisión</h2>
        <p className="text-sm text-slate-400 mb-6">Solo puedes ver información — cualquier edición de notas o asistencia la hace el docente correspondiente.</p>

        <div className="flex gap-2 mb-6 border-b" style={{ borderColor: '#E5E9F0' }}>
          {[
            { id: 'docentes', label: 'Docentes y Aulas' },
            { id: 'conducta', label: `Conducta ${conducta.length > 0 ? `(${conducta.length})` : ''}` },
            { id: 'importar', label: 'Importar Estudiantes' },
          ].map(function (t) {
            const active = tab === t.id
            return (
              <button key={t.id} onClick={function () { setTab(t.id) }} className="px-4 py-2.5 text-sm font-semibold border-b-2 transition"
                style={active ? { borderColor: GREEN, color: NAVY_DARK } : { borderColor: 'transparent', color: '#94A3B8' }}>
                {t.label}
              </button>
            )
          })}
        </div>

        {tab === 'docentes' && (
          docentesLista.length === 0 ? (
            <p className="text-slate-400 text-sm">Aún no hay docentes con Asignaturas en esta institución.</p>
          ) : (
            <div className="space-y-6">
              {docentesLista.map(function (grupo) {
                return (
                  <div key={grupo.docente.id} className="bg-white rounded-2xl p-5" style={{ border: '1px solid #E5E9F0' }}>
                    <h3 className="text-sm font-bold mb-3" style={{ color: NAVY_DARK }}>{grupo.docente.full_name}</h3>
                    <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
                      {grupo.cursos.map(function (c) {
                        return (
                          <button
                            key={c.id}
                            onClick={function () { setCursoSel(c) }}
                            className="text-left rounded-xl p-3 transition hover:-translate-y-0.5"
                            style={{ backgroundColor: '#F4F6F9', border: '1px solid #E5E9F0' }}
                          >
                            <p className="text-sm font-semibold" style={{ color: NAVY_DARK }}>{c.nombre}</p>
                            <p className="text-xs text-slate-400">{gradoLabel(c.grado)} — Sección {c.grupo}</p>
                            <p className="text-xs mt-1" style={{ color: GREEN_DARK }}>{c.enrollments?.[0]?.count ?? 0} estudiante(s)</p>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })}

              {sinDocente.length > 0 && (
                <div className="bg-white rounded-2xl p-5" style={{ border: '1px solid #FDECEC' }}>
                  <h3 className="text-sm font-bold mb-3" style={{ color: '#B91C1C' }}>Asignaturas sin docente ({sinDocente.length})</h3>
                  <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
                    {sinDocente.map(function (c) {
                      return (
                        <div key={c.id} className="rounded-xl p-3" style={{ backgroundColor: '#FDECEC' }}>
                          <p className="text-sm font-semibold" style={{ color: NAVY_DARK }}>{c.nombre}</p>
                          <p className="text-xs text-slate-400">{gradoLabel(c.grado)} — Sección {c.grupo}</p>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )
        )}

        {tab === 'conducta' && (
          conducta.length === 0 ? (
            <p className="text-slate-400 text-sm">No hay registros de conducta en esta institución todavía.</p>
          ) : (
            <ul className="space-y-2">
              {conducta.map(function (r) {
                return (
                  <li key={r.id} className="bg-white rounded-xl p-4" style={{ border: '1px solid #E5E9F0' }}>
                    <div className="flex justify-between items-start gap-3 flex-wrap">
                      <div>
                        <p className="text-sm font-semibold" style={{ color: NAVY_DARK }}>{r.studentNombre}</p>
                        <p className="text-xs text-slate-400">{r.curso?.nombre} — {gradoLabel(r.curso?.grado)} Sección {r.curso?.grupo}</p>
                      </div>
                      <span className="text-xs text-slate-400">{new Date(r.created_at).toLocaleDateString('es-PE')}</span>
                    </div>
                    <p className="text-sm mt-2" style={{ color: NAVY_DARK }}>{r.descripcion}</p>
                  </li>
                )
              })}
            </ul>
          )
        )}

        {tab === 'importar' && <ImportarEstudiantes />}
      </main>
    </div>
  )
}
