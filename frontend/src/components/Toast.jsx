import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { IconAlert, IconCheck, IconInfo, IconX } from './Icons'
import { useIsMobile } from './useMediaQuery'
import { useSheetDrag } from './useSheetDrag'

const ToastContext = createContext(null)

const DURATION = 4500
const LEAVE_MS = 220

export function useToast() {
  return useContext(ToastContext)
}

const ICONS = {
  success: <IconCheck size={17} />,
  error: <IconAlert size={17} />,
  info: <IconInfo size={17} />,
}

/**
 * Um toast. O temporizador vive aqui (e não no provider) para poder ser pausado
 * enquanto o dedo está pousado — a leitura não devia competir com a contagem.
 */
function Toast({ toast, onDismiss }) {
  const isMobile = useIsMobile()
  const [paused, setPaused] = useState(false)
  const remaining = useRef(DURATION)
  // preenchido no efeito: Date.now() durante o render é uma chamada impura
  const startedAt = useRef(0)

  useEffect(() => {
    if (paused || toast.leaving) return
    startedAt.current = Date.now()
    const id = setTimeout(() => onDismiss(toast.id), remaining.current)
    return () => {
      clearTimeout(id)
      remaining.current -= Date.now() - startedAt.current
    }
  }, [paused, toast.leaving, toast.id, onDismiss])

  // em mobile o toast está em baixo e ao largo: fecha-se deslizando para baixo
  const drag = useSheetDrag(() => onDismiss(toast.id), {
    axis: isMobile ? 'y' : 'x',
    enabled: !toast.leaving,
  })

  const pause = () => setPaused(true)
  const resume = () => setPaused(false)

  return (
    <div className={`toast toast-${toast.type} ${toast.leaving ? 'toast-leave' : ''}`}
         style={drag.style}
         {...drag.handlers}
         onPointerEnter={pause} onPointerLeave={resume}
         onFocusCapture={pause} onBlurCapture={resume}>
      <span className="toast-icon">{ICONS[toast.type]}</span>
      <div className="toast-text">
        <strong>{toast.title}</strong>
        {toast.message && <span>{toast.message}</span>}
      </div>
      <button className="toast-close" onClick={() => onDismiss(toast.id)} aria-label="Fechar">
        <IconX size={14} />
      </button>
      <span className={`toast-progress ${paused ? 'paused' : ''}`} />
    </div>
  )
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const nextId = useRef(1)

  const dismiss = useCallback((id) => {
    setToasts((list) => list.map((t) => (t.id === id ? { ...t, leaving: true } : t)))
    setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), LEAVE_MS)
  }, [])

  const push = useCallback((type, title, message) => {
    const id = nextId.current++
    setToasts((list) => [...list.slice(-3), { id, type, title, message }])
  }, [])

  const toast = {
    success: (title, message) => push('success', title, message),
    error: (title, message) => push('error', title, message),
    info: (title, message) => push('info', title, message),
  }

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="toast-stack" role="status" aria-live="polite">
        {toasts.map((t) => (
          <Toast key={t.id} toast={t} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}
