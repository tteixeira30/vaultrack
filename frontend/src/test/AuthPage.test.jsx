import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AuthPage from '../pages/AuthPage'
import { AuthProvider } from '../components/AuthContext'
import { ToastProvider } from '../components/Toast'

// Os labels do AuthPage não estão associados aos inputs (sem htmlFor),
// por isso os campos localizam-se pelo placeholder.
function renderAuthPage() {
  // sem token no localStorage o AuthProvider não chama a API no arranque
  return render(
    <ToastProvider>
      <AuthProvider>
        <AuthPage />
      </AuthProvider>
    </ToastProvider>,
  )
}

describe('AuthPage', () => {
  it('mostra o formulário de login por omissão', () => {
    renderAuthPage()

    expect(screen.getByPlaceholderText('exemplo@email.com')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('A tua palavra-passe')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeInTheDocument()
    // campos exclusivos do registo não aparecem
    expect(screen.queryByPlaceholderText('O teu nome')).not.toBeInTheDocument()
  })

  it('muda para o formulário de registo ao clicar em "Criar conta"', async () => {
    const user = userEvent.setup()
    renderAuthPage()

    await user.click(screen.getByRole('button', { name: 'Criar conta' }))

    expect(screen.getByPlaceholderText('O teu nome')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Deixa vazio se não tiveres')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Mínimo 8 caracteres')).toBeInTheDocument()
    // o botão de submissão passa a "Criar conta" (tab + submit + link do rodapé)
    expect(screen.getAllByRole('button', { name: 'Criar conta' }).length).toBeGreaterThanOrEqual(2)
  })

  it('submeter com campos vazios mostra toast de erro e não chama a API', async () => {
    global.fetch = vi.fn()
    const user = userEvent.setup()
    renderAuthPage()

    await user.click(screen.getByRole('button', { name: 'Entrar' }))

    expect(await screen.findByText('Campos em falta')).toBeInTheDocument()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('login falhado mostra a mensagem de erro do backend', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: 'Email ou palavra-passe incorretos.' }), { status: 401 }),
    )
    const user = userEvent.setup()
    renderAuthPage()

    await user.type(screen.getByPlaceholderText('exemplo@email.com'), 'a@b.pt')
    await user.type(screen.getByPlaceholderText('A tua palavra-passe'), 'errada')
    await user.click(screen.getByRole('button', { name: 'Entrar' }))

    expect(await screen.findByText('Erro ao iniciar sessão')).toBeInTheDocument()
    expect(await screen.findByText('Email ou palavra-passe incorretos.')).toBeInTheDocument()
  })

  it('registo com sucesso submete nome, email, palavra-passe e convite', async () => {
    const jsonRes = (body) => new Response(JSON.stringify(body), { status: 200 })
    global.fetch = vi.fn((url) => {
      if (String(url).includes('/auth/register')) {
        return Promise.resolve(jsonRes({ token: 'tok', user: { name: 'Ana Silva', baseCurrency: 'EUR' } }))
      }
      return Promise.resolve(jsonRes({ base: 'EUR', rate: 1 })) // /currency
    })
    const user = userEvent.setup()
    renderAuthPage()

    await user.click(screen.getByRole('button', { name: 'Criar conta' }))
    await user.type(screen.getByPlaceholderText('O teu nome'), 'Ana Silva')
    await user.type(screen.getByPlaceholderText('exemplo@email.com'), 'ana@ex.com')
    await user.type(screen.getByPlaceholderText('Mínimo 8 caracteres'), 'segredo1')
    await user.click(screen.getAllByRole('button', { name: 'Criar conta' }).at(-1))

    // faz o pedido de registo com o corpo esperado
    await screen.findByText(/Bem-vindo, Ana!/)
    const registerCall = fetch.mock.calls.find(([u]) => String(u).includes('/auth/register'))
    expect(JSON.parse(registerCall[1].body)).toMatchObject({ name: 'Ana Silva', email: 'ana@ex.com' })
  })
})
