import { useState } from 'react'
import { supabase } from './supabaseClient'

const NAVY_DARK = '#0F172A'
const NAVY = '#2563EB'

const FRASE_CONFIRMACION = 'BORRAR TODO'
const BUCKETS = ['materials', 'conductas', 'examenes', 'mensajes']

async function vaciarBucketCompleto(bucket) {
  async function listarRecursivo(path) {
    const result = await supabase.storage.from(bucket).list(path, { limit: 1000 })
    if (result.error || !result.data) return []
    let archivos = []
    for (const item of result.data) {
      const fullPath = path ? `${path}/${item.name}` : item.name
      if (item.id == null) {
        // Es una carpeta (no tiene id de archivo) -> entrar recursivamente
        const dentro = await listarRecursivo(fullPath)
        archivos = archivos.concat(dentro)
      } else {
        archivos.push(fullPath)
      }
    }
    return archivos
  }

  const todosLosArchivos = await listarRecursivo('')
  if (todosLosArchivos.length === 0) return 0

  // Borrar en lotes de 100
  for (let i = 0; i < todosLosArchivos.length; i += 100) {
    const lote = todosLosArchivos.slice(i, i + 100)
    await supabase.storage.from(bucket).remove(lote)
  }
  return todosLosArchivos.length
}

export default function VaciarPeriodo() {
  const [textoConfirmacion, setTextoConfirmacion] = useState('')
  const [procesando, setProcesando] = useState(false)
  const [progreso, setProgreso] = useState('')
  const [resultado, setResultado] = useState(null)
  const [error, setError] = useState('')

  const habilitado = textoConfirmacion.trim() === FRASE_CONFIRMACION

  async function handleVaciar() {
    if (!habilitado) return
    const confirmar1 = confirm('Esto va a BORRAR de forma permanente todas las Unidades, tareas, notas, exámenes, conducta, comunicados, mensajes y materiales. Las cuentas, cursos y matrículas NO se tocan. ¿Estás completamente seguro?')
    if (!confirmar1) return
    const confirmar2 = confirm('Última confirmación: esta acción NO se puede deshacer. ¿Continuar?')
    if (!confirmar2) return

    setProcesando(true)
    setError('')
    setResultado(null)

    try {
      let totalArchivos = 0
      for (const bucket of BUCKETS) {
        setProgreso(`Borrando archivos de "${bucket}"...`)
        const cantidad = await vaciarBucketCompleto(bucket)
        totalArchivos += cantidad
      }

      setProgreso('Borrando los datos del periodo en la base de datos...')
      const rpcResult = await supabase.rpc('vaciar_periodo_academico')
      if (rpcResult.error) throw new Error(rpcResult.error.message)

      setResultado({ archivos: totalArchivos })
      setTextoConfirmacion('')
    } catch (err) {
      setError(err.message)
    } finally {
      setProcesando(false)
      setProgreso('')
    }
  }

  return (
    <div>
      <h2 className="text-2xl font-bold mb-2" style={{ color: NAVY_DARK }}>Vaciar Periodo Académico</h2>
      <p className="text-sm text-slate-400 mb-6">
        Borra todos los datos del periodo actual (Unidades, tareas, notas, exámenes, conducta, comunicados, mensajes, videoclases y materiales) para empezar un nuevo Bimestre desde cero, sin acumular datos en el plan gratuito. Las cuentas de estudiantes y docentes, los cursos y las matrículas <strong>no se tocan</strong>.
      </p>

      <div className="bg-white rounded-2xl p-5" style={{ border: '2px solid #FDECEC' }}>
        <p className="text-sm font-bold mb-3" style={{ color: '#B91C1C' }}>⚠️ Esta acción es irreversible</p>

        <div className="grid sm:grid-cols-2 gap-4 mb-4">
          <div className="rounded-xl p-3" style={{ backgroundColor: '#E7F3E4' }}>
            <p className="text-xs font-bold mb-1" style={{ color: '#16A34A' }}>Se mantiene</p>
            <ul className="text-xs space-y-0.5" style={{ color: '#16A34A' }}>
              <li>• Cuentas (estudiantes, docentes, admin)</li>
              <li>• Cursos y horarios</li>
              <li>• Matrículas</li>
              <li>• Áreas, Asignaturas, Competencias, Capacidades</li>
            </ul>
          </div>
          <div className="rounded-xl p-3" style={{ backgroundColor: '#FDECEC' }}>
            <p className="text-xs font-bold mb-1" style={{ color: '#B91C1C' }}>Se borra por completo</p>
            <ul className="text-xs space-y-0.5" style={{ color: '#B91C1C' }}>
              <li>• Unidades, actividades, tareas y entregas</li>
              <li>• Notas de cierre y exámenes virtuales</li>
              <li>• Registro de Conducta</li>
              <li>• Comunicados, mensajes, notificaciones</li>
              <li>• Videoclases y materiales (incluye archivos)</li>
            </ul>
          </div>
        </div>

        <label className="block text-xs font-medium mb-1" style={{ color: NAVY_DARK }}>
          Para confirmar, escribe exactamente: <span className="font-mono font-bold">{FRASE_CONFIRMACION}</span>
        </label>
        <input
          type="text"
          value={textoConfirmacion}
          onChange={function (e) { setTextoConfirmacion(e.target.value) }}
          disabled={procesando}
          className="w-full rounded-lg px-3 py-2 text-sm outline-none mb-3"
          style={{ backgroundColor: 'white', border: '1px solid #D6DCE5', color: NAVY_DARK }}
        />

        <button
          onClick={handleVaciar}
          disabled={!habilitado || procesando}
          className="text-sm font-semibold px-6 py-2.5 rounded-xl text-white transition hover:opacity-90 disabled:opacity-40"
          style={{ backgroundColor: '#B91C1C' }}
        >
          {procesando ? (progreso || 'Procesando...') : '🗑️ Vaciar Periodo Académico'}
        </button>

        {error && <p className="text-red-500 text-sm mt-3">Error: {error}</p>}

        {resultado && (
          <div className="mt-4 rounded-lg p-3" style={{ backgroundColor: '#E7F3E4' }}>
            <p className="text-sm font-semibold" style={{ color: '#16A34A' }}>
              ✓ Periodo vaciado correctamente. Se borraron {resultado.archivos} archivo(s) guardados, además de todos los datos académicos del periodo.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
