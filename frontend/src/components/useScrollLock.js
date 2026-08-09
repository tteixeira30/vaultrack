import { useEffect } from 'react'

/**
 * Impede o scroll da página por trás de uma sobreposição.
 *
 * `overflow: hidden` no body não chega em iOS e, pior, perde a posição de
 * scroll: ao reabrir o body a página salta para o topo. Fixa-se o body no
 * deslocamento atual e repõe-se no fim.
 *
 * A contagem de referências é essencial: o Modal empilha a confirmação de
 * "Descartar alterações?" por cima de si próprio, e sem isto o fecho da de
 * dentro largava o bloqueio e deixava a página no topo.
 */
let locks = 0
let savedY = 0

function lock() {
  if (locks++ > 0) return
  savedY = window.scrollY
  const { style } = document.body
  style.position = 'fixed'
  style.top = `-${savedY}px`
  style.left = '0'
  style.right = '0'
  style.width = '100%'
}

function unlock() {
  if (--locks > 0) return
  locks = 0
  const { style } = document.body
  style.position = ''
  style.top = ''
  style.left = ''
  style.right = ''
  style.width = ''
  window.scrollTo(0, savedY)
}

export function useScrollLock(active) {
  useEffect(() => {
    if (!active) return
    lock()
    return unlock
  }, [active])
}
