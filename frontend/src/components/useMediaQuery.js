import { useCallback, useSyncExternalStore } from 'react'

/**
 * Media query reativa, para os casos em que o CSS não chega — props de
 * componentes (Recharts, variantes de sobreposição) vivem em JS.
 *
 * Degrada para `false` quando não há `window.matchMedia`: é o caso do jsdom nos
 * testes, e é por isso que o `ThemeContext` e o `App` já usam `?.` aqui. Assim
 * os testes existentes continuam a exercitar o caminho de desktop.
 */
export function useMediaQuery(query) {
  const subscribe = useCallback((onChange) => {
    const mql = window.matchMedia?.(query)
    if (!mql) return () => {}
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [query])

  const getSnapshot = useCallback(() => window.matchMedia?.(query).matches ?? false, [query])

  return useSyncExternalStore(subscribe, getSnapshot, () => false)
}

/** A fronteira "isto é mobile" — a mesma dos 900px do styles.css. */
export function useIsMobile() {
  return useMediaQuery('(max-width: 900px)')
}
