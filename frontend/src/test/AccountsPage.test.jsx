import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AccountsPage from '../pages/AccountsPage'
import { api } from '../api'

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    api: {
      getExpenses: vi.fn(), getCategoryRules: vi.fn(),
      addExpenseAccount: vi.fn(), updateExpenseAccount: vi.fn(), deleteExpenseAccount: vi.fn(),
    },
  }
})
vi.mock('../components/Toast', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }),
}))

const data = {
  month: '2025-06', inflows: 0, outflows: 0, net: 0, byCategory: [], transactions: [],
  accounts: [
    { id: 1, name: 'Santander', transactionCount: 12, currentBalance: 3210.44 },
    { id: 2, name: 'Trade Republic', transactionCount: 3, currentBalance: null },
  ],
}

describe('AccountsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.getExpenses.mockResolvedValue(data)
    api.getCategoryRules.mockResolvedValue([])
  })

  it('lista as contas com saldo e assinala as que não o têm', async () => {
    render(<AccountsPage />)

    await waitFor(() => expect(screen.getAllByTestId('account-row')).toHaveLength(2))
    const [santander, tr] = screen.getAllByTestId('account-row')

    expect(within(santander).getByText('SA')).toBeInTheDocument() // código mono
    expect(within(santander).getByText(/3210,44/)).toBeInTheDocument()
    expect(within(tr).getByText('Sem saldo')).toBeInTheDocument()
  })

  it('soma o saldo das contas que o têm definido', async () => {
    render(<AccountsPage />)
    await waitFor(() => expect(screen.getByText('Saldo em contas')).toBeInTheDocument())
    expect(screen.getByText('Saldo em contas').nextSibling).toHaveTextContent(/3210,44/)
  })

  it('criar uma conta chama a API', async () => {
    api.addExpenseAccount.mockResolvedValue({})
    const user = userEvent.setup()
    render(<AccountsPage />)

    await waitFor(() => expect(screen.getAllByTestId('account-row')).toHaveLength(2))
    await user.click(screen.getByRole('button', { name: 'Nova conta' }))
    await user.type(screen.getByPlaceholderText('Ex: Santander'), 'Revolut')
    await user.type(screen.getByPlaceholderText(/Deixa em branco/), '742,18')
    await user.click(screen.getByRole('button', { name: 'Guardar' }))

    await waitFor(() => expect(api.addExpenseAccount)
      .toHaveBeenCalledWith({ name: 'Revolut', currentBalance: 742.18 }))
  })

  it('eliminar uma conta confirma antes de chamar a API', async () => {
    api.deleteExpenseAccount.mockResolvedValue({})
    const user = userEvent.setup()
    render(<AccountsPage />)

    await waitFor(() => expect(screen.getAllByTestId('account-row')).toHaveLength(2))
    await user.click(screen.getByLabelText('Eliminar Santander'))
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Eliminar' }))

    await waitFor(() => expect(api.deleteExpenseAccount).toHaveBeenCalledWith(1))
  })

  it('mostra as regras de categoria aprendidas', async () => {
    api.getCategoryRules.mockResolvedValue([{ matchKey: 'continente', category: 'GROCERIES' }])
    render(<AccountsPage />)

    await waitFor(() => expect(screen.getByText('continente')).toBeInTheDocument())
    expect(screen.getByText('Supermercado')).toBeInTheDocument()
  })
})
