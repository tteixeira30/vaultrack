import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '../App'
import { useAuth } from '../components/AuthContext'
import { CURRENCIES } from '../api'

// AuthProvider vira passthrough; useAuth é controlado por teste
vi.mock('../components/AuthContext', () => ({
  AuthProvider: ({ children }) => children,
  useAuth: vi.fn(),
}))
// páginas substituídas por stubs para isolar o shell (sem chamadas à API)
vi.mock('../pages/DashboardPage', () => ({ default: () => <div>PÁGINA_PAINEL</div> }))
vi.mock('../pages/IncomePage', () => ({ default: () => <div>PÁGINA_RENDIMENTO</div> }))
vi.mock('../pages/InvestmentsPage', () => ({ default: () => <div>PÁGINA_CARTEIRA</div> }))
vi.mock('../pages/GoalsPage', () => ({ default: () => <div>PÁGINA_OBJETIVOS</div> }))
vi.mock('../pages/CalendarPage', () => ({ default: () => <div>PÁGINA_CALENDARIO</div> }))
vi.mock('../pages/AchievementsPage', () => ({ default: () => <div>PÁGINA_CONQUISTAS</div> }))
vi.mock('../pages/ExpensesPage', () => ({ default: () => <div>PÁGINA_MOVIMENTOS</div> }))
vi.mock('../pages/AccountsPage', () => ({ default: () => <div>PÁGINA_CONTAS</div> }))
vi.mock('../pages/ProfilePage', () => ({ default: ({ onLogout }) => (
  <div>PÁGINA_PERFIL<button onClick={onLogout}>Terminar sessão</button></div>
) }))
vi.mock('../pages/AuthPage', () => ({ default: () => <div>PÁGINA_AUTH</div> }))

/** Barra inferior (mobile). Escondida por CSS no desktop, mas sempre no DOM. */
const bottomNav = () => screen.getByRole('navigation', { name: 'Navegação por separadores' })

const authed = {
  user: { name: 'Ana Silva', email: 'ana@ex.com' },
  loading: false, baseCurrency: 'EUR', rateLive: true, currencies: CURRENCIES,
  logout: vi.fn(), changeCurrency: vi.fn(),
}

describe('App / Shell', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // jsdom não implementa scrollTo e o histórico persiste entre testes
    window.scrollTo = vi.fn()
    window.history.replaceState(null, '', '/')
  })

  it('mostra o esqueleto enquanto a sessão carrega', () => {
    useAuth.mockReturnValue({ ...authed, loading: true, user: null })
    const { container } = render(<App />)
    expect(container.querySelector('.skeleton')).toBeInTheDocument()
  })

  it('sem sessão mostra a página de autenticação', () => {
    useAuth.mockReturnValue({ ...authed, user: null })
    render(<App />)
    expect(screen.getByText('PÁGINA_AUTH')).toBeInTheDocument()
  })

  it('com sessão mostra o painel por omissão e as iniciais do utilizador', () => {
    useAuth.mockReturnValue(authed)
    render(<App />)
    expect(screen.getByText('PÁGINA_PAINEL')).toBeInTheDocument()
    expect(screen.getAllByText('AS').length).toBeGreaterThan(0) // iniciais
    expect(screen.getByText('ana@ex.com')).toBeInTheDocument()
  })

  it('a sidebar agrupa os nove ecrãs em Principal, Análise e Sistema', () => {
    useAuth.mockReturnValue(authed)
    const { container } = render(<App />)

    const groups = [...container.querySelectorAll('.nav-group-name')].map((e) => e.textContent)
    expect(groups).toEqual(['Principal', 'Análise', 'Sistema'])
    expect(container.querySelectorAll('.nav-item')).toHaveLength(9)
  })

  it('clicar num separador da sidebar troca a página apresentada', async () => {
    useAuth.mockReturnValue(authed)
    const user = userEvent.setup()
    const { container } = render(<App />)

    await user.click(within(container.querySelector('.nav')).getByRole('button', { name: 'Carteira' }))

    expect(screen.getByText('PÁGINA_CARTEIRA')).toBeInTheDocument()
  })

  it('a barra inferior mostra os três separadores mobile', () => {
    useAuth.mockReturnValue(authed)
    render(<App />)

    const labels = within(bottomNav()).getAllByRole('button').map((b) => b.textContent)
    expect(labels).toEqual(['Início', 'Dinheiro', 'Crescer'])
  })

  it('o separador ativo é anunciado com aria-current', async () => {
    useAuth.mockReturnValue(authed)
    const user = userEvent.setup()
    render(<App />)

    const nav = bottomNav()
    expect(within(nav).getByRole('button', { name: 'Início' })).toHaveAttribute('aria-current', 'page')

    await user.click(within(nav).getByRole('button', { name: 'Crescer' }))
    expect(within(nav).getByRole('button', { name: 'Crescer' })).toHaveAttribute('aria-current', 'page')
    expect(within(nav).getByRole('button', { name: 'Início' })).not.toHaveAttribute('aria-current')
  })

  it('um separador com vários ecrãs abre no primeiro e mostra os segmentos', async () => {
    useAuth.mockReturnValue(authed)
    const user = userEvent.setup()
    render(<App />)

    await user.click(within(bottomNav()).getByRole('button', { name: 'Dinheiro' }))
    expect(screen.getByText('PÁGINA_MOVIMENTOS')).toBeInTheDocument()

    const segments = screen.getByRole('tablist', { name: 'Dinheiro' })
    expect(within(segments).getAllByRole('tab').map((b) => b.textContent))
      .toEqual(['Movimentos', 'Rendimento', 'Calendário'])

    await user.click(within(segments).getByRole('tab', { name: 'Calendário' }))
    expect(screen.getByText('PÁGINA_CALENDARIO')).toBeInTheDocument()
  })

  it('trocar de separador empilha histórico e o voltar desfaz', async () => {
    useAuth.mockReturnValue(authed)
    const user = userEvent.setup()
    render(<App />)

    await user.click(within(bottomNav()).getByRole('button', { name: 'Dinheiro' }))
    expect(screen.getByText('PÁGINA_MOVIMENTOS')).toBeInTheDocument()
    expect(window.location.hash).toBe('#expenses')

    // o popstate do browser (e o botão físico do Android) devolve o anterior
    window.dispatchEvent(new PopStateEvent('popstate', { state: { tab: 'dashboard' } }))
    expect(await screen.findByText('PÁGINA_PAINEL')).toBeInTheDocument()
  })

  it('tocar no separador já ativo sobe ao topo em vez de renavegar', async () => {
    useAuth.mockReturnValue(authed)
    const user = userEvent.setup()
    render(<App />)

    await user.click(within(bottomNav()).getByRole('button', { name: 'Início' }))

    expect(window.scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: 0 }))
    expect(screen.getByText('PÁGINA_PAINEL')).toBeInTheDocument()
  })

  it('o Perfil abre pela sidebar e tem o terminar sessão', async () => {
    // em desktop o Perfil é um item do grupo "Sistema"; o avatar do cabeçalho
    // é a porta de entrada em mobile, onde não há sidebar
    useAuth.mockReturnValue(authed)
    const user = userEvent.setup()
    const { container } = render(<App />)

    await user.click(within(container.querySelector('.nav')).getByRole('button', { name: 'Perfil' }))
    expect(screen.getByText('PÁGINA_PERFIL')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Terminar sessão' }))
    expect(authed.logout).toHaveBeenCalledOnce()
  })

  it('o botão da moeda avança para a seguinte da lista', async () => {
    useAuth.mockReturnValue(authed)
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: /Moeda base: EUR/ }))
    expect(authed.changeCurrency).toHaveBeenCalledWith('USD')
  })

  it('a janela Adicionar leva ao ecrã da ação escolhida', async () => {
    useAuth.mockReturnValue(authed)
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: /Adicionar/ }))
    // a lista abre num diálogo ao centro, não num menu ancorado ao botão
    const dialog = screen.getByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: /Objetivo/ }))
    expect(screen.getByText('PÁGINA_OBJETIVOS')).toBeInTheDocument()
  })

  it('⌘K abre a paleta e escolher um destino navega', async () => {
    useAuth.mockReturnValue(authed)
    const user = userEvent.setup()
    render(<App />)

    await user.keyboard('{Control>}k{/Control}')
    const palette = screen.getByRole('dialog', { name: 'Ir para' })

    await user.click(within(palette).getByRole('button', { name: /Conquistas/ }))
    expect(screen.getByText('PÁGINA_CONQUISTAS')).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Ir para' })).not.toBeInTheDocument()
  })
})
