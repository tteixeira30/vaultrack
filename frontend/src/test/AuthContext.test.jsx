import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AuthProvider, useAuth } from '../components/AuthContext'
import { api, getToken, setToken } from '../api'

// mantém as funções de token reais (localStorage), mocka só o objeto `api`
vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    api: { me: vi.fn(), login: vi.fn(), register: vi.fn(), getCurrency: vi.fn(), setCurrency: vi.fn() },
  }
})

function Consumer() {
  const { user, loading, baseCurrency, rateLive, currencies, login, register, logout, changeCurrency } = useAuth()
  return (
    <div>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="user">{user ? user.name : 'none'}</span>
      <span data-testid="cur">{baseCurrency}</span>
      <span data-testid="live">{String(rateLive)}</span>
      <span data-testid="curs">{currencies.map((c) => c.code).join(',')}</span>
      <button onClick={() => login('a@b.pt', 'x')}>login</button>
      <button onClick={() => register('Ana', 'a@b.pt', 'segredo1')}>register</button>
      <button onClick={() => changeCurrency('GBP')}>currency</button>
      <button onClick={logout}>logout</button>
    </div>
  )
}

const renderAuth = () => render(<AuthProvider><Consumer /></AuthProvider>)

describe('AuthContext', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    api.getCurrency.mockResolvedValue({ base: 'EUR', rate: 1, rateLive: true })
  })

  it('sem token termina o carregamento sem utilizador', async () => {
    renderAuth()
    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'))
    expect(screen.getByTestId('user')).toHaveTextContent('none')
  })

  it('com token válido carrega o utilizador via api.me', async () => {
    setToken('t')
    api.me.mockResolvedValue({ name: 'Ana', email: 'a@b.pt', baseCurrency: 'USD' })
    api.getCurrency.mockResolvedValue({ base: 'USD', rate: 1.1 })

    renderAuth()

    await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('Ana'))
    expect(screen.getByTestId('cur')).toHaveTextContent('USD')
  })

  it('login guarda o token e o utilizador', async () => {
    api.login.mockResolvedValue({ token: 'novo-token', user: { name: 'Rui', baseCurrency: 'EUR' } })
    const user = userEvent.setup()
    renderAuth()
    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'))

    await user.click(screen.getByRole('button', { name: 'login' }))

    await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('Rui'))
    expect(getToken()).toBe('novo-token')
  })

  it('register autentica o novo utilizador', async () => {
    api.register.mockResolvedValue({ token: 'tok', user: { name: 'Nova', baseCurrency: 'EUR' } })
    const user = userEvent.setup()
    renderAuth()
    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'))

    await user.click(screen.getByRole('button', { name: 'register' }))

    await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('Nova'))
    expect(api.register).toHaveBeenCalledWith({ name: 'Ana', email: 'a@b.pt', password: 'segredo1', inviteCode: null })
  })

  it('logout limpa o token e o utilizador', async () => {
    api.login.mockResolvedValue({ token: 'tok', user: { name: 'Rui', baseCurrency: 'EUR' } })
    const user = userEvent.setup()
    renderAuth()
    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'))
    await user.click(screen.getByRole('button', { name: 'login' }))
    await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('Rui'))

    await user.click(screen.getByRole('button', { name: 'logout' }))

    expect(screen.getByTestId('user')).toHaveTextContent('none')
    expect(getToken()).toBeNull()
  })

  it('changeCurrency atualiza a moeda base', async () => {
    api.login.mockResolvedValue({ token: 'tok', user: { name: 'Rui', baseCurrency: 'EUR' } })
    api.setCurrency.mockResolvedValue({ baseCurrency: 'GBP' })
    const user = userEvent.setup()
    renderAuth()
    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'))
    await user.click(screen.getByRole('button', { name: 'login' }))
    await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('Rui'))

    api.getCurrency.mockResolvedValue({ base: 'GBP', rate: 0.85 })
    await user.click(screen.getByRole('button', { name: 'currency' }))

    await waitFor(() => expect(screen.getByTestId('cur')).toHaveTextContent('GBP'))
    expect(api.setCurrency).toHaveBeenCalledWith('GBP')
  })

  // Sem câmbio o backend devolve a taxa 1,0: os montantes continuam a ser
  // euros com outro símbolo à frente, e o shell tem de o poder dizer.
  it('propaga rateLive: false quando o câmbio não está disponível', async () => {
    setToken('t')
    api.me.mockResolvedValue({ name: 'Ana', baseCurrency: 'USD' })
    api.getCurrency.mockResolvedValue({ base: 'USD', rate: 1, rateLive: false })

    renderAuth()

    await waitFor(() => expect(screen.getByTestId('cur')).toHaveTextContent('USD'))
    expect(screen.getByTestId('live')).toHaveTextContent('false')
  })

  it('falha a carregar a moeda deixa EUR com a taxa dada como válida', async () => {
    setToken('t')
    api.me.mockResolvedValue({ name: 'Ana', baseCurrency: 'EUR' })
    api.getCurrency.mockRejectedValue(new Error('offline'))

    renderAuth()

    await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('Ana'))
    expect(screen.getByTestId('cur')).toHaveTextContent('EUR')
    expect(screen.getByTestId('live')).toHaveTextContent('true')
  })

  // Quem manda na lista de moedas é o backend; o CURRENCIES local só acrescenta
  // símbolo e nome. Antes eram duas listas à mão sem nada a garanti-las iguais.
  it('a lista de moedas vem do supported do backend', async () => {
    setToken('t')
    api.me.mockResolvedValue({ name: 'Ana', baseCurrency: 'EUR' })
    api.getCurrency.mockResolvedValue({ base: 'EUR', rate: 1, rateLive: true, supported: ['EUR', 'GBP'] })

    renderAuth()

    await waitFor(() => expect(screen.getByTestId('curs')).toHaveTextContent('EUR,GBP'))
  })

  it('uma moeda que o backend passe a aceitar aparece à mesma', async () => {
    setToken('t')
    api.me.mockResolvedValue({ name: 'Ana', baseCurrency: 'EUR' })
    api.getCurrency.mockResolvedValue({ base: 'EUR', rate: 1, rateLive: true, supported: ['EUR', 'SEK'] })

    renderAuth()

    await waitFor(() => expect(screen.getByTestId('curs')).toHaveTextContent('EUR,SEK'))
  })

  it('sem resposta do backend fica a lista local inteira', async () => {
    setToken('t')
    api.me.mockResolvedValue({ name: 'Ana', baseCurrency: 'EUR' })
    api.getCurrency.mockRejectedValue(new Error('offline'))

    renderAuth()

    await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('Ana'))
    expect(screen.getByTestId('curs')).toHaveTextContent('EUR,USD,GBP')
  })
  // Um 502 com o backend a reiniciar, ou o telemóvel sem rede ao abrir a app,
  // não é o servidor a recusar o token — deitava a sessão fora por nada.
  it('um erro de transporte no arranque não termina a sessão', async () => {
    setToken('t')
    api.me.mockRejectedValue(Object.assign(new Error('Erro 502'), { status: 502 }))

    renderAuth()

    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'))
    expect(getToken()).toBe('t')
  })

  it('um 401 no arranque termina a sessão', async () => {
    setToken('t')
    api.me.mockRejectedValue(Object.assign(new Error('Erro 401'), { status: 401 }))

    renderAuth()

    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'))
    expect(getToken()).toBeNull()
  })
})
