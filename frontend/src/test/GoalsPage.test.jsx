import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import GoalsPage from '../pages/GoalsPage'
import { api } from '../api'

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    api: {
      getGoals: vi.fn(), addGoal: vi.fn(), updateGoal: vi.fn(),
      contributeGoal: vi.fn(), deleteGoal: vi.fn(), applyDeposits: vi.fn(),
    },
  }
})
// silencia os toasts (não interessam à asserção e poluem o DOM)
vi.mock('../components/Toast', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }),
}))

const goal = (over = {}) => ({
  id: 1, name: 'Fundo de emergência', targetAmount: 1000, monthlyAllocation: 100,
  savedAmount: 300, progressPercent: 30, autoDeposit: false, contributionDay: 1, ...over,
})

describe('GoalsPage', () => {
  beforeEach(() => vi.resetAllMocks())

  // Regressão: a condição que revela este campo lia o valor com Number(), por
  // isso "250,25" dava NaN e o campo do dia nunca aparecia — sem erro nenhum.
  it('o dia do depósito aparece com a alocação escrita com vírgula', async () => {
    api.getGoals.mockResolvedValue([])
    const user = userEvent.setup()
    render(<GoalsPage />)

    await waitFor(() => expect(screen.getByRole('button', { name: /Novo objetivo/ })).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: /Novo objetivo/ }))

    const dialog = screen.getByRole('dialog')
    await user.type(within(dialog).getByPlaceholderText('Ex: 300'), '250,25')
    await user.click(within(dialog).getByRole('checkbox'))

    expect(within(dialog).getByText('Dia do mês do depósito')).toBeInTheDocument()
  })

  it('mostra o esqueleto enquanto carrega', () => {
    api.getGoals.mockReturnValue(new Promise(() => {}))
    const { container } = render(<GoalsPage />)
    expect(container.querySelector('.skeleton')).toBeInTheDocument()
  })

  it('lista os objetivos com progresso', async () => {
    api.getGoals.mockResolvedValue([goal()])
    render(<GoalsPage />)

    await waitFor(() => expect(screen.getByText('Fundo de emergência')).toBeInTheDocument())
    const card = document.querySelector('.goal-card')
    expect(within(card).getByText(/300,00/)).toBeInTheDocument()
    expect(within(card).getByText(/30,0%/)).toBeInTheDocument()
  })

  it('criar um objetivo envia os valores convertidos e recarrega', async () => {
    api.getGoals.mockResolvedValueOnce([]).mockResolvedValueOnce([goal()])
    api.addGoal.mockResolvedValue({})
    const user = userEvent.setup()
    render(<GoalsPage />)

    await waitFor(() => expect(screen.getByRole('button', { name: /Novo objetivo/ })).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: /Novo objetivo/ }))

    await user.type(screen.getByPlaceholderText('Ex: Fundo de emergência'), 'Carro')
    await user.type(screen.getByPlaceholderText('Ex: 10000'), '5000')
    await user.type(screen.getByPlaceholderText('Ex: 300'), '200')
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Criar objetivo' }))

    await waitFor(() => expect(api.addGoal).toHaveBeenCalledTimes(1))
    expect(api.addGoal).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Carro', targetAmount: 5000, monthlyAllocation: 200,
    }))
  })

  it('não cria com campos em falta (não chama a API)', async () => {
    api.getGoals.mockResolvedValue([])
    const user = userEvent.setup()
    render(<GoalsPage />)

    await waitFor(() => expect(screen.getByRole('button', { name: /Novo objetivo/ })).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: /Novo objetivo/ }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Criar objetivo' }))

    expect(api.addGoal).not.toHaveBeenCalled()
  })

  it('contribuir para um objetivo chama a API com o valor', async () => {
    api.getGoals.mockResolvedValue([goal()])
    api.contributeGoal.mockResolvedValue({ progressPercent: 50 })
    const user = userEvent.setup()
    render(<GoalsPage />)

    await waitFor(() => expect(screen.getByText('Fundo de emergência')).toBeInTheDocument())
    const card = document.querySelector('.goal-card')
    await user.type(within(card).getByPlaceholderText('Valor'), '200')
    await user.click(within(card).getByRole('button', { name: /Contribuir/ }))

    await waitFor(() => expect(api.contributeGoal).toHaveBeenCalledWith(1, 200))
  })

  it('editar um objetivo envia as alterações', async () => {
    api.getGoals.mockResolvedValue([goal()])
    api.updateGoal.mockResolvedValue({})
    const user = userEvent.setup()
    render(<GoalsPage />)

    await waitFor(() => expect(screen.getByText('Fundo de emergência')).toBeInTheDocument())
    await user.click(screen.getAllByLabelText(/^Editar /)[0])

    const dialog = screen.getByRole('dialog')
    const nameInput = within(dialog).getAllByRole('textbox')[0]
    await user.clear(nameInput)
    await user.type(nameInput, 'Fundo maior')
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }))

    await waitFor(() => expect(api.updateGoal).toHaveBeenCalledTimes(1))
    expect(api.updateGoal.mock.calls[0][1]).toMatchObject({ name: 'Fundo maior' })
  })

  it('eliminar um objetivo confirma e chama a API', async () => {
    api.getGoals.mockResolvedValueOnce([goal()]).mockResolvedValueOnce([])
    api.deleteGoal.mockResolvedValue({})
    const user = userEvent.setup()
    render(<GoalsPage />)

    await waitFor(() => expect(screen.getByText('Fundo de emergência')).toBeInTheDocument())
    await user.click(screen.getAllByLabelText(/^Eliminar /)[0])
    // ConfirmDialog (role alertdialog) — o botão de confirmar
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Eliminar' }))

    await waitFor(() => expect(api.deleteGoal).toHaveBeenCalledWith(1))
  })

  it('simular depósito mensal chama applyDeposits para objetivos', async () => {
    api.getGoals.mockResolvedValue([goal({ autoDeposit: true })])
    api.applyDeposits.mockResolvedValue({ applied: [{ name: 'Fundo de emergência' }], totalAmount: 100 })
    const user = userEvent.setup()
    render(<GoalsPage />)

    await waitFor(() => expect(screen.getByText('Fundo de emergência')).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: /Simular depósito mensal/ }))

    await waitFor(() => expect(api.applyDeposits).toHaveBeenCalledWith('goals'))
  })
})
