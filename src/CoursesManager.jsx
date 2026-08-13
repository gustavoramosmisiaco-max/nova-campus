import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'

const NAVY_DARK = '#0F172A'
const NAVY = '#2563EB'
const GREEN = '#22C55E'
const GREEN_DARK = '#16A34A'

const DIAS = [
  { value: 1, label: 'Lunes' },
  { value: 2, label: 'Martes' },
  { value: 3, label: 'Miércoles' },
  { value: 4, label: 'Jueves' },
  { value: 5, label: 'Viernes' },
  { value: 6, label: 'Sábado' },
  { value: 7, label: 'Domingo' },
]
const GRADOS = [1, 2, 3, 4, 5]
const SECCIONES = ['A', 'B', 'C', 'D', 'E']

function diaLabel(v) {
  return DIAS.find(function (d) { return d.value === v })?.label || '—'
}

function scheduleText(schedules) {
  if (!schedules || schedules.length === 0) return 'Sin horario definido'
  const sorted = [...schedules].sort(function (a, b) { return a.dia_semana - b.dia_semana })
  return sorted
    .map(function (s) {
      return `${diaLabel(s.dia_semana)} ${s.hora_inicio?.slice(0, 5)}-${s.hora_fin?.slice(0, 5)}`
    })
    .join(' · ')
}

const inputStyle = { backgroundColor: 'white', border: '1px solid #D6DCE5', color: NAVY_DARK }

const emptyBlock = { dia_semana: 1, hora_inicio: '', hora_fin: '' }

export default function CoursesManager({ institucionFija, institucionFijaNombre } = {}) {
  const [courses, setCourses] = useState([])
  const [docentes, setDocentes] = useState([])
  const [areas, setAreas] = useState([])
  const [instituciones, setInstituciones] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [error, setError] = useState('')

  const [form, setForm] = useState({
    areaId: '',
    asignatura_id: '',
    grupo: 'A',
    grado: 1,
    docente_id: '',
    institucion_id: '',
    descripcion: '',
  })
  const [schedules, setSchedules] = useState([{ ...emptyBlock }])
  const [gradosPorInstitucion, setGradosPorInstitucion] = useState({}) // { institucionId: [{numero, nombre}] }

  useEffect(function () {
    loadCourses()
    loadDocentes()
    loadAreas()
    loadInstituciones()
    loadGradosPorInstitucion()
  }, [])

  async function loadGradosPorInstitucion() {
    const result = await supabase.from('grados_institucion').select('institucion_id, numero, nombre').order('orden')
    if (result.error) return
    const mapa = {}
    result.data.forEach(function (g) {
      if (!mapa[g.institucion_id]) mapa[g.institucion_id] = []
      mapa[g.institucion_id].push({ numero: g.numero, nombre: g.nombre })
    })
    setGradosPorInstitucion(mapa)
  }

  // Lista combinada de todos los grados de todas las instituciones (sin repetir), para cuando aún no se eligió institución
  function gradosUnion() {
    const vistos = new Map()
    Object.values(gradosPorInstitucion).forEach(function (lista) {
      lista.forEach(function (g) { if (!vistos.has(g.numero)) vistos.set(g.numero, g) })
    })
    return [...vistos.values()].sort(function (a, b) { return a.numero - b.numero })
  }

  function gradosParaInstitucion(institucionId) {
    if (institucionId && gradosPorInstitucion[institucionId]) return gradosPorInstitucion[institucionId]
    return gradosUnion().length > 0 ? gradosUnion() : GRADOS.map(function (n) { return { numero: n, nombre: n + '°' } })
  }

  async function loadCourses() {
    setLoading(true)
    const result = await supabase
      .from('courses')
      .select('*, docente:profiles(full_name), course_schedules(*), asignaturas(nombre, areas_curriculares(id, nombre)), institucion:instituciones_educativas(nombre)')
      .order('grado', { ascending: true })
      .order('grupo', { ascending: true })
      .order('nombre', { ascending: true })

    if (result.error) {
      setError(result.error.message)
    } else {
      setCourses(result.data)
    }
    setLoading(false)
  }

  async function loadDocentes() {
    const result = await supabase
      .from('profiles')
      .select('id, full_name')
      .eq('role', 'docente')
      .order('full_name')

    if (!result.error) setDocentes(result.data)
  }

  async function loadInstituciones() {
    const result = await supabase
      .from('instituciones_educativas')
      .select('id, nombre')
      .order('nombre')
    if (!result.error) setInstituciones(result.data)
  }

  async function loadAreas() {
    const result = await supabase
      .from('areas_curriculares')
      .select('*, asignaturas(id, nombre, activo)')
      .order('orden', { ascending: true })

    if (!result.error) {
      const sorted = result.data.map(function (area) {
        return {
          ...area,
          asignaturas: area.asignaturas
            .filter(function (a) { return a.activo })
            .sort(function (a, b) { return a.nombre.localeCompare(b.nombre) }),
        }
      }).filter(function (area) { return area.asignaturas.length > 0 })
      setAreas(sorted)
    }
  }

  function asignaturasDelArea(areaId) {
    return areas.find(function (a) { return a.id === areaId })?.asignaturas || []
  }

  async function heredarInstitucionDelAula(grado, grupo) {
    const result = await supabase
      .from('courses')
      .select('institucion_id')
      .eq('grado', grado)
      .eq('grupo', grupo)
      .not('institucion_id', 'is', null)
      .limit(1)
      .maybeSingle()
    if (!result.error && result.data?.institucion_id) {
      setForm(function (prev) { return { ...prev, institucion_id: result.data.institucion_id } })
    }
  }

  function openNewForm() {
    setEditingId(null)
    const primerArea = areas[0]
    setForm({
      areaId: primerArea?.id || '',
      asignatura_id: primerArea?.asignaturas[0]?.id || '',
      grupo: 'A',
      grado: 1,
      docente_id: '',
      institucion_id: institucionFija || instituciones[0]?.id || '',
      descripcion: '',
    })
    setSchedules([{ ...emptyBlock }])
    setShowForm(true)
    heredarInstitucionDelAula(1, 'A')
  }

  function openEditForm(course) {
    setEditingId(course.id)
    setForm({
      areaId: course.asignaturas?.areas_curriculares?.id || '',
      asignatura_id: course.asignatura_id || '',
      grupo: SECCIONES.includes(course.grupo) ? course.grupo : 'A',
      grado: course.grado || 1,
      docente_id: course.docente_id || '',
      institucion_id: course.institucion_id || '',
      descripcion: course.descripcion || '',
    })
    const existing = (course.course_schedules || []).map(function (s) {
      return { dia_semana: s.dia_semana, hora_inicio: s.hora_inicio?.slice(0, 5) || '', hora_fin: s.hora_fin?.slice(0, 5) || '' }
    })
    setSchedules(existing.length > 0 ? existing : [{ ...emptyBlock }])
    setShowForm(true)
  }

  function addScheduleBlock() {
    setSchedules(function (prev) { return [...prev, { ...emptyBlock }] })
  }

  function removeScheduleBlock(index) {
    setSchedules(function (prev) { return prev.filter(function (_, i) { return i !== index }) })
  }

  function updateScheduleBlock(index, field, value) {
    setSchedules(function (prev) {
      return prev.map(function (s, i) {
        return i === index ? { ...s, [field]: value } : s
      })
    })
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (!form.asignatura_id) {
      setError('Selecciona una asignatura.')
      return
    }

    const validSchedules = schedules.filter(function (s) { return s.hora_inicio && s.hora_fin })
    if (validSchedules.length === 0) {
      setError('Agrega al menos un bloque de horario válido.')
      return
    }

    const asignaturaSeleccionada = areas
      .flatMap(function (a) { return a.asignaturas })
      .find(function (a) { return a.id === form.asignatura_id })

    const payload = {
      nombre: asignaturaSeleccionada?.nombre || '',
      asignatura_id: form.asignatura_id,
      grupo: form.grupo,
      grado: form.grado,
      docente_id: form.docente_id || null,
      institucion_id: form.institucion_id || null,
      descripcion: form.descripcion,
    }

    let courseId = editingId
    let result
    if (editingId) {
      result = await supabase.from('courses').update(payload).eq('id', editingId)
    } else {
      result = await supabase.from('courses').insert(payload).select('id').single()
      if (!result.error) courseId = result.data.id
    }

    if (result.error) {
      setError(result.error.message)
      return
    }

    if (editingId) {
      const delResult = await supabase.from('course_schedules').delete().eq('course_id', courseId)
      if (delResult.error) {
        setError(delResult.error.message)
        return
      }
    }

    const schedulesPayload = validSchedules.map(function (s) {
      return { course_id: courseId, dia_semana: s.dia_semana, hora_inicio: s.hora_inicio, hora_fin: s.hora_fin }
    })
    const insertSchedulesResult = await supabase.from('course_schedules').insert(schedulesPayload)

    if (insertSchedulesResult.error) {
      setError(insertSchedulesResult.error.message)
      return
    }

    // Si es una asignatura NUEVA, matricular a quienes correspondan a esta aula (grado+sección+institución) —
    // por perfil directo, así también agarra a estudiantes que aún no tenían ningún curso
    if (!editingId) {
      let estudiantesQuery = supabase
        .from('profiles')
        .select('id')
        .eq('role', 'estudiante')
        .eq('grado', form.grado)
        .eq('grupo', form.grupo)

      if (form.institucion_id) {
        estudiantesQuery = estudiantesQuery.eq('institucion_id', form.institucion_id)
      } else {
        estudiantesQuery = estudiantesQuery.is('institucion_id', null)
      }

      const estudiantesResult = await estudiantesQuery
      const estudiantesDelAula = (estudiantesResult.data || []).map(function (s) { return s.id })

      if (estudiantesDelAula.length > 0) {
        const nuevasMatriculas = estudiantesDelAula.map(function (studentId) {
          return { course_id: courseId, student_id: studentId, status: 'activo' }
        })
        await supabase.from('enrollments').insert(nuevasMatriculas)
      }
    }

    setShowForm(false)
    loadCourses()
  }

  async function handleDelete(id) {
    if (!confirm('¿Quitar esta asignación? Esto también borrará matrículas, materiales, tareas y horarios asociados a ella.')) return
    const result = await supabase.from('courses').delete().eq('id', id)
    if (result.error) {
      alert('Error al eliminar: ' + result.error.message)
    } else {
      loadCourses()
    }
  }

  const [institucionFiltro, setInstitucionFiltro] = useState(institucionFija || null) // null = "todas" (sin filtrar)

  // Agrupar: Área > Asignatura > lista de asignaciones (grado/sección/docente) — filtrado por institución elegida
  const coursesFiltrados = institucionFiltro == null ? courses : courses.filter(function (c) { return (c.institucion_id || 'sin-institucion') === institucionFiltro })

  const arbol = areas.map(function (area) {
    const asignaturasConCursos = area.asignaturas.map(function (asig) {
      const items = coursesFiltrados.filter(function (c) { return c.asignatura_id === asig.id })
      return { asignatura: asig, items: items }
    }).filter(function (a) { return a.items.length > 0 })
    return { area: area, asignaturas: asignaturasConCursos }
  }).filter(function (a) { return a.asignaturas.length > 0 })

  const sinAsignatura = coursesFiltrados.filter(function (c) { return !c.asignatura_id })

  function renderAsignacionCard(c) {
    return (
      <div
        key={c.id}
        className="bg-white rounded-xl p-4 space-y-1"
        style={{ border: '1px solid #E5E9F0' }}
      >
        <div className="flex justify-between items-start">
          <p className="text-sm font-bold" style={{ color: NAVY_DARK }}>
            {c.grado}° Secundaria — Sección {c.grupo}
          </p>
          <div className="flex gap-2">
            <button
              onClick={function () { openEditForm(c) }}
              className="text-xs font-semibold px-3 py-1 rounded-lg transition"
              style={{ backgroundColor: 'white', color: NAVY, border: '1px solid #D6DCE5' }}
            >
              Editar
            </button>
            <button
              onClick={function () { handleDelete(c.id) }}
              className="text-xs font-semibold px-3 py-1 rounded-lg text-white transition hover:opacity-90"
              style={{ backgroundColor: '#B91C1C' }}
            >
              Quitar
            </button>
          </div>
        </div>
        <p className="text-sm text-slate-500">
          Docente: <span className="font-medium" style={{ color: c.docente ? NAVY_DARK : '#B91C1C' }}>{c.docente?.full_name || 'Sin asignar'}</span>
        </p>
        <p className="text-xs text-slate-400">
          {c.institucion?.nombre || 'Sin institución'}
        </p>
        <p className="text-sm font-medium" style={{ color: GREEN_DARK }}>
          {scheduleText(c.course_schedules)}
        </p>
      </div>
    )
  }

  const [bulkGrado, setBulkGrado] = useState(1)
  const [bulkGrupo, setBulkGrupo] = useState('A')
  const [bulkInstitucion, setBulkInstitucion] = useState('')
  const [bulkSaving, setBulkSaving] = useState(false)
  const [bulkMsg, setBulkMsg] = useState('')
  const [mostrarAvanzado, setMostrarAvanzado] = useState(false)

  const [copiarOrigenInst, setCopiarOrigenInst] = useState(institucionFija || '')
  const [copiarOrigenGrado, setCopiarOrigenGrado] = useState(1)
  const [copiarOrigenGrupo, setCopiarOrigenGrupo] = useState('A')
  const [copiarDestinoInst, setCopiarDestinoInst] = useState(institucionFija || '')
  const [copiarDestinoGrado, setCopiarDestinoGrado] = useState(1)
  const [copiarDestinoGrupo, setCopiarDestinoGrupo] = useState('A')
  const [copiando, setCopiando] = useState(false)
  const [copiarMsg, setCopiarMsg] = useState('')

  function cursosDelOrigen() {
    if (!copiarOrigenInst) return []
    return courses.filter(function (c) {
      return c.institucion_id === copiarOrigenInst && c.grado === copiarOrigenGrado && c.grupo === copiarOrigenGrupo
    })
  }

  async function handleCopiarAula() {
    setCopiarMsg('')
    if (!copiarOrigenInst || !copiarDestinoInst) {
      setCopiarMsg('Elige la institución de origen y la de destino.')
      return
    }
    const origenCursos = cursosDelOrigen()
    if (origenCursos.length === 0) {
      setCopiarMsg('El aula de origen no tiene ninguna Asignatura todavía.')
      return
    }

    setCopiando(true)

    // No copiar las que ya existan en el destino, para no duplicar
    const existentesResult = await supabase
      .from('courses')
      .select('asignatura_id')
      .eq('institucion_id', copiarDestinoInst)
      .eq('grado', copiarDestinoGrado)
      .eq('grupo', copiarDestinoGrupo)
    const yaExisten = new Set((existentesResult.data || []).map(function (c) { return c.asignatura_id }))

    const aCrear = origenCursos.filter(function (c) { return c.asignatura_id && !yaExisten.has(c.asignatura_id) })
    if (aCrear.length === 0) {
      setCopiarMsg('El aula de destino ya tiene todas esas Asignaturas — no se copió nada nuevo.')
      setCopiando(false)
      return
    }

    const payloads = aCrear.map(function (c) {
      return {
        nombre: c.nombre,
        asignatura_id: c.asignatura_id,
        grado: copiarDestinoGrado,
        grupo: copiarDestinoGrupo,
        docente_id: null,
        institucion_id: copiarDestinoInst,
        descripcion: c.descripcion || '',
      }
    })

    const insertResult = await supabase.from('courses').insert(payloads).select('id')
    if (insertResult.error) {
      setCopiarMsg('Error: ' + insertResult.error.message)
      setCopiando(false)
      return
    }

    // Copiar también los horarios de cada curso origen a su equivalente nuevo
    await Promise.all(insertResult.data.map(async function (nuevo, i) {
      const origenCorrespondiente = aCrear[i]
      const horariosResult = await supabase.from('course_schedules').select('dia_semana, hora_inicio, hora_fin').eq('course_id', origenCorrespondiente.id)
      if (horariosResult.data && horariosResult.data.length > 0) {
        const payload = horariosResult.data.map(function (h) {
          return { course_id: nuevo.id, dia_semana: h.dia_semana, hora_inicio: h.hora_inicio, hora_fin: h.hora_fin }
        })
        await supabase.from('course_schedules').insert(payload)
      }
    }))

    // Matricular a los alumnos que correspondan a esta aula destino — por perfil directo (institución+grado+sección),
    // no solo a quienes ya estuvieran en otro curso de ahí (así también agarra a los que aún no tenían ningún curso)
    const estudiantesResult = await supabase
      .from('profiles')
      .select('id')
      .eq('role', 'estudiante')
      .eq('grado', copiarDestinoGrado)
      .eq('grupo', copiarDestinoGrupo)
      .eq('institucion_id', copiarDestinoInst)

    const estudiantesDelAula = (estudiantesResult.data || []).map(function (s) { return s.id })

    if (estudiantesDelAula.length > 0) {
      await Promise.all(insertResult.data.map(async function (nuevo) {
        const matriculas = estudiantesDelAula.map(function (studentId) { return { course_id: nuevo.id, student_id: studentId, status: 'activo' } })
        await supabase.from('enrollments').insert(matriculas)
      }))
    }

    setCopiarMsg(`Se copiaron ${aCrear.length} Asignatura(s) al aula de destino, con su horario incluido.`)
    setCopiando(false)
    loadCourses()
  }

  async function handleBulkAsignarInstitucion() {
    if (!bulkInstitucion) {
      setBulkMsg('Selecciona una institución.')
      return
    }
    setBulkSaving(true)
    setBulkMsg('')
    const result = await supabase
      .from('courses')
      .update({ institucion_id: bulkInstitucion })
      .eq('grado', bulkGrado)
      .eq('grupo', bulkGrupo)
      .is('institucion_id', null)
      .select('id')

    if (result.error) {
      setBulkMsg('Error: ' + result.error.message)
    } else if (result.data.length === 0) {
      setBulkMsg(`No se aplicó nada — todos los cursos de ${bulkGrado}° "${bulkGrupo}" ya tenían una institución asignada.`)
    } else {
      setBulkMsg(`Institución asignada a ${result.data.length} curso(s) de ${bulkGrado}° "${bulkGrupo}" que estaban sin institución.`)
      loadCourses()
    }
    setBulkSaving(false)
  }

  const [asignarDocInst, setAsignarDocInst] = useState(institucionFija || '')
  const [asignarDocGrado, setAsignarDocGrado] = useState(1)
  const [asignarDocGrupo, setAsignarDocGrupo] = useState('A')
  const [asignarDocSeleccionadas, setAsignarDocSeleccionadas] = useState(new Set())
  const [asignarDocDocenteId, setAsignarDocDocenteId] = useState('')
  const [asignarDocGuardando, setAsignarDocGuardando] = useState(false)
  const [asignarDocMsg, setAsignarDocMsg] = useState('')

  function cursosDelAulaSeleccionada() {
    if (!asignarDocInst) return []
    return courses.filter(function (c) {
      return c.institucion_id === asignarDocInst && c.grado === asignarDocGrado && c.grupo === asignarDocGrupo
    })
  }

  function toggleAsignarDocSeleccion(courseId) {
    setAsignarDocSeleccionadas(function (prev) {
      const next = new Set(prev)
      if (next.has(courseId)) next.delete(courseId); else next.add(courseId)
      return next
    })
  }

  function seleccionarTodasAsignarDoc() {
    setAsignarDocSeleccionadas(new Set(cursosDelAulaSeleccionada().map(function (c) { return c.id })))
  }

  async function handleAsignarDocenteMasivo() {
    setAsignarDocMsg('')
    if (asignarDocSeleccionadas.size === 0) { setAsignarDocMsg('Marca al menos una Asignatura.'); return }
    setAsignarDocGuardando(true)
    const result = await supabase
      .from('courses')
      .update({ docente_id: asignarDocDocenteId || null })
      .in('id', [...asignarDocSeleccionadas])
      .select('id')

    if (result.error) {
      setAsignarDocMsg('Error: ' + result.error.message)
    } else {
      const nombreDocente = docentes.find(function (d) { return d.id === asignarDocDocenteId })?.full_name || 'Sin asignar'
      setAsignarDocMsg(`${result.data.length} Asignatura(s) actualizada(s) con docente: ${nombreDocente}.`)
      setAsignarDocSeleccionadas(new Set())
      loadCourses()
    }
    setAsignarDocGuardando(false)
  }

  const [masivoAreaId, setMasivoAreaId] = useState('')
  const [masivoAsignaturaIds, setMasivoAsignaturaIds] = useState(new Set())
  const [masivoGrados, setMasivoGrados] = useState(new Set())
  const [masivoSecciones, setMasivoSecciones] = useState(new Set())
  const [masivoInstitucion, setMasivoInstitucion] = useState(institucionFija || '')
  const [masivoCreando, setMasivoCreando] = useState(false)
  const [masivoMsg, setMasivoMsg] = useState('')

  function toggleSetValue(setFn, value) {
    setFn(function (prev) {
      const next = new Set(prev)
      if (next.has(value)) next.delete(value); else next.add(value)
      return next
    })
  }

  async function handleCrearCursosMasivo() {
    if (masivoAsignaturaIds.size === 0) { setMasivoMsg('Selecciona al menos una asignatura.'); return }
    if (masivoGrados.size === 0 || masivoSecciones.size === 0) { setMasivoMsg('Selecciona al menos un Grado y una Sección.'); return }

    setMasivoCreando(true)
    setMasivoMsg('')

    const asignaturaObjs = areas
      .flatMap(function (a) { return a.asignaturas })
      .filter(function (a) { return masivoAsignaturaIds.has(a.id) })

    // Traer combinaciones que ya existan, para no duplicar
    const existingResult = await supabase
      .from('courses')
      .select('asignatura_id, grado, grupo')
      .in('asignatura_id', [...masivoAsignaturaIds])
    const existentes = new Set((existingResult.data || []).map(function (c) { return `${c.asignatura_id}__${c.grado}__${c.grupo}` }))

    const payloads = []
    asignaturaObjs.forEach(function (asig) {
      masivoGrados.forEach(function (grado) {
        masivoSecciones.forEach(function (grupo) {
          const key = `${asig.id}__${grado}__${grupo}`
          if (existentes.has(key)) return
          payloads.push({
            nombre: asig.nombre,
            asignatura_id: asig.id,
            grado: grado,
            grupo: grupo,
            docente_id: null,
            institucion_id: masivoInstitucion || null,
            descripcion: '',
          })
        })
      })
    })

    if (payloads.length === 0) {
      setMasivoMsg('Todas esas combinaciones ya existían — no se creó ninguna nueva.')
      setMasivoCreando(false)
      return
    }

    const insertResult = await supabase.from('courses').insert(payloads).select('id, grado, grupo, institucion_id')
    if (insertResult.error) {
      setMasivoMsg('Error: ' + insertResult.error.message)
      setMasivoCreando(false)
      return
    }

    // Matricular a los alumnos que correspondan a cada aula nueva — por perfil directo (institución+grado+sección)
    await Promise.all(insertResult.data.map(async function (nuevoCurso) {
      let estudiantesQuery = supabase
        .from('profiles')
        .select('id')
        .eq('role', 'estudiante')
        .eq('grado', nuevoCurso.grado)
        .eq('grupo', nuevoCurso.grupo)

      if (nuevoCurso.institucion_id) {
        estudiantesQuery = estudiantesQuery.eq('institucion_id', nuevoCurso.institucion_id)
      } else {
        estudiantesQuery = estudiantesQuery.is('institucion_id', null)
      }

      const estudiantesResult = await estudiantesQuery
      const estudiantesDelAula = (estudiantesResult.data || []).map(function (s) { return s.id })
      if (estudiantesDelAula.length === 0) return

      const matriculas = estudiantesDelAula.map(function (studentId) {
        return { course_id: nuevoCurso.id, student_id: studentId, status: 'activo' }
      })
      await supabase.from('enrollments').insert(matriculas)
    }))

    setMasivoMsg(`Se crearon ${payloads.length} curso(s) nuevos, con sus alumnos ya matriculados donde correspondía.`)
    setMasivoAsignaturaIds(new Set())
    setMasivoGrados(new Set())
    setMasivoSecciones(new Set())
    setMasivoCreando(false)
    loadCourses()
  }

  async function handleQuitarArea(areaId, areaNombre) {
    const totalCursos = courses.filter(function (c) { return c.asignaturas?.areas_curriculares?.id === areaId }).length
    if (!confirm(`¿Quitar TODA el Área "${areaNombre}"? Esto elimina las ${totalCursos} asignación(es) de esa área (todas sus asignaturas, en todos los grados y secciones) — junto con sus matrículas, materiales y tareas. No se puede deshacer.`)) return

    const idsAQuitar = courses
      .filter(function (c) { return c.asignaturas?.areas_curriculares?.id === areaId })
      .map(function (c) { return c.id })

    const result = await supabase.from('courses').delete().in('id', idsAQuitar)
    if (result.error) {
      alert('Error: ' + result.error.message)
    } else {
      loadCourses()
    }
  }


  return (
    <div>
      <div className="flex justify-between items-center mb-1">
        <h2 className="text-2xl font-bold" style={{ color: NAVY_DARK }}>Gestión de Aulas</h2>
        <button
          onClick={openNewForm}
          className="font-semibold px-4 py-2 rounded-lg transition text-white hover:opacity-90"
          style={{ backgroundColor: GREEN }}
        >
          + Nueva asignación
        </button>
      </div>
      <p className="text-sm text-slate-400 mb-4">
        Asigna un docente a una Asignatura de un Área, para un Grado y Sección específicos.
      </p>

      {!institucionFija && (
      <div className="bg-white rounded-2xl p-4 mb-6" style={{ border: '1px solid #E5E9F0' }}>
        <p className="text-sm font-bold mb-1" style={{ color: NAVY_DARK }}>Copiar aula completa</p>
        <p className="text-xs text-slate-400 mb-1">
          Úsala cuando <strong>ya tienes un aula parecida armada</strong> (otra institución, otro grado, otra sección) y quieres replicar la misma estructura sin repetir todo a mano.
        </p>
        <p className="text-xs text-slate-400 mb-3">
          Copia todas las Asignaturas y su horario, sin duplicar las que ya existan en el destino.
        </p>

        <div className="grid sm:grid-cols-2 gap-4">
          <div className="rounded-xl p-3" style={{ backgroundColor: '#F4F6F9' }}>
            <p className="text-xs font-bold mb-2" style={{ color: NAVY }}>Copiar DESDE</p>
            <div className="space-y-2">
              <select value={copiarOrigenInst} disabled={!!institucionFija} onChange={function (e) { setCopiarOrigenInst(e.target.value) }} className="w-full rounded-lg px-3 py-2 text-sm outline-none disabled:opacity-60" style={inputStyle}>
                <option value="">-- Institución --</option>
                {instituciones.map(function (i) { return <option key={i.id} value={i.id}>{i.nombre}</option> })}
              </select>
              <div className="grid grid-cols-2 gap-2">
                <select value={copiarOrigenGrado} onChange={function (e) { setCopiarOrigenGrado(Number(e.target.value)) }} className="rounded-lg px-3 py-2 text-sm outline-none" style={inputStyle}>
                  {gradosParaInstitucion(copiarOrigenInst).map(function (g) { return <option key={g.numero} value={g.numero}>{g.nombre}</option> })}
                </select>
                <select value={copiarOrigenGrupo} onChange={function (e) { setCopiarOrigenGrupo(e.target.value) }} className="rounded-lg px-3 py-2 text-sm outline-none" style={inputStyle}>
                  {SECCIONES.map(function (s) { return <option key={s} value={s}>Sección {s}</option> })}
                </select>
              </div>
              <p className="text-xs text-slate-400">{cursosDelOrigen().length} Asignatura(s) encontrada(s) ahí</p>
            </div>
          </div>

          <div className="rounded-xl p-3" style={{ backgroundColor: '#EAF2FB' }}>
            <p className="text-xs font-bold mb-2" style={{ color: NAVY }}>Copiar HACIA</p>
            <div className="space-y-2">
              <select value={copiarDestinoInst} disabled={!!institucionFija} onChange={function (e) { setCopiarDestinoInst(e.target.value) }} className="w-full rounded-lg px-3 py-2 text-sm outline-none disabled:opacity-60" style={inputStyle}>
                <option value="">-- Institución --</option>
                {instituciones.map(function (i) { return <option key={i.id} value={i.id}>{i.nombre}</option> })}
              </select>
              <div className="grid grid-cols-2 gap-2">
                <select value={copiarDestinoGrado} onChange={function (e) { setCopiarDestinoGrado(Number(e.target.value)) }} className="rounded-lg px-3 py-2 text-sm outline-none" style={inputStyle}>
                  {gradosParaInstitucion(copiarDestinoInst).map(function (g) { return <option key={g.numero} value={g.numero}>{g.nombre}</option> })}
                </select>
                <select value={copiarDestinoGrupo} onChange={function (e) { setCopiarDestinoGrupo(e.target.value) }} className="rounded-lg px-3 py-2 text-sm outline-none" style={inputStyle}>
                  {SECCIONES.map(function (s) { return <option key={s} value={s}>Sección {s}</option> })}
                </select>
              </div>
            </div>
          </div>
        </div>

        <button
          onClick={handleCopiarAula}
          disabled={copiando}
          className="mt-3 text-sm font-semibold px-5 py-2.5 rounded-xl text-white transition hover:opacity-90 disabled:opacity-50"
          style={{ background: `linear-gradient(90deg, ${NAVY}, ${GREEN})`, boxShadow: '0 8px 20px rgba(37,99,235,0.3)' }}
        >
          {copiando ? 'Copiando...' : 'Copiar aula'}
        </button>
        {copiarMsg && <p className="text-xs mt-2" style={{ color: copiarMsg.startsWith('Error') ? '#B91C1C' : '#16A34A' }}>{copiarMsg}</p>}
      </div>
      )}

      <div className="bg-white rounded-2xl p-4 mb-6" style={{ border: '1px solid #E5E9F0' }}>
        <p className="text-sm font-bold mb-1" style={{ color: NAVY_DARK }}>Crear varios cursos de golpe</p>
        <p className="text-xs text-slate-400 mb-1">
          Úsala cuando <strong>no tienes ningún aula parecida todavía</strong> — arma varias Asignaturas desde cero, eligiendo Grados y Secciones a la vez.
        </p>
        <p className="text-xs text-slate-400 mb-3">
          Se crea un curso por cada combinación, y matricula solos a los alumnos que ya estén en esa aula.
        </p>

        <div className="mb-3">
          <label className="block text-xs font-medium mb-1" style={{ color: NAVY_DARK }}>Área</label>
          <select
            value={masivoAreaId}
            onChange={function (e) { setMasivoAreaId(e.target.value); setMasivoAsignaturaIds(new Set()) }}
            className="rounded-lg px-3 py-2 text-sm outline-none"
            style={{ ...inputStyle, minWidth: 260 }}
          >
            <option value="">-- Selecciona un área --</option>
            {areas.map(function (a) { return <option key={a.id} value={a.id}>{a.nombre}</option> })}
          </select>
        </div>

        {masivoAreaId && (
          <div className="mb-3">
            <label className="block text-xs font-medium mb-1" style={{ color: NAVY_DARK }}>Asignaturas</label>
            <div className="flex flex-wrap gap-2">
              {(areas.find(function (a) { return a.id === masivoAreaId })?.asignaturas || []).map(function (asig) {
                const checked = masivoAsignaturaIds.has(asig.id)
                return (
                  <button
                    key={asig.id}
                    type="button"
                    onClick={function () { toggleSetValue(setMasivoAsignaturaIds, asig.id) }}
                    className="text-xs font-semibold px-3 py-1.5 rounded-lg transition"
                    style={checked ? { backgroundColor: GREEN, color: 'white' } : { backgroundColor: 'white', color: NAVY_DARK, border: '1px solid #D6DCE5' }}
                  >
                    {asig.nombre}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        <div className="grid sm:grid-cols-3 gap-3 mb-3">
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: NAVY_DARK }}>Grados</label>
            <div className="flex flex-wrap gap-1.5">
              {gradosParaInstitucion(masivoInstitucion).map(function (g) {
                const checked = masivoGrados.has(g.numero)
                return (
                  <button key={g.numero} type="button" onClick={function () { toggleSetValue(setMasivoGrados, g.numero) }}
                    className="w-9 h-9 rounded-lg text-sm font-semibold transition"
                    style={checked ? { backgroundColor: NAVY, color: 'white' } : { backgroundColor: 'white', color: NAVY_DARK, border: '1px solid #D6DCE5' }}>
                    {g.nombre}
                  </button>
                )
              })}
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: NAVY_DARK }}>Secciones</label>
            <div className="flex flex-wrap gap-1.5">
              {SECCIONES.map(function (s) {
                const checked = masivoSecciones.has(s)
                return (
                  <button key={s} type="button" onClick={function () { toggleSetValue(setMasivoSecciones, s) }}
                    className="w-9 h-9 rounded-lg text-sm font-semibold transition"
                    style={checked ? { backgroundColor: NAVY, color: 'white' } : { backgroundColor: 'white', color: NAVY_DARK, border: '1px solid #D6DCE5' }}>
                    {s}
                  </button>
                )
              })}
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: NAVY_DARK }}>Institución (opcional)</label>
            <select value={masivoInstitucion} disabled={!!institucionFija} onChange={function (e) { setMasivoInstitucion(e.target.value) }} className="w-full rounded-lg px-3 py-2 text-sm outline-none disabled:opacity-60" style={inputStyle}>
              <option value="">-- Sin asignar --</option>
              {instituciones.map(function (i) { return <option key={i.id} value={i.id}>{i.nombre}</option> })}
            </select>
          </div>
        </div>

        <button
          onClick={handleCrearCursosMasivo}
          disabled={masivoCreando}
          className="text-sm font-semibold px-4 py-2 rounded-lg text-white transition hover:opacity-90 disabled:opacity-50"
          style={{ backgroundColor: GREEN }}
        >
          {masivoCreando ? 'Creando...' : 'Crear cursos'}
        </button>
        {masivoMsg && <p className="text-xs mt-2" style={{ color: masivoMsg.startsWith('Error') ? '#B91C1C' : '#16A34A' }}>{masivoMsg}</p>}
      </div>

      {!institucionFija && (
      <button
        onClick={function () { setMostrarAvanzado(!mostrarAvanzado) }}
        className="text-xs font-semibold mb-6 hover:underline"
        style={{ color: '#94A3B8' }}
      >
        {mostrarAvanzado ? '▾' : '▸'} Herramientas avanzadas (poco usadas)
      </button>
      )}

      <div className="bg-white rounded-2xl p-4 mb-6" style={{ border: '1px solid #E5E9F0' }}>
        <p className="text-sm font-bold mb-1" style={{ color: NAVY_DARK }}>Asignar Docente a varias Asignaturas</p>
        <p className="text-xs text-slate-400 mb-3">
          Elige el aula, marca las Asignaturas que quieras (todas, o solo algunas), y ponles el mismo docente de un solo golpe — sin abrir cada una por separado.
        </p>

        <div className="grid sm:grid-cols-3 gap-3 mb-3 max-w-2xl">
          <select value={asignarDocInst} disabled={!!institucionFija} onChange={function (e) { setAsignarDocInst(e.target.value); setAsignarDocSeleccionadas(new Set()) }} className="rounded-lg px-3 py-2 text-sm outline-none disabled:opacity-60" style={inputStyle}>
            <option value="">-- Institución --</option>
            {instituciones.map(function (i) { return <option key={i.id} value={i.id}>{i.nombre}</option> })}
          </select>
          <select value={asignarDocGrado} onChange={function (e) { setAsignarDocGrado(Number(e.target.value)); setAsignarDocSeleccionadas(new Set()) }} className="rounded-lg px-3 py-2 text-sm outline-none" style={inputStyle}>
            {gradosParaInstitucion(asignarDocInst).map(function (g) { return <option key={g.numero} value={g.numero}>{g.nombre}</option> })}
          </select>
          <select value={asignarDocGrupo} onChange={function (e) { setAsignarDocGrupo(e.target.value); setAsignarDocSeleccionadas(new Set()) }} className="rounded-lg px-3 py-2 text-sm outline-none" style={inputStyle}>
            {SECCIONES.map(function (s) { return <option key={s} value={s}>Sección {s}</option> })}
          </select>
        </div>

        {asignarDocInst && cursosDelAulaSeleccionada().length > 0 && (
          <>
            <div className="flex justify-between items-center mb-2">
              <p className="text-xs font-semibold" style={{ color: NAVY_DARK }}>Asignaturas de esta aula ({cursosDelAulaSeleccionada().length})</p>
              <button onClick={seleccionarTodasAsignarDoc} className="text-xs font-semibold hover:underline" style={{ color: NAVY }}>Marcar todas</button>
            </div>
            <div className="rounded-xl overflow-hidden mb-3" style={{ border: '1px solid #E5E9F0' }}>
              {cursosDelAulaSeleccionada().map(function (c) {
                const marcado = asignarDocSeleccionadas.has(c.id)
                return (
                  <label key={c.id} className="flex items-center justify-between gap-3 px-3 py-2 cursor-pointer" style={{ borderBottom: '1px solid #F4F6F9', backgroundColor: marcado ? '#EAF2FB' : 'white' }}>
                    <span className="flex items-center gap-2">
                      <input type="checkbox" checked={marcado} onChange={function () { toggleAsignarDocSeleccion(c.id) }} />
                      <span className="text-sm" style={{ color: NAVY_DARK }}>{c.nombre}</span>
                    </span>
                    <span className="text-xs text-slate-400">{c.docente?.full_name || 'Sin asignar'}</span>
                  </label>
                )
              })}
            </div>

            <div className="flex gap-2 items-center flex-wrap">
              <select value={asignarDocDocenteId} onChange={function (e) { setAsignarDocDocenteId(e.target.value) }} className="rounded-lg px-3 py-2 text-sm outline-none" style={{ ...inputStyle, minWidth: 220 }}>
                <option value="">Sin asignar</option>
                {docentes.map(function (d) { return <option key={d.id} value={d.id}>{d.full_name}</option> })}
              </select>
              <button
                onClick={handleAsignarDocenteMasivo}
                disabled={asignarDocGuardando || asignarDocSeleccionadas.size === 0}
                className="text-sm font-semibold px-4 py-2 rounded-lg text-white transition hover:opacity-90 disabled:opacity-50"
                style={{ backgroundColor: GREEN }}
              >
                {asignarDocGuardando ? 'Aplicando...' : `Asignar a las ${asignarDocSeleccionadas.size} seleccionada(s)`}
              </button>
            </div>
          </>
        )}
        {asignarDocInst && cursosDelAulaSeleccionada().length === 0 && (
          <p className="text-xs text-slate-400">Esa aula no tiene ninguna Asignatura todavía.</p>
        )}
        {asignarDocMsg && <p className="text-xs mt-3" style={{ color: asignarDocMsg.startsWith('Error') ? '#B91C1C' : '#16A34A' }}>{asignarDocMsg}</p>}
      </div>

      {mostrarAvanzado && (
        <div className="bg-white rounded-2xl p-4 mb-6" style={{ border: '1px solid #E5E9F0' }}>
          <p className="text-sm font-bold mb-1" style={{ color: NAVY_DARK }}>Asignar Institución a toda un aula</p>
          <p className="text-xs text-slate-400 mb-3">
            Para casos raros: si algún curso viejo quedó sin institución asignada (de antes de que esto fuera obligatorio), esto la completa. Solo toca los que <strong>todavía no tienen</strong> institución — nunca reemplaza una que ya esté puesta.
          </p>
          <div className="flex items-end gap-3 flex-wrap">
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: NAVY_DARK }}>Grado</label>
              <select value={bulkGrado} onChange={function (e) { setBulkGrado(Number(e.target.value)) }} className="rounded-lg px-3 py-2 text-sm outline-none" style={inputStyle}>
                {gradosUnion().map(function (g) { return <option key={g.numero} value={g.numero}>{g.nombre}</option> })}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: NAVY_DARK }}>Sección</label>
              <select value={bulkGrupo} onChange={function (e) { setBulkGrupo(e.target.value) }} className="rounded-lg px-3 py-2 text-sm outline-none" style={inputStyle}>
                {SECCIONES.map(function (s) { return <option key={s} value={s}>{s}</option> })}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: NAVY_DARK }}>Institución</label>
              <select value={bulkInstitucion} onChange={function (e) { setBulkInstitucion(e.target.value) }} className="rounded-lg px-3 py-2 text-sm outline-none" style={{ ...inputStyle, minWidth: 220 }}>
                <option value="">-- Selecciona --</option>
                {instituciones.map(function (i) { return <option key={i.id} value={i.id}>{i.nombre}</option> })}
              </select>
            </div>
            <button
              onClick={handleBulkAsignarInstitucion}
              disabled={bulkSaving}
              className="text-sm font-semibold px-4 py-2 rounded-lg text-white transition hover:opacity-90 disabled:opacity-50"
              style={{ backgroundColor: GREEN }}
            >
              {bulkSaving ? 'Aplicando...' : 'Aplicar a toda el aula'}
            </button>
          </div>
          {bulkMsg && <p className="text-xs mt-2" style={{ color: bulkMsg.startsWith('Error') ? '#B91C1C' : '#16A34A' }}>{bulkMsg}</p>}
        </div>
      )}

      {!institucionFija && (
      loading ? (
        <p className="text-slate-400">Cargando...</p>
      ) : courses.length === 0 ? (
        <p className="text-slate-400">Aún no hay ninguna asignación creada.</p>
      ) : (
        <div>
          <div className="flex gap-2 mb-5 flex-wrap">
            <button
              onClick={function () { setInstitucionFiltro(null) }}
              className="text-xs font-semibold px-4 py-2 rounded-full transition"
              style={institucionFiltro == null ? { backgroundColor: NAVY_DARK, color: 'white' } : { backgroundColor: 'white', color: NAVY_DARK, border: '1px solid #D6DCE5' }}
            >
              Todas ({courses.length})
            </button>
            {instituciones.map(function (i) {
              const cantidad = courses.filter(function (c) { return c.institucion_id === i.id }).length
              if (cantidad === 0) return null
              return (
                <button
                  key={i.id}
                  onClick={function () { setInstitucionFiltro(i.id) }}
                  className="text-xs font-semibold px-4 py-2 rounded-full transition"
                  style={institucionFiltro === i.id ? { backgroundColor: GREEN, color: 'white' } : { backgroundColor: 'white', color: NAVY_DARK, border: '1px solid #D6DCE5' }}
                >
                  {i.nombre} ({cantidad})
                </button>
              )
            })}
            {(function () {
              const sinInst = courses.filter(function (c) { return !c.institucion_id }).length
              if (sinInst === 0) return null
              return (
                <button
                  onClick={function () { setInstitucionFiltro('sin-institucion') }}
                  className="text-xs font-semibold px-4 py-2 rounded-full transition"
                  style={institucionFiltro === 'sin-institucion' ? { backgroundColor: '#B91C1C', color: 'white' } : { backgroundColor: '#FDECEC', color: '#B91C1C', border: '1px solid #F5C6C6' }}
                >
                  Sin institución ({sinInst})
                </button>
              )
            })()}
          </div>

          {arbol.length === 0 && sinAsignatura.length === 0 ? (
            <p className="text-slate-400 text-sm">No hay Asignaturas en esta institución todavía.</p>
          ) : (
          <div className="space-y-8">
          {arbol.map(function (grupoArea) {
            return (
              <div key={grupoArea.area.id}>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-base font-bold" style={{ color: NAVY_DARK }}>{grupoArea.area.nombre}</h3>
                  <button
                    onClick={function () { handleQuitarArea(grupoArea.area.id, grupoArea.area.nombre) }}
                    className="text-xs font-semibold px-3 py-1 rounded-lg text-white transition hover:opacity-90"
                    style={{ backgroundColor: '#B91C1C' }}
                  >
                    Quitar toda el Área
                  </button>
                </div>
                <div className="space-y-4">
                  {grupoArea.asignaturas.map(function (grupoAsig) {
                    return (
                      <div key={grupoAsig.asignatura.id} className="pl-4" style={{ borderLeft: '3px solid #E7F3E4' }}>
                        <p
                          className="text-xs font-bold uppercase tracking-wide mb-2 px-3 py-1 rounded-lg inline-block"
                          style={{ backgroundColor: '#E7F3E4', color: GREEN_DARK }}
                        >
                          {grupoAsig.asignatura.nombre} ({grupoAsig.items.length})
                        </p>
                        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                          {grupoAsig.items.map(renderAsignacionCard)}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}

          {sinAsignatura.length > 0 && (
            <div>
              <h3
                className="text-xs font-bold uppercase tracking-wide mb-3 px-3 py-1.5 rounded-lg inline-block"
                style={{ backgroundColor: '#FDECEC', color: '#B91C1C' }}
              >
                Sin asignatura vinculada
              </h3>
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {sinAsignatura.map(renderAsignacionCard)}
              </div>
            </div>
          )}
          </div>
          )}
        </div>
      )
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <form
            onSubmit={handleSubmit}
            className="bg-white rounded-2xl p-6 w-full max-w-md space-y-4 max-h-[90vh] overflow-y-auto"
            style={{ border: '1px solid #E5E9F0' }}
          >
            <h3 className="text-xl font-bold" style={{ color: NAVY_DARK }}>
              {editingId ? 'Editar asignación' : 'Nueva asignación'}
            </h3>

            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: NAVY_DARK }}>Área</label>
              <select
                value={form.areaId}
                onChange={function (e) {
                  const nuevaArea = e.target.value
                  const primeraAsig = asignaturasDelArea(nuevaArea)[0]
                  setForm({ ...form, areaId: nuevaArea, asignatura_id: primeraAsig?.id || '' })
                }}
                className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                style={inputStyle}
              >
                <option value="">-- Selecciona un área --</option>
                {areas.map(function (a) {
                  return <option key={a.id} value={a.id}>{a.nombre}</option>
                })}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: NAVY_DARK }}>Asignatura</label>
              <select
                value={form.asignatura_id}
                onChange={function (e) { setForm({ ...form, asignatura_id: e.target.value }) }}
                required
                className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                style={inputStyle}
                disabled={!form.areaId}
              >
                <option value="">-- Selecciona una asignatura --</option>
                {asignaturasDelArea(form.areaId).map(function (a) {
                  return <option key={a.id} value={a.id}>{a.nombre}</option>
                })}
              </select>
              {areas.length === 0 && (
                <p className="text-xs mt-1" style={{ color: '#B91C1C' }}>
                  No hay asignaturas activas. Actívalas primero en la pestaña "Asignaturas".
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: NAVY_DARK }}>Grado</label>
                <select
                  value={form.grado}
                  onChange={function (e) {
                    const nuevoGrado = Number(e.target.value)
                    setForm({ ...form, grado: nuevoGrado })
                    if (!editingId) heredarInstitucionDelAula(nuevoGrado, form.grupo)
                  }}
                  className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                  style={inputStyle}
                >
                  {gradosParaInstitucion(form.institucion_id).map(function (g) {
                    return <option key={g.numero} value={g.numero}>{g.nombre}</option>
                  })}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: NAVY_DARK }}>Sección</label>
                <select
                  value={form.grupo}
                  onChange={function (e) {
                    const nuevoGrupo = e.target.value
                    setForm({ ...form, grupo: nuevoGrupo })
                    if (!editingId) heredarInstitucionDelAula(form.grado, nuevoGrupo)
                  }}
                  className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                  style={inputStyle}
                >
                  {SECCIONES.map(function (s) {
                    return <option key={s} value={s}>Sección {s}</option>
                  })}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: NAVY_DARK }}>Institución educativa</label>
              {institucionFija ? (
                <p className="w-full rounded-lg px-3 py-2 text-sm" style={{ backgroundColor: '#F4F6F9', color: NAVY_DARK, border: '1px solid #D6DCE5' }}>
                  {institucionFijaNombre || 'Tu institución'}
                </p>
              ) : (
                <>
                  <select
                    value={form.institucion_id}
                    onChange={function (e) {
                      const nuevaInstitucion = e.target.value
                      const listaGrados = gradosParaInstitucion(nuevaInstitucion)
                      const gradoValido = listaGrados.some(function (g) { return g.numero === form.grado })
                      setForm({ ...form, institucion_id: nuevaInstitucion, grado: gradoValido ? form.grado : (listaGrados[0]?.numero || form.grado) })
                    }}
                    className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                    style={inputStyle}
                  >
                    <option value="">-- Selecciona --</option>
                    {instituciones.map(function (i) {
                      return <option key={i.id} value={i.id}>{i.nombre}</option>
                    })}
                  </select>
                  {instituciones.length === 0 && (
                    <p className="text-xs mt-1" style={{ color: '#B91C1C' }}>
                      No hay instituciones creadas. Créalas primero en la pestaña "Instituciones".
                    </p>
                  )}
                </>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: NAVY_DARK }}>Docente asignado</label>
              <select
                value={form.docente_id}
                onChange={function (e) { setForm({ ...form, docente_id: e.target.value }) }}
                className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                style={inputStyle}
              >
                <option value="">Sin asignar</option>
                {docentes.map(function (d) {
                  return <option key={d.id} value={d.id}>{d.full_name}</option>
                })}
              </select>
            </div>

            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="block text-sm font-medium" style={{ color: NAVY_DARK }}>
                  Horarios (puedes agregar varios días)
                </label>
                <button
                  type="button"
                  onClick={addScheduleBlock}
                  className="text-xs font-semibold px-3 py-1 rounded-lg transition"
                  style={{ backgroundColor: 'white', color: NAVY, border: '1px solid #D6DCE5' }}
                >
                  + Agregar día
                </button>
              </div>

              <div className="space-y-2">
                {schedules.map(function (block, index) {
                  return (
                    <div
                      key={index}
                      className="rounded-lg p-3 space-y-2"
                      style={{ backgroundColor: '#F4F6F9', border: '1px solid #E5E9F0' }}
                    >
                      <div className="flex justify-between items-center">
                        <select
                          value={block.dia_semana}
                          onChange={function (e) { updateScheduleBlock(index, 'dia_semana', Number(e.target.value)) }}
                          className="rounded-lg px-2 py-1.5 text-sm outline-none flex-1 mr-2"
                          style={inputStyle}
                        >
                          {DIAS.map(function (d) {
                            return <option key={d.value} value={d.value}>{d.label}</option>
                          })}
                        </select>
                        {schedules.length > 1 && (
                          <button
                            type="button"
                            onClick={function () { removeScheduleBlock(index) }}
                            className="text-xs font-semibold px-2 py-1.5 rounded-lg text-white transition hover:opacity-90"
                            style={{ backgroundColor: '#B91C1C' }}
                          >
                            Quitar
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="time"
                          value={block.hora_inicio}
                          onChange={function (e) { updateScheduleBlock(index, 'hora_inicio', e.target.value) }}
                          required
                          className="w-full rounded-lg px-2 py-1.5 text-sm outline-none"
                          style={inputStyle}
                        />
                        <input
                          type="time"
                          value={block.hora_fin}
                          onChange={function (e) { updateScheduleBlock(index, 'hora_fin', e.target.value) }}
                          required
                          className="w-full rounded-lg px-2 py-1.5 text-sm outline-none"
                          style={inputStyle}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: NAVY_DARK }}>Descripción (opcional)</label>
              <textarea
                value={form.descripcion}
                onChange={function (e) { setForm({ ...form, descripcion: e.target.value }) }}
                className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                style={inputStyle}
                rows={2}
              />
            </div>

            {error && <p className="text-red-500 text-sm">{error}</p>}

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={function () { setShowForm(false) }}
                className="flex-1 py-2 rounded-lg transition font-medium"
                style={{ backgroundColor: '#F4F6F9', color: NAVY_DARK, border: '1px solid #D6DCE5' }}
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="flex-1 font-semibold py-2 rounded-lg transition text-white hover:opacity-90"
                style={{ background: `linear-gradient(90deg, ${NAVY}, ${GREEN})`, boxShadow: '0 8px 20px rgba(37,99,235,0.3)' }}
              >
                Guardar
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
