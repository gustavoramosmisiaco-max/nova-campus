import { useEffect, useState, useRef } from 'react'

const RED = '#B91C1C'
const GREEN = '#5DAA47'

let activeRequests = 0
let listeners = []

function notify() {
  listeners.forEach(function (fn) { fn(activeRequests) })
}

// Se activa una sola vez, sin importar cuántas veces se monte el componente
let intercepted = false
function interceptFetch() {
  if (intercepted) return
  intercepted = true
  const originalFetch = window.fetch
  window.fetch = function (...args) {
    activeRequests++
    notify()
    return originalFetch.apply(this, args).finally(function () {
      activeRequests = Math.max(0, activeRequests - 1)
      notify()
    })
  }
}

export default function LoadingBar() {
  const [estado, setEstado] = useState('idle') // idle | loading | done
  const timeoutRef = useRef(null)

  useEffect(function () {
    interceptFetch()

    function handleChange(count) {
      if (count > 0) {
        if (timeoutRef.current) clearTimeout(timeoutRef.current)
        setEstado('loading')
      } else {
        setEstado('done')
        timeoutRef.current = setTimeout(function () { setEstado('idle') }, 600)
      }
    }

    listeners.push(handleChange)
    return function () {
      listeners = listeners.filter(function (l) { return l !== handleChange })
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [])

  if (estado === 'idle') return null

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height: 3,
        zIndex: 9999,
        backgroundColor: estado === 'loading' ? RED : GREEN,
        transition: 'background-color 0.2s ease',
      }}
    >
      {estado === 'loading' && (
        <div
          style={{
            height: '100%',
            width: '40%',
            backgroundColor: '#FCA5A5',
            animation: 'nova-loading-bar-slide 1s ease-in-out infinite',
          }}
        />
      )}
      <style>{`
        @keyframes nova-loading-bar-slide {
          0% { margin-left: -40%; }
          100% { margin-left: 100%; }
        }
      `}</style>
    </div>
  )
}
