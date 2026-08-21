import { createContext, useCallback, useContext, useEffect, useState } from 'react'

const ThemeContext = createContext(null)
const STORAGE_KEY = 'tracky_theme'

/**
 * Preferência de tema: 'light' | 'dark' | 'system'.
 *
 * O design de perfil oferece três miniaturas em vez de um interruptor, por isso
 * "sistema" é uma escolha explícita e não apenas o valor por omissão. O que fica
 * no `data-theme` do <html> é sempre o tema *resolvido* (claro ou escuro) — o
 * CSS não precisa de saber que a escolha foi automática.
 */
const PREFS = ['light', 'dark', 'system']

function storedPref() {
  const saved = localStorage.getItem(STORAGE_KEY)
  return PREFS.includes(saved) ? saved : 'system'
}

const systemTheme = () =>
  window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark'

export function ThemeProvider({ children }) {
  const [pref, setPref] = useState(storedPref)
  const [theme, setTheme] = useState(() => (storedPref() === 'system' ? systemTheme() : storedPref()))

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, pref)
    if (pref !== 'system') { setTheme(pref); return }

    setTheme(systemTheme())
    const mql = window.matchMedia?.('(prefers-color-scheme: light)')
    if (!mql) return
    const onChange = () => setTheme(systemTheme())
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [pref])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  // alterna entre claro e escuro a partir do tema que está à vista; a escolha
  // passa a ser explícita (deixa de seguir o sistema), como se espera de um
  // interruptor
  const toggle = useCallback(() => setPref(theme === 'dark' ? 'light' : 'dark'), [theme])

  return (
    <ThemeContext.Provider value={{ theme, pref, setPref, toggle }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}

// Recharts não lê CSS custom properties em atributos SVG — as cores dos gráficos
// (grelha e eixos) têm de ser passadas explicitamente consoante o tema ativo.
const CHART_COLORS = {
  dark: { grid: '#1c1f28', axis: '#828899' },
  light: { grid: '#e2dfd8', axis: '#6a655c' },
}

export function useChartColors() {
  const { theme } = useTheme() ?? {}
  return CHART_COLORS[theme] ?? CHART_COLORS.dark
}
