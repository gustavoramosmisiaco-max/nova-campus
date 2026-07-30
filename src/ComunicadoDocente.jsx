import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import { useAuth } from './AuthContext'
import { compararPorApellido } from './gradeUtils'

const NAVY_DARK = '#0F2A4A'
const NAVY = '#1d5c8f'
const GREEN = '#5DAA47'

const inputStyle = { backgroundColor: 'white', border: '1px solid #D6DCE5', color: NAVY_DARK }

function gradoLabel(g) {
  return g ? `${g}° Secundaria` : 'Sin grado'
}

export default function ComunicadoDocente() {
  const { session } = useAuth()
  const [loading, setLoading] = useState(true)
  const [misCursos, setMisCursos] = useState([])
  const [institucionSel, setInstitucionSel] = useState('')
  const [aulaSel, setAulaSel] = useState('')
  const [areaSel, setAreaSel] = useState('')
  const [destinatario, setDestinatario] = useState('todos') // 'todos' | 'individual'
  const [estudiantes, setEstudiantes] = useState([])
  const [busqueda, setBusqueda] = useState('')
  const [estudianteSel, setEstudianteSel] = useState(null)

  const [titulo, setTitulo] = useState('')
  const [mensaje, setMensaje] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')
  const [enviados, setEnviados] = useState([])

  useEffect(function () {
    cargarMisCursos()
    cargarEnviados()
  }, [])

  async function cargarMisCursos() {
    setLoading(true)
    const result = await supabase
      .from('courses')
      .select('id, grado, grupo, institucion_id, instituciones_educativas(nombre), asignaturas(area_id, areas_curriculares(nombre))')
      .eq('docente_id', session.user.id)
    if (!result.error) setMisCursos(result.data)
    setLoading(false)
  }

  async function cargarEnviados() {
    const result = await supabase
      .from('comunicados')
      .select('*, estudiante:profiles!comunicados_student_id_fkey(full_name)')
      .eq('created_by', session.user.id)
      .order('created_at', { ascending: false })
      .limit(20)
    if (!result.error) setEnviados(result.data)
  }

  const institucionesUnicas = [...new Map(
    misCursos.map(function (c) { return [c.institucion_id || 'sin-institucion', c.instituciones_educativas?.nombre || 'Sin institución'] })
  ).entries()]

  const aulasDisponibles = [...new Map(
    misCursos
      .filter(function (c) { return (c.institucion_id || 'sin-institucion') === institucionSel })
      .map(function (c) { return [`${c.grado}__${c.grupo}`, { grado: c.grado, grupo: c.grupo }] })
  ).values()]

  const areasDisponibles = [...new Map(
    misCursos
      .filter(function (c) {
        const [g, s] = aulaSel.split('__')
        return (c.institucion_id || 'sin-institucion') === institucionSel && String(c.grado) === g && c.grupo === s
      })
      .map(function (c) { return [c.asignaturas?.area_id, c.asignaturas?.areas_curriculares?.nombre] })
  ).entries()]

  useEffect(function () {
    if (aulaSel && areaSel && destinatario === 'individual') cargarEstudiantes()
    else setEstudiantes([])
  }, [aulaSel, areaSel, destinatario])

  async function cargarEstudiantes() {
    const [grado, grupo] = aulaSel.split('__')
    const cursoRef = misCursos.find(function (c) {
      return (c.institucion_id || 'sin-institucion') === institucionSel && String(c.grado) === grado && c.grupo === grupo && c.asignaturas?.area_id === areaSel
    })
    if (!cursoRef) return
    const enrollResult = await supabase
      .from('enrollments')
      .select('student:profiles(id, full_name)')
      .eq('course_id', cursoRef.id)
      .eq('status', 'activo')
    if (!enrollResult.error) {
      const lista = enrollResult.data.map(function (e) { return e.student }).filter(Boolean)
      lista.sort(function (a, b) { return compararPorApellido(a.full_name, b.full_name) })
      setEstudiantes(lista)
    }
  }

  async function handleEnviar(e) {
    e.preventDefault()
    setError('')
    if (!titulo.trim() || !mensaje.trim()) { setError('Completa el título y el mensaje.'); return }
    if (destinatario === 'individual' && !estudianteSel) { setError('Elige un estudiante.'); return }
    setEnviando(true)

    const [grado, grupo] = aulaSel.split('__')
    const payload = {
      institucion_id: institucionSel === 'sin-institucion' ? null : institucionSel,
      area_id: areaSel || null,
      grado: Number(grado),
      grupo: grupo,
      student_id: destinatario === 'individual' ? estudianteSel.id : null,
      titulo: titulo.trim(),
      mensaje: mensaje.trim(),
      created_by: session.user.id,
    }

    const result = await supabase.from('comunicados').insert(payload)
    if (result.error) {
      setError(result.error.message)
      setEnviando(false)
      return
    }

    let destinatarios = []
    if (destinatario === 'individual') {
      destinatarios = [estudianteSel.id]
    } else {
      const cursoRef = misCursos.find(function (c) {
        return (c.institucion_id || 'sin-institucion') === institucionSel && String(c.grado) === grado && c.grupo === grupo && c.asignaturas?.area_id === areaSel
      })
      if (cursoRef) {
        const enrollResult = await supabase.from('enrollments').select('student_id').eq('course_id', cursoRef.id).eq('status', 'activo')
        destinatarios = (enrollResult.data || []).map(function (e) { return e.student_id })
      }
    }
    if (destinatarios.length > 0) {
      const notifs = destinatarios.map(function (id) {
        return { user_id: id, tipo: 'mensaje', titulo: '📢 ' + titulo.trim(), mensaje: mensaje.trim().slice(0, 80) }
      })
      await supabase.from('notificaciones').insert(notifs)
    }

    setTitulo('')
    setMensaje('')
    setEstudianteSel(null)
    setEnviando(false)
    cargarEnviados()
    alert('Comunicado enviado correctamente.')
  }

  async function handleEliminar(id) {
    if (!confirm('¿Eliminar este comunicado?')) return
    await supabase.from('comunicados').delete().eq('id', id)
    cargarEnviados()
  }

  if (loading) return <p className="text-slate-400 text-sm">Cargando...</p>

  const estudiantesFiltrados = estudiantes.filter(function (s) { return s.full_name.toLowerCase().includes(busqueda.toLowerCase()) })

  return (
    <div>
      <h2 className="text-2xl font-bold mb-2" style={{ color: NAVY_DARK }}>Comunicados</h2>
      <p className="text-sm text-slate-400 mb-6">Envía un aviso que aparecerá como ventana emergente en el panel del estudiante y en el Portal de Padres.</p>

      <form onSubmit={handleEnviar} className="bg-white rounded-2xl p-4 mb-8 space-y-3" style={{ border: '1px solid #E5E9F0' }}>
        <div className="grid sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: NAVY_DARK }}>Institución</label>
            <select value={institucionSel} onChange={function (e) { setInstitucionSel(e.target.value); setAulaSel(''); setAreaSel(''); setEstudianteSel(null) }} className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={inputStyle}>
              <option value="">-- Elige --</option>
              {institucionesUnicas.map(function ([id, nombre]) { return <option key={id} value={id}>{nombre}</option> })}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: NAVY_DARK }}>Grado y Sección</label>
            <select value={aulaSel} onChange={function (e) { setAulaSel(e.target.value); setAreaSel(''); setEstudianteSel(null) }} disabled={!institucionSel} className="w-full rounded-lg px-3 py-2 text-sm outline-none disabled:opacity-50" style={inputStyle}>
              <option value="">-- Elige --</option>
              {aulasDisponibles.map(function (a) { return <option key={`${a.grado}-${a.grupo}`} value={`${a.grado}__${a.grupo}`}>{gradoLabel(a.grado)} — Sección {a.grupo}</option> })}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: NAVY_DARK }}>Área</label>
            <select value={areaSel} onChange={function (e) { setAreaSel(e.target.value); setEstudianteSel(null) }} disabled={!aulaSel} className="w-full rounded-lg px-3 py-2 text-sm outline-none disabled:opacity-50" style={inputStyle}>
              <option value="">-- Elige --</option>
              {areasDisponibles.map(function ([id, nombre]) { return <option key={id} value={id}>{nombre}</option> })}
            </select>
          </div>
        </div>

        {areaSel && (
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: NAVY_DARK }}>Destinatario</label>
            <div className="flex gap-2">
              {[{ id: 'todos', label: 'Toda el aula' }, { id: 'individual', label: 'Un estudiante específico' }].map(function (op) {
                const active = destinatario === op.id
                return (
                  <button
                    key={op.id}
                    type="button"
                    onClick={function () { setDestinatario(op.id); setEstudianteSel(null) }}
                    className="text-xs font-semibold px-3 py-2 rounded-lg transition"
                    style={active ? { backgroundColor: GREEN, color: 'white' } : { backgroundColor: '#F4F6F9', color: NAVY_DARK }}
                  >
                    {op.label}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {areaSel && destinatario === 'individual' && (
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: NAVY_DARK }}>Buscar estudiante</label>
            {estudianteSel ? (
              <div className="flex items-center justify-between rounded-lg px-3 py-2" style={{ backgroundColor: '#E7F3E4' }}>
                <span className="text-sm font-semibold" style={{ color: '#2f7a1f' }}>{estudianteSel.full_name}</span>
                <button type="button" onClick={function () { setEstudianteSel(null) }} className="text-xs font-semibold" style={{ color: '#B91C1C' }}>Cambiar</button>
              </div>
            ) : (
              <>
                <input type="text" value={busqueda} onChange={function (e) { setBusqueda(e.target.value) }} placeholder="Escribe el nombre..." className="w-full rounded-lg px-3 py-2 text-sm outline-none mb-2" style={inputStyle} />
                <div className="max-h-40 overflow-y-auto space-y-1">
                  {estudiantesFiltrados.map(function (s) {
                    return (
                      <button key={s.id} type="button" onClick={function () { setEstudianteSel(s) }} className="w-full text-left text-xs px-3 py-2 rounded-lg transition hover:opacity-80" style={{ backgroundColor: '#F4F6F9', color: NAVY_DARK }}>
                        {s.full_name}
                      </button>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        )}

        {areaSel && (
          <>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: NAVY_DARK }}>Título</label>
              <input type="text" value={titulo} onChange={function (e) { setTitulo(e.target.value) }} placeholder="Ej: Reunión de padres de familia" className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={inputStyle} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: NAVY_DARK }}>Mensaje</label>
              <textarea value={mensaje} onChange={function (e) { setMensaje(e.target.value) }} rows={4} placeholder="Escribe el comunicado..." className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={inputStyle} />
            </div>
            {error && <p className="text-red-500 text-sm">{error}</p>}
            <button type="submit" disabled={enviando} className="text-sm font-semibold px-4 py-2 rounded-lg text-white transition hover:opacity-90 disabled:opacity-50" style={{ backgroundColor: GREEN }}>
              {enviando ? 'Enviando...' : '📢 Enviar comunicado'}
            </button>
          </>
        )}
      </form>

      <p className="text-sm font-bold mb-3" style={{ color: NAVY_DARK }}>Comunicados enviados</p>
      {enviados.length === 0 ? (
        <p className="text-xs text-slate-400">Aún no has enviado ningún comunicado.</p>
      ) : (
        <ul className="space-y-2">
          {enviados.map(function (c) {
            return (
              <li key={c.id} className="bg-white rounded-xl p-4" style={{ border: '1px solid #E5E9F0' }}>
                <div className="flex justify-between items-start gap-3">
                  <div>
                    <p className="text-sm font-semibold" style={{ color: NAVY_DARK }}>{c.titulo}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{c.mensaje}</p>
                    <p className="text-xs text-slate-400 mt-1">
                      {c.estudiante ? c.estudiante.full_name : `${gradoLabel(c.grado)} — Sección ${c.grupo}`} · {new Date(c.created_at).toLocaleDateString('es-PE')}
                    </p>
                  </div>
                  <button onClick={function () { handleEliminar(c.id) }} className="text-xs font-semibold px-2 py-1 rounded-lg text-white transition hover:opacity-90 flex-shrink-0" style={{ backgroundColor: '#B91C1C' }}>
                    Eliminar
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
