import { useEffect, useState, useRef, lazy, Suspense } from 'react'
import { supabase } from './supabaseClient'
import { useAuth } from './AuthContext'
import RegistroAuxiliarPorArea from './RegistroAuxiliarPorArea'
import ImportarEstudiantes from './ImportarEstudiantes'
import ExcelJS from 'exceljs'
import { compararPorApellido } from './gradeUtils'
import { llamarIA } from './aiClient'

const CoursesManager = lazy(function () { return import('./CoursesManager') })
const ImportarDocentes = lazy(function () { return import('./ImportarDocentes') })
const HabilitarCursos = lazy(function () { return import('./HabilitarCursos') })
const AsignaturasManager = lazy(function () { return import('./AsignaturasManager') })
const RecreosManager = lazy(function () { return import('./RecreosManager') })
const FeriadosManager = lazy(function () { return import('./FeriadosManager') })
const EnrollmentsManager = lazy(function () { return import('./EnrollmentsManager') })
const DocentesList = lazy(function () { return import('./DocentesList') })
const EstudiantesList = lazy(function () { return import('./EstudiantesList') })
const MiInstitucion = lazy(function () { return import('./MiInstitucion') })

const NAVY_DARK = '#0F172A'
const NAVY = '#2563EB'
const GREEN = '#22C55E'
const GREEN_DARK = '#16A34A'

function gradoLabel(g) {
  return g ? `${g}° Secundaria` : 'Sin grado'
}

// Cuando hay muchísimos ids (cientos de Aulas), una sola consulta ".in()" puede superar
// el límite de longitud de la URL y el servidor la rechaza (error 400). Esta función
// divide la lista en bloques pequeños, consulta cada uno por separado, y junta todo.
async function consultarEnBloques(supabase, tabla, campos, columnaFiltro, valores, tamanoBloque) {
  if (!valores || valores.length === 0) return []
  const bloque = tamanoBloque || 80
  const resultados = []
  for (let i = 0; i < valores.length; i += bloque) {
    const trozo = valores.slice(i, i + bloque)
    const result = await supabase.from(tabla).select(campos).in(columnaFiltro, trozo)
    if (result.error) {
      console.log('[DIAGNOSTICO] Error en tabla', tabla, '— mensaje:', result.error.message, '— código:', result.error.code, '— detalle completo:', result.error)
    }
    if (!result.error && result.data) resultados.push(...result.data)
  }
  return resultados
}

export default function CoordinadorDashboard() {
  const { session, profile, logout } = useAuth()
  const [loading, setLoading] = useState(true)
  const [institucion, setInstitucion] = useState(null)
  const [cursos, setCursos] = useState([])
  const [conducta, setConducta] = useState([])
  const [monitoreoPorCurso, setMonitoreoPorCurso] = useState({})
  const [monitoreoCursoSel, setMonitoreoCursoSel] = useState(null)
  const [monitoreoDetalle, setMonitoreoDetalle] = useState([])
  const [monitoreoDetalleLoading, setMonitoreoDetalleLoading] = useState(false)
  const [monitoreoUnidadAbierta, setMonitoreoUnidadAbierta] = useState(null)
  const [recordandoId, setRecordandoId] = useState(null)

  async function abrirDetalleMonitoreo(curso) {
    setMonitoreoCursoSel(curso)
    setMonitoreoDetalleLoading(true)
    setMonitoreoUnidadAbierta(null)

    const areaId = curso.asignaturas?.areas_curriculares?.id
    const unidadesResult = await supabase
      .from('unidades')
      .select('id, tipo, numero, nombre, fecha_inicio, fecha_fin')
      .eq('area_id', areaId)
      .eq('grado', curso.grado)
      .eq('grupo', curso.grupo)
      .order('numero')
    const unidades = unidadesResult.data || []
    const unidadIds = unidades.map(function (u) { return u.id })

    let actividades = []
    if (unidadIds.length > 0) {
      const actResult = await supabase
        .from('actividades')
        .select('id, nombre, numero_actividad, unidad_id, fecha_clase')
        .eq('course_id', curso.id)
        .in('unidad_id', unidadIds)
        .order('numero_actividad')
      actividades = actResult.data || []
    }
    const actIds = actividades.map(function (a) { return a.id })

    let materiales = []
    let tareas = []
    if (actIds.length > 0) {
      const matResult = await supabase.from('materials').select('id, titulo, actividad_id, file_url, link_url, created_at').in('actividad_id', actIds)
      materiales = matResult.data || []
      const tareasResult = await supabase.from('assignments').select('id, titulo, actividad_id, fecha_entrega').in('actividad_id', actIds)
      tareas = tareasResult.data || []
    }

    const detalle = unidades.map(function (u) {
      const actividadesDeUnidad = actividades.filter(function (a) { return a.unidad_id === u.id }).map(function (a) {
        return {
          ...a,
          materiales: materiales.filter(function (m) { return m.actividad_id === a.id }),
          tareas: tareas.filter(function (t) { return t.actividad_id === a.id }),
        }
      })
      return { ...u, actividades: actividadesDeUnidad }
    })
    setMonitoreoDetalle(detalle)
    setMonitoreoDetalleLoading(false)
  }

  async function recordarDocente(curso) {
    setRecordandoId(curso.id)
    await supabase.from('notificaciones').insert({
      user_id: curso.docente.id,
      tipo: 'recordatorio',
      titulo: 'Recordatorio de tu Coordinador',
      mensaje: `Por favor sube los materiales y actividades pendientes de "${curso.nombre}" (${gradoLabel(curso.grado)} Sección ${curso.grupo}) para que tus estudiantes puedan descargarlos.`,
    })
    setRecordandoId(null)
    alert('Recordatorio enviado a ' + curso.docente.full_name)
  }

  // ============================================================
  // Monitoreo — 5 ejes según el CNEB / Marco de Buen Desempeño Docente
  // ============================================================
  const [monitoreoEjes, setMonitoreoEjes] = useState({}) // { [courseId]: { progreso, formativa, cierre, asistencia, instrumentos } }
  const [monitoreoCargando, setMonitoreoCargando] = useState(false)
  const [monitoreoCargado, setMonitoreoCargado] = useState(false)
  const monitoreoTurnoRef = useRef(0)
  const [docenteExpandido, setDocenteExpandido] = useState(null)

  // ============================================================
  // Formato SIAGIE por Bimestre — RVM N° 094-2020-MINEDU
  // ============================================================
  const [siagieGrado, setSiagieGrado] = useState(1)
  const [siagieGrupo, setSiagieGrupo] = useState('A')
  const [siagieBimestre, setSiagieBimestre] = useState(1)
  const [siagieGenerando, setSiagieGenerando] = useState(false)
  const [siagieDatos, setSiagieDatos] = useState(null)
  const [siagieConclusionesIA, setSiagieConclusionesIA] = useState({})
  const [siagieGenerandoConclusiones, setSiagieGenerandoConclusiones] = useState(false)
  const [siagieProgresoConclusiones, setSiagieProgresoConclusiones] = useState({ hechas: 0, total: 0 })
  const [siagieDescargando, setSiagieDescargando] = useState(false)
  const [reporteDesempenoTexto, setReporteDesempenoTexto] = useState('')
  const [generandoReporteDesempeno, setGenerandoReporteDesempeno] = useState(false)
  const [registrosRecibidos, setRegistrosRecibidos] = useState([])
  const [registrosCargando, setRegistrosCargando] = useState(false)
  const [registrosCargados, setRegistrosCargados] = useState(false)
  const [siagiePlantillaArchivo, setSiagiePlantillaArchivo] = useState(null)
  const [siagiePlantillaEstructura, setSiagiePlantillaEstructura] = useState(null)
  const [siagiePlantillaWorkbook, setSiagiePlantillaWorkbook] = useState(null) // el archivo Excel real, en memoria, listo para escribirle encima
  const [siagieLeyendoPlantilla, setSiagieLeyendoPlantilla] = useState(false)
  const [siagieCompletandoConIA, setSiagieCompletandoConIA] = useState(false)

  // Lee el archivo real que el docente descarga del SIAGIE, guarda TODAS sus filas
  // (para que la IA pueda encontrar la fila exacta de cada estudiante) y también guarda
  // el propio Workbook en memoria, para poder escribirle encima más adelante sin perder
  // su formato original.
  async function leerPlantillaSIAGIE(file) {
    setSiagieLeyendoPlantilla(true)
    setSiagiePlantillaEstructura(null)
    setSiagiePlantillaWorkbook(null)
    try {
      const buffer = await file.arrayBuffer()
      const workbook = new ExcelJS.Workbook()
      await workbook.xlsx.load(buffer)

      const hojas = workbook.worksheets.map(function (ws) {
        const todasLasFilas = []
        ws.eachRow({ includeEmpty: true }, function (row, rowNumber) {
          const valores = []
          row.eachCell({ includeEmpty: true }, function (cell) { valores.push(cell.value != null ? String(cell.value) : '') })
          todasLasFilas.push({ fila: rowNumber, valores: valores })
        })
        return {
          nombre: ws.name,
          totalFilas: ws.rowCount,
          totalColumnas: ws.columnCount,
          filas: todasLasFilas,
        }
      })

      setSiagiePlantillaArchivo(file)
      setSiagiePlantillaWorkbook(workbook)
      setSiagiePlantillaEstructura({ nombreArchivo: file.name, hojas: hojas })
    } catch (err) {
      alert('No se pudo leer ese archivo. Verifica que sea un Excel (.xlsx) válido. Detalle: ' + err.message)
      setSiagiePlantillaArchivo(null)
    }
    setSiagieLeyendoPlantilla(false)
  }

  // Le pide a la IA que analice la estructura real de la plantilla + los datos ya
  // calculados (niveles de logro y conclusiones), y devuelva en qué fila/columna de
  // CADA hoja va cada valor. Con esa lista, se escribe directo sobre el archivo
  // original (sin tocar su formato) y se descarga listo para subir al SIAGIE.
  async function completarPlantillaConIA() {
    if (!siagiePlantillaEstructura || !siagiePlantillaWorkbook) {
      alert('Primero sube la plantilla del SIAGIE.')
      return
    }
    if (!siagieDatos) {
      alert('Primero calcula los niveles de logro (arriba, con el botón "Calcular niveles de logro") para esta misma Aula y Bimestre.')
      return
    }

    setSiagieCompletandoConIA(true)
    try {
      const datosParaLaIA = siagieDatos.estudiantes.map(function (est) {
        const porCompetencia = siagieDatos.competencias.map(function (comp) {
          const key = `${est.id}__${comp.id}`
          const datos = siagieDatos.acumulado[key]
          const promedio = datos && datos.cantidad > 0 ? datos.suma / datos.cantidad : null
          const nivel = nivelLogro(promedio)
          return {
            competencia: comp.nombre,
            area: comp.area,
            nivel: nivel || null,
            conclusion: siagieConclusionesIA[key] || null,
          }
        })
        return { estudiante: est.full_name, competencias: porCompetencia }
      })

      const resultado = await llamarIA('completar_plantilla_siagie', {
        estructura: siagiePlantillaEstructura,
        datos: datosParaLaIA,
      })

      if (resultado.error) {
        alert('Error al completar la plantilla: ' + resultado.error)
        setSiagieCompletandoConIA(false)
        return
      }

      const asignaciones = resultado.data?.asignaciones || []
      if (asignaciones.length === 0) {
        alert('La IA no encontró dónde ubicar los datos en esta plantilla. Puede que su estructura sea distinta a la esperada — revisa el archivo manualmente.')
        setSiagieCompletandoConIA(false)
        return
      }

      // Escribir cada valor directo sobre el Workbook real, sin tocar su formato
      let escritos = 0
      asignaciones.forEach(function (asig) {
        const ws = siagiePlantillaWorkbook.worksheets.find(function (h) { return h.name === asig.hoja })
        if (!ws) return
        const cell = ws.getRow(asig.fila).getCell(asig.columna)
        cell.value = asig.valor
        escritos++
      })

      const buffer = await siagiePlantillaWorkbook.xlsx.writeBuffer()
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = siagiePlantillaArchivo.name // mismo nombre exacto del archivo original del SIAGIE
      a.click()
      URL.revokeObjectURL(url)

      alert(`Listo — se completaron ${escritos} celda(s) en la plantilla. Revisa el archivo descargado antes de subirlo al SIAGIE.`)
    } catch (err) {
      alert('Error al completar la plantilla: ' + err.message)
    }
    setSiagieCompletandoConIA(false)
  }

  function nivelLogro(promedio) {
    if (promedio == null) return null
    if (promedio >= 18) return 'AD'
    if (promedio >= 14) return 'A'
    if (promedio >= 11) return 'B'
    return 'C'
  }

  async function calcularDatosSIAGIE() {
    setSiagieGenerando(true)
    setSiagieDatos(null)
    setSiagieConclusionesIA({})
    try {
      const grado = siagieGrado
      const grupo = siagieGrupo
      const bimestre = siagieBimestre

      // 1. Estudiantes de esa aula (perfil directo + respaldo por matrícula)
      const directoResult = await supabase.from('profiles').select('id, full_name')
        .eq('role', 'estudiante').eq('grado', grado).eq('grupo', grupo).eq('institucion_id', institucion.id)

      const cursosAulaResult = await supabase.from('courses')
        .select('id, asignatura_id, asignaturas(nombre, areas_curriculares(id, nombre))')
        .eq('institucion_id', institucion.id).eq('grado', grado).eq('grupo', grupo)
      const cursosAula = cursosAulaResult.data || []
      const courseIds = cursosAula.map(function (c) { return c.id })

      let estudiantesMap = {}
      ;(directoResult.data || []).forEach(function (s) { estudiantesMap[s.id] = s.full_name })

      if (courseIds.length > 0) {
        for (let i = 0; i < courseIds.length; i += 80) {
          const trozo = courseIds.slice(i, i + 80)
          const enrollResult = await supabase.from('enrollments').select('student_id, student:profiles(id, full_name)').eq('status', 'activo').in('course_id', trozo)
          ;(enrollResult.data || []).forEach(function (e) { if (e.student) estudiantesMap[e.student.id] = e.student.full_name })
        }
      }

      const estudiantes = Object.entries(estudiantesMap).map(function ([id, full_name]) { return { id: id, full_name: full_name } })
      estudiantes.sort(function (a, b) { return compararPorApellido ? compararPorApellido(a.full_name, b.full_name) : a.full_name.localeCompare(b.full_name) })

      if (estudiantes.length === 0) {
        alert('No se encontraron estudiantes en esa aula.')
        setSiagieGenerando(false)
        return
      }

      // 2. Áreas presentes en esa aula
      const areasMap = {}
      cursosAula.forEach(function (c) {
        const area = c.asignaturas?.areas_curriculares
        if (area) areasMap[area.nombre] = area.id
      })
      const areaNombres = Object.keys(areasMap).sort()

      if (areaNombres.length === 0) {
        alert('Esa aula no tiene Áreas/Asignaturas configuradas.')
        setSiagieGenerando(false)
        return
      }

      // 3. Competencias de cada Área (competencias.area es texto, se compara por nombre)
      const competenciasResult = await supabase.from('competencias').select('id, nombre, area, codigo').in('area', areaNombres)
      const competencias = competenciasResult.data || []

      const capacidadesResult = competencias.length > 0
        ? await supabase.from('capacidades').select('id, competencia_id').in('competencia_id', competencias.map(function (c) { return c.id }))
        : { data: [] }
      const capacidades = capacidadesResult.data || []
      const capacidadIds = capacidades.map(function (c) { return c.id })

      // 4. Unidades del Bimestre elegido (numero 1-2 = Bimestre 1, 3-4 = Bimestre 2, etc.)
      const numerosDelBimestre = [bimestre * 2 - 1, bimestre * 2]
      const unidadesResult = await supabase.from('unidades').select('id, area_id, grado, grupo, numero')
        .eq('grado', grado).eq('grupo', grupo).in('numero', numerosDelBimestre)
        .in('area_id', Object.values(areasMap))
      const unidades = unidadesResult.data || []
      const unidadIds = unidades.map(function (u) { return u.id })

      // 5. Actividades de esas Unidades, en los cursos de esta aula
      let actividades = []
      if (unidadIds.length > 0 && courseIds.length > 0) {
        for (let i = 0; i < courseIds.length; i += 80) {
          const trozo = courseIds.slice(i, i + 80)
          const actResult = await supabase.from('actividades').select('id, course_id, unidad_id, nombre').in('course_id', trozo).in('unidad_id', unidadIds)
          actividades = actividades.concat(actResult.data || [])
        }
      }
      const actividadIds = actividades.map(function (a) { return a.id })
      const actividadPorId = {}
      actividades.forEach(function (a) { actividadPorId[a.id] = a })

      // 6. Tareas de esas Actividades
      let assignments = []
      if (actividadIds.length > 0) {
        for (let i = 0; i < actividadIds.length; i += 80) {
          const trozo = actividadIds.slice(i, i + 80)
          const assignResult = await supabase.from('assignments').select('id, actividad_id, titulo').in('actividad_id', trozo)
          assignments = assignments.concat(assignResult.data || [])
        }
      }
      const assignmentIds = assignments.map(function (a) { return a.id })
      const assignmentPorId = {}
      assignments.forEach(function (a) { assignmentPorId[a.id] = a })

      // 7. Entregas y sus notas por Capacidad, para calcular el promedio por Estudiante+Competencia
      let submissions = []
      if (assignmentIds.length > 0) {
        for (let i = 0; i < assignmentIds.length; i += 80) {
          const trozo = assignmentIds.slice(i, i + 80)
          const subsResult = await supabase.from('submissions').select('id, student_id, assignment_id').in('assignment_id', trozo)
          submissions = submissions.concat(subsResult.data || [])
        }
      }
      const submissionIds = submissions.map(function (s) { return s.id })

      let scores = []
      if (submissionIds.length > 0 && capacidadIds.length > 0) {
        for (let i = 0; i < submissionIds.length; i += 80) {
          const trozo = submissionIds.slice(i, i + 80)
          const scoresResult = await supabase.from('submission_scores').select('submission_id, capacidad_id, score').in('submission_id', trozo).in('capacidad_id', capacidadIds)
          scores = scores.concat(scoresResult.data || [])
        }
      }

      const submissionPorId = {}
      submissions.forEach(function (s) { submissionPorId[s.id] = s })
      const capacidadPorId = {}
      capacidades.forEach(function (c) { capacidadPorId[c.id] = c })

      // Promedio por Estudiante+Competencia, y evidencias (para pasarle a la IA después)
      const acumulado = {}
      const evidenciasPorClave = {}
      scores.forEach(function (sc) {
        const submission = submissionPorId[sc.submission_id]
        const capacidad = capacidadPorId[sc.capacidad_id]
        if (!submission || !capacidad || sc.score == null) return
        const key = `${submission.student_id}__${capacidad.competencia_id}`
        if (!acumulado[key]) acumulado[key] = { suma: 0, cantidad: 0 }
        acumulado[key].suma += sc.score
        acumulado[key].cantidad += 1

        const assignment = assignmentPorId[submission.assignment_id]
        if (assignment) {
          if (!evidenciasPorClave[key]) evidenciasPorClave[key] = []
          evidenciasPorClave[key].push({ titulo: assignment.titulo, score: sc.score })
        }
      })

      setSiagieDatos({
        grado: grado,
        grupo: grupo,
        bimestre: bimestre,
        estudiantes: estudiantes,
        areaNombres: areaNombres,
        competencias: competencias,
        acumulado: acumulado,
        evidenciasPorClave: evidenciasPorClave,
      })
    } catch (err) {
      alert('Error al calcular los datos del SIAGIE: ' + err.message)
    }
    setSiagieGenerando(false)
  }

  // ============================================================
  // Registros Auxiliares que los Docentes ya enviaron dentro de la plataforma —
  // se agrupan por Área → Grado → Sección → Bimestre.
  // ============================================================
  async function cargarRegistrosRecibidos() {
    setRegistrosCargando(true)
    const result = await supabase
      .from('registros_auxiliares_enviados')
      .select('id, docente_id, area_id, grado, grupo, bimestre, fecha_envio, estado, datos, docente:profiles(full_name), area:areas_curriculares(nombre)')
      .eq('institucion_id', institucion.id)
      .order('fecha_envio', { ascending: false })
    if (!result.error) {
      setRegistrosRecibidos(result.data || [])
    } else {
      alert('Error al cargar los registros recibidos: ' + result.error.message)
    }
    setRegistrosCargados(true)
    setRegistrosCargando(false)
  }

  // Agrupa los envíos por Área → Grado → Sección → Bimestre, y arma la lista de quién ya envió
  function agruparRegistrosRecibidos() {
    const grupos = {}
    registrosRecibidos.forEach(function (r) {
      const key = `${r.area_id}__${r.grado}__${r.grupo}__${r.bimestre}`
      if (!grupos[key]) {
        grupos[key] = {
          areaId: r.area_id,
          areaNombre: r.area?.nombre || 'Área',
          grado: r.grado,
          grupo: r.grupo,
          bimestre: r.bimestre,
          envios: [],
        }
      }
      grupos[key].envios.push(r)
    })
    return Object.values(grupos).sort(function (a, b) {
      if (a.areaNombre !== b.areaNombre) return a.areaNombre.localeCompare(b.areaNombre)
      if (a.grado !== b.grado) return a.grado - b.grado
      return a.grupo.localeCompare(b.grupo)
    })
  }

  // Toma el envío más reciente de ese Área+Grado+Sección+Bimestre (todos representan la
  // misma foto del Área completa, ya que el Registro Auxiliar de cada Docente ya combina
  // las Asignaturas de toda el Área, no solo la suya) y lo convierte al mismo formato que
  // usa calcularDatosSIAGIE(), para reutilizar exactamente los mismos botones de generar
  // conclusiones con IA y descargar el Excel.
  function extraerParaSIAGIE(grupo) {
    const envioMasReciente = grupo.envios[0] // ya vienen ordenados del más nuevo al más viejo
    const datos = envioMasReciente.datos

    const estudiantes = (datos.estudiantes || []).map(function (e) { return { id: e.estudianteId, full_name: e.estudianteNombre } })

    const competenciasMap = {}
    ;(datos.estudiantes || []).forEach(function (e) {
      ;(e.competencias || []).forEach(function (c) {
        if (!competenciasMap[c.competenciaId]) competenciasMap[c.competenciaId] = { id: c.competenciaId, nombre: c.nombre, area: datos.area }
      })
    })
    const competencias = Object.values(competenciasMap)

    const acumulado = {}
    ;(datos.estudiantes || []).forEach(function (e) {
      ;(e.competencias || []).forEach(function (c) {
        if (c.promedio == null) return
        const key = `${e.estudianteId}__${c.competenciaId}`
        acumulado[key] = { suma: c.promedio, cantidad: 1 } // ya viene promediado desde el Registro Auxiliar
      })
    })

    setSiagieGrado(grupo.grado)
    setSiagieGrupo(grupo.grupo)
    setSiagieBimestre(grupo.bimestre)
    setSiagieConclusionesIA({})
    setSiagieDatos({
      grado: grupo.grado,
      grupo: grupo.grupo,
      bimestre: grupo.bimestre,
      estudiantes: estudiantes,
      areaNombres: [datos.area],
      competencias: competencias,
      acumulado: acumulado,
      evidenciasPorClave: {}, // el Registro Auxiliar ya envía solo el promedio final, sin el detalle de cada actividad
    })

    alert(`Extraído: ${grupo.areaNombre} — ${gradoLabel(grupo.grado)} Sección ${grupo.grupo}, con datos de ${grupo.envios.length} envío(s). Baja para generar conclusiones y descargar el Excel.`)
  }

  // ¿Cuántos pares Estudiante+Competencia tienen Nivel "C"? — la norma exige Conclusión Descriptiva ahí sí o sí.
  function paresConNivelC() {
    if (!siagieDatos) return []
    const pares = []
    siagieDatos.estudiantes.forEach(function (est) {
      siagieDatos.competencias.forEach(function (comp) {
        const key = `${est.id}__${comp.id}`
        const datos = siagieDatos.acumulado[key]
        const promedio = datos && datos.cantidad > 0 ? datos.suma / datos.cantidad : null
        const nivel = nivelLogro(promedio)
        if (nivel === 'C') pares.push({ key: key, estudiante: est, competencia: comp })
      })
    })
    return pares
  }

  async function generarConclusionesConIA() {
    const pares = paresConNivelC()
    if (pares.length === 0) {
      alert('No hay ningún caso con Nivel "C" en esta Área/Grado/Sección — no hace falta generar conclusiones obligatorias.')
      return
    }
    setSiagieGenerandoConclusiones(true)
    setSiagieProgresoConclusiones({ hechas: 0, total: pares.length })

    for (let i = 0; i < pares.length; i++) {
      const par = pares[i]
      const areaDeLaCompetencia = par.competencia.area
      const evidencias = siagieDatos.evidenciasPorClave[par.key] || []

      const resultado = await llamarIA('conclusion_descriptiva', {
        estudianteNombre: par.estudiante.full_name,
        competenciaNombre: par.competencia.nombre,
        areaNombre: areaDeLaCompetencia,
        nivelLogro: 'C',
        bimestre: siagieDatos.bimestre,
        notasActividades: evidencias,
      })

      if (!resultado.error) {
        setSiagieConclusionesIA(function (prev) { return { ...prev, [par.key]: resultado.data.conclusion } })
      }
      setSiagieProgresoConclusiones({ hechas: i + 1, total: pares.length })
    }

    setSiagieGenerandoConclusiones(false)
  }

  async function descargarExcelSIAGIE() {
    if (!siagieDatos) return
    setSiagieDescargando(true)
    try {
      const { grado, grupo, bimestre, estudiantes, areaNombres, competencias, acumulado } = siagieDatos

      // 8. Armar el Excel: una hoja por Área
      const workbook = new ExcelJS.Workbook()

      areaNombres.forEach(function (areaNombre) {
        const competenciasDelArea = competencias.filter(function (c) { return c.area === areaNombre }).sort(function (a, b) { return a.nombre.localeCompare(b.nombre) })
        if (competenciasDelArea.length === 0) return

        const ws = workbook.addWorksheet(areaNombre.slice(0, 31))
        const colsPorCompetencia = 2 // Nivel + Conclusión descriptiva, según la norma (RVM 094-2020-MINEDU)
        const totalColumnas = 1 + competenciasDelArea.length * colsPorCompetencia

        ws.mergeCells(1, 1, 1, totalColumnas)
        const titulo = ws.getCell(1, 1)
        titulo.value = `${areaNombre} — ${gradoLabel(grado)} Sección ${grupo} — Bimestre ${bimestre}`
        titulo.font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } }
        titulo.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } }
        titulo.alignment = { horizontal: 'center', vertical: 'middle' }
        ws.getRow(1).height = 22

        // Fila 2: nombre de cada Competencia, ocupando sus 2 columnas (Nivel + Conclusión)
        const filaCompetencias = ws.getRow(2)
        competenciasDelArea.forEach(function (comp, i) {
          const colInicio = 2 + i * colsPorCompetencia
          ws.mergeCells(2, colInicio, 2, colInicio + 1)
          const cell = filaCompetencias.getCell(colInicio)
          cell.value = comp.nombre
          cell.alignment = { wrapText: true, vertical: 'middle', horizontal: 'center' }
          cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } }
        })
        filaCompetencias.height = 30

        const headerRow = ws.getRow(3)
        headerRow.getCell(1).value = 'Estudiante'
        competenciasDelArea.forEach(function (comp, i) {
          const colInicio = 2 + i * colsPorCompetencia
          headerRow.getCell(colInicio).value = 'Nivel'
          headerRow.getCell(colInicio + 1).value = 'Conclusión descriptiva'
        })
        headerRow.eachCell(function (cell) {
          cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } }
          cell.alignment = { horizontal: 'center', vertical: 'middle' }
        })
        headerRow.height = 20
        ws.mergeCells(2, 1, 3, 1) // "Estudiante" ocupa las 2 filas de encabezado

        ws.getColumn(1).width = 32
        competenciasDelArea.forEach(function (_, i) {
          const colInicio = 2 + i * colsPorCompetencia
          ws.getColumn(colInicio).width = 8
          ws.getColumn(colInicio + 1).width = 45
        })

        estudiantes.forEach(function (est, idx) {
          const row = ws.getRow(4 + idx)
          row.getCell(1).value = est.full_name
          competenciasDelArea.forEach(function (comp, i) {
            const colInicio = 2 + i * colsPorCompetencia
            const key = `${est.id}__${comp.id}`
            const datos = acumulado[key]
            const promedio = datos && datos.cantidad > 0 ? datos.suma / datos.cantidad : null
            const nivel = nivelLogro(promedio)

            const cellNivel = row.getCell(colInicio)
            cellNivel.value = nivel || '—'
            cellNivel.alignment = { horizontal: 'center' }
            if (nivel === 'C') cellNivel.font = { bold: true, color: { argb: 'FFB91C1C' } }
            else if (nivel === 'AD') cellNivel.font = { bold: true, color: { argb: 'FF16A34A' } }
            else if (nivel) cellNivel.font = { bold: true, color: { argb: 'FF2563EB' } }

            // Conclusión descriptiva: obligatoria por norma cuando el Nivel es "C" en ESA Competencia
            // — se usa el texto generado por la IA (o editado a mano) si existe, si no queda en blanco
            const cellConclusion = row.getCell(colInicio + 1)
            cellConclusion.value = siagieConclusionesIA[key] || ''
            cellConclusion.alignment = { wrapText: true, vertical: 'middle' }
            if (nivel === 'C') cellConclusion.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF7E6' } }
          })
          for (let c = 1; c <= totalColumnas; c++) {
            row.getCell(c).border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }
          }
        })

        ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 }
      })

      const buffer = await workbook.xlsx.writeBuffer()
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `SIAGIE_${gradoLabel(grado).replace(/\s/g, '_')}_${grupo}_Bimestre${bimestre}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      alert('Error al generar el formato: ' + err.message)
    }
    setSiagieDescargando(false)
  }
  const [monitoreoVistaComparar, setMonitoreoVistaComparar] = useState(false)
  const [monitoreoAreaComparar, setMonitoreoAreaComparar] = useState(null)

  // ============================================================
  // Bitácora de acompañamiento — notas del Coordinador por Docente
  // ============================================================
  const [notasDocenteAbierto, setNotasDocenteAbierto] = useState(null)
  const [notasCargando, setNotasCargando] = useState(false)
  const [notasLista, setNotasLista] = useState([])
  const [notaTexto, setNotaTexto] = useState('')
  const [guardandoNota, setGuardandoNota] = useState(false)

  async function abrirNotasDocente(docenteId) {
    setNotasDocenteAbierto(docenteId)
    setNotaTexto('')
    setReporteDesempenoTexto('')
    setNotasCargando(true)
    const result = await supabase
      .from('notas_acompanamiento')
      .select('id, texto, created_at')
      .eq('docente_id', docenteId)
      .eq('institucion_id', institucion.id)
      .order('created_at', { ascending: false })
    setNotasLista(result.data || [])
    setNotasCargando(false)
  }

  async function generarReporteDesempeno(docenteId, docenteNombre) {
    setGenerandoReporteDesempeno(true)
    try {
      // Ejes: el resumen de cada curso de este docente ya está en monitoreoEjes — se resume por eje (peor color gana)
      const cursosDelDocente = cursos.filter(function (c) { return c.docente?.id === docenteId })
      const ejesResumen = {}
      ;['progreso', 'formativa', 'cierre', 'asistencia', 'instrumentos', 'materialesEje'].forEach(function (key) {
        const valores = cursosDelDocente.map(function (c) { return monitoreoEjes[c.id]?.[key] }).filter(Boolean)
        if (valores.length === 0) { ejesResumen[key] = 'gris'; return }
        if (valores.includes('rojo')) ejesResumen[key] = 'rojo'
        else if (valores.includes('ambar')) ejesResumen[key] = 'ambar'
        else if (valores.every(function (v) { return v === 'gris' })) ejesResumen[key] = 'gris'
        else ejesResumen[key] = 'verde'
      })

      const resultado = await llamarIA('reporte_desempeno_docente', {
        docenteNombre: docenteNombre,
        ejes: ejesResumen,
        notasBitacora: notasLista.map(function (n) { return { fecha: n.created_at, texto: n.texto } }),
      })

      if (resultado.error) {
        alert('Error al generar el reporte: ' + resultado.error)
      } else {
        setReporteDesempenoTexto(resultado.data.reporte)
      }
    } catch (err) {
      alert('Error al generar el reporte: ' + err.message)
    }
    setGenerandoReporteDesempeno(false)
  }

  async function guardarNota(docenteId) {
    if (!notaTexto.trim()) return
    setGuardandoNota(true)
    const result = await supabase.from('notas_acompanamiento').insert({
      coordinador_id: session.user.id,
      docente_id: docenteId,
      institucion_id: institucion.id,
      texto: notaTexto.trim(),
    })
    if (result.error) {
      alert('Error al guardar la nota: ' + result.error.message)
    } else {
      setNotaTexto('')
      abrirNotasDocente(docenteId)
    }
    setGuardandoNota(false)
  }

  async function cargarMonitoreoCompleto() {
    if (cursos.length === 0) return
    setMonitoreoCargando(true)
    const miTurno = Date.now()
    monitoreoTurnoRef.current = miTurno

    const courseIds = cursos.map(function (c) { return c.id })
    const areaIds = [...new Set(cursos.map(function (c) { return c.asignaturas?.areas_curriculares?.id }).filter(Boolean))]

    // 1. Unidades de todas las Áreas de esta institución (para saber en qué fecha va cada una)
    const unidades = await consultarEnBloques(supabase, 'unidades', 'id, area_id, grado, grupo, numero, fecha_inicio, fecha_fin', 'area_id', areaIds)

    // 2. Actividades de todos los cursos (para saber si avanzan según su Unidad activa)
    const actividades = await consultarEnBloques(supabase, 'actividades', 'id, course_id, unidad_id, created_at', 'course_id', courseIds)
    const actIds = actividades.map(function (a) { return a.id })

    // 3b. Materiales compartidos (recursos de apoyo, no solo tareas)
    const materiales = await consultarEnBloques(supabase, 'materials', 'id, actividad_id', 'actividad_id', actIds)
    const actividadPorIdParaMateriales = {}
    actividades.forEach(function (a) { actividadPorIdParaMateriales[a.id] = a.course_id })

    // 3. Assignments (tareas) — instrumento usado y fecha de entrega, por curso
    const assignments = await consultarEnBloques(supabase, 'assignments', 'id, course_id, instrumento_evaluacion, fecha_entrega', 'course_id', courseIds)
    const assignmentIds = assignments.map(function (a) { return a.id })

    // 4. Submissions + cuándo se calificaron (evaluación formativa oportuna)
    const submissions = await consultarEnBloques(supabase, 'submissions', 'id, assignment_id, submitted_at, graded_at', 'assignment_id', assignmentIds)

    // 5. Evaluación de cierre (best-effort — si la tabla tiene otra estructura, se ignora sin romper nada)
    let cierres = []
    try {
      cierres = await consultarEnBloques(supabase, 'evaluacion_cierre', 'id, course_id, unidad_id', 'course_id', courseIds)
    } catch (_e) { /* se ignora si la tabla no tiene esta forma */ }

    // 6. Última fecha de asistencia registrada, por Área+Grado+Sección
    let ultimaAsistenciaPorClave = {}
    if (areaIds.length > 0) {
      const asisResult = await consultarEnBloques(supabase, 'asistencias', 'area_id, grado, grupo, fecha', 'area_id', areaIds)
      ;(asisResult || []).forEach(function (a) {
        const key = `${a.area_id}__${a.grado}__${a.grupo}`
        if (!ultimaAsistenciaPorClave[key] || a.fecha > ultimaAsistenciaPorClave[key]) ultimaAsistenciaPorClave[key] = a.fecha
      })
    }

    const hoy = new Date().toISOString().slice(0, 10)
    const ejesPorCurso = {}

    cursos.forEach(function (curso) {
      const areaId = curso.asignaturas?.areas_curriculares?.id
      const unidadesDelCurso = unidades.filter(function (u) { return u.area_id === areaId && u.grado === curso.grado && u.grupo === curso.grupo })
      const actividadesDelCurso = actividades.filter(function (a) { return a.course_id === curso.id })
      const assignmentsDelCurso = assignments.filter(function (a) { return a.course_id === curso.id })
      const assignmentIdsDelCurso = assignmentsDelCurso.map(function (a) { return a.id })
      const submissionsDelCurso = submissions.filter(function (s) { return assignmentIdsDelCurso.includes(s.assignment_id) })

      // Eje 1: Progreso curricular
      const unidadActiva = unidadesDelCurso.find(function (u) { return u.fecha_inicio <= hoy && hoy <= u.fecha_fin })
      let progreso = 'gris'
      if (unidadActiva) {
        const actividadesEnUnidadActiva = actividadesDelCurso.filter(function (a) { return a.unidad_id === unidadActiva.id })
        progreso = actividadesEnUnidadActiva.length > 0 ? 'verde' : 'ambar'
      } else {
        const unidadVencidaSinCerrar = unidadesDelCurso.find(function (u) {
          return u.fecha_fin < hoy && actividadesDelCurso.filter(function (a) { return a.unidad_id === u.id }).length === 0
        })
        if (unidadVencidaSinCerrar) progreso = 'rojo'
      }

      // Eje 2: Evaluación formativa oportuna (¿califica rápido después de que entregan?)
      const entregasCalificadas = submissionsDelCurso.filter(function (s) { return s.graded_at })
      let formativa = 'gris'
      if (submissionsDelCurso.length > 0) {
        const diasPromedio = entregasCalificadas.length > 0
          ? entregasCalificadas.reduce(function (acc, s) {
              const dias = (new Date(s.graded_at) - new Date(s.submitted_at)) / (1000 * 60 * 60 * 24)
              return acc + dias
            }, 0) / entregasCalificadas.length
          : null
        const pctSinCalificar = 1 - (entregasCalificadas.length / submissionsDelCurso.length)
        if (pctSinCalificar > 0.5) formativa = 'rojo'
        else if (diasPromedio == null || diasPromedio > 7) formativa = 'ambar'
        else formativa = 'verde'
      }

      // Eje 3: Cierre de Unidad (¿ya cerró las Unidades que ya vencieron?)
      const unidadesVencidas = unidadesDelCurso.filter(function (u) { return u.fecha_fin < hoy })
      let cierre = 'gris'
      if (unidadesVencidas.length > 0) {
        const unidadesConCierre = new Set(cierres.filter(function (c) { return c.course_id === curso.id }).map(function (c) { return c.unidad_id }))
        const faltantes = unidadesVencidas.filter(function (u) { return !unidadesConCierre.has(u.id) })
        cierre = faltantes.length === 0 ? 'verde' : 'rojo'
      }

      // Eje 4: Asistencia registrada con regularidad (últimos 10 días de clase)
      const claveAsis = `${areaId}__${curso.grado}__${curso.grupo}`
      const ultimaAsis = ultimaAsistenciaPorClave[claveAsis]
      let asistencia = 'gris'
      if (ultimaAsis) {
        const diasDesde = (new Date(hoy) - new Date(ultimaAsis)) / (1000 * 60 * 60 * 24)
        asistencia = diasDesde <= 10 ? 'verde' : diasDesde <= 20 ? 'ambar' : 'rojo'
      }

      // Eje 5: Variedad de instrumentos de evaluación
      const instrumentosUsados = new Set(assignmentsDelCurso.map(function (a) { return a.instrumento_evaluacion }).filter(Boolean))
      let instrumentos = 'gris'
      if (assignmentsDelCurso.length > 0) {
        instrumentos = instrumentosUsados.size >= 2 ? 'verde' : instrumentosUsados.size === 1 ? 'ambar' : 'rojo'
      }

      // Eje 6: Materiales compartidos (recursos de apoyo, no solo tareas)
      const materialesDelCurso = materiales.filter(function (m) { return actividadPorIdParaMateriales[m.actividad_id] === curso.id })
      let materialesEje = 'gris'
      if (actividadesDelCurso.length > 0) {
        materialesEje = materialesDelCurso.length > 0 ? 'verde' : 'rojo'
      }

      ejesPorCurso[curso.id] = { progreso, formativa, cierre, asistencia, instrumentos, materialesEje }
    })

    // Si mientras tanto se disparó otra actualización más nueva, esta respuesta ya está vieja — se descarta
    if (monitoreoTurnoRef.current !== miTurno) return

    setMonitoreoEjes(ejesPorCurso)
    setMonitoreoCargando(false)
    setMonitoreoCargado(true)
  }

  const [tab, setTab] = useState('docentes')
  const [menuFlotanteAbierto, setMenuFlotanteAbierto] = useState(false)
  const [cursoSel, setCursoSel] = useState(null)
  const [gradosProp, setGradosProp] = useState([])
  const [seccionesProp, setSeccionesProp] = useState([])
  const [nuevoGradoNombre, setNuevoGradoNombre] = useState('')
  const [nuevoGradoNumero, setNuevoGradoNumero] = useState('')
  const [nuevaSeccionLetra, setNuevaSeccionLetra] = useState('')
  const [todosLosDocentes, setTodosLosDocentes] = useState([])
  const [docentesVinculadosIds, setDocentesVinculadosIds] = useState(new Set())
  const [docentesConAlgunVinculo, setDocentesConAlgunVinculo] = useState(new Set())
  const [buscarDocente, setBuscarDocente] = useState('')
  const [vinculandoId, setVinculandoId] = useState(null)
  const [areaAbierta, setAreaAbierta] = useState(null)
  const [docenteAbierto, setDocenteAbierto] = useState(null)
  const [gradoFiltroArea, setGradoFiltroArea] = useState(null)

  useEffect(function () {
    cargar()
  }, [])

  useEffect(function () {
    if (tab === 'monitoreo') cargarMonitoreoCompleto()
  }, [tab, cursos])

  async function cargar() {
    setLoading(true)
    const instResult = await supabase.from('profiles').select('institucion_id, instituciones_educativas!profiles_institucion_id_fkey(id, nombre, logo_url)').eq('id', session.user.id).single()
    const institucionId = instResult.data?.institucion_id
    setInstitucion(instResult.data?.instituciones_educativas || null)

    if (institucionId) {
      const cursosResult = await supabase
        .from('courses')
        .select('id, nombre, grado, grupo, docente:profiles(id, full_name), asignaturas(areas_curriculares(id, nombre)), enrollments(count)')
        .eq('institucion_id', institucionId)
        .order('grado')
        .order('grupo')
      if (!cursosResult.error) setCursos(cursosResult.data)

      const courseIds = (cursosResult.data || []).map(function (c) { return c.id })
      if (courseIds.length > 0) {
        const actividadesResult = await supabase.from('actividades').select('id, course_id, created_at').in('course_id', courseIds)
        const actividades = actividadesResult.data || []
        const actIds = actividades.map(function (a) { return a.id })

        let assignments = []
        if (actIds.length > 0) {
          const assignResult = await supabase.from('assignments').select('id, actividad_id, created_at').in('actividad_id', actIds)
          assignments = assignResult.data || []
        }

        const conteoPorCurso = {}
        courseIds.forEach(function (id) { conteoPorCurso[id] = { actividades: 0, tareas: 0, ultimaFecha: null } })
        actividades.forEach(function (a) {
          if (!conteoPorCurso[a.course_id]) return
          conteoPorCurso[a.course_id].actividades++
          if (!conteoPorCurso[a.course_id].ultimaFecha || a.created_at > conteoPorCurso[a.course_id].ultimaFecha) {
            conteoPorCurso[a.course_id].ultimaFecha = a.created_at
          }
        })
        const actividadPorId = {}
        actividades.forEach(function (a) { actividadPorId[a.id] = a.course_id })
        assignments.forEach(function (t) {
          const courseId = actividadPorId[t.actividad_id]
          if (!courseId || !conteoPorCurso[courseId]) return
          conteoPorCurso[courseId].tareas++
          if (!conteoPorCurso[courseId].ultimaFecha || t.created_at > conteoPorCurso[courseId].ultimaFecha) {
            conteoPorCurso[courseId].ultimaFecha = t.created_at
          }
        })
        setMonitoreoPorCurso(conteoPorCurso)
      }

      const conductaDirecta = await supabase
        .from('conductas_registro')
        .select('id, descripcion, created_at, student_id, area_id, grado, grupo')
        .eq('institucion_id', institucionId)
        .order('created_at', { ascending: false })
        .limit(50)
      const conductaResult = {
        error: conductaDirecta.error,
        data: conductaDirecta.data || [],
      }
      if (!conductaResult.error) {
        const studentIds = [...new Set(conductaResult.data.map(function (r) { return r.student_id }))]
        const areaIdsParaConducta = [...new Set(conductaResult.data.map(function (r) { return r.area_id }).filter(Boolean))]
        let areasPorId = {}
        if (areaIdsParaConducta.length > 0) {
          const areasNombreResult = await supabase.from('areas_curriculares').select('id, nombre').in('id', areaIdsParaConducta)
          if (!areasNombreResult.error) areasNombreResult.data.forEach(function (a) { areasPorId[a.id] = a.nombre })
        }
        let nombresMap = {}
        if (studentIds.length > 0) {
          const nombresResult = await supabase.from('profiles').select('id, full_name').in('id', studentIds)
          if (!nombresResult.error) nombresResult.data.forEach(function (p) { nombresMap[p.id] = p.full_name })
        }
        setConducta(conductaResult.data.map(function (r) {
          return { ...r, studentNombre: nombresMap[r.student_id] || 'Estudiante', curso: { nombre: areasPorId[r.area_id] || 'Sin área', grado: r.grado, grupo: r.grupo } }
        }))
      }

      const gradosResult = await supabase.from('grados_institucion').select('*').eq('institucion_id', institucionId).order('orden')
      if (!gradosResult.error) setGradosProp(gradosResult.data)

      const seccionesResult = await supabase.from('secciones_institucion').select('*').eq('institucion_id', institucionId).order('orden')
      if (!seccionesResult.error) setSeccionesProp(seccionesResult.data)

      const docentesResult = await supabase.from('profiles').select('id, full_name, email').eq('role', 'docente').order('full_name')
      if (!docentesResult.error) setTodosLosDocentes(docentesResult.data)

      const todosVinculosResult = await supabase.from('docente_instituciones').select('docente_id, institucion_id')
      if (!todosVinculosResult.error) {
        setDocentesVinculadosIds(new Set(todosVinculosResult.data.filter(function (v) { return v.institucion_id === institucionId }).map(function (v) { return v.docente_id })))
        setDocentesConAlgunVinculo(new Set(todosVinculosResult.data.map(function (v) { return v.docente_id })))
      }
    }
    setLoading(false)
  }

  async function toggleVinculoDocente(docenteId, yaVinculado) {
    if (!institucion?.id) return
    setVinculandoId(docenteId)
    if (yaVinculado) {
      await supabase.from('docente_instituciones').delete().eq('docente_id', docenteId).eq('institucion_id', institucion.id)
    } else {
      await supabase.from('docente_instituciones').insert({ docente_id: docenteId, institucion_id: institucion.id })
    }
    await cargar()
    setVinculandoId(null)
  }

  async function crearAsignaturasAutomaticas(combinaciones) {
    // combinaciones: [{grado, grupo}, ...] — crea 1 curso por cada Asignatura del catálogo compartido, por cada combinación
    if (!institucion?.id || combinaciones.length === 0) return

    const globalesResult = await supabase.from('asignaturas').select('id, nombre').is('institucion_id', null).eq('activo', true)
    const globales = globalesResult.data || []
    if (globales.length === 0) return

    const existentesResult = await supabase
      .from('courses')
      .select('asignatura_id, grado, grupo')
      .eq('institucion_id', institucion.id)
    const yaExisten = new Set((existentesResult.data || []).map(function (c) { return `${c.asignatura_id}__${c.grado}__${c.grupo}` }))

    const payloads = []
    combinaciones.forEach(function (comb) {
      globales.forEach(function (asig) {
        const key = `${asig.id}__${comb.grado}__${comb.grupo}`
        if (yaExisten.has(key)) return
        payloads.push({
          nombre: asig.nombre,
          asignatura_id: asig.id,
          grado: comb.grado,
          grupo: comb.grupo,
          institucion_id: institucion.id,
          activo: true,
        })
      })
    })
    if (payloads.length === 0) return

    const insertResult = await supabase.from('courses').insert(payloads).select('id, grado, grupo')
    if (insertResult.error || !insertResult.data) return

    // Matricular automáticamente a los estudiantes que correspondan a cada combinación
    await Promise.all(insertResult.data.map(async function (nuevoCurso) {
      const directoResult = await supabase
        .from('profiles')
        .select('id')
        .eq('role', 'estudiante')
        .eq('grado', nuevoCurso.grado)
        .eq('grupo', nuevoCurso.grupo)
        .eq('institucion_id', institucion.id)

      // Respaldo: estudiantes viejos que solo se sabe su aula por matrículas en OTROS cursos de esa misma combinación
      const otrosCursosResult = await supabase
        .from('courses')
        .select('id')
        .eq('institucion_id', institucion.id)
        .eq('grado', nuevoCurso.grado)
        .eq('grupo', nuevoCurso.grupo)
        .neq('id', nuevoCurso.id)
      const otrosCourseIds = (otrosCursosResult.data || []).map(function (c) { return c.id })

      let respaldoIds = []
      if (otrosCourseIds.length > 0) {
        const enrollResult = await supabase
          .from('enrollments')
          .select('student_id')
          .in('course_id', otrosCourseIds)
          .eq('status', 'activo')
        respaldoIds = (enrollResult.data || []).map(function (e) { return e.student_id })
      }

      const estudiantesDelAula = [...new Set([...(directoResult.data || []).map(function (s) { return s.id }), ...respaldoIds])]
      if (estudiantesDelAula.length === 0) return
      const matriculas = estudiantesDelAula.map(function (studentId) { return { course_id: nuevoCurso.id, student_id: studentId, status: 'activo' } })
      await supabase.from('enrollments').insert(matriculas)
    }))
  }

  async function agregarGrado() {
    if (!nuevoGradoNombre.trim() || !nuevoGradoNumero || !institucion?.id) return
    const maxOrden = gradosProp.reduce(function (a, g) { return Math.max(a, g.orden) }, 0)
    const nuevoNumero = Number(nuevoGradoNumero)
    const result = await supabase.from('grados_institucion').insert({
      institucion_id: institucion.id,
      numero: nuevoNumero,
      nombre: nuevoGradoNombre.trim(),
      orden: maxOrden + 1,
    })
    if (result.error) { alert('No se pudo agregar: ' + result.error.message); return }
    setNuevoGradoNombre('')
    setNuevoGradoNumero('')

    // Crear las Asignaturas del catálogo compartido para este Grado nuevo, en cada Sección que ya exista
    const combinaciones = seccionesProp.map(function (s) { return { grado: nuevoNumero, grupo: s.letra } })
    await crearAsignaturasAutomaticas(combinaciones)
    cargar()
  }

  async function eliminarGrado(gradoId) {
    if (!confirm('¿Quitar este grado? Las aulas que ya lo usen no se ven afectadas.')) return
    await supabase.from('grados_institucion').delete().eq('id', gradoId)
    cargar()
  }

  async function agregarSeccion() {
    if (!nuevaSeccionLetra.trim() || !institucion?.id) return
    const maxOrden = seccionesProp.reduce(function (a, s) { return Math.max(a, s.orden) }, 0)
    const nuevaLetra = nuevaSeccionLetra.trim().toUpperCase()
    const result = await supabase.from('secciones_institucion').insert({
      institucion_id: institucion.id,
      letra: nuevaLetra,
      orden: maxOrden + 1,
    })
    if (result.error) { alert('No se pudo agregar: ' + result.error.message); return }
    setNuevaSeccionLetra('')

    // Crear las Asignaturas del catálogo compartido para esta Sección nueva, en cada Grado que ya exista
    const combinaciones = gradosProp.map(function (g) { return { grado: g.numero, grupo: nuevaLetra } })
    await crearAsignaturasAutomaticas(combinaciones)
    cargar()
  }

  async function eliminarSeccion(seccionId) {
    if (!confirm('¿Quitar esta sección? Las aulas que ya la usen no se ven afectadas.')) return
    await supabase.from('secciones_institucion').delete().eq('id', seccionId)
    cargar()
  }

  const [sincronizando, setSincronizando] = useState(false)
  const [sincronizarMsg, setSincronizarMsg] = useState('')
  const [asisGradoSel, setAsisGradoSel] = useState(null)
  const [asisSeccionSel, setAsisSeccionSel] = useState(null)
  const [asisDatos, setAsisDatos] = useState([])
  const [asisFechas, setAsisFechas] = useState([])
  const [asisLoading, setAsisLoading] = useState(false)
  const [asisEstudiantesRaw, setAsisEstudiantesRaw] = useState({})
  const [asisAreasDisponibles, setAsisAreasDisponibles] = useState([])
  const [asisAreaFiltro, setAsisAreaFiltro] = useState(null)
  const [asisUnidades, setAsisUnidades] = useState([])
  const [asisFeriados, setAsisFeriados] = useState([])

  async function cargarAsistenciaDeAula(grado, grupo) {
    setAsisLoading(true)

    // Estudiantes con el dato guardado directo en su perfil
    const directoResult = await supabase
      .from('profiles')
      .select('id, full_name')
      .eq('role', 'estudiante')
      .eq('grado', grado)
      .eq('grupo', grupo)
      .eq('institucion_id', institucion.id)

    // Respaldo: estudiantes viejos que solo se sabe su aula por sus matrículas de cursos
    const cursosDeAulaResult = await supabase
      .from('courses')
      .select('id')
      .eq('institucion_id', institucion.id)
      .eq('grado', grado)
      .eq('grupo', grupo)
    const courseIds = (cursosDeAulaResult.data || []).map(function (c) { return c.id })

    let respaldoEstudiantes = []
    if (courseIds.length > 0) {
      const enrollResult = await supabase
        .from('enrollments')
        .select('student:profiles(id, full_name)')
        .in('course_id', courseIds)
        .eq('status', 'activo')
      respaldoEstudiantes = (enrollResult.data || []).map(function (e) { return e.student }).filter(Boolean)
    }

    const mapaEstudiantes = new Map()
    ;(directoResult.data || []).forEach(function (s) { mapaEstudiantes.set(s.id, s) })
    respaldoEstudiantes.forEach(function (s) { if (!mapaEstudiantes.has(s.id)) mapaEstudiantes.set(s.id, s) })
    const estudiantes = [...mapaEstudiantes.values()]
    const studentIds = estudiantes.map(function (s) { return s.id })

    let porEstudiante = {}
    estudiantes.forEach(function (s) { porEstudiante[s.id] = { nombre: s.full_name, registros: [] } })

    let areasConDatos = []
    if (studentIds.length > 0) {
      const asisResult = await supabase
        .from('asistencias')
        .select('student_id, fecha, estado, area_id, areas_curriculares(nombre)')
        .in('student_id', studentIds)
        .order('fecha')
      ;(asisResult.data || []).forEach(function (a) {
        if (!porEstudiante[a.student_id]) return
        porEstudiante[a.student_id].registros.push({ fecha: a.fecha, estado: a.estado, areaId: a.area_id, areaNombre: a.areas_curriculares?.nombre || 'Sin área' })
      })
      const mapaAreas = {}
      ;(asisResult.data || []).forEach(function (a) {
        if (a.area_id) mapaAreas[a.area_id] = a.areas_curriculares?.nombre || 'Sin área'
      })
      areasConDatos = Object.entries(mapaAreas).map(function ([id, nombre]) { return { id: id, nombre: nombre } })
        .sort(function (a, b) { return a.nombre.localeCompare(b.nombre) })
    }

    // Unidades de esa aula (con fechas), de todas las Áreas, para calcular el calendario real de días de clase
    const unidadesResult = await supabase
      .from('unidades')
      .select('id, area_id, fecha_inicio, fecha_fin')
      .eq('grado', grado)
      .eq('grupo', grupo)
      .not('fecha_inicio', 'is', null)
      .not('fecha_fin', 'is', null)
    setAsisUnidades(unidadesResult.data || [])

    const feriadosResult = await supabase.from('feriados').select('fecha').eq('institucion_id', institucion.id)
    setAsisFeriados((feriadosResult.data || []).map(function (f) { return f.fecha }))

    setAsisEstudiantesRaw(porEstudiante)
    setAsisAreasDisponibles(areasConDatos)
    setAsisAreaFiltro(null)
    recalcularAsistencia(porEstudiante, null, unidadesResult.data || [], (feriadosResult.data || []).map(function (f) { return f.fecha }))
    setAsisLoading(false)
  }

  function esFinDeSemana(fechaStr) {
    const dia = new Date(fechaStr + 'T00:00:00').getDay()
    return dia === 0 || dia === 6
  }

  function recalcularAsistencia(porEstudianteRaw, areaFiltro, unidadesParam, feriadosParam) {
    const unidadesUsar = unidadesParam !== undefined ? unidadesParam : asisUnidades
    const feriadosUsar = feriadosParam !== undefined ? feriadosParam : asisFeriados
    const unidadesRelevantes = areaFiltro ? unidadesUsar.filter(function (u) { return u.area_id === areaFiltro }) : unidadesUsar

    // Calendario real: todos los días de clase (sin fines de semana ni feriados) dentro del rango de cada Unidad relevante
    const calendarioSet = new Set()
    unidadesRelevantes.forEach(function (u) {
      let cursor = new Date(u.fecha_inicio + 'T00:00:00')
      const fin = new Date(u.fecha_fin + 'T00:00:00')
      while (cursor <= fin) {
        const fStr = cursor.toISOString().slice(0, 10)
        if (!esFinDeSemana(fStr) && !feriadosUsar.includes(fStr)) calendarioSet.add(fStr)
        cursor.setDate(cursor.getDate() + 1)
      }
    })
    const fechasCalendario = [...calendarioSet].sort()

    const lista = Object.values(porEstudianteRaw).map(function (e) {
      const registrosFiltrados = areaFiltro ? e.registros.filter(function (r) { return r.areaId === areaFiltro }) : e.registros
      const fechas = {}
      registrosFiltrados.forEach(function (r) { fechas[r.fecha] = r.estado })
      let ausentes = 0
      let justificadas = 0
      fechasCalendario.forEach(function (f) {
        if (fechas[f] === 'justificado') justificadas++
        else if (fechas[f] === 'ausente') ausentes++
      })
      return { nombre: e.nombre, fechas: fechas, ausentes: ausentes, justificadas: justificadas, total: ausentes + justificadas }
    })
    lista.sort(function (a, b) { return b.total - a.total })

    // Si ninguna Unidad tiene fechas configuradas todavía, usamos las fechas sueltas que sí tengan registro (respaldo)
    if (fechasCalendario.length === 0) {
      const fechasSet = new Set()
      Object.values(porEstudianteRaw).forEach(function (e) {
        const registrosFiltrados = areaFiltro ? e.registros.filter(function (r) { return r.areaId === areaFiltro }) : e.registros
        registrosFiltrados.forEach(function (r) { fechasSet.add(r.fecha) })
      })
      setAsisFechas([...fechasSet].sort())
    } else {
      setAsisFechas(fechasCalendario)
    }
    setAsisDatos(lista)
  }

  function cambiarAreaFiltro(areaId) {
    setAsisAreaFiltro(areaId)
    recalcularAsistencia(asisEstudiantesRaw, areaId)
  }

  async function exportarAsistenciaExcel() {
    const workbook = new ExcelJS.Workbook()
    const ws = workbook.addWorksheet('Asistencia')

    ws.mergeCells(1, 1, 1, 4 + asisFechas.length)
    const titulo = ws.getCell(1, 1)
    const nombreAreaFiltro = asisAreaFiltro ? asisAreasDisponibles.find(function (a) { return a.id === asisAreaFiltro })?.nombre : null
    titulo.value = `Reporte de Asistencia — ${institucion.nombre} — ${gradoLabel(asisGradoSel)} Sección ${asisSeccionSel}${nombreAreaFiltro ? ' — ' + nombreAreaFiltro : ''}`
    titulo.font = { bold: true, size: 13, color: { argb: 'FFFFFFFF' } }
    titulo.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } }
    titulo.alignment = { horizontal: 'center', vertical: 'middle' }
    ws.getRow(1).height = 24

    const headerRow = ws.getRow(3)
    headerRow.getCell(1).value = 'Estudiante'
    asisFechas.forEach(function (f, i) {
      const cell = headerRow.getCell(2 + i)
      cell.value = new Date(f + 'T00:00:00').toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit' })
      cell.alignment = { textRotation: 90, horizontal: 'center', vertical: 'middle' }
    })
    headerRow.getCell(2 + asisFechas.length).value = 'Sin justificar'
    headerRow.getCell(3 + asisFechas.length).value = 'Justificadas'
    headerRow.getCell(4 + asisFechas.length).value = 'Total'
    headerRow.eachCell(function (cell) {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } }
    })
    headerRow.height = 42
    ws.getColumn(1).width = 30
    for (let i = 0; i < asisFechas.length; i++) ws.getColumn(2 + i).width = 4
    ws.getColumn(2 + asisFechas.length).width = 12
    ws.getColumn(3 + asisFechas.length).width = 12
    ws.getColumn(4 + asisFechas.length).width = 10

    asisDatos.forEach(function (e, idx) {
      const row = ws.getRow(4 + idx)
      row.getCell(1).value = e.nombre
      asisFechas.forEach(function (f, i) {
        const estado = e.fechas[f]
        const cell = row.getCell(2 + i)
        if (estado === 'justificado') {
          cell.value = 'J'
          cell.font = { bold: true, color: { argb: 'FFB45309' } }
        } else if (estado === 'ausente') {
          cell.value = 'F'
          cell.font = { bold: true, color: { argb: 'FFB91C1C' } }
        } else {
          cell.value = 'P'
          cell.font = { bold: true, color: { argb: 'FF16A34A' } }
        }
        cell.alignment = { horizontal: 'center' }
      })
      row.getCell(2 + asisFechas.length).value = e.ausentes
      row.getCell(2 + asisFechas.length).font = { color: { argb: 'FFB91C1C' }, bold: true }
      row.getCell(2 + asisFechas.length).alignment = { horizontal: 'center' }
      row.getCell(3 + asisFechas.length).value = e.justificadas
      row.getCell(3 + asisFechas.length).font = { color: { argb: 'FFB45309' }, bold: true }
      row.getCell(3 + asisFechas.length).alignment = { horizontal: 'center' }
      row.getCell(4 + asisFechas.length).value = e.total
      row.getCell(4 + asisFechas.length).font = { bold: true }
      row.getCell(4 + asisFechas.length).alignment = { horizontal: 'center' }
      for (let c = 1; c <= 4 + asisFechas.length; c++) {
        row.getCell(c).border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }
        if (idx % 2 === 0 && !row.getCell(c).font?.color) row.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } }
      }
    })

    ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0, footer: 0 } }
    ws.views = [{ state: 'frozen', xSplit: 1, ySplit: 3 }]

    const buffer = await workbook.xlsx.writeBuffer()
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `Asistencia_${gradoLabel(asisGradoSel).replace(/\s/g, '_')}_${asisSeccionSel}.xlsx`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function sincronizarAsignaturas() {
    if (gradosProp.length === 0 || seccionesProp.length === 0) {
      setSincronizarMsg('Primero agrega al menos un Grado y una Sección.')
      return
    }
    setSincronizando(true)
    setSincronizarMsg('')

    const combinaciones = []
    gradosProp.forEach(function (g) {
      seccionesProp.forEach(function (s) {
        combinaciones.push({ grado: g.numero, grupo: s.letra })
      })
    })

    const antesResult = await supabase.from('courses').select('id', { count: 'exact', head: true }).eq('institucion_id', institucion.id)
    const totalAntes = antesResult.count || 0

    await crearAsignaturasAutomaticas(combinaciones)

    const despuesResult = await supabase.from('courses').select('id', { count: 'exact', head: true }).eq('institucion_id', institucion.id)
    const totalDespues = despuesResult.count || 0

    setSincronizarMsg(`Listo: se completaron ${totalDespues - totalAntes} Asignatura(s) que faltaban en tus Grados y Secciones existentes.`)
    setSincronizando(false)
    cargar()
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

  // Agrupar cursos por Área curricular, y dentro de cada Área, por Docente
  const areasMap = {}
  cursos.forEach(function (c) {
    const areaNombre = c.asignaturas?.areas_curriculares?.nombre || 'Sin área'
    if (!areasMap[areaNombre]) areasMap[areaNombre] = { area: areaNombre, docentesMap: {}, sinDocente: [] }
    if (c.docente) {
      if (!areasMap[areaNombre].docentesMap[c.docente.id]) areasMap[areaNombre].docentesMap[c.docente.id] = { docente: c.docente, cursos: [] }
      areasMap[areaNombre].docentesMap[c.docente.id].cursos.push(c)
    } else {
      areasMap[areaNombre].sinDocente.push(c)
    }
  })
  const areasLista = Object.values(areasMap)
    .map(function (a) { return { area: a.area, docentesLista: Object.values(a.docentesMap), sinDocente: a.sinDocente } })
    .sort(function (a, b) { return a.area.localeCompare(b.area) })
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
        <div className="flex items-center gap-3">
          {institucion.logo_url && (
            <img src={institucion.logo_url} alt={institucion.nombre} className="w-10 h-10 rounded-full object-contain bg-white" style={{ border: '1px solid #E5E9F0' }} />
          )}
          <div>
            <p className="font-bold text-sm" style={{ color: NAVY_DARK }}>Nexoris Academy — Coordinador</p>
            <p className="text-xs" style={{ color: GREEN_DARK }}>{institucion.nombre} · {profile?.full_name}</p>
          </div>
        </div>
        <button onClick={logout} className="text-xs font-semibold px-4 py-2 rounded-lg transition" style={{ backgroundColor: '#F4F6F9', color: NAVY_DARK, border: '1px solid #D6DCE5' }}>Salir</button>
      </header>

      <main className="p-6 max-w-5xl mx-auto">
        <h2 className="text-2xl font-bold mb-1" style={{ color: NAVY_DARK }}>Panel de Supervisión</h2>
        <p className="text-sm text-slate-400 mb-6">Solo puedes ver información — cualquier edición de notas o asistencia la hace el docente correspondiente.</p>

        <div className="sticky top-0 z-20 mb-6" style={{ backgroundColor: '#F4F6F9' }}>
          <div className="flex gap-2 border-b overflow-x-auto" style={{ borderColor: '#E5E9F0' }}>
          {(function () {
            const pestañas = [
              { id: 'docentes', label: 'Docentes y Aulas' },
              { id: 'lista-docentes', label: 'Docentes' },
              { id: 'lista-estudiantes', label: 'Estudiantes' },
              { id: 'aulas', label: 'Gestión de Aulas' },
              { id: 'grados-secciones', label: 'Grados y Secciones' },
              { id: 'conducta', label: `Conducta ${conducta.length > 0 ? `(${conducta.length})` : ''}` },
              { id: 'importar', label: 'Importar Estudiantes' },
              { id: 'importar-docentes', label: 'Importar Docentes' },
              { id: 'habilitar-cursos', label: 'Habilitar Cursos' },
              { id: 'asignaturas', label: 'Asignaturas' },
              { id: 'recreos', label: 'Recreos' },
              { id: 'feriados', label: 'Feriados' },
              { id: 'matriculas', label: 'Matrículas' },
              { id: 'asistencia', label: 'Asistencia' },
              { id: 'monitoreo', label: 'Monitoreo' },
              { id: 'siagie', label: 'Formato SIAGIE' },
              { id: 'mi-institucion', label: '🏫 Mi Institución' },
            ]
            return pestañas.map(function (t) {
              const active = tab === t.id
              return (
                <button key={t.id} onClick={function () { setTab(t.id) }} className="px-4 py-2.5 text-sm font-semibold border-b-2 transition whitespace-nowrap"
                  style={active ? { borderColor: GREEN, color: NAVY_DARK } : { borderColor: 'transparent', color: '#94A3B8' }}>
                  {t.label}
                </button>
              )
            })
          })()}
          </div>
        </div>

        {/* Botón flotante — siempre visible, para cambiar de pestaña sin subir hasta arriba */}
        <button
          onClick={function () { setMenuFlotanteAbierto(!menuFlotanteAbierto) }}
          className="fixed rounded-full flex items-center justify-center text-white shadow-lg transition hover:opacity-90"
          style={{
            bottom: 'max(24px, env(safe-area-inset-bottom, 0px) + 16px)',
            right: 'max(24px, env(safe-area-inset-right, 0px) + 16px)',
            width: 56, height: 56, backgroundColor: NAVY, zIndex: 9999, boxShadow: '0 8px 20px rgba(37,99,235,0.4)',
          }}
          title="Cambiar de pestaña"
        >
          <span style={{ fontSize: 22 }}>☰</span>
        </button>

        {menuFlotanteAbierto && (
          <>
            <div className="fixed inset-0" style={{ backgroundColor: 'rgba(15,42,74,0.3)', zIndex: 9997 }} onClick={function () { setMenuFlotanteAbierto(false) }} />
            <div
              className="fixed rounded-2xl bg-white overflow-y-auto"
              style={{
                bottom: 'max(90px, env(safe-area-inset-bottom, 0px) + 82px)',
                right: 'max(24px, env(safe-area-inset-right, 0px) + 16px)',
                width: 260, maxHeight: '60vh', zIndex: 9998, border: '1px solid #E5E9F0', boxShadow: '0 12px 32px rgba(15,42,74,0.2)',
              }}
            >
              {[
                { id: 'docentes', label: 'Docentes y Aulas' },
                { id: 'lista-docentes', label: 'Docentes' },
                { id: 'lista-estudiantes', label: 'Estudiantes' },
                { id: 'aulas', label: 'Gestión de Aulas' },
                { id: 'grados-secciones', label: 'Grados y Secciones' },
                { id: 'conducta', label: `Conducta ${conducta.length > 0 ? `(${conducta.length})` : ''}` },
                { id: 'importar', label: 'Importar Estudiantes' },
                { id: 'importar-docentes', label: 'Importar Docentes' },
                { id: 'habilitar-cursos', label: 'Habilitar Cursos' },
                { id: 'asignaturas', label: 'Asignaturas' },
                { id: 'recreos', label: 'Recreos' },
                { id: 'feriados', label: 'Feriados' },
                { id: 'matriculas', label: 'Matrículas' },
                { id: 'asistencia', label: 'Asistencia' },
                { id: 'monitoreo', label: 'Monitoreo' },
                { id: 'siagie', label: 'Formato SIAGIE' },
                { id: 'mi-institucion', label: '🏫 Mi Institución' },
              ].map(function (t) {
                const active = tab === t.id
                return (
                  <button
                    key={t.id}
                    onClick={function () { setTab(t.id); setMenuFlotanteAbierto(false); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
                    className="w-full text-left px-4 py-2.5 text-sm font-medium transition"
                    style={active ? { backgroundColor: '#E7F3E4', color: GREEN_DARK } : { color: NAVY_DARK }}
                  >
                    {t.label}
                  </button>
                )
              })}
            </div>
          </>
        )}

        {tab === 'monitoreo' && (function () {
          const LEYENDA_EJES = {
            progreso: 'Progreso curricular — ¿avanza según el cronograma de su Unidad?',
            formativa: 'Evaluación formativa oportuna — ¿califica poco después de que entregan?',
            cierre: 'Cierre de Unidad — ¿ya evaluó las Unidades que ya terminaron?',
            asistencia: 'Asistencia registrada con regularidad',
            instrumentos: 'Variedad de instrumentos de evaluación',
            materialesEje: 'Materiales compartidos — ¿sube recursos de apoyo, no solo tareas?',
          }
          const COLOR_SEMAFORO = { verde: '#22C55E', ambar: '#F59E0B', rojo: '#EF4444', gris: '#CBD5E1' }

          function Punto({ color, titulo }) {
            return <span title={titulo} className="inline-block rounded-full flex-shrink-0" style={{ width: 10, height: 10, backgroundColor: COLOR_SEMAFORO[color] }} />
          }

          function semaforoGeneral(cursosDelDocente) {
            const todosLosEjes = cursosDelDocente.flatMap(function (c) {
              const e = monitoreoEjes[c.id]
              return e ? Object.values(e) : []
            })
            if (todosLosEjes.length === 0) return 'gris'
            if (todosLosEjes.includes('rojo')) return 'rojo'
            if (todosLosEjes.includes('ambar')) return 'ambar'
            if (todosLosEjes.every(function (e) { return e === 'gris' })) return 'gris'
            return 'verde'
          }

          // Agrupar todos los cursos de la institución por Docente
          const porDocente = {}
          cursos.forEach(function (c) {
            if (!c.docente) return
            if (!porDocente[c.docente.id]) porDocente[c.docente.id] = { docente: c.docente, cursos: [] }
            porDocente[c.docente.id].cursos.push(c)
          })
          const listaDocentes = Object.values(porDocente).sort(function (a, b) { return compararPorApellido ? compararPorApellido(a.docente.full_name, b.docente.full_name) : a.docente.full_name.localeCompare(b.docente.full_name) })

          // Agrupar también por Área, para la vista de comparación
          const porArea = {}
          cursos.forEach(function (c) {
            if (!c.docente) return
            const areaNombre = c.asignaturas?.areas_curriculares?.nombre || 'Sin área'
            if (!porArea[areaNombre]) porArea[areaNombre] = {}
            if (!porArea[areaNombre][c.docente.id]) porArea[areaNombre][c.docente.id] = { docente: c.docente, cursos: [] }
            porArea[areaNombre][c.docente.id].cursos.push(c)
          })
          const areasParaComparar = Object.keys(porArea).sort()

          return (
            <div>
              <div className="flex justify-between items-start gap-3 flex-wrap mb-1">
                <p className="text-xs text-slate-400">Acompañamiento docente según el CNEB — el semáforo junto a cada nombre resume 6 ejes de su práctica en todas sus Asignaturas. Haz clic para ver el detalle.</p>
                <div className="flex gap-2 flex-shrink-0">
                  <button
                    onClick={function () { setMonitoreoVistaComparar(!monitoreoVistaComparar); setMonitoreoAreaComparar(areasParaComparar[0] || null) }}
                    className="text-xs font-semibold px-3 py-1.5 rounded-lg transition"
                    style={monitoreoVistaComparar ? { backgroundColor: NAVY, color: 'white' } : { backgroundColor: 'white', color: NAVY, border: '1px solid #D6DCE5' }}
                  >
                    📊 {monitoreoVistaComparar ? 'Ver por Docente' : 'Comparar por Área'}
                  </button>
                  <button
                    onClick={cargarMonitoreoCompleto}
                    disabled={monitoreoCargando}
                    className="text-xs font-semibold px-3 py-1.5 rounded-lg transition hover:opacity-90 disabled:opacity-50"
                    style={{ backgroundColor: 'white', color: NAVY, border: '1px solid #D6DCE5' }}
                  >
                    {monitoreoCargando ? 'Actualizando...' : '🔄 Actualizar'}
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 mb-5 text-[11px] text-slate-400">
                {Object.entries(LEYENDA_EJES).map(function ([key, texto]) {
                  return <span key={key} className="flex items-center gap-1"><Punto color="verde" />{texto.split(' — ')[0]}</span>
                })}
              </div>

              {monitoreoVistaComparar ? (
                <div>
                  {areasParaComparar.length > 1 && (
                    <div className="flex gap-1.5 flex-wrap mb-4">
                      {areasParaComparar.map(function (areaNombre) {
                        return (
                          <button
                            key={areaNombre}
                            onClick={function () { setMonitoreoAreaComparar(areaNombre) }}
                            className="text-xs font-semibold px-3 py-1.5 rounded-full transition"
                            style={monitoreoAreaComparar === areaNombre ? { backgroundColor: GREEN, color: 'white' } : { backgroundColor: 'white', color: NAVY_DARK, border: '1px solid #D6DCE5' }}
                          >
                            {areaNombre}
                          </button>
                        )
                      })}
                    </div>
                  )}

                  {!monitoreoAreaComparar || !porArea[monitoreoAreaComparar] ? (
                    <p className="text-slate-400 text-sm">No hay Áreas con Docentes asignados todavía.</p>
                  ) : (
                    <div className="bg-white rounded-2xl overflow-x-auto" style={{ border: '1px solid #E5E9F0' }}>
                      <table className="w-full text-sm">
                        <thead>
                          <tr style={{ borderBottom: '1px solid #E5E9F0' }}>
                            <th className="text-left py-2.5 px-4 font-semibold" style={{ color: NAVY_DARK }}>Docente</th>
                            {Object.keys(LEYENDA_EJES).map(function (key) {
                              return <th key={key} className="text-center py-2.5 px-2 font-semibold text-[11px]" style={{ color: NAVY_DARK }} title={LEYENDA_EJES[key]}>{LEYENDA_EJES[key].split(' — ')[0]}</th>
                            })}
                          </tr>
                        </thead>
                        <tbody>
                          {Object.values(porArea[monitoreoAreaComparar])
                            .sort(function (a, b) { return compararPorApellido ? compararPorApellido(a.docente.full_name, b.docente.full_name) : a.docente.full_name.localeCompare(b.docente.full_name) })
                            .map(function (grupoDoc) {
                              return (
                                <tr key={grupoDoc.docente.id} style={{ borderBottom: '1px solid #F4F6F9' }}>
                                  <td className="py-2.5 px-4 font-medium" style={{ color: NAVY_DARK }}>{grupoDoc.docente.full_name}</td>
                                  {Object.keys(LEYENDA_EJES).map(function (key) {
                                    // Resumen del eje: si algún curso de esta Área+Docente está en rojo, gana rojo; si no, ámbar; si no, verde; si no hay datos, gris
                                    const valores = grupoDoc.cursos.map(function (c) { return monitoreoEjes[c.id]?.[key] }).filter(Boolean)
                                    let resumen = 'gris'
                                    if (valores.length > 0) {
                                      if (valores.includes('rojo')) resumen = 'rojo'
                                      else if (valores.includes('ambar')) resumen = 'ambar'
                                      else if (valores.every(function (v) { return v === 'gris' })) resumen = 'gris'
                                      else resumen = 'verde'
                                    }
                                    return (
                                      <td key={key} className="text-center py-2.5 px-2">
                                        <Punto color={resumen} titulo={LEYENDA_EJES[key]} />
                                      </td>
                                    )
                                  })}
                                </tr>
                              )
                            })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ) : (
              <>
              {monitoreoCargando && listaDocentes.length === 0 && <p className="text-slate-400 text-sm">Cargando...</p>}
              {!monitoreoCargando && listaDocentes.length === 0 && <p className="text-slate-400 text-sm">Aún no hay docentes con Aulas asignadas.</p>}

              <div className="space-y-3">
                {listaDocentes.map(function (grupoDoc) {
                  const abierto = docenteExpandido === grupoDoc.docente.id
                  const general = semaforoGeneral(grupoDoc.cursos)
                  return (
                    <div key={grupoDoc.docente.id} className="bg-white rounded-2xl overflow-hidden" style={{ border: '1px solid #E5E9F0' }}>
                      <div className="w-full flex items-center justify-between px-5 py-4">
                        <button
                          onClick={function () { setDocenteExpandido(abierto ? null : grupoDoc.docente.id) }}
                          className="flex items-center gap-2.5 text-left flex-1"
                        >
                          <Punto color={general} titulo="Resumen general" />
                          <span className="text-sm font-bold" style={{ color: NAVY_DARK }}>{grupoDoc.docente.full_name}</span>
                        </button>
                        <span className="text-xs text-slate-400 flex items-center gap-3 flex-shrink-0">
                          <button
                            onClick={function () { abrirNotasDocente(grupoDoc.docente.id) }}
                            className="font-semibold px-2 py-1 rounded-lg transition"
                            style={{ backgroundColor: '#EAF2FB', color: NAVY }}
                          >
                            📝 Notas
                          </button>
                          <button onClick={function () { setDocenteExpandido(abierto ? null : grupoDoc.docente.id) }}>
                            {grupoDoc.cursos.length} asignatura(s) {abierto ? '▾' : '▸'}
                          </button>
                        </span>
                      </div>

                      {abierto && (
                        <div className="px-5 pb-5 space-y-2">
                          {monitoreoCargando && <p className="text-xs text-slate-400">Calculando...</p>}
                          {grupoDoc.cursos.map(function (c) {
                            const e = monitoreoEjes[c.id]
                            return (
                              <div key={c.id} className="rounded-xl p-3" style={{ backgroundColor: '#F4F6F9', border: '1px solid #E5E9F0' }}>
                                <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
                                  <div>
                                    <p className="text-sm font-semibold" style={{ color: NAVY_DARK }}>{c.nombre}</p>
                                    <p className="text-xs text-slate-400">{gradoLabel(c.grado)} — Sección {c.grupo}</p>
                                  </div>
                                  <button
                                    onClick={function () { abrirDetalleMonitoreo(c) }}
                                    className="text-[11px] font-semibold px-2.5 py-1 rounded-lg transition"
                                    style={{ backgroundColor: 'white', color: NAVY, border: '1px solid #D6DCE5' }}
                                  >
                                    Ver detalle completo
                                  </button>
                                </div>
                                {!e ? (
                                  <p className="text-xs text-slate-400">Sin datos suficientes todavía.</p>
                                ) : (
                                  <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                                    {Object.entries(LEYENDA_EJES).map(function ([key, texto]) {
                                      return (
                                        <span key={key} className="flex items-center gap-1.5 text-xs" style={{ color: NAVY_DARK }} title={texto}>
                                          <Punto color={e[key]} titulo={texto} />
                                          {texto.split(' — ')[0]}
                                        </span>
                                      )
                                    })}
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
              </>
              )}

              {monitoreoCursoSel && (
                <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={function () { setMonitoreoCursoSel(null) }}>
                  <div className="bg-white rounded-2xl p-6 w-full max-w-lg max-h-[80vh] overflow-y-auto" style={{ border: '1px solid #E5E9F0' }} onClick={function (e) { e.stopPropagation() }}>
                    <div className="flex justify-between items-start mb-1">
                      <h3 className="text-lg font-bold" style={{ color: NAVY_DARK }}>{monitoreoCursoSel.nombre}</h3>
                      <button onClick={function () { setMonitoreoCursoSel(null) }} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
                    </div>
                    <p className="text-xs text-slate-400 mb-4">{gradoLabel(monitoreoCursoSel.grado)} — Sección {monitoreoCursoSel.grupo} · {monitoreoCursoSel.docente?.full_name}</p>

                    <button
                      onClick={function () { recordarDocente(monitoreoCursoSel) }}
                      disabled={recordandoId === monitoreoCursoSel.id}
                      className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white transition hover:opacity-90 disabled:opacity-50 mb-4"
                      style={{ backgroundColor: '#B45309' }}
                    >
                      {recordandoId === monitoreoCursoSel.id ? 'Enviando...' : '🔔 Recordar al docente'}
                    </button>

                    {monitoreoDetalleLoading ? (
                      <p className="text-slate-400 text-sm">Cargando...</p>
                    ) : monitoreoDetalle.length === 0 ? (
                      <p className="text-slate-400 text-sm">Sin Unidades configuradas todavía para esta Asignatura.</p>
                    ) : (
                      <div className="space-y-3">
                        {monitoreoDetalle.map(function (u) {
                          const uAbierta = monitoreoUnidadAbierta === u.id
                          return (
                            <div key={u.id} className="rounded-xl overflow-hidden" style={{ border: '1px solid #E5E9F0' }}>
                              <button onClick={function () { setMonitoreoUnidadAbierta(uAbierta ? null : u.id) }} className="w-full flex justify-between items-center px-3 py-2.5 text-left" style={{ backgroundColor: '#F4F6F9' }}>
                                <span className="text-xs font-bold" style={{ color: NAVY }}>{u.tipo} {u.numero}{u.nombre ? ' — ' + u.nombre : ''}</span>
                                <span className="text-[11px] text-slate-400">{u.actividades.length} actividad(es) {uAbierta ? '▾' : '▸'}</span>
                              </button>
                              {uAbierta && (
                                <div className="p-3 space-y-2">
                                  {u.actividades.length === 0 ? (
                                    <p className="text-xs text-slate-400">Sin actividades registradas en esta Unidad.</p>
                                  ) : (
                                    u.actividades.map(function (a) {
                                      return (
                                        <div key={a.id} className="rounded-lg p-2.5" style={{ backgroundColor: '#FAFBFC', border: '1px solid #F4F6F9' }}>
                                          <p className="text-xs font-semibold" style={{ color: NAVY_DARK }}>Actividad {a.numero_actividad} — {a.nombre}</p>
                                          <p className="text-[11px] text-slate-400 mt-0.5">{a.materiales.length} material(es) · {a.tareas.length} tarea(s)</p>
                                        </div>
                                      )
                                    })
                                  )}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {notasDocenteAbierto && (
                <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={function () { setNotasDocenteAbierto(null) }}>
                  <div className="bg-white rounded-2xl p-6 w-full max-w-lg max-h-[80vh] overflow-y-auto flex flex-col" style={{ border: '1px solid #E5E9F0' }} onClick={function (e) { e.stopPropagation() }}>
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h3 className="text-lg font-bold" style={{ color: NAVY_DARK }}>Bitácora de acompañamiento</h3>
                        <p className="text-xs text-slate-400">
                          {listaDocentes.find(function (g) { return g.docente.id === notasDocenteAbierto })?.docente.full_name}
                        </p>
                      </div>
                      <button onClick={function () { setNotasDocenteAbierto(null) }} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
                    </div>

                    <div className="space-y-2 mb-4">
                      <textarea
                        value={notaTexto}
                        onChange={function (e) { setNotaTexto(e.target.value) }}
                        placeholder="Ej: Hablé con él sobre el atraso en 3°C. Se comprometió a subir la actividad esta semana. Seguimiento: 22/08."
                        rows={3}
                        className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                        style={{ backgroundColor: '#F4F6F9', border: '1px solid #D6DCE5', color: NAVY_DARK }}
                      />
                      <button
                        onClick={function () { guardarNota(notasDocenteAbierto) }}
                        disabled={guardandoNota || !notaTexto.trim()}
                        className="text-xs font-semibold px-4 py-2 rounded-lg text-white transition hover:opacity-90 disabled:opacity-50"
                        style={{ backgroundColor: GREEN }}
                      >
                        {guardandoNota ? 'Guardando...' : '+ Agregar nota'}
                      </button>
                    </div>

                    <div className="mb-4">
                      <button
                        onClick={function () { generarReporteDesempeno(notasDocenteAbierto, listaDocentes.find(function (g) { return g.docente.id === notasDocenteAbierto })?.docente.full_name || '') }}
                        disabled={generandoReporteDesempeno}
                        className="text-xs font-semibold px-4 py-2 rounded-lg text-white transition hover:opacity-90 disabled:opacity-50"
                        style={{ backgroundColor: '#7C3AED' }}
                      >
                        {generandoReporteDesempeno ? 'Analizando...' : '🤖 Generar reporte de desempeño con IA'}
                      </button>
                      {reporteDesempenoTexto && (
                        <div className="mt-3 rounded-lg p-3 whitespace-pre-line text-sm" style={{ backgroundColor: '#F0F0FF', border: '1px solid #D6D0FA', color: '#4A2E9E' }}>
                          {reporteDesempenoTexto}
                        </div>
                      )}
                    </div>

                    <p className="text-xs font-bold mb-2" style={{ color: NAVY_DARK }}>Historial</p>
                    {notasCargando ? (
                      <p className="text-xs text-slate-400">Cargando...</p>
                    ) : notasLista.length === 0 ? (
                      <p className="text-xs text-slate-400">Todavía no hay notas para este docente.</p>
                    ) : (
                      <div className="space-y-2">
                        {notasLista.map(function (n) {
                          return (
                            <div key={n.id} className="rounded-lg p-3" style={{ backgroundColor: '#F4F6F9', border: '1px solid #E5E9F0' }}>
                              <p className="text-[11px] text-slate-400 mb-1">{new Date(n.created_at).toLocaleDateString('es-PE', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
                              <p className="text-sm" style={{ color: NAVY_DARK }}>{n.texto}</p>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })()}

        {tab === 'siagie' && (
          <div>
            <h2 className="text-2xl font-bold mb-2" style={{ color: NAVY_DARK }}>Formato SIAGIE por Bimestre</h2>
            <p className="text-sm text-slate-400 mb-6">
              Genera el Excel con el nivel de logro (AD, A, B, C) de cada Competencia, por Grado y Sección — listo para pasar al SIAGIE.
            </p>

            <div className="bg-white rounded-2xl p-5 mb-6" style={{ border: '1px solid #E5E9F0' }}>
              <div className="flex justify-between items-center flex-wrap gap-2 mb-1">
                <p className="text-sm font-bold" style={{ color: NAVY_DARK }}>📥 Registros Auxiliares recibidos</p>
                <button
                  onClick={cargarRegistrosRecibidos}
                  disabled={registrosCargando}
                  className="text-xs font-semibold px-3 py-1.5 rounded-lg transition disabled:opacity-50"
                  style={{ backgroundColor: 'white', color: NAVY, border: '1px solid #D6DCE5' }}
                >
                  {registrosCargando ? 'Cargando...' : registrosCargados ? '🔄 Actualizar' : 'Ver registros recibidos'}
                </button>
              </div>
              <p className="text-xs text-slate-400 mb-4">
                Lo que los Docentes ya enviaron desde su Registro Auxiliar, agrupado por Área → Grado → Sección.
              </p>

              {registrosCargados && (function () {
                const grupos = agruparRegistrosRecibidos()
                if (grupos.length === 0) {
                  return <p className="text-slate-400 text-sm">Todavía no hay ningún Registro Auxiliar enviado.</p>
                }

                const porArea = {}
                grupos.forEach(function (g) {
                  if (!porArea[g.areaNombre]) porArea[g.areaNombre] = []
                  porArea[g.areaNombre].push(g)
                })

                return (
                  <div className="space-y-4">
                    {Object.entries(porArea).map(function ([areaNombre, gruposDelArea]) {
                      return (
                        <div key={areaNombre} className="rounded-xl p-3" style={{ backgroundColor: '#F4F6F9' }}>
                          <p className="text-xs font-bold mb-2" style={{ color: NAVY_DARK }}>{areaNombre}</p>
                          <div className="space-y-2">
                            {gruposDelArea.map(function (g) {
                              const docentesUnicos = [...new Set(g.envios.map(function (e) { return e.docente?.full_name || 'Docente' }))]
                              return (
                                <div key={`${g.areaId}_${g.grado}_${g.grupo}_${g.bimestre}`} className="bg-white rounded-lg p-3 flex justify-between items-center flex-wrap gap-2" style={{ border: '1px solid #E5E9F0' }}>
                                  <div>
                                    <p className="text-xs font-semibold" style={{ color: NAVY_DARK }}>
                                      {gradoLabel(g.grado)} Sección {g.grupo} — Bimestre {g.bimestre}
                                    </p>
                                    <p className="text-[11px] text-slate-400">
                                      Enviado por: {docentesUnicos.join(', ')}
                                    </p>
                                  </div>
                                  <button
                                    onClick={function () { extraerParaSIAGIE(g) }}
                                    className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white transition hover:opacity-90"
                                    style={{ backgroundColor: '#7C3AED' }}
                                  >
                                    Extraer para SIAGIE
                                  </button>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )
              })()}
            </div>

            <p className="text-sm font-bold mb-2" style={{ color: NAVY_DARK }}>O calcula manualmente</p>
            <p className="text-xs text-slate-400 mb-4">
              Según la RVM N° 094-2020-MINEDU: la Conclusión Descriptiva es obligatoria cuando el nivel de logro es "C" (resaltada en naranja) — queda en blanco por ahora, lista para completarse.
            </p>

            <div className="bg-white rounded-2xl p-5 max-w-lg" style={{ border: '1px solid #E5E9F0' }}>
              <div className="grid sm:grid-cols-3 gap-3 mb-4">
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: NAVY_DARK }}>Grado</label>
                  <select value={siagieGrado} onChange={function (e) { setSiagieGrado(Number(e.target.value)) }} className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={{ backgroundColor: 'white', border: '1px solid #D6DCE5', color: NAVY_DARK }}>
                    {(gradosProp.length > 0 ? gradosProp.map(function (g) { return g.numero }) : [1, 2, 3, 4, 5]).map(function (g) { return <option key={g} value={g}>{g}°</option> })}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: NAVY_DARK }}>Sección</label>
                  <select value={siagieGrupo} onChange={function (e) { setSiagieGrupo(e.target.value) }} className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={{ backgroundColor: 'white', border: '1px solid #D6DCE5', color: NAVY_DARK }}>
                    {(seccionesProp.length > 0 ? seccionesProp.map(function (s) { return s.letra }) : ['A', 'B', 'C', 'D', 'E']).map(function (s) { return <option key={s} value={s}>Sección {s}</option> })}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: NAVY_DARK }}>Bimestre</label>
                  <select value={siagieBimestre} onChange={function (e) { setSiagieBimestre(Number(e.target.value)) }} className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={{ backgroundColor: 'white', border: '1px solid #D6DCE5', color: NAVY_DARK }}>
                    <option value={1}>I Bimestre</option>
                    <option value={2}>II Bimestre</option>
                    <option value={3}>III Bimestre</option>
                    <option value={4}>IV Bimestre</option>
                  </select>
                </div>
              </div>

              <button
                onClick={calcularDatosSIAGIE}
                disabled={siagieGenerando}
                className="text-sm font-semibold px-5 py-2.5 rounded-xl text-white transition hover:opacity-90 disabled:opacity-50"
                style={{ background: `linear-gradient(90deg, ${NAVY}, ${GREEN})`, boxShadow: '0 8px 20px rgba(37,99,235,0.3)' }}
              >
                {siagieGenerando ? 'Calculando...' : '🧮 Calcular niveles de logro'}
              </button>
            </div>

            {siagieDatos && (function () {
              const pendientesC = paresConNivelC()
              return (
                <div className="bg-white rounded-2xl p-5 max-w-2xl mt-5" style={{ border: '1px solid #E5E9F0' }}>
                  <p className="text-sm font-bold mb-1" style={{ color: NAVY_DARK }}>
                    {gradoLabel(siagieDatos.grado)} Sección {siagieDatos.grupo} — {siagieDatos.estudiantes.length} estudiante(s)
                  </p>
                  <p className="text-xs text-slate-400 mb-4">
                    {pendientesC.length === 0
                      ? 'No hay ningún caso con Nivel "C" en este Bimestre — no hay Conclusiones obligatorias pendientes.'
                      : `${pendientesC.length} caso(s) con Nivel "C" necesitan Conclusión Descriptiva obligatoria (según RVM N° 094-2020-MINEDU).`}
                  </p>

                  {pendientesC.length > 0 && (
                    <button
                      onClick={generarConclusionesConIA}
                      disabled={siagieGenerandoConclusiones}
                      className="text-xs font-semibold px-4 py-2 rounded-lg text-white transition hover:opacity-90 disabled:opacity-50 mb-4"
                      style={{ backgroundColor: '#7C3AED' }}
                    >
                      {siagieGenerandoConclusiones
                        ? `Generando... (${siagieProgresoConclusiones.hechas}/${siagieProgresoConclusiones.total})`
                        : '🤖 Generar conclusiones con IA'}
                    </button>
                  )}

                  {pendientesC.length > 0 && (
                    <div className="space-y-3 mb-5 max-h-96 overflow-y-auto">
                      {pendientesC.map(function (par) {
                        return (
                          <div key={par.key} className="rounded-lg p-3" style={{ backgroundColor: '#FFF7E6', border: '1px solid #FDE4B5' }}>
                            <p className="text-xs font-semibold mb-1" style={{ color: NAVY_DARK }}>
                              {par.estudiante.full_name} — {par.competencia.nombre}
                            </p>
                            <textarea
                              value={siagieConclusionesIA[par.key] || ''}
                              onChange={function (e) { setSiagieConclusionesIA(function (prev) { return { ...prev, [par.key]: e.target.value } }) }}
                              placeholder="Todavía sin conclusión — usa el botón de arriba, o escríbela a mano aquí"
                              rows={2}
                              className="w-full rounded-lg px-2 py-1.5 text-xs outline-none"
                              style={{ backgroundColor: 'white', border: '1px solid #D6DCE5', color: NAVY_DARK }}
                            />
                          </div>
                        )
                      })}
                    </div>
                  )}

                  <button
                    onClick={descargarExcelSIAGIE}
                    disabled={siagieDescargando}
                    className="text-sm font-semibold px-5 py-2.5 rounded-xl text-white transition hover:opacity-90 disabled:opacity-50"
                    style={{ background: `linear-gradient(90deg, ${NAVY}, ${GREEN})`, boxShadow: '0 8px 20px rgba(37,99,235,0.3)' }}
                  >
                    {siagieDescargando ? 'Generando Excel...' : '📥 Descargar formato SIAGIE'}
                  </button>
                </div>
              )
            })()}

            <div className="bg-white rounded-2xl p-5 max-w-lg mt-5" style={{ border: '1px solid #E5E9F0' }}>
              <p className="text-sm font-bold mb-1" style={{ color: NAVY_DARK }}>Completar la plantilla oficial del SIAGIE con IA</p>
              <p className="text-xs text-slate-400 mb-4">
                Sube aquí el archivo Excel en blanco que descargaste directo del SIAGIE (Evaluación → Registro de calificaciones). El sistema detecta su estructura, y en el futuro la IA lo va a completar automáticamente con las notas ya calculadas — listo para descargar con el mismo nombre y subirlo de vuelta al SIAGIE.
              </p>

              <label className="inline-block text-xs font-semibold px-4 py-2.5 rounded-lg cursor-pointer transition hover:opacity-90" style={{ backgroundColor: 'white', color: NAVY, border: '1px solid #D6DCE5' }}>
                {siagieLeyendoPlantilla ? 'Leyendo archivo...' : '📎 Subir plantilla del SIAGIE (.xlsx)'}
                <input
                  type="file"
                  accept=".xlsx"
                  className="hidden"
                  onChange={function (e) { if (e.target.files[0]) leerPlantillaSIAGIE(e.target.files[0]) }}
                  disabled={siagieLeyendoPlantilla}
                />
              </label>

              {siagiePlantillaEstructura && (
                <div className="mt-4">
                  <p className="text-xs font-semibold mb-2" style={{ color: GREEN_DARK }}>
                    ✓ Archivo leído: {siagiePlantillaEstructura.nombreArchivo}
                  </p>
                  <div className="space-y-2 mb-4">
                    {siagiePlantillaEstructura.hojas.map(function (hoja, i) {
                      return (
                        <div key={i} className="rounded-lg p-2.5 text-xs" style={{ backgroundColor: '#F4F6F9', border: '1px solid #E5E9F0' }}>
                          <p className="font-semibold" style={{ color: NAVY_DARK }}>Hoja: "{hoja.nombre}"</p>
                          <p className="text-slate-400">{hoja.totalFilas} fila(s) × {hoja.totalColumnas} columna(s) detectadas</p>
                        </div>
                      )
                    })}
                  </div>

                  <button
                    onClick={completarPlantillaConIA}
                    disabled={siagieCompletandoConIA}
                    className="text-xs font-semibold px-4 py-2 rounded-lg text-white transition hover:opacity-90 disabled:opacity-50"
                    style={{ backgroundColor: '#7C3AED' }}
                  >
                    {siagieCompletandoConIA ? 'Completando...' : '🤖 Completar con IA'}
                  </button>
                  {!siagieDatos && (
                    <p className="text-[11px] text-slate-400 mt-2">
                      Nota: primero calcula los niveles de logro arriba (misma Aula y Bimestre) para poder completar esta plantilla.
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {tab === 'lista-docentes' && (
          <Suspense fallback={<p className="text-slate-400 text-sm">Cargando...</p>}>
            <DocentesList institucionFija={institucion.id} />
          </Suspense>
        )}

        {tab === 'lista-estudiantes' && (
          <Suspense fallback={<p className="text-slate-400 text-sm">Cargando...</p>}>
            <EstudiantesList institucionFija={institucion.id} institucionFijaNombre={institucion.nombre} />
          </Suspense>
        )}

        {tab === 'mi-institucion' && (
          <Suspense fallback={<p className="text-slate-400 text-sm">Cargando...</p>}>
            <MiInstitucion institucion={institucion} onActualizada={cargar} />
          </Suspense>
        )}

        {tab === 'docentes' && (
          areasLista.length === 0 ? (
            <p className="text-slate-400 text-sm">Aún no hay Asignaturas creadas en esta institución.</p>
          ) : (
            <div className="space-y-3">
              {areasLista.map(function (grupoArea) {
                const totalCursos = grupoArea.docentesLista.reduce(function (a, d) { return a + d.cursos.length }, 0)
                const abierta = areaAbierta === grupoArea.area
                return (
                  <div key={grupoArea.area} className="bg-white rounded-2xl overflow-hidden" style={{ border: '1px solid #E5E9F0' }}>
                    <button
                      onClick={function () { setAreaAbierta(abierta ? null : grupoArea.area) }}
                      className="w-full flex items-center justify-between px-5 py-4 text-left"
                    >
                      <span className="text-sm font-bold" style={{ color: NAVY_DARK }}>{grupoArea.area}</span>
                      <span className="text-xs font-semibold px-2.5 py-1 rounded-full flex items-center gap-2" style={{ backgroundColor: '#E7F3E4', color: GREEN_DARK }}>
                        {totalCursos} asignatura(s) {abierta ? '▾' : '▸'}
                      </span>
                    </button>

                    {abierta && (
                      <div className="px-5 pb-5 space-y-4">
                        {(function () {
                          const gradosDeEstaArea = [...new Set(
                            grupoArea.docentesLista.flatMap(function (d) { return d.cursos.map(function (c) { return c.grado } ) })
                              .concat(grupoArea.sinDocente.map(function (c) { return c.grado }))
                          )].sort(function (a, b) { return a - b })
                          if (gradosDeEstaArea.length <= 1) return null
                          return (
                            <div className="flex gap-1.5 flex-wrap">
                              <button
                                onClick={function () { setGradoFiltroArea(null) }}
                                className="text-[11px] font-semibold px-2.5 py-1 rounded-full transition"
                                style={gradoFiltroArea == null ? { backgroundColor: NAVY_DARK, color: 'white' } : { backgroundColor: 'white', color: NAVY_DARK, border: '1px solid #D6DCE5' }}
                              >
                                Todos los grados
                              </button>
                              {gradosDeEstaArea.map(function (g) {
                                return (
                                  <button
                                    key={g}
                                    onClick={function () { setGradoFiltroArea(g) }}
                                    className="text-[11px] font-semibold px-2.5 py-1 rounded-full transition"
                                    style={gradoFiltroArea === g ? { backgroundColor: GREEN, color: 'white' } : { backgroundColor: 'white', color: NAVY_DARK, border: '1px solid #D6DCE5' }}
                                  >
                                    {gradoLabel(g)}
                                  </button>
                                )
                              })}
                            </div>
                          )
                        })()}

                        {grupoArea.docentesLista.map(function (grupoDoc) {
                          const cursosFiltrados = gradoFiltroArea == null ? grupoDoc.cursos : grupoDoc.cursos.filter(function (c) { return c.grado === gradoFiltroArea })
                          if (cursosFiltrados.length === 0) return null
                          const docenteEstaAbierto = docenteAbierto === grupoDoc.docente.id
                          return (
                            <div key={grupoDoc.docente.id} className="rounded-xl overflow-hidden" style={{ border: '1px solid #E5E9F0' }}>
                              <button
                                onClick={function () { setDocenteAbierto(docenteEstaAbierto ? null : grupoDoc.docente.id) }}
                                className="w-full flex items-center justify-between px-3 py-2.5 text-left"
                                style={{ backgroundColor: '#F4F6F9' }}
                              >
                                <span className="text-xs font-bold" style={{ color: NAVY }}>{grupoDoc.docente.full_name}</span>
                                <span className="text-[11px] text-slate-400">{cursosFiltrados.length} asignatura(s) {docenteEstaAbierto ? '▾' : '▸'}</span>
                              </button>
                              {docenteEstaAbierto && (
                                <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3 p-3">
                                  {cursosFiltrados.map(function (c) {
                                    return (
                                      <button
                                        key={c.id}
                                        onClick={function () { setCursoSel(c) }}
                                        className="text-left rounded-lg p-2.5 transition hover:-translate-y-0.5 bg-white"
                                        style={{ border: '1px solid #E5E9F0' }}
                                      >
                                        <p className="text-sm font-semibold" style={{ color: NAVY_DARK }}>{c.nombre}</p>
                                        <p className="text-xs text-slate-400">{gradoLabel(c.grado)} — Sección {c.grupo}</p>
                                        <p className="text-xs mt-1" style={{ color: GREEN_DARK }}>{c.enrollments?.[0]?.count ?? 0} estudiante(s)</p>
                                      </button>
                                    )
                                  })}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
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

        {tab === 'importar' && <ImportarEstudiantes institucionFija={institucion.id} />}

        {tab === 'aulas' && (
          <Suspense fallback={<p className="text-slate-400 text-sm">Cargando...</p>}>
            <CoursesManager institucionFija={institucion.id} institucionFijaNombre={institucion.nombre} />
          </Suspense>
        )}

        {tab === 'importar-docentes' && (
          <Suspense fallback={<p className="text-slate-400 text-sm">Cargando...</p>}>
            <ImportarDocentes institucionFija={institucion.id} />
          </Suspense>
        )}

        {tab === 'habilitar-cursos' && (
          <Suspense fallback={<p className="text-slate-400 text-sm">Cargando...</p>}>
            <HabilitarCursos institucionFija={institucion.id} />
          </Suspense>
        )}

        {tab === 'asignaturas' && (
          <Suspense fallback={<p className="text-slate-400 text-sm">Cargando...</p>}>
            <AsignaturasManager institucionFija={institucion.id} />
          </Suspense>
        )}

        {tab === 'recreos' && (
          <Suspense fallback={<p className="text-slate-400 text-sm">Cargando...</p>}>
            <RecreosManager institucionFija={institucion.id} />
          </Suspense>
        )}

        {tab === 'feriados' && (
          <Suspense fallback={<p className="text-slate-400 text-sm">Cargando...</p>}>
            <FeriadosManager institucionFija={institucion.id} />
          </Suspense>
        )}

        {tab === 'matriculas' && (
          <Suspense fallback={<p className="text-slate-400 text-sm">Cargando...</p>}>
            <EnrollmentsManager />
          </Suspense>
        )}

        {tab === 'asistencia' && (
          asisSeccionSel ? (
            <div>
              <button onClick={function () { setAsisSeccionSel(null); setAsisDatos([]); setAsisFechas([]) }} className="text-sm font-semibold mb-4 hover:underline" style={{ color: NAVY }}>← Volver a Secciones</button>
              <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
                <h3 className="text-lg font-bold" style={{ color: NAVY_DARK }}>{gradoLabel(asisGradoSel)} — Sección {asisSeccionSel}</h3>
                {asisDatos.length > 0 && (
                  <button
                    onClick={exportarAsistenciaExcel}
                    className="text-xs font-semibold px-4 py-2 rounded-lg text-white transition hover:opacity-90"
                    style={{ backgroundColor: '#16A34A' }}
                  >
                    📊 Exportar Excel (horizontal)
                  </button>
                )}
              </div>
              {asisAreasDisponibles.length > 1 && (
                <div className="flex gap-1.5 flex-wrap mb-4">
                  <button
                    onClick={function () { cambiarAreaFiltro(null) }}
                    className="text-xs font-semibold px-3 py-1.5 rounded-full transition"
                    style={asisAreaFiltro == null ? { backgroundColor: NAVY_DARK, color: 'white' } : { backgroundColor: 'white', color: NAVY_DARK, border: '1px solid #D6DCE5' }}
                  >
                    Todas las Áreas
                  </button>
                  {asisAreasDisponibles.map(function (a) {
                    return (
                      <button
                        key={a.id}
                        onClick={function () { cambiarAreaFiltro(a.id) }}
                        className="text-xs font-semibold px-3 py-1.5 rounded-full transition"
                        style={asisAreaFiltro === a.id ? { backgroundColor: GREEN, color: 'white' } : { backgroundColor: 'white', color: NAVY_DARK, border: '1px solid #D6DCE5' }}
                      >
                        {a.nombre}
                      </button>
                    )
                  })}
                </div>
              )}
              {asisLoading ? (
                <p className="text-slate-400 text-sm">Cargando...</p>
              ) : asisDatos.length === 0 ? (
                <p className="text-slate-400 text-sm">No hay estudiantes en esta aula.</p>
              ) : (
                <div className="bg-white rounded-2xl overflow-auto" style={{ border: '1px solid #E5E9F0', maxHeight: '70vh' }}>
                  <table className="text-sm border-collapse" style={{ minWidth: '100%' }}>
                    <thead className="sticky top-0 z-10">
                      <tr>
                        <td className="py-2 px-4 font-semibold sticky left-0" style={{ backgroundColor: '#F4F6F9', color: NAVY_DARK, border: '1px solid #E5E9F0', minWidth: 180 }}>Estudiante</td>
                        {asisFechas.map(function (f) {
                          return (
                            <td key={f} className="p-1 text-center" style={{ backgroundColor: '#F4F6F9', border: '1px solid #E5E9F0', fontSize: 10, minWidth: 26 }}>
                              <span style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', whiteSpace: 'nowrap' }}>
                                {new Date(f + 'T00:00:00').toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit' })}
                              </span>
                            </td>
                          )
                        })}
                        <td className="p-2 text-center font-semibold" style={{ backgroundColor: '#FDECEC', color: '#B91C1C', border: '1px solid #E5E9F0', minWidth: 60 }}>Sin justif.</td>
                        <td className="p-2 text-center font-semibold" style={{ backgroundColor: '#FFF7E6', color: '#B45309', border: '1px solid #E5E9F0', minWidth: 60 }}>Justif.</td>
                        <td className="p-2 text-center font-semibold" style={{ backgroundColor: '#DEEBF7', color: NAVY_DARK, border: '1px solid #E5E9F0', minWidth: 50 }}>Total</td>
                      </tr>
                    </thead>
                    <tbody>
                      {asisDatos.map(function (e, i) {
                        return (
                          <tr key={i}>
                            <td className="py-2 px-4 sticky left-0" style={{ backgroundColor: 'white', color: NAVY_DARK, border: '1px solid #E5E9F0' }}>{e.nombre}</td>
                            {asisFechas.map(function (f) {
                              const estado = e.fechas[f]
                              return (
                                <td key={f} className="p-1 text-center font-bold" style={{ border: '1px solid #E5E9F0', fontSize: 11, color: estado === 'justificado' ? '#B45309' : estado === 'ausente' ? '#B91C1C' : '#16A34A' }}>
                                  {estado === 'justificado' ? 'J' : estado === 'ausente' ? 'F' : 'P'}
                                </td>
                              )
                            })}
                            <td className="p-2 text-center font-bold" style={{ backgroundColor: '#FDECEC', color: '#B91C1C', border: '1px solid #E5E9F0' }}>{e.ausentes}</td>
                            <td className="p-2 text-center font-bold" style={{ backgroundColor: '#FFF7E6', color: '#B45309', border: '1px solid #E5E9F0' }}>{e.justificadas}</td>
                            <td className="p-2 text-center font-bold" style={{ backgroundColor: '#DEEBF7', color: NAVY_DARK, border: '1px solid #E5E9F0' }}>{e.total}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : asisGradoSel ? (
            <div>
              <button onClick={function () { setAsisGradoSel(null) }} className="text-sm font-semibold mb-4 hover:underline" style={{ color: NAVY }}>← Volver a Grados</button>
              <p className="text-sm text-slate-400 mb-4">Elige la Sección de {gradoLabel(asisGradoSel)}</p>
              <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
                {seccionesProp.map(function (s) {
                  return (
                    <button
                      key={s.letra}
                      onClick={function () { setAsisSeccionSel(s.letra); cargarAsistenciaDeAula(asisGradoSel, s.letra) }}
                      className="text-left bg-white rounded-2xl p-5 space-y-1 transition hover:-translate-y-0.5"
                      style={{ border: '1px solid #E5E9F0', boxShadow: '0 1px 3px rgba(15,42,74,0.06)' }}
                    >
                      <h3 className="text-lg font-bold" style={{ color: NAVY_DARK }}>Sección {s.letra}</h3>
                    </button>
                  )
                })}
              </div>
            </div>
          ) : (
            <div>
              <p className="text-sm text-slate-400 mb-4">Elige el Grado para ver el reporte de asistencia</p>
              <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
                {gradosProp.map(function (g) {
                  return (
                    <button
                      key={g.numero}
                      onClick={function () { setAsisGradoSel(g.numero) }}
                      className="text-left bg-white rounded-2xl p-5 space-y-1 transition hover:-translate-y-0.5"
                      style={{ border: '1px solid #E5E9F0', boxShadow: '0 1px 3px rgba(15,42,74,0.06)' }}
                    >
                      <h3 className="text-lg font-bold" style={{ color: NAVY_DARK }}>{g.nombre}</h3>
                    </button>
                  )
                })}
              </div>
            </div>
          )
        )}

        {tab === 'grados-secciones' && (
          <div>
            <div className="bg-white rounded-2xl p-4 mb-5" style={{ border: '1px solid #E5E9F0' }}>
              <p className="text-sm font-bold mb-1" style={{ color: NAVY_DARK }}>Completar Asignaturas en aulas ya existentes</p>
              <p className="text-xs text-slate-400 mb-3">Si tenías Grados/Secciones de antes, esto revisa todas las combinaciones y agrega las Asignaturas del catálogo compartido que les falten — sin duplicar nada.</p>
              <button
                onClick={sincronizarAsignaturas}
                disabled={sincronizando}
                className="text-sm font-semibold px-4 py-2 rounded-lg text-white transition hover:opacity-90 disabled:opacity-50"
                style={{ backgroundColor: GREEN }}
              >
                {sincronizando ? 'Sincronizando...' : 'Sincronizar ahora'}
              </button>
              {sincronizarMsg && <p className="text-xs mt-2" style={{ color: '#16A34A' }}>{sincronizarMsg}</p>}
            </div>

            <div className="grid sm:grid-cols-2 gap-5">
            <div className="bg-white rounded-2xl p-5" style={{ border: '1px solid #E5E9F0' }}>
              <p className="text-sm font-bold mb-3" style={{ color: NAVY_DARK }}>Grados de {institucion.nombre}</p>
              {gradosProp.length === 0 ? (
                <p className="text-xs text-slate-400 mb-3">Sin grados todavía.</p>
              ) : (
                <ul className="space-y-1 mb-3">
                  {gradosProp.map(function (g) {
                    return (
                      <li key={g.id} className="flex justify-between items-center text-xs rounded-lg px-2 py-1.5" style={{ backgroundColor: '#F4F6F9' }}>
                        <span style={{ color: NAVY_DARK }}>{g.nombre} (nº {g.numero})</span>
                        <button onClick={function () { eliminarGrado(g.id) }} className="text-[10px] font-semibold px-2 py-0.5 rounded text-white" style={{ backgroundColor: '#B91C1C' }}>Quitar</button>
                      </li>
                    )
                  })}
                </ul>
              )}
              <div className="flex gap-2">
                <input type="number" value={nuevoGradoNumero} onChange={function (e) { setNuevoGradoNumero(e.target.value) }} placeholder="Nº (ej: 6)" className="w-20 rounded-lg px-2 py-1.5 text-xs outline-none" style={{ backgroundColor: 'white', border: '1px solid #D6DCE5', color: NAVY_DARK }} />
                <input type="text" value={nuevoGradoNombre} onChange={function (e) { setNuevoGradoNombre(e.target.value) }} placeholder="Nombre (ej: 6°)" className="flex-1 rounded-lg px-2 py-1.5 text-xs outline-none" style={{ backgroundColor: 'white', border: '1px solid #D6DCE5', color: NAVY_DARK }} />
                <button onClick={agregarGrado} className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white transition hover:opacity-90" style={{ backgroundColor: GREEN }}>+ Agregar</button>
              </div>
            </div>

            <div className="bg-white rounded-2xl p-5" style={{ border: '1px solid #E5E9F0' }}>
              <p className="text-sm font-bold mb-3" style={{ color: NAVY_DARK }}>Secciones de {institucion.nombre}</p>
              {seccionesProp.length === 0 ? (
                <p className="text-xs text-slate-400 mb-3">Sin secciones todavía.</p>
              ) : (
                <ul className="space-y-1 mb-3">
                  {seccionesProp.map(function (s) {
                    return (
                      <li key={s.id} className="flex justify-between items-center text-xs rounded-lg px-2 py-1.5" style={{ backgroundColor: '#F4F6F9' }}>
                        <span style={{ color: NAVY_DARK }}>Sección {s.letra}</span>
                        <button onClick={function () { eliminarSeccion(s.id) }} className="text-[10px] font-semibold px-2 py-0.5 rounded text-white" style={{ backgroundColor: '#B91C1C' }}>Quitar</button>
                      </li>
                    )
                  })}
                </ul>
              )}
              <div className="flex gap-2">
                <input type="text" maxLength={1} value={nuevaSeccionLetra} onChange={function (e) { setNuevaSeccionLetra(e.target.value) }} placeholder="Letra (ej: F)" className="flex-1 rounded-lg px-2 py-1.5 text-xs outline-none" style={{ backgroundColor: 'white', border: '1px solid #D6DCE5', color: NAVY_DARK }} />
                <button onClick={agregarSeccion} className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white transition hover:opacity-90" style={{ backgroundColor: GREEN }}>+ Agregar</button>
              </div>
            </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
