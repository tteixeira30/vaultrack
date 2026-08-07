import { useCallback, useRef, useState } from 'react'

const DISMISS_PX = 90       // arrastar além disto fecha
const FLICK_VELOCITY = 0.5  // px/ms — um gesto rápido fecha mesmo sem chegar ao limiar

/**
 * Arrastar-para-fechar de uma sheet.
 *
 * Devolve `handlers` para pôr **só na pega e no cabeçalho**, nunca no corpo:
 * um arrasto iniciado no corpo compete com o scroll desse mesmo corpo, e o
 * remendo habitual ("só quando scrollTop é 0") é o que torna estas sheets
 * imprevisíveis.
 *
 * `axis: 'y'` fecha para baixo (sheets); `'x'` fecha para o lado (toasts).
 */
export function useSheetDrag(onDismiss, { axis = 'y', enabled = true } = {}) {
  const [offset, setOffset] = useState(0)
  const [dragging, setDragging] = useState(false)
  const start = useRef(null)

  const onPointerDown = useCallback((e) => {
    if (!enabled || e.button > 0) return
    // não arrancar um arrasto em cima de um controlo: a captura do ponteiro
    // rouba-lhe o clique (o botão de fechar vive no cabeçalho do modal)
    if (e.target.closest?.('button, a, input, select, textarea')) return

    start.current = { pos: axis === 'y' ? e.clientY : e.clientX, at: e.timeStamp }
    e.currentTarget.setPointerCapture?.(e.pointerId)
    setDragging(true)
  }, [axis, enabled])

  const onPointerMove = useCallback((e) => {
    if (!start.current) return
    const delta = (axis === 'y' ? e.clientY : e.clientX) - start.current.pos
    // só na direção de fecho: puxar ao contrário não descola a sheet
    setOffset(Math.max(0, delta))
  }, [axis])

  const end = useCallback((e) => {
    if (!start.current) return
    const delta = (axis === 'y' ? e.clientY : e.clientX) - start.current.pos
    const elapsed = Math.max(1, e.timeStamp - start.current.at)
    const velocity = delta / elapsed

    start.current = null
    setDragging(false)
    setOffset(0)

    if (delta > DISMISS_PX || (delta > 16 && velocity > FLICK_VELOCITY)) onDismiss()
  }, [axis, onDismiss])

  const translate = axis === 'y' ? `translateY(${offset}px)` : `translateX(${offset}px)`

  return {
    handlers: enabled
      ? { onPointerDown, onPointerMove, onPointerUp: end, onPointerCancel: end }
      : {},
    /** Aplicar no painel; sem transição durante o arrasto, para acompanhar o dedo. */
    style: offset
      ? { transform: translate, transition: 'none' }
      : dragging ? { transition: 'none' } : undefined,
    dragging,
  }
}
