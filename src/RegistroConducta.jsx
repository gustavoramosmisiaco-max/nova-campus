import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import { useAuth } from './AuthContext'
import { compararPorApellido } from './gradeUtils'
import PreviewModal from './PreviewModal'

const NAVY_DARK = '#0F2A4A'
const NAVY = '#1d5c8f'
const GREEN = '#5DAA47'

const inputStyle = { backgroundColor: 'white', border: '1px solid #D6DCE5', color: NAVY_DARK }

const TIPOS_CONDUCTA = [
  'Indisciplina',
  'Desorden en el aula',
  'Falta de respeto',
  'Impuntualidad',
  'Incumplimiento de tareas',
  'Uso indebido del celular',
  'Otro',
]

function gradoLabel(g) {
  return g ? `${g}° Secundaria` : 'Sin grado'
}

export default function RegistroConducta() {
  const { session } = useAuth()
  const [loading, setLoading] = useState(true)
  const [misCursos, setMisCursos] = useState([])
  const [institucionSel, setInstitucionSel] = useState('')
  const [aulaSel, setAulaSel] = useState('')
  const [areaSel, setAreaSel] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [estudiantes, setEstudiantes] = useState([])
  const [estudianteSel, setEstudianteSel] = useState(null)
  const [historial, setHistorial] = useState([])
  const [loadingHistorial, setLoadingHistorial] = useState(false)
  const [unidades, setUnidades] = useState([])
  const [unidadSel, setUnidadSel] = useState('')

  const [tipo, setTipo] = useState(TIPOS_CONDUCTA[0])
  const [descripcion, setDescripcion] = useState('')
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10))
  const [archivo, setArchivo] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [preview, setPreview] = useState(null)

  useEffect(function () {
    cargarMisCursos()
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
    if (aulaSel && areaSel) {
      cargarEstudiantes()
      cargarUnidades()
    } else {
      setEstudiantes([])
      setUnidades([])
    }
  }, [aulaSel, areaSel])

  async function cargarUnidades() {
    const [grado, grupo] = aulaSel.split('__')
    const result = await supabase
      .from('unidades')
      .select('id, tipo, numero, nombre')
      .eq('area_id', areaSel)
      .eq('grado', grado)
      .eq('grupo', grupo)
      .order('numero')
    if (!result.error) {
      setUnidades(result.data)
      if (result.data.length > 0) setUnidadSel(result.data[0].id)
    }
  }

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

  async function seleccionarEstudiante(est) {
    setEstudianteSel(est)
    setLoadingHistorial(true)
    const [grado, grupo] = aulaSel.split('__')
    const result = await supabase
      .from('conductas_registro')
      .select('*, docente:profiles!conductas_registro_registrado_por_fkey(full_name), unidad:unidades(tipo, numero)')
      .eq('student_id', est.id)
      .eq('area_id', areaSel)
      .eq('grado', grado)
      .eq('grupo', grupo)
      .order('fecha', { ascending: false })
    if (!result.error) setHistorial(result.data)
    setLoadingHistorial(false)
  }

  async function handleGuardar(e) {
    e.preventDefault()
    setError('')
    if (!descripcion.trim()) { setError('Describe qué ocurrió.'); return }
    setGuardando(true)

    let imagenUrl = null
    if (archivo) {
      const path = `${session.user.id}/${Date.now()}_${archivo.name.replace(/[^a-zA-Z0-9.\-_]/g, '_')}`
      const uploadResult = await supabase.storage.from('conductas').upload(path, archivo)
      if (uploadResult.error) {
        setError('Error al subir el archivo: ' + uploadResult.error.message)
        setGuardando(false)
        return
      }
      imagenUrl = path
    }

    const [grado, grupo] = aulaSel.split('__')
    const unidadObj = unidades.find(function (u) { return u.id === unidadSel })
    const result = await supabase.from('conductas_registro').insert({
      student_id: estudianteSel.id,
      area_id: areaSel,
      grado: Number(grado),
      grupo: grupo,
      institucion_id: institucionSel === 'sin-institucion' ? null : institucionSel,
      unidad_id: unidadSel || null,
      bimestre: unidadObj ? Math.ceil(unidadObj.numero / 2) : null,
      tipo: tipo,
      descripcion: descripcion.trim(),
      imagen_url: imagenUrl,
      fecha: fecha,
      registrado_por: session.user.id,
    })

    if (result.error) {
      setError(result.error.message)
    } else {
      await supabase.from('notificaciones').insert({
        user_id: estudianteSel.id,
        tipo: 'justificacion',
        titulo: 'Se registró una observación de conducta',
        mensaje: `${tipo} — ${fecha}`,
      })
      setDescripcion('')
      setArchivo(null)
      setTipo(TIPOS_CONDUCTA[0])
      seleccionarEstudiante(estudianteSel)
    }
    setGuardando(false)
  }

  async function handleVerImagen(path) {
    const result = await supabase.storage.from('conductas').createSignedUrl(path, 300)
    if (result.error) { alert('Error: ' + result.error.message); return }
    const parts = path.split('/')
    const name = parts[parts.length - 1]
    const ext = name.split('.').pop().toLowerCase()
    setPreview({ url: result.data.signedUrl, type: ext, name: name })
  }

  if (loading) return <p className="text-slate-400 text-sm">Cargando...</p>

  const estudiantesFiltrados = estudiantes.filter(function (s) {
    return s.full_name.toLowerCase().includes(busqueda.toLowerCase())
  })

  return (
    <div>
      <h2 className="text-2xl font-bold mb-2" style={{ color: NAVY_DARK }}>Registro de Conducta</h2>
      <p className="text-sm text-slate-400 mb-6">Registra conductas observadas en el aula: indisciplina, desorden y otras situaciones.</p>

      <div className="grid sm:grid-cols-3 gap-3 mb-6">
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

      {areaSel && !estudianteSel && (
        <div className="bg-white rounded-2xl p-4" style={{ border: '1px solid #E5E9F0' }}>
          <label className="block text-xs font-medium mb-1" style={{ color: NAVY_DARK }}>Buscar estudiante</label>
          <input
            type="text"
            value={busqueda}
            onChange={function (e) { setBusqueda(e.target.value) }}
            placeholder="Escribe el nombre..."
            className="w-full rounded-lg px-3 py-2 text-sm outline-none mb-3"
            style={inputStyle}
          />
          <div className="max-h-72 overflow-y-auto space-y-1">
            {estudiantesFiltrados.length === 0 ? (
              <p className="text-xs text-slate-400">Ningún estudiante coincide.</p>
            ) : (
              estudiantesFiltrados.map(function (s) {
                return (
                  <button
                    key={s.id}
                    onClick={function () { seleccionarEstudiante(s) }}
                    className="w-full text-left text-sm px-3 py-2 rounded-lg transition hover:opacity-80"
                    style={{ backgroundColor: '#F4F6F9', color: NAVY_DARK }}
                  >
                    {s.full_name}
                  </button>
                )
              })
            )}
          </div>
        </div>
      )}

      {estudianteSel && (
        <div>
          <button onClick={function () { setEstudianteSel(null); setBusqueda('') }} className="text-sm font-semibold mb-4 hover:underline" style={{ color: NAVY }}>← Buscar otro estudiante</button>
          <h3 className="text-lg font-bold mb-4" style={{ color: NAVY_DARK }}>{estudianteSel.full_name}</h3>

          <form onSubmit={handleGuardar} className="bg-white rounded-2xl p-4 mb-6 space-y-3" style={{ border: '1px solid #E5E9F0' }}>
            <p className="text-sm font-bold" style={{ color: NAVY_DARK }}>Nueva observación</p>
            <div className="grid sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: NAVY_DARK }}>Tipo</label>
                <select value={tipo} onChange={function (e) { setTipo(e.target.value) }} className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={inputStyle}>
                  {TIPOS_CONDUCTA.map(function (t) { return <option key={t} value={t}>{t}</option> })}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: NAVY_DARK }}>Unidad / Experiencia</label>
                <select value={unidadSel} onChange={function (e) { setUnidadSel(e.target.value) }} className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={inputStyle}>
                  <option value="">-- Sin especificar --</option>
                  {unidades.map(function (u) {
                    return <option key={u.id} value={u.id}>{u.tipo} {u.numero} (Bim. {Math.ceil(u.numero / 2)}){u.nombre ? ' — ' + u.nombre : ''}</option>
                  })}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: NAVY_DARK }}>Fecha</label>
                <input type="date" value={fecha} onChange={function (e) { setFecha(e.target.value) }} className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={inputStyle} />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: NAVY_DARK }}>Descripción</label>
              <textarea
                value={descripcion}
                onChange={function (e) { setDescripcion(e.target.value) }}
                rows={3}
                required
                placeholder="Describe qué ocurrió..."
                className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                style={inputStyle}
              />
            </div>
            <div>
              <label className="text-xs font-semibold px-3 py-2 rounded-lg cursor-pointer inline-block transition" style={{ backgroundColor: '#F4F6F9', color: NAVY_DARK, border: '1px solid #D6DCE5' }}>
                📎 Adjuntar imagen (citación/informe)
                <input type="file" accept="image/*,application/pdf" className="hidden" onChange={function (e) { setArchivo(e.target.files[0]) }} />
              </label>
              {archivo && <span className="text-xs text-slate-500 ml-2">{archivo.name}</span>}
            </div>
            {error && <p className="text-red-500 text-sm">{error}</p>}
            <button type="submit" disabled={guardando} className="text-sm font-semibold px-4 py-2 rounded-lg text-white transition hover:opacity-90 disabled:opacity-50" style={{ backgroundColor: GREEN }}>
              {guardando ? 'Guardando...' : 'Registrar conducta'}
            </button>
          </form>

          <p className="text-sm font-bold mb-3" style={{ color: NAVY_DARK }}>Historial ({historial.length})</p>
          {loadingHistorial ? (
            <p className="text-xs text-slate-400">Cargando...</p>
          ) : historial.length === 0 ? (
            <p className="text-xs text-slate-400">Sin observaciones registradas todavía.</p>
          ) : (
            <ul className="space-y-2">
              {historial.map(function (h) {
                return (
                  <li key={h.id} className="rounded-xl p-3" style={{ backgroundColor: '#F4F6F9', border: '1px solid #E5E9F0' }}>
                    <div className="flex justify-between items-start gap-3">
                      <div>
                        <p className="text-sm font-semibold" style={{ color: NAVY_DARK }}>{h.tipo}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{h.descripcion}</p>
                        <p className="text-xs text-slate-400 mt-1">
                          {new Date(h.fecha + 'T00:00:00').toLocaleDateString('es-PE')}
                          {h.unidad && ` · ${h.unidad.tipo} ${h.unidad.numero} (Bim. ${h.bimestre || Math.ceil(h.unidad.numero / 2)})`}
                          {' · Registrado por ' + (h.docente?.full_name || 'Docente')}
                        </p>
                      </div>
                      {h.imagen_url && (
                        <button onClick={function () { handleVerImagen(h.imagen_url) }} className="text-xs font-semibold px-3 py-1.5 rounded-lg transition flex-shrink-0" style={{ backgroundColor: 'white', color: NAVY, border: '1px solid #D6DCE5' }}>
                          Ver adjunto
                        </button>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}

      <PreviewModal preview={preview} onClose={function () { setPreview(null) }} />
    </div>
  )
}
