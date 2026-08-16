import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import { useAuth } from './AuthContext'
import { getLetterGrade, getLetterColor } from './gradeUtils'
import { compararPorApellido } from './gradeUtils'
import PreviewModal from './PreviewModal'
import CourseMaterials from './CourseMaterials'
import EvaluacionCierre from './EvaluacionCierre'
import ImportarUnidadWord from './ImportarUnidadWord'

const NAVY_DARK = '#0F172A'
const NAVY = '#2563EB'
const GREEN = '#22C55E'
const GREEN_DARK = '#16A34A'

const inputStyle = { backgroundColor: 'white', border: '1px solid #D6DCE5', color: NAVY_DARK }
const TIPOS_UNIDAD = ['Unidad', 'Experiencia de aprendizaje']
const NUMEROS_UNIDAD = [1, 2, 3, 4, 5, 6, 7, 8]

function getArea(nombreCurso) {
  return nombreCurso === 'Matematica' ? 'Matematica' : 'Ciencia y Tecnologia'
}

export default function CourseActivities({ courseId }) {
  const [courseNombre, setCourseNombre] = useState('')
  const [selectedUnidad, setSelectedUnidad] = useState(null)
  const [selectedActividad, setSelectedActividad] = useState(null)

  useEffect(function () {
    supabase.from('courses').select('nombre').eq('id', courseId).single().then(function (r) {
      if (!r.error) setCourseNombre(r.data.nombre)
    })
  }, [courseId])

  if (selectedActividad) {
    return (
      <ActividadContenido
        actividad={selectedActividad}
        onBack={function () { setSelectedActividad(null) }}
      />
    )
  }

  if (selectedUnidad) {
    return (
      <UnidadActividades
        unidad={selectedUnidad}
        courseId={courseId}
        courseNombre={courseNombre}
        onBack={function () { setSelectedUnidad(null) }}
        onSelectActividad={setSelectedActividad}
      />
    )
  }

  return <UnidadesList courseId={courseId} onSelectUnidad={setSelectedUnidad} />
}

// ============================================================
// NIVEL 1: Lista de carpetas (Unidades / Experiencias)
// ============================================================
function UnidadesList({ courseId, onSelectUnidad }) {
  const { session } = useAuth()
  const [aula, setAula] = useState(null)
  const [unidades, setUnidades] = useState([])
  const [conteoPropio, setConteoPropio] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [tipo, setTipo] = useState('Unidad')
  const [numero, setNumero] = useState(1)
  const [nombre, setNombre] = useState('')
  const [fechaInicio, setFechaInicio] = useState('')
  const [fechaFin, setFechaFin] = useState('')
  const [mostrarImportarWord, setMostrarImportarWord] = useState(false)

  useEffect(function () {
    cargarAulaYUnidades()
  }, [courseId])

  async function cargarAulaYUnidades() {
    setLoading(true)
    const courseResult = await supabase
      .from('courses')
      .select('grado, grupo, asignaturas(area_id)')
      .eq('id', courseId)
      .single()

    if (courseResult.error || !courseResult.data?.asignaturas) {
      setError('No se pudo determinar el Área de este curso.')
      setLoading(false)
      return
    }
    const infoAula = {
      areaId: courseResult.data.asignaturas.area_id,
      grado: courseResult.data.grado,
      grupo: courseResult.data.grupo,
    }
    setAula(infoAula)
    await loadUnidades(infoAula)
  }

  async function loadUnidades(infoAula) {
    setLoading(true)
    const result = await supabase
      .from('unidades')
      .select('*')
      .eq('area_id', infoAula.areaId)
      .eq('grado', infoAula.grado)
      .eq('grupo', infoAula.grupo)
      .order('numero', { ascending: true })
    if (result.error) {
      setError(result.error.message)
      setLoading(false)
      return
    }
    setUnidades(result.data)

    // Cuántas actividades tiene ESTA asignatura (no las otras) dentro de cada carpeta compartida
    const unidadIds = result.data.map(function (u) { return u.id })
    if (unidadIds.length > 0) {
      const actResult = await supabase
        .from('actividades')
        .select('unidad_id')
        .eq('course_id', courseId)
        .in('unidad_id', unidadIds)
      if (!actResult.error) {
        const conteo = {}
        actResult.data.forEach(function (a) { conteo[a.unidad_id] = (conteo[a.unidad_id] || 0) + 1 })
        setConteoPropio(conteo)
      }
    }
    setLoading(false)
  }

  function resetForm() {
    setEditingId(null)
    setTipo('Unidad')
    setNumero(1)
    setNombre('')
    setFechaInicio('')
    setFechaFin('')
  }

  function openNew() {
    resetForm()
    setShowForm(true)
  }

  function openEdit(u) {
    setEditingId(u.id)
    setTipo(u.tipo)
    setNumero(u.numero)
    setNombre(u.nombre || '')
    setFechaInicio(u.fecha_inicio || '')
    setFechaFin(u.fecha_fin || '')
    setShowForm(true)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    const payload = { area_id: aula.areaId, grado: aula.grado, grupo: aula.grupo, tipo: tipo, numero: numero, nombre: nombre || null, fecha_inicio: fechaInicio || null, fecha_fin: fechaFin || null }

    let result
    if (editingId) {
      result = await supabase.from('unidades').update(payload).eq('id', editingId)
    } else {
      payload.created_by = session.user.id
      result = await supabase.from('unidades').insert(payload)
    }

    if (result.error) {
      if (result.error.code === '23505') {
        setError('Ya existe una carpeta con ese Tipo y Número para esta Área (probablemente creada desde otra asignatura). Búscala en la lista de abajo en vez de crearla de nuevo.')
      } else {
        setError(result.error.message)
      }
      return
    }
    resetForm()
    setShowForm(false)
    loadUnidades(aula)
  }

  async function handleDelete(id) {
    if (!confirm('¿Eliminar esta carpeta? Es compartida por TODAS las asignaturas de esta área (Biología, Química, Física, etc.) — se eliminarán también sus actividades, materiales y tareas de todas ellas.')) return
    const result = await supabase.from('unidades').delete().eq('id', id)
    if (result.error) alert('Error: ' + result.error.message)
    else loadUnidades(aula)
  }

  if (loading) return <p className="text-slate-400 text-sm">Cargando carpetas...</p>

  return (
    <div>
      <div className="flex justify-between items-center mb-1">
        <h3 className="text-lg font-bold" style={{ color: NAVY_DARK }}>Unidades y Experiencias de Aprendizaje</h3>
        <div className="flex gap-2">
          <button
            onClick={function () { setMostrarImportarWord(!mostrarImportarWord); setShowForm(false) }}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white transition hover:opacity-90"
            style={{ backgroundColor: '#7C3AED' }}
          >
            {mostrarImportarWord ? 'Cancelar' : '📄 Importar desde Word'}
          </button>
          <button
            onClick={function () { if (showForm) setShowForm(false); else { openNew(); setMostrarImportarWord(false) } }}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white transition hover:opacity-90"
            style={{ backgroundColor: GREEN }}
          >
            {showForm ? 'Cancelar' : '+ Nueva carpeta'}
          </button>
        </div>
      </div>
      <p className="text-xs text-slate-400 mb-4">
        Estas carpetas se comparten entre todas las asignaturas de esta Área para este Grado y Sección (ej. Biología, Química y Física). Si otra asignatura ya creó "Experiencia 5", aparecerá aquí — solo agrega tus propias actividades adentro.
      </p>

      {mostrarImportarWord && aula && (
        <ImportarUnidadWord
          areaId={aula.areaId}
          grado={aula.grado}
          grupo={aula.grupo}
          courseId={courseId}
          onCerrar={function () { setMostrarImportarWord(false) }}
          onImportado={function () { setMostrarImportarWord(false); loadUnidades(aula) }}
        />
      )}

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="rounded-xl p-4 mb-5 space-y-3"
          style={{ backgroundColor: '#F4F6F9', border: '1px solid #E5E9F0' }}
        >
          <h4 className="text-sm font-semibold" style={{ color: NAVY_DARK }}>
            {editingId ? 'Editar carpeta' : 'Nueva carpeta'}
          </h4>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: NAVY_DARK }}>Tipo</label>
            <div className="flex gap-2 mb-2">
              {TIPOS_UNIDAD.map(function (t) {
                const active = tipo === t
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={function () { setTipo(t) }}
                    className="text-xs font-semibold px-3 py-1.5 rounded-lg transition"
                    style={active ? { backgroundColor: GREEN, color: 'white' } : { backgroundColor: 'white', color: NAVY_DARK, border: '1px solid #D6DCE5' }}
                  >
                    {t}
                  </button>
                )
              })}
            </div>
            <label className="block text-xs font-medium mb-1" style={{ color: NAVY_DARK }}>Número</label>
            <div className="flex gap-2 flex-wrap">
              {NUMEROS_UNIDAD.map(function (n) {
                const active = numero === n
                return (
                  <button
                    key={n}
                    type="button"
                    onClick={function () { setNumero(n) }}
                    className="w-9 h-9 rounded-lg text-sm font-semibold transition"
                    style={active ? { backgroundColor: NAVY, color: 'white' } : { backgroundColor: 'white', color: NAVY_DARK, border: '1px solid #D6DCE5' }}
                  >
                    {n}
                  </button>
                )
              })}
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: NAVY_DARK }}>Nombre de la carpeta (opcional)</label>
            <input
              type="text"
              value={nombre}
              onChange={function (e) { setNombre(e.target.value) }}
              placeholder="Ej: Los seres vivos y su entorno"
              className="w-full rounded-lg px-3 py-2 text-sm outline-none"
              style={inputStyle}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: NAVY_DARK }}>Fecha de inicio</label>
              <input
                type="date"
                value={fechaInicio}
                onChange={function (e) { setFechaInicio(e.target.value) }}
                className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                style={inputStyle}
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: NAVY_DARK }}>Fecha de fin</label>
              <input
                type="date"
                value={fechaFin}
                onChange={function (e) { setFechaFin(e.target.value) }}
                className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                style={inputStyle}
              />
            </div>
          </div>
          <p className="text-xs text-slate-400">Estas fechas se usan para calcular en qué días registrar asistencia.</p>
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <button
            type="submit"
            className="font-semibold px-4 py-2 rounded-lg text-white transition hover:opacity-90"
            style={{ backgroundColor: GREEN }}
          >
            {editingId ? 'Guardar cambios' : 'Crear carpeta'}
          </button>
        </form>
      )}

      {unidades.length === 0 ? (
        <p className="text-slate-400 text-sm">Aún no hay carpetas creadas.</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {unidades.map(function (u) {
            return (
              <div
                key={u.id}
                className="rounded-xl p-4"
                style={{ backgroundColor: '#F4F6F9', border: '1px solid #E5E9F0' }}
              >
                <button
                  onClick={function () { onSelectUnidad(u) }}
                  className="text-left w-full mb-2"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <FolderIcon />
                    <span className="text-xs font-semibold" style={{ color: GREEN_DARK }}>{u.tipo} {u.numero}</span>
                  </div>
                  <p className="text-sm font-bold" style={{ color: NAVY_DARK }}>{u.nombre || `${u.tipo} ${u.numero}`}</p>
                  <p className="text-xs text-slate-400 mt-1">
                    {conteoPropio[u.id] || 0} actividad(es) de esta asignatura
                  </p>
                </button>
                <div className="flex gap-2">
                  <button
                    onClick={function () { openEdit(u) }}
                    className="text-xs font-semibold px-3 py-1 rounded-lg transition"
                    style={{ backgroundColor: 'white', color: NAVY, border: '1px solid #D6DCE5' }}
                  >
                    Editar
                  </button>
                  <button
                    onClick={function () { handleDelete(u.id) }}
                    className="text-xs font-semibold px-3 py-1 rounded-lg text-white transition hover:opacity-90"
                    style={{ backgroundColor: '#B91C1C' }}
                  >
                    Eliminar
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ============================================================
// NIVEL 2: Actividades dentro de una carpeta (Unidad)
// ============================================================
function UnidadActividades({ unidad, courseId, courseNombre, onBack, onSelectActividad }) {
  const { session } = useAuth()
  const [subTab, setSubTab] = useState('actividades')
  const [activities, setActivities] = useState([])
  const [competencias, setCompetencias] = useState([])
  const [capacidadesDisponibles, setCapacidadesDisponibles] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)

  const [nombre, setNombre] = useState('')
  const [fechaClase, setFechaClase] = useState('')
  const [tipoInstrumento, setTipoInstrumento] = useState('Lista de cotejo')
  const [proposito, setProposito] = useState('')
  const [competenciaId, setCompetenciaId] = useState('')
  const [detalles, setDetalles] = useState({})

  useEffect(function () {
    init()
  }, [unidad.id])

  async function init() {
    setLoading(true)
    const courseResult = await supabase
      .from('courses')
      .select('asignaturas(area_id, areas_curriculares(nombre))')
      .eq('id', courseId)
      .single()

    const areaNombre = courseResult.data?.asignaturas?.areas_curriculares?.nombre || getArea(courseNombre)
    const compResult = await supabase.from('competencias').select('*').eq('area', areaNombre).order('codigo')
    setCompetencias(compResult.data || [])
    await loadActivities()
    setLoading(false)
  }

  async function loadActivities() {
    const result = await supabase
      .from('actividades')
      .select('*, competencia:competencias(nombre, codigo), actividad_capacidades(criterio, desempeno, desc_ad, desc_a, desc_b, desc_c, capacidad:capacidades(id, nombre, orden))')
      .eq('unidad_id', unidad.id)
      .eq('course_id', courseId)
      .order('created_at', { ascending: true })
    if (result.error) setError(result.error.message)
    else setActivities(result.data)
  }

  async function loadCapacidadesFor(compId) {
    if (!compId) { setCapacidadesDisponibles([]); return }
    const result = await supabase.from('capacidades').select('*').eq('competencia_id', compId).order('orden')
    setCapacidadesDisponibles(result.data || [])
  }

  function resetForm() {
    setEditingId(null)
    setNombre('')
    setFechaClase('')
    setTipoInstrumento('Lista de cotejo')
    setProposito('')
    setCompetenciaId('')
    setDetalles({})
    setCapacidadesDisponibles([])
  }

  function openNew() {
    resetForm()
    setShowForm(true)
  }

  async function openEdit(a) {
    setEditingId(a.id)
    setNombre(a.nombre)
    setFechaClase(a.fecha_clase || '')
    setTipoInstrumento(a.tipo_instrumento || 'Lista de cotejo')
    setProposito(a.proposito || '')
    const compId = a.competencia ? competencias.find(function (c) { return c.nombre === a.competencia.nombre })?.id : ''
    setCompetenciaId(compId || '')
    if (compId) await loadCapacidadesFor(compId)

    // Criterios individuales de la Lista de Cotejo (si esta Actividad ya los tenía)
    const criteriosResult = await supabase.from('criterios_cotejo').select('capacidad_id, texto, orden').eq('actividad_id', a.id).order('orden')
    const criteriosPorCapacidad = {}
    ;(criteriosResult.data || []).forEach(function (c) {
      if (!criteriosPorCapacidad[c.capacidad_id]) criteriosPorCapacidad[c.capacidad_id] = []
      criteriosPorCapacidad[c.capacidad_id].push(c.texto)
    })

    const newDetalles = {}
    ;(a.actividad_capacidades || []).forEach(function (ac) {
      newDetalles[ac.capacidad.id] = {
        checked: true, criterio: ac.criterio || '', desempeno: ac.desempeno || '',
        desc_ad: ac.desc_ad || '', desc_a: ac.desc_a || '', desc_b: ac.desc_b || '', desc_c: ac.desc_c || '',
        criteriosLista: criteriosPorCapacidad[ac.capacidad.id] && criteriosPorCapacidad[ac.capacidad.id].length > 0 ? criteriosPorCapacidad[ac.capacidad.id] : [''],
      }
    })
    setDetalles(newDetalles)
    setShowForm(true)
  }

  function toggleCapacidad(id) {
    setDetalles(function (prev) {
      const existing = prev[id]
      if (existing && existing.checked) return { ...prev, [id]: { ...existing, checked: false } }
      return { ...prev, [id]: { checked: true, criterio: existing?.criterio || '', desempeno: existing?.desempeno || '', desc_ad: existing?.desc_ad || '', desc_a: existing?.desc_a || '', desc_b: existing?.desc_b || '', desc_c: existing?.desc_c || '', criteriosLista: existing?.criteriosLista || [''] } }
    })
  }

  function updateDetalle(id, field, value) {
    setDetalles(function (prev) { return { ...prev, [id]: { ...prev[id], [field]: value } } })
  }

  // ============================================================
  // Criterios individuales de la Lista de Cotejo — cada uno se podrá
  // marcar por separado al calificar, en vez de escribir una nota directa.
  // ============================================================
  function agregarCriterioLista(capId) {
    setDetalles(function (prev) {
      const lista = prev[capId]?.criteriosLista || ['']
      return { ...prev, [capId]: { ...prev[capId], criteriosLista: [...lista, ''] } }
    })
  }

  function actualizarCriterioLista(capId, index, valor) {
    setDetalles(function (prev) {
      const lista = [...(prev[capId]?.criteriosLista || [''])]
      lista[index] = valor
      return { ...prev, [capId]: { ...prev[capId], criteriosLista: lista } }
    })
  }

  function quitarCriterioLista(capId, index) {
    setDetalles(function (prev) {
      const lista = (prev[capId]?.criteriosLista || ['']).filter(function (_c, i) { return i !== index })
      return { ...prev, [capId]: { ...prev[capId], criteriosLista: lista.length > 0 ? lista : [''] } }
    })
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    const existing = editingId ? activities.find(function (a) { return a.id === editingId }) : null
    const numeroActividad = existing ? existing.numero_actividad : (activities.length + 1)

    const payload = {
      course_id: courseId,
      unidad_id: unidad.id,
      tipo_unidad: unidad.tipo,
      numero_unidad: String(unidad.numero),
      numero_actividad: numeroActividad,
      nombre: nombre,
      fecha_clase: fechaClase || null,
      tipo_instrumento: tipoInstrumento,
      proposito: proposito,
      competencia_id: competenciaId || null,
    }

    let actividadId = editingId
    let result
    if (editingId) {
      result = await supabase.from('actividades').update(payload).eq('id', editingId)
    } else {
      payload.created_by = session.user.id
      result = await supabase.from('actividades').insert(payload).select('id').single()
      if (!result.error) actividadId = result.data.id
    }
    if (result.error) { setError(result.error.message); return }

    if (editingId) {
      await supabase.from('actividad_capacidades').delete().eq('actividad_id', actividadId)
      await supabase.from('criterios_cotejo').delete().eq('actividad_id', actividadId)
    }
    const selectedIds = Object.keys(detalles).filter(function (id) { return detalles[id].checked })
    if (selectedIds.length > 0) {
      const capsPayload = selectedIds.map(function (capId) {
        return {
          actividad_id: actividadId, capacidad_id: capId,
          criterio: detalles[capId].criterio || '', desempeno: detalles[capId].desempeno || '',
          desc_ad: detalles[capId].desc_ad || '', desc_a: detalles[capId].desc_a || '',
          desc_b: detalles[capId].desc_b || '', desc_c: detalles[capId].desc_c || '',
        }
      })
      const capsResult = await supabase.from('actividad_capacidades').insert(capsPayload)
      if (capsResult.error) { setError(capsResult.error.message); return }

      // Si es Lista de cotejo, guardar los criterios individuales de cada Capacidad seleccionada
      if (tipoInstrumento === 'Lista de cotejo') {
        const criteriosPayload = []
        selectedIds.forEach(function (capId) {
          const lista = (detalles[capId].criteriosLista || []).filter(function (texto) { return texto.trim() })
          lista.forEach(function (texto, i) {
            criteriosPayload.push({ actividad_id: actividadId, capacidad_id: capId, texto: texto.trim(), orden: i + 1 })
          })
        })
        if (criteriosPayload.length > 0) {
          const critResult = await supabase.from('criterios_cotejo').insert(criteriosPayload)
          if (critResult.error) { setError(critResult.error.message); return }
        }
      }
    }

    resetForm()
    setShowForm(false)
    loadActivities()
  }

  async function handleDelete(id) {
    if (!confirm('¿Eliminar esta actividad? También se borrarán sus materiales y tareas.')) return
    const result = await supabase.from('actividades').delete().eq('id', id)
    if (result.error) alert('Error: ' + result.error.message)
    else loadActivities()
  }

  if (loading) return <p className="text-slate-400 text-sm">Cargando...</p>

  return (
    <div>
      <button onClick={onBack} className="text-sm font-semibold mb-4 hover:underline flex items-center gap-1" style={{ color: NAVY }}>
        ← Volver a carpetas
      </button>

      <div className="flex items-center gap-2 mb-4">
        <FolderIcon big />
        <div>
          <p className="text-xs font-semibold" style={{ color: GREEN_DARK }}>{unidad.tipo} {unidad.numero}</p>
          <h3 className="text-lg font-bold" style={{ color: NAVY_DARK }}>{unidad.nombre || `${unidad.tipo} ${unidad.numero}`}</h3>
        </div>
      </div>

      <div className="flex gap-2 mb-5 border-b" style={{ borderColor: '#E5E9F0' }}>
        {[{ id: 'actividades', label: 'Actividades' }, { id: 'cierre', label: 'Evaluación de Cierre' }].map(function (t) {
          const active = subTab === t.id
          return (
            <button key={t.id} onClick={function () { setSubTab(t.id) }}
              className="px-4 py-2.5 text-sm font-semibold border-b-2 transition"
              style={active ? { borderColor: GREEN, color: NAVY_DARK } : { borderColor: 'transparent', color: '#94A3B8' }}>
              {t.label}
            </button>
          )
        })}
      </div>

      {subTab === 'cierre' && (
        <EvaluacionCierre unidad={{ ...unidad, course_id: courseId }} />
      )}

      {subTab === 'actividades' && (
        <>
      <div className="flex justify-end mb-3">
        <button
          onClick={function () { if (showForm) setShowForm(false); else openNew() }}
          className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white transition hover:opacity-90"
          style={{ backgroundColor: GREEN }}
        >
          {showForm ? 'Cancelar' : '+ Nueva actividad'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="rounded-xl p-4 mb-5 space-y-3" style={{ backgroundColor: '#F4F6F9', border: '1px solid #E5E9F0' }}>
          <h4 className="text-sm font-semibold" style={{ color: NAVY_DARK }}>{editingId ? 'Editar actividad' : 'Nueva actividad'}</h4>
          {!editingId && (
            <p className="text-xs font-semibold" style={{ color: GREEN_DARK }}>Esta será la Actividad N.° {activities.length + 1} de esta carpeta</p>
          )}
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: NAVY_DARK }}>Nombre de la actividad</label>
            <input type="text" value={nombre} onChange={function (e) { setNombre(e.target.value) }} required
              placeholder="Ej: La célula y sus funciones" className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={inputStyle} />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: NAVY_DARK }}>Fecha de clase (opcional)</label>
            <input type="date" value={fechaClase} onChange={function (e) { setFechaClase(e.target.value) }}
              className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={inputStyle} />
            <p className="text-xs text-slate-400 mt-1">Si el estudiante faltó ese día (sin justificar), su casilla en el Registro Auxiliar queda en blanco.</p>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: NAVY_DARK }}>Instrumento de evaluación</label>
            <div className="flex gap-2">
              {['Lista de cotejo', 'Rúbrica'].map(function (t) {
                const active = tipoInstrumento === t
                return (
                  <button key={t} type="button" onClick={function () { setTipoInstrumento(t) }}
                    className="text-xs font-semibold px-3 py-1.5 rounded-lg transition"
                    style={active ? { backgroundColor: GREEN, color: 'white' } : { backgroundColor: 'white', color: NAVY_DARK, border: '1px solid #D6DCE5' }}>
                    {t}
                  </button>
                )
              })}
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: NAVY_DARK }}>Propósito</label>
            <textarea value={proposito} onChange={function (e) { setProposito(e.target.value) }} rows={2}
              placeholder="Propósito de aprendizaje de esta actividad" className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={inputStyle} />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: NAVY_DARK }}>Competencia</label>
            <select value={competenciaId} onChange={async function (e) { setCompetenciaId(e.target.value); setDetalles({}); await loadCapacidadesFor(e.target.value) }}
              className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={inputStyle}>
              <option value="">-- Selecciona una competencia --</option>
              {competencias.map(function (c) { return <option key={c.id} value={c.id}>{c.codigo} — {c.nombre}</option> })}
            </select>
          </div>
          {capacidadesDisponibles.length > 0 && (
            <div>
              <label className="block text-xs font-medium mb-2" style={{ color: NAVY_DARK }}>Capacidades a evaluar</label>
              <div className="space-y-2">
                {capacidadesDisponibles.map(function (cap) {
                  const det = detalles[cap.id]
                  const checked = det?.checked || false
                  return (
                    <div key={cap.id} className="rounded-lg p-3" style={{ backgroundColor: 'white', border: '1px solid #D6DCE5' }}>
                      <label className="flex items-start gap-2 text-sm cursor-pointer">
                        <input type="checkbox" checked={checked} onChange={function () { toggleCapacidad(cap.id) }} className="mt-0.5" />
                        <span style={{ color: NAVY_DARK }}>{cap.nombre}</span>
                      </label>
                      {checked && (
                        <div className="mt-2 pl-6 space-y-2">
                          {tipoInstrumento === 'Rúbrica' ? (
                            <>
                              <textarea value={det?.desc_ad || ''} onChange={function (e) { updateDetalle(cap.id, 'desc_ad', e.target.value) }} placeholder="Descripción nivel AD" rows={2} className="w-full rounded-lg px-3 py-1.5 text-xs outline-none" style={{ backgroundColor: '#F4F6F9', border: '1px solid #D6DCE5', color: NAVY_DARK }} />
                              <textarea value={det?.desc_a || ''} onChange={function (e) { updateDetalle(cap.id, 'desc_a', e.target.value) }} placeholder="Descripción nivel A" rows={2} className="w-full rounded-lg px-3 py-1.5 text-xs outline-none" style={{ backgroundColor: '#F4F6F9', border: '1px solid #D6DCE5', color: NAVY_DARK }} />
                              <textarea value={det?.desc_b || ''} onChange={function (e) { updateDetalle(cap.id, 'desc_b', e.target.value) }} placeholder="Descripción nivel B" rows={2} className="w-full rounded-lg px-3 py-1.5 text-xs outline-none" style={{ backgroundColor: '#F4F6F9', border: '1px solid #D6DCE5', color: NAVY_DARK }} />
                              <textarea value={det?.desc_c || ''} onChange={function (e) { updateDetalle(cap.id, 'desc_c', e.target.value) }} placeholder="Descripción nivel C" rows={2} className="w-full rounded-lg px-3 py-1.5 text-xs outline-none" style={{ backgroundColor: '#F4F6F9', border: '1px solid #D6DCE5', color: NAVY_DARK }} />
                            </>
                          ) : tipoInstrumento === 'Lista de cotejo' ? (
                            <>
                              <p className="text-[11px] text-slate-500 mb-1">
                                Escribe cada criterio por separado — al calificar, se marcarán uno por uno. Con 1 solo criterio, la nota queda a tu criterio; con varios, se sugiere según cuántos cumplió.
                              </p>
                              {(det?.criteriosLista || ['']).map(function (texto, i) {
                                return (
                                  <div key={i} className="flex gap-1.5 items-center">
                                    <input
                                      type="text"
                                      value={texto}
                                      onChange={function (e) { actualizarCriterioLista(cap.id, i, e.target.value) }}
                                      placeholder={`Criterio ${i + 1}`}
                                      className="flex-1 rounded-lg px-3 py-1.5 text-xs outline-none"
                                      style={{ backgroundColor: '#F4F6F9', border: '1px solid #D6DCE5', color: NAVY_DARK }}
                                    />
                                    {(det?.criteriosLista || ['']).length > 1 && (
                                      <button type="button" onClick={function () { quitarCriterioLista(cap.id, i) }} className="text-xs font-semibold px-2 py-1 rounded text-white flex-shrink-0" style={{ backgroundColor: '#B91C1C' }}>×</button>
                                    )}
                                  </div>
                                )
                              })}
                              <button type="button" onClick={function () { agregarCriterioLista(cap.id) }} className="text-xs font-semibold px-2 py-1 rounded-lg transition" style={{ backgroundColor: 'white', color: GREEN_DARK, border: '1px solid #D6DCE5' }}>
                                + Agregar criterio
                              </button>
                              <input type="text" value={det?.desempeno || ''} onChange={function (e) { updateDetalle(cap.id, 'desempeno', e.target.value) }} placeholder="Desempeño (opcional)" className="w-full rounded-lg px-3 py-1.5 text-xs outline-none mt-2" style={{ backgroundColor: '#F4F6F9', border: '1px solid #D6DCE5', color: NAVY_DARK }} />
                            </>
                          ) : (
                            <>
                              <input type="text" value={det?.criterio || ''} onChange={function (e) { updateDetalle(cap.id, 'criterio', e.target.value) }} placeholder="Criterio de evaluación" className="w-full rounded-lg px-3 py-1.5 text-xs outline-none" style={{ backgroundColor: '#F4F6F9', border: '1px solid #D6DCE5', color: NAVY_DARK }} />
                              <input type="text" value={det?.desempeno || ''} onChange={function (e) { updateDetalle(cap.id, 'desempeno', e.target.value) }} placeholder="Desempeño (opcional)" className="w-full rounded-lg px-3 py-1.5 text-xs outline-none" style={{ backgroundColor: '#F4F6F9', border: '1px solid #D6DCE5', color: NAVY_DARK }} />
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <button type="submit" className="font-semibold px-4 py-2 rounded-lg text-white transition hover:opacity-90" style={{ background: `linear-gradient(90deg, ${NAVY}, ${GREEN})`, boxShadow: '0 8px 20px rgba(37,99,235,0.3)' }}>
            {editingId ? 'Guardar cambios' : 'Crear actividad'}
          </button>
        </form>
      )}

      {activities.length === 0 ? (
        <p className="text-slate-400 text-sm">Aún no hay actividades en esta carpeta.</p>
      ) : (
        <ul className="space-y-3">
          {activities.map(function (a) {
            return (
              <li key={a.id} className="rounded-xl p-4" style={{ backgroundColor: '#F4F6F9', border: '1px solid #E5E9F0' }}>
                <div className="flex justify-between items-start flex-wrap gap-3">
                  <button onClick={function () { onSelectActividad(a) }} className="text-left flex-1">
                    <p className="text-sm font-bold" style={{ color: NAVY_DARK }}>Actividad {a.numero_actividad} · {a.nombre}</p>
                    {a.competencia && <p className="text-xs text-slate-500 mt-1">{a.competencia.codigo} — {a.competencia.nombre}</p>}
                    <p className="text-xs mt-1" style={{ color: GREEN_DARK }}>Ver materiales y tareas →</p>
                  </button>
                  <div className="flex gap-2">
                    <button onClick={function () { openEdit(a) }} className="text-xs font-semibold px-3 py-1.5 rounded-lg transition" style={{ backgroundColor: 'white', color: NAVY, border: '1px solid #D6DCE5' }}>Editar</button>
                    <button onClick={function () { handleDelete(a.id) }} className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white transition hover:opacity-90" style={{ backgroundColor: '#B91C1C' }}>Eliminar</button>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
        </>
      )}
    </div>
  )
}

// ============================================================
// NIVEL 3: Contenido de una Actividad (Materiales + Tareas)
// ============================================================
function ActividadContenido({ actividad, onBack }) {
  const [tab, setTab] = useState('materiales')

  return (
    <div>
      <button onClick={onBack} className="text-sm font-semibold mb-4 hover:underline flex items-center gap-1" style={{ color: NAVY }}>
        ← Volver a la carpeta
      </button>

      <h3 className="text-lg font-bold mb-4" style={{ color: NAVY_DARK }}>
        Actividad {actividad.numero_actividad} · {actividad.nombre}
      </h3>

      <div className="flex gap-2 mb-6 border-b" style={{ borderColor: '#E5E9F0' }}>
        {[{ id: 'materiales', label: 'Materiales' }, { id: 'tareas', label: 'Tareas' }, { id: 'notasclase', label: 'Notas de Clase' }].map(function (t) {
          const active = tab === t.id
          return (
            <button key={t.id} onClick={function () { setTab(t.id) }}
              className="px-4 py-2.5 text-sm font-semibold border-b-2 transition"
              style={active ? { borderColor: GREEN, color: NAVY_DARK } : { borderColor: 'transparent', color: '#94A3B8' }}>
              {t.label}
            </button>
          )
        })}
      </div>

      {tab === 'materiales' && <CourseMaterials courseId={actividad.course_id} actividadId={actividad.id} canUpload={true} />}
      {tab === 'tareas' && <ActividadTareas actividad={actividad} />}
      {tab === 'notasclase' && <NotasClasePorActividad actividad={actividad} />}
    </div>
  )
}

// ============================================================
// Tareas de una Actividad específica (sin selector, ya está en contexto)
// ============================================================
function ActividadTareas({ actividad }) {
  const { session } = useAuth()
  const [assignments, setAssignments] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)

  const capacidadesDeActividad = actividad.actividad_capacidades || []

  const [selectedCapacidades, setSelectedCapacidades] = useState([])
  const [titulo, setTitulo] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [fechaEntrega, setFechaEntrega] = useState('')
  const [puntajeMax, setPuntajeMax] = useState(20)
  const [instrumento, setInstrumento] = useState('')
  const [tipoEntrega, setTipoEntrega] = useState('individual')
  const [linkDrive, setLinkDrive] = useState('')
  const [habilitarNotasClase, setHabilitarNotasClase] = useState(false)

  const [selectedAssignment, setSelectedAssignment] = useState(null)
  const [assignmentCapacidades, setAssignmentCapacidades] = useState([])
  const [submissions, setSubmissions] = useState([])
  const [submissionScoresMap, setSubmissionScoresMap] = useState({})
  const [criteriosPorCapacidad, setCriteriosPorCapacidad] = useState({})
  const [criterioChecksMap, setCriterioChecksMap] = useState({})
  const [justificaciones, setJustificaciones] = useState([])
  const [enrolledStudents, setEnrolledStudents] = useState([])
  const [gruposCurso, setGruposCurso] = useState([])
  const [loadingSubs, setLoadingSubs] = useState(false)
  const [aplicandoCeros, setAplicandoCeros] = useState(false)
  const [publicandoNotas, setPublicandoNotas] = useState(false)
  const [preview, setPreview] = useState(null)

  useEffect(function () {
    loadAssignments()
  }, [actividad.id])

  async function loadAssignments() {
    setLoading(true)
    const result = await supabase
      .from('assignments')
      .select('*, assignment_capacidades(capacidad:capacidades(nombre))')
      .eq('actividad_id', actividad.id)
      .order('fecha_entrega', { ascending: false })
    if (result.error) {
      setError(result.error.message)
      setLoading(false)
      return
    }

    const enrollResult = await supabase
      .from('enrollments')
      .select('id', { count: 'exact', head: true })
      .eq('course_id', actividad.course_id)
      .eq('status', 'activo')
    const totalMatriculados = enrollResult.count || 0

    const assignmentIds = result.data.map(function (a) { return a.id })
    let countMap = {}
    if (assignmentIds.length > 0) {
      const subsCountResult = await supabase
        .from('submissions')
        .select('assignment_id, file_url')
        .in('assignment_id', assignmentIds)
      if (!subsCountResult.error) {
        subsCountResult.data.forEach(function (s) {
          if (s.file_url == null) return // registrado en 0 por el docente, no es una entrega real
          countMap[s.assignment_id] = (countMap[s.assignment_id] || 0) + 1
        })
      }
    }

    const enriched = result.data.map(function (a) {
      return { ...a, totalMatriculados: totalMatriculados, totalEntregados: countMap[a.id] || 0 }
    })

    setAssignments(enriched)
    setLoading(false)
  }

  function resetForm() {
    setEditingId(null)
    setSelectedCapacidades([])
    setTitulo('')
    setDescripcion('')
    setFechaEntrega('')
    setPuntajeMax(20)
    setInstrumento('')
    setTipoEntrega('individual')
    setLinkDrive('')
    setHabilitarNotasClase(false)
  }

  function openNew() {
    resetForm()
    setShowForm(true)
  }

  async function openEdit(a) {
    setEditingId(a.id)
    setTitulo(a.titulo)
    setDescripcion(a.descripcion || '')
    const d = new Date(a.fecha_entrega)
    const pad = function (n) { return String(n).padStart(2, '0') }
    setFechaEntrega(d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()))
    setPuntajeMax(a.puntaje_maximo)
    setInstrumento(a.instrumento_evaluacion || '')
    setTipoEntrega(a.tipo_entrega || 'individual')
    setLinkDrive(a.link_url || '')
    setHabilitarNotasClase(!!a.habilitar_notas_clase)
    const acResult = await supabase.from('assignment_capacidades').select('capacidad_id').eq('assignment_id', a.id)
    setSelectedCapacidades(!acResult.error ? acResult.data.map(function (x) { return x.capacidad_id }) : [])
    setShowForm(true)
  }

  function toggleCapacidad(capId) {
    setSelectedCapacidades(function (prev) {
      return prev.includes(capId) ? prev.filter(function (id) { return id !== capId }) : [...prev, capId]
    })
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (selectedCapacidades.length === 0) {
      setError('Selecciona al menos una capacidad a evaluar.')
      return
    }

    const acs = capacidadesDeActividad.filter(function (ac) { return selectedCapacidades.includes(ac.capacidad.id) })
    const capacidadTexto = acs.map(function (ac) { return ac.capacidad.nombre }).join('; ')
    const criterioTexto = acs.map(function (ac) { return ac.criterio }).filter(Boolean).join(' | ')
    const desempenoTexto = acs.map(function (ac) { return ac.desempeno }).filter(Boolean).join(' | ')

    const payload = {
      course_id: actividad.course_id,
      actividad_id: actividad.id,
      titulo: titulo,
      descripcion: descripcion,
      fecha_entrega: fechaEntrega ? `${fechaEntrega}:00-05:00` : fechaEntrega,
      puntaje_maximo: puntajeMax,
      instrumento_evaluacion: instrumento,
      tipo_entrega: tipoEntrega,
      competencia: actividad.competencia?.nombre || '',
      capacidad: capacidadTexto,
      criterio: criterioTexto,
      tema: actividad.nombre,
      desempeno: desempenoTexto,
      link_url: linkDrive.trim() || null,
      habilitar_notas_clase: habilitarNotasClase,
    }

    let assignmentId = editingId
    let result
    if (editingId) {
      result = await supabase.from('assignments').update(payload).eq('id', editingId)
    } else {
      payload.created_by = session.user.id
      result = await supabase.from('assignments').insert(payload).select('id').single()
      if (!result.error) assignmentId = result.data.id
    }
    if (result.error) { setError(result.error.message); return }

    if (editingId) {
      await supabase.from('assignment_capacidades').delete().eq('assignment_id', assignmentId)
    }
    const acsPayload = selectedCapacidades.map(function (capId) { return { assignment_id: assignmentId, capacidad_id: capId } })
    const acsResult = await supabase.from('assignment_capacidades').insert(acsPayload)
    if (acsResult.error) { setError(acsResult.error.message); return }

    resetForm()
    setShowForm(false)
    loadAssignments()

    if (!editingId) {
      const enrollResult = await supabase
        .from('enrollments')
        .select('student_id')
        .eq('course_id', actividad.course_id)
        .eq('status', 'activo')
      if (!enrollResult.error && enrollResult.data.length > 0) {
        const notifs = enrollResult.data.map(function (e) {
          return {
            user_id: e.student_id,
            tipo: 'tarea_nueva',
            titulo: 'Nueva tarea: ' + titulo,
            mensaje: actividad.nombre,
          }
        })
        await supabase.from('notificaciones').insert(notifs)
      }
    }
  }

  async function handleDeleteAssignment(id) {
    if (!confirm('¿Eliminar esta tarea? También se borrarán las entregas.')) return
    const result = await supabase.from('assignments').delete().eq('id', id)
    if (result.error) alert('Error: ' + result.error.message)
    else { loadAssignments(); setSelectedAssignment(null) }
  }

  async function openSubmissions(a) {
    setSelectedAssignment(a)
    setLoadingSubs(true)

    const acResult = await supabase.from('assignment_capacidades').select('capacidad:capacidades(id, nombre, orden)').eq('assignment_id', a.id)
    const caps = !acResult.error
      ? acResult.data.map(function (x) { return x.capacidad }).sort(function (x, y) { return (x.orden || 0) - (y.orden || 0) })
      : []
    setAssignmentCapacidades(caps)

    // Criterios individuales de la Lista de Cotejo, si esta Actividad los tiene
    let criteriosPorCapacidad = {}
    if (actividad.tipo_instrumento === 'Lista de cotejo' && caps.length > 0) {
      const critResult = await supabase.from('criterios_cotejo').select('id, capacidad_id, texto, orden').eq('actividad_id', actividad.id).order('orden')
      ;(critResult.data || []).forEach(function (c) {
        if (!criteriosPorCapacidad[c.capacidad_id]) criteriosPorCapacidad[c.capacidad_id] = []
        criteriosPorCapacidad[c.capacidad_id].push(c)
      })
    }
    setCriteriosPorCapacidad(criteriosPorCapacidad)

    const result = await supabase.from('submissions').select('*, student:profiles!submissions_student_id_fkey(full_name, email)').eq('assignment_id', a.id).order('submitted_at', { ascending: false })
    if (result.error) { setSubmissions([]); setLoadingSubs(false); return }
    setSubmissions(result.data)

    const submissionIds = result.data.map(function (s) { return s.id })
    let scoresMap = {}
    if (submissionIds.length > 0) {
      const scoresResult = await supabase.from('submission_scores').select('submission_id, capacidad_id, score').in('submission_id', submissionIds)
      if (!scoresResult.error) scoresResult.data.forEach(function (s) { scoresMap[`${s.submission_id}__${s.capacidad_id}`] = s.score })
    }
    setSubmissionScoresMap(scoresMap)

    // Checks de criterios ya marcados, por Entrega
    let checksMap = {}
    if (submissionIds.length > 0) {
      const checksResult = await supabase.from('submission_criterio_checks').select('submission_id, criterio_id, cumplido').in('submission_id', submissionIds)
      ;(checksResult.data || []).forEach(function (c) { checksMap[`${c.submission_id}__${c.criterio_id}`] = c.cumplido })
    }
    setCriterioChecksMap(checksMap)

    const justResult = await supabase
      .from('justificaciones')
      .select('*, student:profiles!justificaciones_student_id_fkey(full_name)')
      .eq('assignment_id', a.id)
      .order('created_at', { ascending: false })
    if (justResult.error) console.error('Error cargando justificaciones:', justResult.error)
    setJustificaciones(!justResult.error ? justResult.data : [])

    const enrollResult = await supabase
      .from('enrollments')
      .select('student:profiles(id, full_name)')
      .eq('course_id', actividad.course_id)
      .eq('status', 'activo')
    setEnrolledStudents(!enrollResult.error ? enrollResult.data.map(function (e) { return e.student }) : [])

    if (a.tipo_entrega === 'grupal') {
      const gruposResult = await supabase
        .from('grupos_trabajo')
        .select('id, nombre, grupos_trabajo_miembros(student_id)')
        .eq('course_id', actividad.course_id)
      setGruposCurso(!gruposResult.error ? gruposResult.data : [])
    } else {
      setGruposCurso([])
    }

    setLoadingSubs(false)
  }

  async function handlePreview(path) {
    const result = await supabase.storage.from('entregas').createSignedUrl(path, 300)
    if (result.error) { alert('Error: ' + result.error.message); return }
    const parts = path.split('/')
    const name = parts[parts.length - 1]
    const ext = name.split('.').pop().toLowerCase()
    setPreview({ url: result.data.signedUrl, type: ext, name: name })
  }

  async function handleRevisarJustificacion(justId, nuevoEstado) {
    const justificacionActual = justificaciones.find(function (j) { return j.id === justId })
    await supabase
      .from('justificaciones')
      .update({ estado: nuevoEstado, reviewed_by: session.user.id, reviewed_at: new Date().toISOString() })
      .eq('id', justId)

    if (justificacionActual) {
      await supabase.from('notificaciones').insert({
        user_id: justificacionActual.student_id,
        tipo: 'justificacion',
        titulo: nuevoEstado === 'aprobada' ? 'Tu justificación fue aprobada' : 'Tu justificación fue rechazada',
        mensaje: selectedAssignment?.titulo || '',
        referencia_id: selectedAssignment?.id || null,
      })
    }
    openSubmissions(selectedAssignment)
  }

  async function handleGradeCapacidad(submissionId, capacidadId, scoreStr) {
    const numScore = Number(scoreStr)
    if (isNaN(numScore) || numScore < 0 || numScore > 20) { alert('La nota debe ser un número entre 0 y 20.'); return }

    let idsAActualizar = [submissionId]

    if (selectedAssignment?.tipo_entrega === 'grupal') {
      const submissionActual = submissions.find(function (s) { return s.id === submissionId })
      if (submissionActual) {
        const miembroResult = await supabase
          .from('grupos_trabajo_miembros')
          .select('grupo_id, grupo:grupos_trabajo!inner(course_id)')
          .eq('student_id', submissionActual.student_id)
          .eq('grupo.course_id', actividad.course_id)
        const grupoIds = (miembroResult.data || []).map(function (m) { return m.grupo_id })
        if (grupoIds.length > 0) {
          const otrosMiembrosResult = await supabase
            .from('grupos_trabajo_miembros')
            .select('student_id')
            .in('grupo_id', grupoIds)
          const idsCompaneros = new Set((otrosMiembrosResult.data || []).map(function (m) { return m.student_id }))
          const otrasSubmissions = submissions.filter(function (s) { return idsCompaneros.has(s.student_id) && s.id !== submissionId })
          idsAActualizar = idsAActualizar.concat(otrasSubmissions.map(function (s) { return s.id }))
        }
      }
    }

    for (const subId of idsAActualizar) {
      await supabase.from('submission_scores').upsert(
        { submission_id: subId, capacidad_id: capacidadId, score: numScore, graded_by: session.user.id, graded_at: new Date().toISOString() },
        { onConflict: 'submission_id,capacidad_id' }
      )
      const allScoresResult = await supabase.from('submission_scores').select('score').eq('submission_id', subId)
      const values = (allScoresResult.data || []).map(function (s) { return s.score }).filter(function (s) { return s != null })
      const avg = values.length > 0 ? values.reduce(function (a, b) { return a + b }, 0) / values.length : null
      await supabase.from('submissions').update({ score: avg, graded_by: session.user.id, graded_at: new Date().toISOString() }).eq('id', subId)
    }

    openSubmissions(selectedAssignment)
  }

  // ============================================================
  // Nota equivalente por nivel, para cuando se califica marcando criterios
  // (Lista de Cotejo) en vez de escribir un número directo.
  // ============================================================
  const NOTA_POR_NIVEL = { AD: 19, A: 16, B: 12, C: 8 }

  // Marca/desmarca un criterio de la Lista de Cotejo, y calcula la nota sugerida
  // según cuántos de los criterios de esa Capacidad ya están marcados:
  // 0 marcados → C · algunos (menos de la mitad) → B · algunos (la mitad o más) → A
  // todos marcados → se le pregunta al docente si es AD o A (mejor logro, a su criterio)
  async function handleToggleCriterio(submissionId, criterioId, capacidadId) {
    const key = `${submissionId}__${criterioId}`
    const nuevoValor = !criterioChecksMap[key]

    const result = await supabase.from('submission_criterio_checks').upsert(
      { submission_id: submissionId, criterio_id: criterioId, cumplido: nuevoValor },
      { onConflict: 'submission_id,criterio_id' }
    )
    if (result.error) { alert('Error al guardar: ' + result.error.message); return }

    const nuevoMapa = { ...criterioChecksMap, [key]: nuevoValor }
    setCriterioChecksMap(nuevoMapa)

    const criteriosDeLaCapacidad = criteriosPorCapacidad[capacidadId] || []
    const total = criteriosDeLaCapacidad.length
    const cumplidos = criteriosDeLaCapacidad.filter(function (c) { return nuevoMapa[`${submissionId}__${c.id}`] }).length

    if (total === 0) return
    if (cumplidos === total) return // todos cumplidos: se espera que el docente elija AD o A con el botón de abajo

    const ratio = cumplidos / total
    const nivelSugerido = cumplidos === 0 ? 'C' : (ratio < 0.5 ? 'B' : 'A')
    await handleGradeCapacidad(submissionId, capacidadId, String(NOTA_POR_NIVEL[nivelSugerido]))
  }

  async function handleElegirNivelMaximo(submissionId, capacidadId, nivel) {
    await handleGradeCapacidad(submissionId, capacidadId, String(NOTA_POR_NIVEL[nivel]))
  }

  async function registrarCeroParaEstudiante(studentId) {
    const nowIso = new Date().toISOString()

    const insertResult = await supabase
      .from('submissions')
      .insert({
        assignment_id: selectedAssignment.id,
        student_id: studentId,
        file_url: null,
        submitted_at: nowIso,
        score: 0,
        graded_by: session.user.id,
        graded_at: nowIso,
        publicado: true,
      })
      .select('id')
      .single()

    if (insertResult.error) {
      alert('Error al registrar 0: ' + insertResult.error.message)
      return
    }

    const submissionId = insertResult.data.id
    if (assignmentCapacidades.length > 0) {
      const scoresPayload = assignmentCapacidades.map(function (cap) {
        return {
          submission_id: submissionId,
          capacidad_id: cap.id,
          score: 0,
          graded_by: session.user.id,
          graded_at: nowIso,
        }
      })
      await supabase.from('submission_scores').insert(scoresPayload)
    }
  }

  async function handleZeroUnStudent(studentId) {
    if (!confirm('¿Registrar 0 (C) para este estudiante en esta tarea? Se guardará como que no entregó.')) return
    await registrarCeroParaEstudiante(studentId)
    openSubmissions(selectedAssignment)
  }

  async function handleZeroTodos() {
    if (missingStudents.length === 0) return
    if (!confirm(`¿Registrar 0 (C) para los ${missingStudents.length} estudiante(s) que no entregaron esta tarea?`)) return
    setAplicandoCeros(true)
    for (const student of missingStudents) {
      await registrarCeroParaEstudiante(student.id)
    }
    setAplicandoCeros(false)
    openSubmissions(selectedAssignment)
  }

  async function handleSubirNotas() {
    if (submissions.length === 0) {
      alert('No hay entregas registradas todavía para publicar.')
      return
    }
    if (!confirm('¿Publicar las notas de esta tarea? Se harán visibles en Instrumento de Evaluación, Registro Auxiliar y para los estudiantes.')) return
    setPublicandoNotas(true)
    await supabase.from('submissions').update({ publicado: true }).eq('assignment_id', selectedAssignment.id)

    const notifs = submissions.map(function (s) {
      return {
        user_id: s.student_id,
        tipo: 'nota_publicada',
        titulo: 'Se publicó tu nota',
        mensaje: selectedAssignment.titulo,
      }
    })
    if (notifs.length > 0) await supabase.from('notificaciones').insert(notifs)

    setPublicandoNotas(false)
    openSubmissions(selectedAssignment)
    alert('Notas publicadas correctamente.')
  }

  const submittedStudentIds = new Set(submissions.map(function (s) { return s.student_id }))
  const missingStudents = enrolledStudents.filter(function (s) { return !submittedStudentIds.has(s.id) })
  const yaVencio = selectedAssignment ? new Date(selectedAssignment.fecha_entrega) < new Date() : false
  const hayNotasSinPublicar = submissions.some(function (s) { return !s.publicado })

  if (selectedAssignment) {
    return (
      <div>
        <button onClick={function () { setSelectedAssignment(null) }} className="text-sm font-semibold mb-4 hover:underline" style={{ color: NAVY }}>← Volver a tareas</button>
        <h3 className="text-lg font-bold mb-1" style={{ color: NAVY_DARK }}>{selectedAssignment.titulo}</h3>
        {selectedAssignment.link_url && (
          <a href={selectedAssignment.link_url} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold inline-block mb-2" style={{ color: NAVY }}>
            📎 Ver material adjunto (Drive)
          </a>
        )}
        <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
          <p className="text-slate-500 text-sm">Entrega: {new Date(selectedAssignment.fecha_entrega).toLocaleString('es-PE')}</p>
          <button
            onClick={handleSubirNotas}
            disabled={publicandoNotas || submissions.length === 0}
            className="text-xs font-semibold px-4 py-2 rounded-lg text-white transition hover:opacity-90 disabled:opacity-50"
            style={{ backgroundColor: hayNotasSinPublicar ? '#B45309' : GREEN }}
          >
            {publicandoNotas ? 'Publicando...' : hayNotasSinPublicar ? 'Subir notas (hay cambios sin publicar)' : 'Subir notas'}
          </button>
        </div>

        {selectedAssignment.habilitar_notas_clase && (
          <NotasClaseSeccion assignmentId={selectedAssignment.id} courseId={actividad.course_id} />
        )}

        {justificaciones.filter(function (j) { return j.estado === 'pendiente' }).length > 0 && (
          <div className="mb-5 rounded-xl p-4" style={{ backgroundColor: '#FFF7E6', border: '1px solid #F5D98A' }}>
            <h4 className="text-sm font-bold mb-3" style={{ color: '#B45309' }}>Justificaciones pendientes de revisión</h4>
            <ul className="space-y-3">
              {justificaciones.filter(function (j) { return j.estado === 'pendiente' }).map(function (j) {
                return (
                  <li key={j.id} className="rounded-lg p-3" style={{ backgroundColor: 'white', border: '1px solid #E5E9F0' }}>
                    <p className="text-sm font-semibold" style={{ color: NAVY_DARK }}>{j.student?.full_name}</p>
                    <p className="text-sm text-slate-600 mt-1">{j.mensaje}</p>
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      {j.file_url && (
                        <button
                          onClick={function () { handlePreview(j.file_url) }}
                          className="text-xs font-semibold px-3 py-1.5 rounded-lg transition"
                          style={{ backgroundColor: 'white', color: NAVY, border: '1px solid #D6DCE5' }}
                        >
                          Ver evidencia
                        </button>
                      )}
                      <button
                        onClick={function () { handleRevisarJustificacion(j.id, 'aprobada') }}
                        className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white transition hover:opacity-90"
                        style={{ backgroundColor: GREEN }}
                      >
                        Aprobar (habilitar entrega)
                      </button>
                      <button
                        onClick={function () { handleRevisarJustificacion(j.id, 'rechazada') }}
                        className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white transition hover:opacity-90"
                        style={{ backgroundColor: '#B91C1C' }}
                      >
                        Rechazar
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>
        )}

        {yaVencio && missingStudents.length > 0 && (
          <div className="mb-5 rounded-xl p-4" style={{ backgroundColor: '#FDECEC', border: '1px solid #F5C6C6' }}>
            <div className="flex justify-between items-center mb-3 flex-wrap gap-2">
              <h4 className="text-sm font-bold" style={{ color: '#B91C1C' }}>
                {missingStudents.length} estudiante(s) no entregaron esta tarea (vencida)
              </h4>
              <button
                onClick={handleZeroTodos}
                disabled={aplicandoCeros}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white transition hover:opacity-90 disabled:opacity-50"
                style={{ backgroundColor: '#B91C1C' }}
              >
                {aplicandoCeros ? 'Registrando...' : `Registrar 0 (C) a todos`}
              </button>
            </div>
            <ul className="space-y-2">
              {missingStudents.map(function (s) {
                return (
                  <li key={s.id} className="flex justify-between items-center rounded-lg px-3 py-2" style={{ backgroundColor: 'white', border: '1px solid #E5E9F0' }}>
                    <span className="text-sm" style={{ color: NAVY_DARK }}>{s.full_name}</span>
                    <button
                      onClick={function () { handleZeroUnStudent(s.id) }}
                      className="text-xs font-semibold px-3 py-1 rounded-lg text-white transition hover:opacity-90"
                      style={{ backgroundColor: '#B91C1C' }}
                    >
                      Registrar 0 (C)
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        )}

        {loadingSubs ? <p className="text-slate-400 text-sm">Cargando...</p> : submissions.length === 0 ? (
          <p className="text-slate-400 text-sm">Ningún alumno ha entregado aún.</p>
        ) : selectedAssignment?.tipo_entrega === 'grupal' && gruposCurso.length > 0 ? (
          (function () {
            const idsEnAlgunGrupo = new Set()
            gruposCurso.forEach(function (g) { g.grupos_trabajo_miembros.forEach(function (m) { idsEnAlgunGrupo.add(m.student_id) }) })
            const sueltos = submissions.filter(function (s) { return !idsEnAlgunGrupo.has(s.student_id) })

            return (
              <ul className="space-y-3">
                {gruposCurso.map(function (g) {
                  const miembroIds = g.grupos_trabajo_miembros.map(function (m) { return m.student_id })
                  const submissionsDelGrupo = submissions.filter(function (s) { return miembroIds.includes(s.student_id) })
                  if (submissionsDelGrupo.length === 0) return null
                  const representante = submissionsDelGrupo[0]
                  const nombresMiembros = submissionsDelGrupo.map(function (s) { return s.student?.full_name }).filter(Boolean).join(', ')

                  return (
                    <li key={g.id} className="rounded-xl p-4" style={{ backgroundColor: '#F4F6F9', border: '1px solid #E5E9F0' }}>
                      <div className="flex justify-between items-start flex-wrap gap-3 mb-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-bold" style={{ color: NAVY_DARK }}>{g.nombre}</p>
                            <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: '#f0e7f7', color: '#8a5cb0' }}>Grupal</span>
                          </div>
                          <p className="text-xs text-slate-500 mt-0.5">{nombresMiembros}</p>
                          {representante.score != null ? (
                            <p className={'text-xs font-semibold mt-1 ' + getLetterColor(representante.score)}>
                              Promedio: {getLetterGrade(representante.score)}
                            </p>
                          ) : (
                            <span className="text-xs font-semibold px-2 py-0.5 rounded-full inline-block mt-1" style={{ backgroundColor: '#FFF7E6', color: '#B45309' }}>
                              Sin calificar
                            </span>
                          )}
                          {!representante.publicado && (
                            <span className="text-xs font-semibold px-2 py-0.5 rounded-full inline-block mt-1 ml-1" style={{ backgroundColor: '#FDECEC', color: '#B91C1C' }}>
                              Sin publicar
                            </span>
                          )}
                        </div>
                        {representante.file_url && (
                          <button onClick={function () { handlePreview(representante.file_url) }} className="text-xs font-semibold px-3 py-1.5 rounded-lg transition" style={{ backgroundColor: 'white', color: NAVY, border: '1px solid #D6DCE5' }}>Ver archivo</button>
                        )}
                      </div>
                      <div className="space-y-2">
                        {assignmentCapacidades.map(function (cap) {
                          return (
                            <CapacidadGradeRow
                              key={cap.id}
                              cap={cap}
                              submission={representante}
                              criteriosPorCapacidad={criteriosPorCapacidad}
                              criterioChecksMap={criterioChecksMap}
                              submissionScoresMap={submissionScoresMap}
                              onToggleCriterio={handleToggleCriterio}
                              onGradeNumerico={handleGradeCapacidad}
                              onElegirNivelMaximo={handleElegirNivelMaximo}
                            />
                          )
                        })}
                      </div>
                    </li>
                  )
                })}

                {sueltos.length > 0 && sueltos.map(function (s) {
                  return (
                    <li key={s.id} className="rounded-xl p-4" style={{ backgroundColor: '#FDECEC', border: '1px solid #F5C6C6' }}>
                      <p className="text-xs font-semibold mb-2" style={{ color: '#B91C1C' }}>Sin grupo asignado</p>
                      <p className="text-sm font-semibold" style={{ color: NAVY_DARK }}>{s.student?.full_name}</p>
                      <div className="space-y-2 mt-2">
                        {assignmentCapacidades.map(function (cap) {
                          return (
                            <CapacidadGradeRow
                              key={cap.id}
                              cap={cap}
                              submission={s}
                              criteriosPorCapacidad={criteriosPorCapacidad}
                              criterioChecksMap={criterioChecksMap}
                              submissionScoresMap={submissionScoresMap}
                              onToggleCriterio={handleToggleCriterio}
                              onGradeNumerico={handleGradeCapacidad}
                              onElegirNivelMaximo={handleElegirNivelMaximo}
                            />
                          )
                        })}
                      </div>
                    </li>
                  )
                })}
              </ul>
            )
          })()
        ) : (
          <ul className="space-y-3">
            {submissions.map(function (s) {
              return (
                <li key={s.id} className="rounded-xl p-4" style={{ backgroundColor: '#F4F6F9', border: '1px solid #E5E9F0' }}>
                  <div className="flex justify-between items-start flex-wrap gap-3 mb-3">
                    <div>
                      <p className="text-sm font-semibold" style={{ color: NAVY_DARK }}>{s.student?.full_name}</p>
                      {s.score != null ? (
                        <p className={'text-xs font-semibold ' + getLetterColor(s.score)}>
                          Promedio: {getLetterGrade(s.score)}{s.file_url == null ? ' (no entregó)' : ''}
                        </p>
                      ) : (
                        <span
                          className="text-xs font-semibold px-2 py-0.5 rounded-full inline-block mt-1"
                          style={{ backgroundColor: '#FFF7E6', color: '#B45309' }}
                        >
                          Sin calificar
                        </span>
                      )}
                      {!s.publicado && (
                        <span
                          className="text-xs font-semibold px-2 py-0.5 rounded-full inline-block mt-1 ml-1"
                          style={{ backgroundColor: '#FDECEC', color: '#B91C1C' }}
                        >
                          Sin publicar
                        </span>
                      )}
                    </div>
                    {s.file_url && (
                      <button onClick={function () { handlePreview(s.file_url) }} className="text-xs font-semibold px-3 py-1.5 rounded-lg transition" style={{ backgroundColor: 'white', color: NAVY, border: '1px solid #D6DCE5' }}>Ver archivo</button>
                    )}
                  </div>
                  <div className="space-y-2">
                    {assignmentCapacidades.map(function (cap) {
                      return (
                        <CapacidadGradeRow
                          key={cap.id}
                          cap={cap}
                          submission={s}
                          criteriosPorCapacidad={criteriosPorCapacidad}
                          criterioChecksMap={criterioChecksMap}
                          submissionScoresMap={submissionScoresMap}
                          onToggleCriterio={handleToggleCriterio}
                          onGradeNumerico={handleGradeCapacidad}
                          onElegirNivelMaximo={handleElegirNivelMaximo}
                        />
                      )
                    })}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
        <PreviewModal preview={preview} onClose={function () { setPreview(null) }} />
      </div>
    )
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h4 className="text-sm font-semibold" style={{ color: NAVY_DARK }}>Tareas de esta actividad</h4>
        <button onClick={function () { if (showForm) setShowForm(false); else openNew() }}
          className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white transition hover:opacity-90" style={{ backgroundColor: GREEN }}>
          {showForm ? 'Cancelar' : '+ Nueva tarea'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="rounded-xl p-4 mb-5 space-y-3" style={{ backgroundColor: '#F4F6F9', border: '1px solid #E5E9F0' }}>
          {capacidadesDeActividad.length > 0 && (
            <div>
              <label className="block text-xs font-medium mb-2" style={{ color: NAVY_DARK }}>¿Qué capacidad(es) evalúa esta tarea?</label>
              <div className="space-y-1.5">
                {capacidadesDeActividad.map(function (ac) {
                  const checked = selectedCapacidades.includes(ac.capacidad.id)
                  return (
                    <label key={ac.capacidad.id} className="flex items-start gap-2 text-sm rounded-lg px-3 py-2 cursor-pointer" style={{ backgroundColor: 'white', border: '1px solid #D6DCE5' }}>
                      <input type="checkbox" checked={checked} onChange={function () { toggleCapacidad(ac.capacidad.id) }} className="mt-0.5" />
                      <span style={{ color: NAVY_DARK }}>{ac.capacidad.nombre}</span>
                    </label>
                  )
                })}
              </div>
            </div>
          )}
          <input type="text" value={titulo} onChange={function (e) { setTitulo(e.target.value) }} required placeholder="Título de la tarea" className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={inputStyle} />
          <textarea value={descripcion} onChange={function (e) { setDescripcion(e.target.value) }} placeholder="Descripción (opcional)" rows={2} className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={inputStyle} />
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: NAVY_DARK }}>Link de Drive (opcional)</label>
            <input
              type="url"
              value={linkDrive}
              onChange={function (e) { setLinkDrive(e.target.value) }}
              placeholder="https://drive.google.com/..."
              className="w-full rounded-lg px-3 py-2 text-sm outline-none"
              style={inputStyle}
            />
            <p className="text-xs text-slate-400 mt-1">Si adjuntas un link, el estudiante lo verá como material de apoyo para hacer la tarea (documento, guía, plantilla, etc.)</p>
          </div>
          <input type="text" value={instrumento} onChange={function (e) { setInstrumento(e.target.value) }} placeholder="Instrumento de evaluación" className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={inputStyle} />
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: NAVY_DARK }}>Tipo de entrega</label>
            <div className="flex gap-2">
              {[{ id: 'individual', label: 'Individual' }, { id: 'grupal', label: 'Grupal' }].map(function (op) {
                const active = tipoEntrega === op.id
                return (
                  <button
                    key={op.id}
                    type="button"
                    onClick={function () { setTipoEntrega(op.id) }}
                    className="flex-1 text-sm font-semibold py-2 rounded-lg transition"
                    style={active ? { backgroundColor: GREEN, color: 'white' } : { backgroundColor: 'white', color: NAVY_DARK, border: '1px solid #D6DCE5' }}
                  >
                    {op.label}
                  </button>
                )
              })}
            </div>
            {tipoEntrega === 'grupal' && (
              <p className="text-xs mt-1" style={{ color: '#B45309' }}>
                Un integrante del grupo sube la tarea y cuenta como entregada para todo el grupo; al calificar a uno, se califica a todos.
              </p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <input type="datetime-local" value={fechaEntrega} onChange={function (e) { setFechaEntrega(e.target.value) }} required className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={inputStyle} />
            <input type="number" value={puntajeMax} onChange={function (e) { setPuntajeMax(e.target.value) }} max={20} min={0} className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={inputStyle} />
          </div>
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input type="checkbox" checked={habilitarNotasClase} onChange={function (e) { setHabilitarNotasClase(e.target.checked) }} className="w-4 h-4 rounded" style={{ accentColor: GREEN }} />
            <span className="text-sm" style={{ color: NAVY_DARK }}>Habilitar notas de clase (se promedia con la nota de la tarea)</span>
          </label>
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <button type="submit" className="font-semibold px-4 py-2 rounded-lg text-white transition hover:opacity-90" style={{ background: `linear-gradient(90deg, ${NAVY}, ${GREEN})`, boxShadow: '0 8px 20px rgba(37,99,235,0.3)' }}>
            {editingId ? 'Guardar cambios' : 'Crear tarea'}
          </button>
        </form>
      )}

      {loading ? <p className="text-slate-400 text-sm">Cargando...</p> : assignments.length === 0 ? (
        <p className="text-slate-400 text-sm">Aún no hay tareas en esta actividad.</p>
      ) : (
        <ul className="space-y-3">
          {assignments.map(function (a) {
            const pct = a.totalMatriculados > 0 ? Math.round((a.totalEntregados / a.totalMatriculados) * 100) : 0
            return (
              <li key={a.id} className="rounded-xl p-4" style={{ backgroundColor: '#F4F6F9', border: '1px solid #E5E9F0' }}>
                <div className="flex justify-between items-start flex-wrap gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold" style={{ color: NAVY_DARK }}>{a.titulo}</p>
                      {a.tipo_entrega === 'grupal' && (
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: '#f0e7f7', color: '#8a5cb0' }}>Grupal</span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500">Entrega: {new Date(a.fecha_entrega).toLocaleString('es-PE')}</p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={function () { openSubmissions(a) }} className="text-xs font-semibold px-3 py-1.5 rounded-lg transition" style={{ backgroundColor: 'white', color: NAVY, border: '1px solid #D6DCE5' }}>Ver entregas</button>
                    <button onClick={function () { openEdit(a) }} className="text-xs font-semibold px-3 py-1.5 rounded-lg transition" style={{ backgroundColor: 'white', color: NAVY, border: '1px solid #D6DCE5' }}>Editar</button>
                    <button onClick={function () { handleDeleteAssignment(a.id) }} className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white transition hover:opacity-90" style={{ backgroundColor: '#B91C1C' }}>Eliminar</button>
                  </div>
                </div>
                <div className="mt-3">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs text-slate-500">Entregas: {a.totalEntregados} de {a.totalMatriculados}</span>
                    <span className="text-xs font-semibold" style={{ color: pct === 100 ? GREEN : pct >= 50 ? '#B45309' : '#B91C1C' }}>{pct}%</span>
                  </div>
                  <div className="w-full h-2 rounded-full overflow-hidden" style={{ backgroundColor: '#E5E9F0' }}>
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${pct}%`, backgroundColor: pct === 100 ? GREEN : pct >= 50 ? '#B45309' : '#B91C1C' }}
                    />
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

// ============================================================
// Fila para calificar una Capacidad — si tiene varios criterios de Lista de Cotejo,
// muestra casillas para marcar y calcula la nota sugerida sola; si no, el número de siempre.
// ============================================================
function CapacidadGradeRow({ cap, submission, criteriosPorCapacidad, criterioChecksMap, submissionScoresMap, onToggleCriterio, onGradeNumerico, onElegirNivelMaximo }) {
  const criterios = criteriosPorCapacidad[cap.id] || []
  const key = `${submission.id}__${cap.id}`
  const currentScore = submissionScoresMap[key]

  if (criterios.length <= 1) {
    return (
      <div className="flex justify-between items-center rounded-lg px-3 py-2" style={{ backgroundColor: 'white', border: '1px solid #E5E9F0' }}>
        <span className="text-xs" style={{ color: NAVY_DARK }}>{cap.nombre}</span>
        <input type="number" min="0" max="20" step="0.5" defaultValue={currentScore != null ? currentScore : ''} placeholder="Nota"
          className="w-16 rounded-lg text-sm px-2 py-1 outline-none" style={inputStyle}
          onBlur={function (e) { if (e.target.value) onGradeNumerico(submission.id, cap.id, e.target.value) }} />
      </div>
    )
  }

  const cumplidos = criterios.filter(function (c) { return criterioChecksMap[`${submission.id}__${c.id}`] }).length
  const total = criterios.length
  const todosMarcados = cumplidos === total

  return (
    <div className="rounded-lg p-3" style={{ backgroundColor: 'white', border: '1px solid #E5E9F0' }}>
      <div className="flex justify-between items-center mb-2">
        <span className="text-xs font-semibold" style={{ color: NAVY_DARK }}>{cap.nombre}</span>
        <span className="text-xs font-bold" style={{ color: currentScore != null ? getLetterColorHex(currentScore) : '#94A3B8' }}>
          {currentScore != null ? getLetterGrade(currentScore) : '—'} ({cumplidos}/{total})
        </span>
      </div>
      <div className="space-y-1">
        {criterios.map(function (c) {
          const marcado = !!criterioChecksMap[`${submission.id}__${c.id}`]
          return (
            <label key={c.id} className="flex items-start gap-2 text-xs cursor-pointer" style={{ color: NAVY_DARK }}>
              <input type="checkbox" checked={marcado} onChange={function () { onToggleCriterio(submission.id, c.id, cap.id) }} className="mt-0.5" />
              <span>{c.texto}</span>
            </label>
          )
        })}
      </div>
      {todosMarcados && (
        <div className="flex gap-2 mt-2">
          <p className="text-[11px] text-slate-500 flex-1">Cumplió todos los criterios — elige el nivel de logro:</p>
          <button type="button" onClick={function () { onElegirNivelMaximo(submission.id, cap.id, 'A') }} className="text-xs font-semibold px-2 py-1 rounded text-white" style={{ backgroundColor: '#1D5C8F' }}>A</button>
          <button type="button" onClick={function () { onElegirNivelMaximo(submission.id, cap.id, 'AD') }} className="text-xs font-semibold px-2 py-1 rounded text-white" style={{ backgroundColor: '#2F7A1F' }}>AD</button>
        </div>
      )}
    </div>
  )
}

function getLetterColorHex(score) {
  const letra = getLetterGrade(score)
  return { AD: '#2F7A1F', A: '#1D5C8F', B: '#B45309', C: '#B91C1C' }[letra] || '#94A3B8'
}

function FolderIcon({ big }) {
  const size = big ? 28 : 18
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={GREEN} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  )
}

function NotasClasePorActividad({ actividad }) {
  const [loading, setLoading] = useState(true)
  const [estudiantes, setEstudiantes] = useState([])
  const [notas, setNotas] = useState({}) // studentId__capacidadId -> nota
  const [guardandoKey, setGuardandoKey] = useState(null)
  const [errorGuardado, setErrorGuardado] = useState('')

  const capacidades = (actividad.actividad_capacidades || [])
    .map(function (ac) { return ac.capacidad })
    .filter(Boolean)
    .sort(function (a, b) { return (a.orden || 0) - (b.orden || 0) })

  useEffect(function () {
    cargar()
  }, [actividad.id])

  async function cargar() {
    setLoading(true)
    const enrollResult = await supabase
      .from('enrollments')
      .select('student:profiles(id, full_name)')
      .eq('course_id', actividad.course_id)
      .eq('status', 'activo')
    const lista = enrollResult.error ? [] : enrollResult.data.map(function (e) { return e.student }).filter(Boolean)
    lista.sort(function (a, b) { return compararPorApellido(a.full_name, b.full_name) })
    setEstudiantes(lista)

    const notasResult = await supabase
      .from('notas_clase')
      .select('student_id, capacidad_id, nota')
      .eq('actividad_id', actividad.id)
    const mapa = {}
    ;(notasResult.data || []).forEach(function (n) { mapa[`${n.student_id}__${n.capacidad_id}`] = n.nota })
    setNotas(mapa)
    setLoading(false)
  }

  async function guardarNota(studentId, capacidadId, valorStr) {
    const key = `${studentId}__${capacidadId}`
    const valor = valorStr === '' ? null : Number(valorStr)
    if (valor != null && (isNaN(valor) || valor < 0 || valor > 20)) return
    setGuardandoKey(key)
    setErrorGuardado('')

    let result
    if (valor == null) {
      result = await supabase.from('notas_clase').delete().eq('actividad_id', actividad.id).eq('capacidad_id', capacidadId).eq('student_id', studentId)
    } else {
      result = await supabase.from('notas_clase').upsert(
        { actividad_id: actividad.id, capacidad_id: capacidadId, student_id: studentId, nota: valor, updated_at: new Date().toISOString() },
        { onConflict: 'actividad_id,capacidad_id,student_id' }
      )
    }

    if (result.error) {
      setErrorGuardado('No se guardó: ' + result.error.message)
    } else {
      setNotas(function (prev) { return { ...prev, [key]: valor } })
    }
    setGuardandoKey(null)
  }

  if (loading) return <p className="text-slate-400 text-sm">Cargando...</p>
  if (capacidades.length === 0) return <p className="text-slate-400 text-sm">Esta Actividad no tiene capacidades asignadas todavía.</p>

  return (
    <div>
      <div className="rounded-xl p-4 mb-4" style={{ backgroundColor: '#F0F6E4', border: '1px solid #C0DD97' }}>
        <p className="text-xs" style={{ color: '#3B6D11' }}>
          Aquí puedes calificar solo con nota de clase, sin necesidad de crear una tarea. Si más adelante creas una tarea para esta Actividad con "Notas de clase" habilitado, esa nota se maneja aparte, por tarea.
        </p>
      </div>
      {errorGuardado && <p className="text-sm text-red-500 mb-3">{errorGuardado}</p>}

      <div className="bg-white rounded-2xl overflow-x-auto" style={{ border: '1px solid #E5E9F0' }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: '1px solid #E5E9F0' }}>
              <th className="text-left py-2 px-3 font-semibold" style={{ color: NAVY_DARK }}>Estudiante</th>
              {capacidades.map(function (cap) {
                return <th key={cap.id} className="text-center py-2 px-2 font-semibold" style={{ color: NAVY_DARK, minWidth: 90 }}>{cap.nombre}</th>
              })}
            </tr>
          </thead>
          <tbody>
            {estudiantes.map(function (s) {
              return (
                <tr key={s.id} style={{ borderBottom: '1px solid #F4F6F9' }}>
                  <td className="py-2 px-3" style={{ color: NAVY_DARK }}>{s.full_name}</td>
                  {capacidades.map(function (cap) {
                    const key = `${s.id}__${cap.id}`
                    return (
                      <td key={cap.id} className="text-center py-2 px-2">
                        <input
                          type="number"
                          min={0}
                          max={20}
                          defaultValue={notas[key] != null ? notas[key] : ''}
                          onBlur={function (e) { guardarNota(s.id, cap.id, e.target.value) }}
                          placeholder="—"
                          disabled={guardandoKey === key}
                          className="w-14 text-center rounded-lg px-2 py-1 text-sm outline-none"
                          style={inputStyle}
                        />
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
  )
}

function NotasClaseSeccion({ assignmentId, courseId }) {
  const [loading, setLoading] = useState(true)
  const [estudiantes, setEstudiantes] = useState([])
  const [notas, setNotas] = useState({}) // studentId -> nota
  const [guardandoId, setGuardandoId] = useState(null)

  useEffect(function () {
    cargar()
  }, [assignmentId])

  async function cargar() {
    setLoading(true)
    const enrollResult = await supabase
      .from('enrollments')
      .select('student:profiles(id, full_name)')
      .eq('course_id', courseId)
      .eq('status', 'activo')
    const lista = enrollResult.error ? [] : enrollResult.data.map(function (e) { return e.student }).filter(Boolean)
    lista.sort(function (a, b) { return compararPorApellido(a.full_name, b.full_name) })
    setEstudiantes(lista)

    const notasResult = await supabase.from('notas_clase').select('student_id, nota').eq('assignment_id', assignmentId)
    const mapa = {}
    ;(notasResult.data || []).forEach(function (n) { mapa[n.student_id] = n.nota })
    setNotas(mapa)
    setLoading(false)
  }

  async function guardarNota(studentId, valorStr) {
    const valor = valorStr === '' ? null : Number(valorStr)
    if (valor != null && (isNaN(valor) || valor < 0 || valor > 20)) return
    setGuardandoId(studentId)

    if (valor == null) {
      await supabase.from('notas_clase').delete().eq('assignment_id', assignmentId).eq('student_id', studentId)
    } else {
      await supabase.from('notas_clase').upsert(
        { assignment_id: assignmentId, student_id: studentId, nota: valor, updated_at: new Date().toISOString() },
        { onConflict: 'assignment_id,student_id' }
      )
    }
    setNotas(function (prev) { return { ...prev, [studentId]: valor } })
    setGuardandoId(null)
  }

  if (loading) return <p className="text-slate-400 text-sm mb-5">Cargando notas de clase...</p>

  return (
    <div className="mb-5 rounded-xl p-4" style={{ backgroundColor: '#F0F6E4', border: '1px solid #C0DD97' }}>
      <h4 className="text-sm font-bold mb-1" style={{ color: '#173404' }}>Notas de clase</h4>
      <p className="text-xs mb-3" style={{ color: '#3B6D11' }}>Esta nota se promedia con la nota de la tarea entregada para dar la nota final de la actividad. Déjala vacía si no aplica para un estudiante.</p>
      <div className="grid sm:grid-cols-2 gap-2">
        {estudiantes.map(function (s) {
          return (
            <div key={s.id} className="flex items-center justify-between bg-white rounded-lg px-3 py-2" style={{ border: '1px solid #DCEBC4' }}>
              <span className="text-xs font-medium truncate" style={{ color: NAVY_DARK, maxWidth: '70%' }}>{s.full_name}</span>
              <input
                type="number"
                min={0}
                max={20}
                defaultValue={notas[s.id] != null ? notas[s.id] : ''}
                onBlur={function (e) { guardarNota(s.id, e.target.value) }}
                placeholder="—"
                disabled={guardandoId === s.id}
                className="w-14 text-center rounded-lg px-2 py-1 text-sm outline-none"
                style={inputStyle}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}
