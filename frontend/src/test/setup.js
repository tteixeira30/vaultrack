import '@testing-library/jest-dom'
import { createElement } from 'react'
import { afterEach, beforeEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import { setDisplayCurrency } from '../api'

// ---------- matchMedia ----------
// O jsdom não implementa matchMedia. Sem mock, o useMediaQuery devolve sempre
// false (por desenho) e as variantes mobile ficavam invisíveis aos testes.
// Por omissão nada casa — o caminho de desktop — e quem quiser testar a
// variante mobile chama `setMediaQuery('(max-width: 900px)', true)`.
const mediaMatches = new Set()

export function setMediaQuery(query, matches) {
  if (matches) mediaMatches.add(query)
  else mediaMatches.delete(query)
}

beforeEach(() => {
  mediaMatches.clear()
  window.matchMedia = (query) => ({
    media: query,
    matches: mediaMatches.has(query),
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
    onchange: null,
  })
})

// O jsdom também não implementa scrollTo, que o bloqueio de scroll usa para
// repor a posição ao fechar uma sobreposição.
window.scrollTo = vi.fn()

// O Recharts precisa de dimensões reais de layout (inexistentes em jsdom) e não
// acrescenta valor aos testes de lógica das páginas. Substitui-se por elementos
// simples para os testes se focarem no comportamento, não no SVG dos gráficos.
vi.mock('recharts', () => {
  const Passthrough = ({ children }) => createElement('div', null, children)
  const names = [
    'ResponsiveContainer', 'AreaChart', 'Area', 'LineChart', 'Line',
    'PieChart', 'Pie', 'Cell', 'XAxis', 'YAxis', 'Tooltip', 'CartesianGrid', 'Legend',
  ]
  return Object.fromEntries(names.map((n) => [n, Passthrough]))
})

afterEach(() => {
  cleanup()
  localStorage.clear()
  // repõe o estado de moeda partilhado no módulo api.js
  setDisplayCurrency('EUR', 1)
})
