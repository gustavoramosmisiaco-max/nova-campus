import { supabase } from './supabaseClient'

// ============================================================
// Ayudante único para hablar con la IA desde cualquier pantalla.
//
// Uso:
//   import { llamarIA } from './aiClient'
//
//   const resultado = await llamarIA('conclusion_descriptiva', {
//     estudianteId: '...',
//     competenciaId: '...',
//     nivelLogro: 'A',
//   })
//
//   if (resultado.error) {
//     alert(resultado.error)
//   } else {
//     console.log(resultado.data)
//   }
//
// Los "tipo" válidos están documentados en PLAN_INTEGRACION_IA.md y en la
// Edge Function ai-assistant (constante ROLES_PERMITIDOS).
// ============================================================

async function extraerMensajeError(fnError) {
  if (!fnError) return 'Error desconocido'
  try {
    if (fnError.context && typeof fnError.context.json === 'function') {
      const body = await fnError.context.json()
      if (body?.error) return body.error
    }
  } catch (_e) { /* si no se puede leer el detalle, usamos el mensaje genérico */ }
  return fnError.message || 'Error desconocido'
}

export async function llamarIA(tipo, payload) {
  const { data, error: fnError } = await supabase.functions.invoke('ai-assistant', {
    body: { tipo: tipo, payload: payload || {} },
  })

  if (fnError) {
    const mensaje = await extraerMensajeError(fnError)
    return { error: mensaje, data: null }
  }
  if (data?.error) {
    return { error: data.error, data: null }
  }
  return { error: null, data: data }
}

// Mensajes en español, listos para mostrar mientras se espera la respuesta —
// cada pantalla puede usar el que le corresponda según qué función esté llamando.
export const MENSAJES_ESPERA_IA = {
  importar_word_unidad: 'Leyendo el documento y armando la Unidad...',
  conclusion_descriptiva: 'Redactando la conclusión descriptiva...',
  reporte_padres: 'Preparando el resumen para la familia...',
  recordatorio_estudiante: 'Revisando tus pendientes...',
  reporte_desempeno_docente: 'Analizando el desempeño del docente...',
  importar_registro_auxiliar_area: 'Juntando los registros del Área...',
  completar_plantilla_siagie: 'Completando la plantilla del SIAGIE...',
  asesoria_financiera: 'Calculando la propuesta...',
}
