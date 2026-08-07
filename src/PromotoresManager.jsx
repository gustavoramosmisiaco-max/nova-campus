import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'

const NAVY_DARK = '#0F172A'
const NAVY = '#2563EB'
const GREEN = '#22C55E'

const inputStyle = { backgroundColor: 'white', border: '1px solid #D6DCE5', color: NAVY_DARK }

export default function PromotoresManager() {
  const [loading, setLoading] = useState(true)
  const [promotores, setPromotores] = useState([])
  const [editandoId, setEditandoId] = useState(null)
  const [nombreEdit, setNombreEdit] = useState('')
  const [guardando, setGuardando] = useState(false)

  const [showGuia, setShowGuia] = useState(false)
  const [nombreNuevo, setNombreNuevo] = useState('')
  const [idNuevo, setIdNuevo] = useState('')

  useEffect(function () {
    cargar()
  }, [])

  async function cargar() {
    setLoading(true)
    const result = await supabase.from('profiles').select('id, full_name, email').eq('role', 'promotor').order('full_name')
    if (!result.error) setPromotores(result.data)
    setLoading(false)
  }

  function abrirEditar(p) {
    setEditandoId(p.id)
    setNombreEdit(p.full_name)
  }

  async function guardarEdicion(id) {
    if (!nombreEdit.trim()) return
    setGuardando(true)
    await supabase.from('profiles').update({ full_name: nombreEdit.trim() }).eq('id', id)
    setEditandoId(null)
    setGuardando(false)
    cargar()
  }

  const sqlGenerado = `update profiles\nset full_name = '${(nombreNuevo || 'Nombre del Promotor').replace(/'/g, "''")}', role = 'promotor'\nwhere id = '${idNuevo || 'PEGA-AQUI-EL-ID'}';`

  function copiarSql() {
    navigator.clipboard.writeText(sqlGenerado)
  }

  if (loading) return <p className="text-slate-400 text-sm">Cargando...</p>

  return (
    <div>
      <div className="flex justify-between items-center flex-wrap gap-3 mb-2">
        <h2 className="text-2xl font-bold" style={{ color: NAVY_DARK }}>Promotores</h2>
        <button
          onClick={function () { setShowGuia(!showGuia) }}
          className="text-xs font-semibold px-4 py-2 rounded-lg text-white transition hover:opacity-90"
          style={{ background: `linear-gradient(90deg, ${NAVY}, ${GREEN})`, boxShadow: '0 8px 20px rgba(37,99,235,0.3)' }}
        >
          {showGuia ? 'Cerrar guía' : '+ Nuevo Promotor'}
        </button>
      </div>
      <p className="text-sm text-slate-400 mb-6">Cuentas con acceso limitado para validar pagos de Cursos de Verano.</p>

      {showGuia && (
        <div className="bg-white rounded-2xl p-5 mb-6" style={{ border: '1px solid #E5E9F0' }}>
          <p className="text-sm font-bold mb-3" style={{ color: NAVY_DARK }}>Crear un nuevo Promotor — 3 pasos</p>

          <div className="space-y-4">
            <div>
              <p className="text-xs font-semibold mb-1" style={{ color: NAVY }}>Paso 1 — Nombre de la persona</p>
              <input type="text" value={nombreNuevo} onChange={function (e) { setNombreNuevo(e.target.value) }} placeholder="Nombre completo del Promotor" className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={inputStyle} />
            </div>

            <div>
              <p className="text-xs font-semibold mb-1" style={{ color: NAVY }}>Paso 2 — Crea su cuenta en Supabase</p>
              <p className="text-xs text-slate-500">
                Ve a Supabase → <strong>Authentication → Users → Add user</strong>, pon su correo y una contraseña temporal, marca "Auto Confirm User" si aparece, y dale <strong>Create user</strong>. Luego haz clic sobre esa fila y copia el ID que aparece (algo como <code>f47ac10b-58cc-...</code>).
              </p>
            </div>

            <div>
              <p className="text-xs font-semibold mb-1" style={{ color: NAVY }}>Paso 3 — Pega ese ID aquí, y copia el SQL final</p>
              <input type="text" value={idNuevo} onChange={function (e) { setIdNuevo(e.target.value) }} placeholder="Pega aquí el ID copiado de Supabase" className="w-full rounded-lg px-3 py-2 text-sm outline-none mb-2" style={inputStyle} />
              <pre className="text-xs rounded-lg p-3 overflow-x-auto" style={{ backgroundColor: '#0F172A', color: '#E2E8F0' }}>{sqlGenerado}</pre>
              <div className="flex gap-2 mt-2">
                <button onClick={copiarSql} className="text-xs font-semibold px-4 py-2 rounded-lg text-white transition hover:opacity-90" style={{ backgroundColor: NAVY }}>
                  📋 Copiar SQL
                </button>
                <button onClick={cargar} className="text-xs font-semibold px-4 py-2 rounded-lg transition" style={{ backgroundColor: '#F4F6F9', color: NAVY_DARK, border: '1px solid #D6DCE5' }}>
                  Ya lo corrí, actualizar lista
                </button>
              </div>
              <p className="text-xs text-slate-400 mt-2">Pega ese SQL en el SQL Editor de Supabase y ejecútalo. Después, el Promotor va a aparecer aquí abajo.</p>
            </div>
          </div>
        </div>
      )}

      {promotores.length === 0 ? (
        <p className="text-slate-400 text-sm">Aún no tienes ningún Promotor registrado.</p>
      ) : (
        <ul className="space-y-2">
          {promotores.map(function (p) {
            return (
              <li key={p.id} className="bg-white rounded-xl p-4 flex justify-between items-center gap-3 flex-wrap" style={{ border: '1px solid #E5E9F0' }}>
                {editandoId === p.id ? (
                  <div className="flex gap-2 items-center flex-1">
                    <input type="text" value={nombreEdit} onChange={function (e) { setNombreEdit(e.target.value) }} className="flex-1 rounded-lg px-3 py-2 text-sm outline-none" style={inputStyle} />
                    <button onClick={function () { guardarEdicion(p.id) }} disabled={guardando} className="text-xs font-semibold px-3 py-2 rounded-lg text-white transition hover:opacity-90 disabled:opacity-50" style={{ backgroundColor: GREEN }}>
                      Guardar
                    </button>
                    <button onClick={function () { setEditandoId(null) }} className="text-xs font-semibold px-3 py-2 rounded-lg transition" style={{ backgroundColor: '#F4F6F9', color: NAVY_DARK, border: '1px solid #D6DCE5' }}>
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <>
                    <div>
                      <p className="text-sm font-semibold" style={{ color: NAVY_DARK }}>{p.full_name}</p>
                      <p className="text-xs text-slate-400">{p.email}</p>
                    </div>
                    <button onClick={function () { abrirEditar(p) }} className="text-xs font-semibold px-3 py-1.5 rounded-lg transition" style={{ backgroundColor: '#F4F6F9', color: NAVY_DARK, border: '1px solid #D6DCE5' }}>
                      Editar nombre
                    </button>
                  </>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
