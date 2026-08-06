import { createContext, useContext, useState } from 'react'

const DocenteContextoActivo = createContext(null)

export function DocenteContextoActivoProvider({ children }) {
  const [institucionSel, setInstitucionSel] = useState('')
  const [aulaSel, setAulaSel] = useState('')
  const [areaId, setAreaId] = useState('')
  const [areaNombre, setAreaNombre] = useState('')

  function elegirInstitucion(id) {
    setInstitucionSel(id)
    setAulaSel('')
    setAreaId('')
    setAreaNombre('')
  }

  function elegirAula(aula) {
    setAulaSel(aula)
    setAreaId('')
    setAreaNombre('')
  }

  function elegirArea(id, nombre) {
    setAreaId(id)
    setAreaNombre(nombre)
  }

  function limpiarTodo() {
    setInstitucionSel('')
    setAulaSel('')
    setAreaId('')
    setAreaNombre('')
  }

  const value = {
    institucionSel,
    aulaSel,
    areaId,
    areaNombre,
    elegirInstitucion,
    elegirAula,
    elegirArea,
    limpiarTodo,
  }

  return <DocenteContextoActivo.Provider value={value}>{children}</DocenteContextoActivo.Provider>
}

export function useDocenteContextoActivo() {
  return useContext(DocenteContextoActivo)
}
