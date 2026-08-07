import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '../App'
import { useAuth } from '../components/AuthContext'

// AuthProvider vira passthrough; useAuth é controlado por teste
vi.mock('../components/AuthContext', () => ({
  AuthProvider: ({ children }) => children,
  useAuth: vi.fn(),
}))
// páginas substituídas por stubs para isolar o shell (sem chamadas à API)
vi.mock('../pages/DashboardPage', () => ({ default: () => <div>PÁGINA_PAINEL</div> }))
vi.mock('../pages/IncomePage', () => ({ default: () => <div>PÁGINA_RENDIMENTO</div> }))
vi.mock('../pages/InvestmentsPage', () => ({ default: () => <div>PÁGINA_INVEST</div> }))
vi.mock('../pages/GoalsPage', () => ({ default: () => <div>PÁGINA_OBJETIVOS</div> }))
vi.mock('../pages/CalendarPage', () => ({ default: () => <div>PÁGINA_CALENDARIO</div> }))
vi.mock('../pages/AchievementsPage', () => ({ default: () => <div>PÁGINA_CONQUISTAS</div> }))
vi.mock('../pages/ExpensesPage', () => ({ default: () => <div>PÁGINA_DESPESAS</div> }))
vi.mock('../pages/AuthPage', () => ({ default: () => <div>PÁGINA_AUTH</div> }))

/** Barra inferior (mobile). Escondida por CSS no desktop, mas sempre no DOM. */
const bottomNav = () => screen.getByRole('navigation', { name: 'Navegação principal' })

const authed = {
  user: { name: 'Ana Silva', email: 'ana@ex.com' },
  loading: false, baseCurrency: 'EUR',
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
    expect(screen.getByText('AS')).toBeInTheDocument() // iniciais
    expect(screen.getByText('ana@ex.com')).toBeInTheDocument()
  })

  it('clicar num separador troca a página apresentada', async () => {
    useAuth.mockReturnValue(authed)
    const user = userEvent.setup()
    render(<App />)

    // o mesmo separador existe na sidebar e na bottom-nav — clica no primeiro
    await user.click(screen.getAllByRole('button', { name: /Investimentos/ })[0])

    expect(screen.getByText('PÁGINA_INVEST')).toBeInTheDocument()
  })

  it('a barra inferior mostra os quatro separadores primários e o "Mais"', () => {
    useAuth.mockReturnValue(authed)
    render(<App />)

    const labels = within(bottomNav()).getAllByRole('button').map((b) => b.textContent)
    expect(labels).toEqual(['Painel', 'Despesas', 'Investimentos', 'Objetivos', 'Mais'])
  })

  it('o separador ativo é anunciado com aria-current', async () => {
    useAuth.mockReturnValue(authed)
    const user = userEvent.setup()
    render(<App />)

    const nav = bottomNav()
    expect(within(nav).getByRole('button', { name: 'Painel' })).toHaveAttribute('aria-current', 'page')

    await user.click(within(nav).getByRole('button', { name: 'Objetivos' }))
    expect(within(nav).getByRole('button', { name: 'Objetivos' })).toHaveAttribute('aria-current', 'page')
    expect(within(nav).getByRole('button', { name: 'Painel' })).not.toHaveAttribute('aria-current')
  })

  it('os separadores secundários chegam-se pela sheet "Mais"', async () => {
    useAuth.mockReturnValue(authed)
    const user = userEvent.setup()
    render(<App />)

    await user.click(within(bottomNav()).getByRole('button', { name: 'Mais' }))

    const sheet = screen.getByRole('dialog', { name: 'Mais' })
    expect(within(sheet).getAllByRole('button').map((b) => b.textContent))
      .toEqual(['Rendimento', 'Calendário', 'Conquistas'])

    await user.click(within(sheet).getByRole('button', { name: 'Rendimento' }))
    expect(screen.getByText('PÁGINA_RENDIMENTO')).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Mais' })).not.toBeInTheDocument()
  })

  it('num separador secundário é o "Mais" que fica ativo', async () => {
    useAuth.mockReturnValue(authed)
    const user = userEvent.setup()
    render(<App />)

    await user.click(within(bottomNav()).getByRole('button', { name: 'Mais' }))
    await user.click(within(screen.getByRole('dialog', { name: 'Mais' })).getByRole('button', { name: 'Calendário' }))

    expect(within(bottomNav()).getByRole('button', { name: 'Mais' })).toHaveClass('active')
  })

  it('trocar de separador empilha histórico e o voltar desfaz', async () => {
    useAuth.mockReturnValue(authed)
    const user = userEvent.setup()
    render(<App />)

    await user.click(within(bottomNav()).getByRole('button', { name: 'Despesas' }))
    expect(screen.getByText('PÁGINA_DESPESAS')).toBeInTheDocument()
    expect(window.location.hash).toBe('#expenses')

    // o popstate do browser (e o botão físico do Android) devolve o anterior
    window.dispatchEvent(new PopStateEvent('popstate', { state: { tab: 'dashboard' } }))
    expect(await screen.findByText('PÁGINA_PAINEL')).toBeInTheDocument()
  })

  it('tocar no separador já ativo sobe ao topo em vez de renavegar', async () => {
    useAuth.mockReturnValue(authed)
    const user = userEvent.setup()
    render(<App />)

    await user.click(within(bottomNav()).getByRole('button', { name: 'Painel' }))

    expect(window.scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: 0 }))
    expect(screen.getByText('PÁGINA_PAINEL')).toBeInTheDocument()
  })

  it('o botão de terminar sessão chama logout', async () => {
    useAuth.mockReturnValue(authed)
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Perfil e definições' }))
    await user.click(screen.getByRole('menuitem', { name: 'Terminar sessão' }))
    expect(authed.logout).toHaveBeenCalledOnce()
  })
})
