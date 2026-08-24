import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeProvider, useTheme, useChartColors } from '../components/ThemeContext'

function Demo() {
  const { theme, pref, toggle, setPref } = useTheme()
  const colors = useChartColors()
  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <span data-testid="pref">{pref}</span>
      <span data-testid="grid">{colors.grid}</span>
      <button onClick={toggle}>alternar</button>
      <button onClick={() => setPref('system')}>sistema</button>
    </div>
  )
}

const renderThemed = () => render(<ThemeProvider><Demo /></ThemeProvider>)

/** matchMedia com listeners — o provider subscreve as mudanças do sistema. */
const mockMatchMedia = (matches) => {
  window.matchMedia = vi.fn().mockReturnValue({
    matches,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })
}

describe('ThemeContext', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.removeAttribute('data-theme')
    // por omissão o sistema pede tema escuro
    mockMatchMedia(false)
  })
  afterEach(() => { vi.restoreAllMocks() })

  it('usa o tema guardado no localStorage', () => {
    localStorage.setItem('tracky_theme', 'light')
    renderThemed()
    expect(screen.getByTestId('theme')).toHaveTextContent('light')
    expect(screen.getByTestId('pref')).toHaveTextContent('light')
    expect(document.documentElement.dataset.theme).toBe('light')
  })

  it('sem preferência guardada segue a preferência do sistema (claro)', () => {
    mockMatchMedia(true) // prefers light
    renderThemed()
    expect(screen.getByTestId('theme')).toHaveTextContent('light')
    expect(screen.getByTestId('pref')).toHaveTextContent('system')
  })

  it('sem preferência nenhuma cai para o tema escuro', () => {
    renderThemed()
    expect(screen.getByTestId('theme')).toHaveTextContent('dark')
  })

  it('toggle alterna o tema e persiste no localStorage', async () => {
    localStorage.setItem('tracky_theme', 'dark')
    renderThemed()
    await userEvent.click(screen.getByRole('button', { name: 'alternar' }))
    expect(screen.getByTestId('theme')).toHaveTextContent('light')
    expect(localStorage.getItem('tracky_theme')).toBe('light')
  })

  it('escolher "sistema" volta a seguir a preferência do sistema', async () => {
    localStorage.setItem('tracky_theme', 'dark')
    mockMatchMedia(true) // o sistema pede claro
    renderThemed()
    expect(screen.getByTestId('theme')).toHaveTextContent('dark')

    await userEvent.click(screen.getByRole('button', { name: 'sistema' }))
    expect(screen.getByTestId('pref')).toHaveTextContent('system')
    expect(screen.getByTestId('theme')).toHaveTextContent('light')
    expect(localStorage.getItem('tracky_theme')).toBe('system')
  })

  it('useChartColors devolve as cores do tema ativo', async () => {
    localStorage.setItem('tracky_theme', 'dark')
    renderThemed()
    expect(screen.getByTestId('grid')).toHaveTextContent('#1c1f28') // grelha do tema escuro
    await userEvent.click(screen.getByRole('button', { name: 'alternar' }))
    expect(screen.getByTestId('grid')).toHaveTextContent('#e2dfd8') // grelha do tema claro (papel)
  })
})
