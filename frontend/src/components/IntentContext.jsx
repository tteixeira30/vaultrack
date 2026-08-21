import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

/**
 * Intenções de criação disparadas fora da página que as executa.
 *
 * O menu "Adicionar" da barra de topo (e a paleta de comandos) precisam de
 * abrir, por exemplo, o formulário de novo objetivo estando no Painel. O shell
 * navega para o separador certo e deixa aqui a intenção; a página consome-a
 * quando monta, com `useIntent`.
 */
const IntentContext = createContext(null)

export function IntentProvider({ children }) {
  const [intent, setIntent] = useState(null)
  const clear = useCallback(() => setIntent(null), [])
  const value = useMemo(() => ({ intent, setIntent, clear }), [intent, clear])
  return <IntentContext.Provider value={value}>{children}</IntentContext.Provider>
}

/** Corre `run` uma vez quando a intenção pedida está pendente, e limpa-a. */
export function useIntent(name, run) {
  const ctx = useContext(IntentContext)
  const intent = ctx?.intent
  const clear = ctx?.clear

  useEffect(() => {
    if (intent !== name) return
    clear?.()
    run()
    // `run` muda a cada render das páginas; o gatilho é a intenção, não a função
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intent, name])
}

export function useIntentSetter() {
  return useContext(IntentContext)?.setIntent ?? (() => {})
}
