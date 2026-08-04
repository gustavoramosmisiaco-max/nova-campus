import { Component } from 'react'

const NAVY_DARK = '#0F2A4A'
const GREEN = '#5DAA47'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { huboError: false }
  }

  static getDerivedStateFromError() {
    return { huboError: true }
  }

  componentDidCatch(error) {
    console.error('Error capturado por ErrorBoundary:', error)
  }

  handleRecargar() {
    this.setState({ huboError: false })
    window.location.reload()
  }

  render() {
    if (this.state.huboError) {
      return (
        <div className="flex flex-col items-center justify-center text-center p-10">
          <p className="text-4xl mb-3">⚠️</p>
          <p className="text-base font-bold mb-1" style={{ color: NAVY_DARK }}>No se pudo cargar esta sección</p>
          <p className="text-sm text-slate-400 mb-5">
            Puede que tu conexión a internet haya fallado un momento. Recarga la página para intentar de nuevo.
          </p>
          <button
            onClick={function () { window.location.reload() }}
            className="text-sm font-semibold px-5 py-2.5 rounded-xl text-white transition hover:opacity-90"
            style={{ backgroundColor: GREEN }}
          >
            Recargar página
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
