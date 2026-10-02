import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import IncomePage from '../pages/IncomePage'
import GoalsPage from '../pages/GoalsPage'
import { api } from '../api'

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }))

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    api: {
      getIncome: vi.fn(), addAllocation: vi.fn(),
      getGoals: vi.fn(), addGoal: vi.fn(),
    },
  }
})
vi.mock('../components/Toast', () => ({ useToast: () => toast }))

const income = {
  month: '2025-06', current: true, monthlyIncome: 2000, allocations: [],
  totalAllocated: 0, totalPercentage: 0, unallocated: 2000, availableMonths: ['2025-06'], copiedFrom: null,
}

describe('IncomePage — validação da categoria', () => {
  beforeEach(() => { vi.clearAllMocks(); api.getIncome.mockResolvedValue(income) })

  const openModal = async (user) => {
    render(<IncomePage />)
    await user.click(await screen.findByRole('button', { name: /Criar categoria/ }))
    return screen.getByRole('dialog')
  }

  it('o exemplo do estado vazio usa o símbolo da moeda base', async () => {
    render(<IncomePage />)
    await screen.findByRole('button', { name: /Criar categoria/ })
    expect(screen.getAllByText(/ex: 400€ renda/).length).toBeGreaterThan(0)
  })

  it('valor vazio mantém "Campos em falta"', async () => {
    const user = userEvent.setup()
    const dialog = await openModal(user)
    await user.type(within(dialog).getByLabelText('Nome'), 'Renda')
    await user.click(within(dialog).getByRole('button', { name: 'Adicionar' }))
    expect(toast.error).toHaveBeenCalledWith('Campos em falta', expect.any(String))
  })

  it.each(['0', '-50'])('valor %s dá "O valor tem de ser maior que 0."', async (v) => {
    const user = userEvent.setup()
    const dialog = await openModal(user)
    await user.type(within(dialog).getByLabelText('Nome'), 'Renda')
    await user.type(within(dialog).getByLabelText('Percentagem do rendimento'), v)
    await user.click(within(dialog).getByRole('button', { name: 'Adicionar' }))
    expect(toast.error).toHaveBeenCalledWith(expect.any(String), 'O valor tem de ser maior que 0.')
    expect(api.addAllocation).not.toHaveBeenCalled()
  })
})

describe('GoalsPage — dia do depósito', () => {
  beforeEach(() => { vi.clearAllMocks(); api.getGoals.mockResolvedValue([]) })

  it('os campos têm nome acessível e um dia fora de 1–31 dá aviso em PT-PT', async () => {
    const user = userEvent.setup()
    render(<GoalsPage />)
    await user.click(await screen.findByRole('button', { name: /Novo objetivo/ }))
    const dialog = screen.getByRole('dialog')

    await user.type(within(dialog).getByLabelText('Nome'), 'Viagem')
    await user.type(within(dialog).getByLabelText('Valor do objetivo'), '1000')
    await user.type(within(dialog).getByLabelText('Alocação mensal'), '100')
    await user.click(within(dialog).getByRole('checkbox'))
    const day = within(dialog).getByLabelText('Dia do mês do depósito')
    await user.clear(day)
    await user.type(day, '45')
    await user.click(within(dialog).getByRole('button', { name: 'Criar objetivo' }))

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Dia inválido', 'O dia tem de estar entre 1 e 31.'))
    expect(api.addGoal).not.toHaveBeenCalled()
  })
})
