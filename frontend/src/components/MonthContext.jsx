import { createContext, useCallback, useContext, useMemo, useState } from 'react'

/**
 * Mês ativo (AAAA-MM), partilhado pelo shell e pelas páginas mensais.
 *
 * No design, o seletor de mês vive na barra de topo e vale para toda a
 * aplicação — antes cada página (Rendimento, Movimentos, Calendário) tinha o
 * seu, e trocar de separador perdia o mês escolhido. Aqui há um só estado.
 */
const MonthContext = createContext(null)

export const currentMonth = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** "2026-08" → "agosto de 2026" (o formato longo do pt-PT). */
export const fmtMonth = (m) => {
  if (!m) return ''
  const [y, mo] = m.split('-').map(Number)
  return new Date(y, mo - 1, 1).toLocaleDateString('pt-PT', { month: 'long', year: 'numeric' })
}

/** "2026-08" → "Agosto 2026", para cabeçalhos (sem a preposição). */
export const fmtMonthShort = (m) => {
  if (!m) return ''
  const [y, mo] = m.split('-').map(Number)
  const s = new Date(y, mo - 1, 1).toLocaleDateString('pt-PT', { month: 'long', year: 'numeric' })
  const clean = s.replace(' de ', ' ')
  return clean.charAt(0).toUpperCase() + clean.slice(1)
}

/** "ago" — mês abreviado sem o ponto que o pt-PT lhe põe. */
export const monthAbbr = (date) =>
  date.toLocaleDateString('pt-PT', { month: 'short' }).replace('.', '')

/**
 * "2026-08-18" → "18 ago".
 *
 * Pedir dia e mês curto na mesma chamada devolve "18/08" em pt-PT — o CLDR
 * escolhe o formato numérico —, por isso o mês vem separado.
 */
export const fmtDayMonth = (iso) => {
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2, '0')} ${monthAbbr(d)}`
}

/** Desloca um AAAA-MM em `delta` meses. */
export const shiftMonth = (m, delta) => {
  const [y, mo] = m.split('-').map(Number)
  const d = new Date(y, mo - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function MonthProvider({ children }) {
  const [month, setMonth] = useState(currentMonth)

  const step = useCallback((delta) => setMonth((m) => shiftMonth(m, delta)), [])

  const value = useMemo(() => ({ month, setMonth, step }), [month, step])
  return <MonthContext.Provider value={value}>{children}</MonthContext.Provider>
}

/**
 * Degrada para um mês local quando não há provider — é o que mantém os testes
 * unitários das páginas a montar cada uma isoladamente.
 */
export function useMonth() {
  const ctx = useContext(MonthContext)
  const [fallback, setFallback] = useState(currentMonth)
  if (ctx) return ctx
  return { month: fallback, setMonth: setFallback, step: (d) => setFallback((m) => shiftMonth(m, d)) }
}
