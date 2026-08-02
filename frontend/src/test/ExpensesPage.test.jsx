import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ExpensesPage from '../pages/ExpensesPage'
import { api } from '../api'
import { setCustomCategories } from '../categories'

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    api: {
      getExpenses: vi.fn(), getExpenseCategories: vi.fn(),
      addExpenseCategory: vi.fn(), updateExpenseCategory: vi.fn(), deleteExpenseCategory: vi.fn(),
      addExpenseAccount: vi.fn(), updateExpenseAccount: vi.fn(), deleteExpenseAccount: vi.fn(),
      addTransaction: vi.fn(), updateTransaction: vi.fn(), deleteTransaction: vi.fn(),
      importTransactions: vi.fn(), getCategoryRules: vi.fn(), getPeriodUsage: vi.fn(),
    },
  }
})
// silencia os toasts
vi.mock('../components/Toast', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }),
}))

const educacao = { id: 1, key: 'EDUCACAO', label: 'Educação', color: '#22d3ee' }

const monthData = (over = {}) => ({
  month: '2026-07', inflows: 1800, outflows: 103.42, net: 1696.58,
  byCategory: [
    { category: 'GROCERIES', total: 63.42 },
    { category: 'EDUCACAO', total: 40 },
  ],
  accounts: [{ id: 10, name: 'Santander', transactionCount: 2, currentBalance: 2450.32 }],
  transactions: [
    { id: 1, accountId: 10, accountName: 'Santander', date: '2026-07-18', description: 'Continente', amount: 63.42, inflow: false, category: 'GROCERIES' },
    { id: 2, accountId: 10, accountName: 'Santander', date: '2026-07-15', description: 'Explicações', amount: 40, inflow: false, category: 'EDUCACAO' },
  ],
  ...over,
})

const openManageModal = async (user) => {
  await user.click(await screen.findByRole('button', { name: /Gerir categorias/ }))
  return screen.getByRole('dialog')
}

describe('ExpensesPage — categorias', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    setCustomCategories([])
    api.getCategoryRules.mockResolvedValue([])
  })

  it('mostra as categorias personalizadas nos movimentos e no detalhe por categoria', async () => {
    api.getExpenses.mockResolvedValue(monthData())
    api.getExpenseCategories.mockResolvedValue([educacao])
    render(<ExpensesPage />)

    // o rótulo "Educação" (chave EDUCACAO) aparece — vem do registo de categorias personalizadas
    await waitFor(() => expect(screen.getAllByText(/Educação/).length).toBeGreaterThan(0))
    // surge tanto na lista de movimentos (com a conta anexada) como nas barras por categoria
    expect(screen.getAllByText(/Educação/).length).toBeGreaterThanOrEqual(2)
  })

  it('criar uma categoria envia o nome e a cor e recarrega a lista', async () => {
    api.getExpenses.mockResolvedValue(monthData())
    api.getExpenseCategories.mockResolvedValue([])
    api.addExpenseCategory.mockResolvedValue({ id: 9, key: 'GINASIO', label: 'Ginásio', color: '#f59e0b' })
    const user = userEvent.setup()
    render(<ExpensesPage />)

    const dialog = await openManageModal(user)
    await user.type(within(dialog).getByPlaceholderText('Ex: Educação'), 'Ginásio')
    await user.click(within(dialog).getByRole('button', { name: /Adicionar categoria/ }))

    await waitFor(() => expect(api.addExpenseCategory).toHaveBeenCalledTimes(1))
    expect(api.addExpenseCategory).toHaveBeenCalledWith(expect.objectContaining({ label: 'Ginásio' }))
    // a cor enviada é um hex da paleta
    expect(api.addExpenseCategory.mock.calls[0][0].color).toMatch(/^#[0-9a-fA-F]{6}$/)
    // recarrega as categorias após criar (mount + reload)
    expect(api.getExpenseCategories.mock.calls.length).toBeGreaterThanOrEqual(2)
  })

  it('não cria uma categoria sem nome (não chama a API)', async () => {
    api.getExpenses.mockResolvedValue(monthData())
    api.getExpenseCategories.mockResolvedValue([])
    const user = userEvent.setup()
    render(<ExpensesPage />)

    const dialog = await openManageModal(user)
    await user.click(within(dialog).getByRole('button', { name: /Adicionar categoria/ }))

    expect(api.addExpenseCategory).not.toHaveBeenCalled()
  })

  it('editar uma categoria envia as alterações', async () => {
    api.getExpenses.mockResolvedValue(monthData())
    api.getExpenseCategories.mockResolvedValue([educacao])
    api.updateExpenseCategory.mockResolvedValue({ ...educacao, label: 'Formação' })
    const user = userEvent.setup()
    render(<ExpensesPage />)

    const dialog = await openManageModal(user)
    await user.click(within(dialog).getByLabelText('Editar Educação'))
    const nameInput = within(dialog).getByPlaceholderText('Ex: Educação')
    await user.clear(nameInput)
    await user.type(nameInput, 'Formação')
    await user.click(within(dialog).getByRole('button', { name: /Guardar alterações/ }))

    await waitFor(() => expect(api.updateExpenseCategory).toHaveBeenCalledTimes(1))
    expect(api.updateExpenseCategory).toHaveBeenCalledWith(1, expect.objectContaining({ label: 'Formação' }))
  })

  it('eliminar uma categoria confirma e chama a API', async () => {
    api.getExpenses.mockResolvedValue(monthData())
    api.getExpenseCategories.mockResolvedValue([educacao])
    api.deleteExpenseCategory.mockResolvedValue({})
    const user = userEvent.setup()
    render(<ExpensesPage />)

    const dialog = await openManageModal(user)
    await user.click(within(dialog).getByLabelText('Eliminar Educação'))
    // ConfirmDialog (role alertdialog)
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Eliminar' }))

    await waitFor(() => expect(api.deleteExpenseCategory).toHaveBeenCalledWith(1))
  })

  it('o seletor de categoria de um movimento inclui as personalizadas', async () => {
    api.getExpenses.mockResolvedValue(monthData())
    api.getExpenseCategories.mockResolvedValue([educacao])
    const user = userEvent.setup()
    render(<ExpensesPage />)

    await user.click(await screen.findByRole('button', { name: /Novo movimento/ }))
    const dialog = screen.getByRole('dialog')
    // abrir o dropdown de categoria (o campo com o label "Categoria")
    const catField = within(dialog).getByText('Categoria').closest('.field')
    await user.click(catField.querySelector('.dd-trigger'))

    // a opção personalizada aparece no menu (portal)
    await waitFor(() => expect(screen.getByRole('option', { name: 'Educação' })).toBeInTheDocument())
  })
})

describe('ExpensesPage — aviso de período já preenchido na importação', () => {
  // CSV da Revolut: o parser usa a data de início, a mesma que o PDF traz em
  // "Data Lançamento", para que importar os dois formatos não duplique tudo.
  const csv = [
    'Tipo,Produto,Data de início,Data de Conclusão,Descrição,Montante,Comissão,Moeda,Estado,Saldo',
    'Pagamento com cartão,Atual,2026-07-03 16:30:29,2026-07-04 11:12:49,Cafetaria,-2.85,0.00,EUR,CONCLUÍDA,215.99',
  ].join('\n')

  const carregarExtrato = async (user) => {
    await user.click(await screen.findByRole('button', { name: /Importar extrato/ }))
    const file = new File([csv], 'extrato.csv', { type: 'text/csv' })
    const input = document.querySelector('input[type="file"]')
    await user.upload(input, file)
  }

  beforeEach(() => {
    vi.resetAllMocks()
    setCustomCategories([])
    api.getCategoryRules.mockResolvedValue([])
    api.getExpenses.mockResolvedValue(monthData())
    api.getExpenseCategories.mockResolvedValue([])
  })

  it('avisa quando a conta já tem movimentos no período do extrato', async () => {
    api.getPeriodUsage.mockResolvedValue({ transactionCount: 26 })
    const user = userEvent.setup()
    render(<ExpensesPage />)
    await carregarExtrato(user)

    // o período consultado é o dos movimentos do ficheiro, com a data de início
    await waitFor(() => expect(api.getPeriodUsage).toHaveBeenCalledWith(10, '2026-07-03', '2026-07-03'))
    expect(await screen.findByText(/já tem 26 movimento\(s\) neste período/)).toBeInTheDocument()
  })

  it('não avisa quando o período está livre', async () => {
    api.getPeriodUsage.mockResolvedValue({ transactionCount: 0 })
    const user = userEvent.setup()
    render(<ExpensesPage />)
    await carregarExtrato(user)

    await waitFor(() => expect(api.getPeriodUsage).toHaveBeenCalled())
    expect(screen.queryByText(/neste período/)).not.toBeInTheDocument()
  })
})
