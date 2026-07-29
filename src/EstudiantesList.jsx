import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import { compararPorApellido } from './gradeUtils'

const NAVY_DARK = '#0F2A4A'
const NAVY = '#1d5c8f'
const GREEN = '#5DAA47'
const GREEN_DARK = '#2f7a1f'

const GRADOS = [1, 2, 3, 4, 5]
const SECCIONES = ['A', 'B', 'C', 'D', 'E']

function FolderIcon({ color, big }) {
  const size = big ? 26 : 18
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color || GREEN} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  )
}

export default function EstudiantesList() {
  const [students, setStudents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [deletingId, setDeletingId] = useState(null)
  const [selectedInst, setSelectedInst] = useState(null)
  const [selectedAula, setSelectedAula] = useState(null)

  useEffect(function () {
    loadStudents()
  }, [])

  async function loadStudents() {
    setLoading(true)
    setError('')

    const profilesResult = await supabase
      .from('profiles')
      .select('id, full_name, codigo_padre')
      .eq('role', 'estudiante')
      .order('full_name', { ascending: true })

    if (profilesResult.error) {
      setError(profilesResult.error.message)
      setLoading(false)
      return
    }

    const enrollResult = await supabase
      .from('enrollments')
      .select('student_id, course:courses(grado, grupo, institucion:instituciones_educativas(nombre))')
      .eq('status', 'activo')

    const aulaMap = {}
    if (!enrollResult.error) {
      enrollResult.data.forEach(function (e) {
        if (!aulaMap[e.student_id] && e.course) {
          aulaMap[e.student_id] = {
            grado: e.course.grado,
            grupo: e.course.grupo,
            institucion: e.course.institucion?.nombre || 'Sin institución asignada',
          }
        }
      })
    }

    const enriched = profilesResult.data.map(function (s) {
      return { ...s, aula: aulaMap[s.id] || { grado: null, grupo: null, institucion: 'Sin institución asignada' } }
    })
    enriched.sort(function (a, b) { return compararPorApellido(a.full_name, b.full_name) })

    setStudents(enriched)
    setLoading(false)
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
      setStudents(function (prev) { return prev.filter(function (s) { return s.id !== id }) })
    }
    setDeletingId(null)
  }

  if (loading) return <p className="text-slate-400 text-sm">Cargando estudiantes...</p>
  if (error) return <p className="text-red-500 text-sm">Error: {error}</p>

  // ---------- Nivel 3: tabla de estudiantes de una aula ----------
  if (selectedAula) {
    const items = students.filter(function (s) {
      return s.aula.institucion === selectedInst && s.aula.grado === selectedAula.grado && s.aula.grupo === selectedAula.grupo
    })
    return (
      <div>
        <button onClick={function () { setSelectedAula(null) }} className="text-sm font-semibold mb-4 hover:underline" style={{ color: NAVY }}>
          ← Volver a {selectedInst}
        </button>
        <h2 className="text-lg font-bold mb-4" style={{ color: NAVY_DARK }}>
          {selectedAula.grado}° Secundaria — Sección {selectedAula.grupo} ({items.length})
        </h2>
        <div className="bg-white rounded-2xl p-4" style={{ border: '1px solid #E5E9F0' }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid #E5E9F0' }}>
                <th className="text-left py-2 pr-3 font-semibold" style={{ color: NAVY_DARK }}>Nombre</th>
                <th className="text-left py-2 pr-3 font-semibold" style={{ color: NAVY_DARK }}>Código de padre</th>
                <th className="text-right py-2 font-semibold" style={{ color: NAVY_DARK }}></th>
              </tr>
            </thead>
            <tbody>
              {items.map(function (s) {
                return (
                  <tr key={s.id} style={{ borderBottom: '1px solid #F4F6F9' }}>
                    <td className="py-2 pr-3" style={{ color: NAVY_DARK }}>{s.full_name}</td>
                    <td className="py-2 pr-3">
                      <span className="text-xs font-mono font-semibold px-2 py-1 rounded-lg" style={{ backgroundColor: '#E7F3E4', color: '#2f7a1f' }}>
                        {s.codigo_padre || '—'}
                      </span>
                    </td>
                    <td className="py-2 text-right">
                      <button
                        onClick={function () { handleDelete(s.id, s.full_name) }}
                        disabled={deletingId === s.id}
                        className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white transition hover:opacity-90 disabled:opacity-50"
                        style={{ backgroundColor: '#B91C1C' }}
                      >
                        {deletingId === s.id ? 'Eliminando...' : 'Eliminar'}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  // ---------- Nivel 2: carpetas de Grado/Sección dentro de una institución ----------
  if (selectedInst) {
    const lista = students.filter(function (s) { return s.aula.institucion === selectedInst })
    const aulas = []
    GRADOS.forEach(function (g) {
      SECCIONES.forEach(function (sec) {
        const items = lista.filter(function (s) { return s.aula.grado === g && s.aula.grupo === sec })
        if (items.length > 0) aulas.push({ grado: g, grupo: sec, cantidad: items.length })
      })
    })
    const sinAula = lista.filter(function (s) { return !s.aula.grado })

    return (
      <div>
        <button onClick={function () { setSelectedInst(null) }} className="text-sm font-semibold mb-4 hover:underline" style={{ color: NAVY }}>
          ← Volver a Instituciones
        </button>
        <h2 className="text-lg font-bold mb-4" style={{ color: NAVY_DARK }}>{selectedInst} ({lista.length})</h2>

        {aulas.length === 0 && sinAula.length === 0 ? (
          <p className="text-slate-400 text-sm">No hay estudiantes aquí.</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {aulas.map(function (aula) {
              return (
                <button
                  key={`${aula.grado}${aula.grupo}`}
                  onClick={function () { setSelectedAula(aula) }}
                  className="text-left rounded-xl p-4 transition hover:-translate-y-0.5"
                  style={{ backgroundColor: '#F4F6F9', border: '1px solid #E5E9F0' }}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <FolderIcon />
                    <span className="text-xs font-semibold" style={{ color: GREEN_DARK }}>{aula.grado}° "{aula.grupo}"</span>
                  </div>
                  <p className="text-sm font-bold" style={{ color: NAVY_DARK }}>{aula.grado}° Secundaria — Sección {aula.grupo}</p>
                  <p className="text-xs text-slate-400 mt-1">{aula.cantidad} estudiante(s)</p>
                </button>
              )
            })}

            {sinAula.length > 0 && (
              <button
                onClick={function () { setSelectedAula({ grado: null, grupo: null }) }}
                className="text-left rounded-xl p-4 transition hover:-translate-y-0.5"
                style={{ backgroundColor: '#FDECEC', border: '1px solid #F5C6C6' }}
              >
                <div className="flex items-center gap-2 mb-1">
                  <FolderIcon color="#B91C1C" />
                  <span className="text-xs font-semibold" style={{ color: '#B91C1C' }}>Sin aula</span>
                </div>
                <p className="text-sm font-bold" style={{ color: NAVY_DARK }}>Sin aula asignada</p>
                <p className="text-xs text-slate-400 mt-1">{sinAula.length} estudiante(s)</p>
              </button>
            )}
          </div>
        )}
      </div>
    )
  }

  // ---------- Nivel 1: carpetas de Instituciones ----------
  const instituciones = [...new Set(students.map(function (s) { return s.aula.institucion }))].sort(function (a, b) {
    if (a === 'Sin institución asignada') return 1
    if (b === 'Sin institución asignada') return -1
    return a.localeCompare(b)
  })

  return (
    <div>
      <h2 className="text-2xl font-bold mb-2" style={{ color: NAVY_DARK }}>Estudiantes</h2>
      <p className="text-sm text-slate-400 mb-6">{students.length} estudiante(s) registrado(s) en total.</p>

      {students.length === 0 ? (
        <p className="text-slate-400 text-sm">Aún no hay estudiantes registrados.</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {instituciones.map(function (inst) {
            const cantidad = students.filter(function (s) { return s.aula.institucion === inst }).length
            const sinInst = inst === 'Sin institución asignada'
            return (
              <button
                key={inst}
                onClick={function () { setSelectedInst(inst) }}
                className="text-left rounded-xl p-4 transition hover:-translate-y-0.5"
                style={sinInst ? { backgroundColor: '#FDECEC', border: '1px solid #F5C6C6' } : { backgroundColor: '#F4F6F9', border: '1px solid #E5E9F0' }}
              >
                <div className="flex items-center gap-2 mb-1">
                  <FolderIcon color={sinInst ? '#B91C1C' : NAVY_DARK} />
                  <span className="text-xs font-semibold" style={{ color: sinInst ? '#B91C1C' : NAVY }}>Institución</span>
                </div>
                <p className="text-sm font-bold" style={{ color: NAVY_DARK }}>{inst}</p>
                <p className="text-xs text-slate-400 mt-1">{cantidad} estudiante(s)</p>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
