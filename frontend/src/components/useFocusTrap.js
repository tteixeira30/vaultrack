import { useEffect, useState } from 'react'

const FOCUSABLE = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled])',
  'select:not([disabled])', 'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])',
].join(',')

/**
 * Guarda quem tinha o foco no momento em que `open` passa a verdadeiro.
 *
 * Lê-se durante o render, antes do commit: um `autoFocus` dentro do painel já
 * tomou o foco quando os efeitos correm, e o "anterior" seria esse campo — que
 * desaparece ao fechar, deixando o foco no body.
 */
function useOpener(open) {
  const [opener, setOpener] = useState(null)
  if (!open && opener) setOpener(null)
  else if (open && !opener) setOpener(document.activeElement)
  return opener
}

const refocus = (el) => { if (el?.isConnected) el.focus?.() }

/** Devolve o foco a quem abriu a sobreposição quando `open` volta a falso. */
export function useRestoreFocus(open) {
  const opener = useOpener(open)
  useEffect(() => {
    if (!open) return
    const previous = opener
    return () => refocus(previous)
  }, [open, opener])
}

/**
 * Prende o Tab dentro do painel enquanto está aberto e devolve o foco a quem o
 * abriu quando fecha — sem isto, o foco fica atrás da sobreposição e quem
 * navega por teclado ou leitor de ecrã perde-se na página por baixo.
 */
export function useFocusTrap(ref, active, { restore = true } = {}) {
  const opener = useOpener(restore && active)
  useEffect(() => {
    if (!active) return

    const previous = opener
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
      if (restore) refocus(previous)
    }
  }, [ref, active, restore, opener])
}
