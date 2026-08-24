import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ProfilePage from '../pages/ProfilePage'
import { ThemeProvider } from '../components/ThemeContext'

const props = {
  user: { name: 'Ana Silva', email: 'ana@ex.com' },
  initials: 'AS',
  baseCurrency: 'EUR',
  changeCurrency: vi.fn(),
  privacy: false,
  togglePrivacy: vi.fn(),
  onGo: vi.fn(),
  onLogout: vi.fn(),
}

const renderProfile = (over = {}) => render(
  <ThemeProvider><ProfilePage {...props} {...over} /></ThemeProvider>,
)

describe('ProfilePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    window.matchMedia = vi.fn().mockReturnValue({
      matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn(),
    })
  })

  it('mostra o utilizador e as três opções de tema', () => {
    renderProfile()
    expect(screen.getByText('Ana Silva')).toBeInTheDocument()
    expect(screen.getByText('ana@ex.com')).toBeInTheDocument()

    const themes = screen.getAllByRole('radio')
    expect(themes.map((b) => b.textContent)).toEqual(['Claro', 'Escuro', 'Sistema'])
    // sem preferência guardada, "Sistema" é a escolha ativa
    expect(screen.getByRole('radio', { name: 'Sistema' })).toHaveAttribute('aria-checked', 'true')
  })

  it('escolher um tema fixa a preferência', async () => {
    const user = userEvent.setup()
    renderProfile()

    await user.click(screen.getByRole('radio', { name: 'Claro' }))
    expect(screen.getByRole('radio', { name: 'Claro' })).toHaveAttribute('aria-checked', 'true')
    expect(localStorage.getItem('tracky_theme')).toBe('light')
  })

  it('o interruptor de privacidade reflete o estado e chama o toggle', async () => {
    const user = userEvent.setup()
    renderProfile({ privacy: true })

    const sw = screen.getByRole('switch', { name: 'Ocultar saldos' })
    expect(sw).toHaveAttribute('aria-checked', 'true')

    await user.click(sw)
    expect(props.togglePrivacy).toHaveBeenCalledOnce()
  })

  it('escolher uma moeda chama changeCurrency', async () => {
    const user = userEvent.setup()
    renderProfile()

    expect(screen.getByRole('button', { name: /EUR/ })).toHaveAttribute('aria-pressed', 'true')
    await user.click(screen.getByRole('button', { name: /GBP/ }))
    expect(props.changeCurrency).toHaveBeenCalledWith('GBP')
  })

  it('as ligações para contas e terminar sessão funcionam', async () => {
    const user = userEvent.setup()
    renderProfile()

    await user.click(screen.getByRole('button', { name: /Contas e importação/ }))
    expect(props.onGo).toHaveBeenCalledWith('accounts')

    await user.click(screen.getByRole('button', { name: /Terminar sessão/ }))
    expect(props.onLogout).toHaveBeenCalledOnce()
  })

  // Com a taxa a 1,0 os montantes são euros com outro símbolo à frente: sem
  // este aviso o número está errado e não há sintoma nenhum.
  it('avisa quando o câmbio não está disponível', () => {
    renderProfile({ baseCurrency: 'USD', rateLive: false })
    expect(screen.getByRole('status')).toHaveTextContent(/Câmbio de EUR para USD indisponível/)
  })

  it('sem falha de câmbio não mostra aviso nenhum', () => {
    renderProfile({ baseCurrency: 'USD', rateLive: true })
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  // A lista de moedas é a que o backend aceita; o CURRENCIES local só lhe
  // acrescenta símbolo e nome.
  it('mostra apenas as moedas que lhe são passadas', () => {
    renderProfile({ currencies: [{ code: 'EUR', symbol: '€', name: 'Euro' }, { code: 'SEK', symbol: 'SEK', name: 'SEK' }] })
    expect(screen.getByRole('button', { name: /EUR/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /SEK/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /JPY/ })).not.toBeInTheDocument()
  })
})
