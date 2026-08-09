import { useEffect } from 'react'

const FOCUSABLE = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled])',
  'select:not([disabled])', 'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])',
].join(',')

/**
 * Prende o Tab dentro do painel enquanto está aberto e devolve o foco a quem o
 * abriu quando fecha — sem isto, o foco fica atrás da sobreposição e quem
 * navega por teclado ou leitor de ecrã perde-se na página por baixo.
 */
export function useFocusTrap(ref, active) {
  useEffect(() => {
    if (!active) return

    const previous = document.activeElement
    const panel = ref.current

    // foca o primeiro elemento útil; o painel leva tabIndex={-1} como recurso
    const first = panel?.querySelector(FOCUSABLE)
    ;(first ?? panel)?.focus?.()

    const onKey = (e) => {
      if (e.key !== 'Tab' || !panel) return
      const items = [...panel.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null)
      if (items.length === 0) return

      const firstItem = items[0]
      const lastItem = items[items.length - 1]
      const current = document.activeElement

      if (e.shiftKey && (current === firstItem || !panel.contains(current))) {
        e.preventDefault()
        lastItem.focus()
      } else if (!e.shiftKey && current === lastItem) {
        e.preventDefault()
        firstItem.focus()
      }
    }

    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      previous?.focus?.()
    }
  }, [ref, active])
}
