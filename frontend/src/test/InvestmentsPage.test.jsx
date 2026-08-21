import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import InvestmentsPage from '../pages/InvestmentsPage'
import { api } from '../api'

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    api: {
      getInvestments: vi.fn(), getPortfolioHistory: vi.fn(), getProjection: vi.fn(),
      refreshInvestments: vi.fn(), addInvestment: vi.fn(), updateInvestment: vi.fn(),
      deleteInvestment: vi.fn(), applyDeposits: vi.fn(),
    },
  }
})
vi.mock('../components/Toast', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }),
}))
vi.mock('../components/ThemeContext', () => ({ useChartColors: () => ({ grid: '#000', axis: '#111' }) }))

const portfolio = (over = {}) => ({
  summary: { totalInvested: 1000, totalCurrent: 1100, totalGain: 100, totalGainPercent: 10 },
  investments: [{
    id: 1, name: 'PPR Manual', symbol: null, type: 'OTHER', initialValue: 1000,
    currentValue: 1100, currentPrice: null, gain: 100, gainPercent: 10,
    live: false, monthlyContribution: null, contributionDay: null,
  }],
  ...over,
})

describe('InvestmentsPage', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    api.getPortfolioHistory.mockResolvedValue([])
    api.getProjection.mockResolvedValue(null)
  })

  it('mostra o esqueleto enquanto carrega', () => {
    api.getInvestments.mockReturnValue(new Promise(() => {}))
    const { container } = render(<InvestmentsPage />)
    expect(container.querySelector('.skeleton')).toBeInTheDocument()
  })

  it('mostra o resumo e a tabela de investimentos', async () => {
    api.getInvestments.mockResolvedValue(portfolio())
    render(<InvestmentsPage />)

    await waitFor(() => expect(screen.getByText('PPR Manual')).toBeInTheDocument())
    // investimento manual sem cotação → badge "manual" e tipo "Outro"
    const row = screen.getByText('PPR Manual').closest('.asset-row')
    expect(within(row).getByText('manual')).toBeInTheDocument()
    expect(within(row).getByText('Outro')).toBeInTheDocument()
  })

  it('adicionar um investimento manual chama a API', async () => {
    api.getInvestments.mockResolvedValue(portfolio({ investments: [] }))
    api.addInvestment.mockResolvedValue({ id: 2 })
    const user = userEvent.setup()
    render(<InvestmentsPage />)

    await waitFor(() => expect(screen.getByRole('button', { name: /Novo investimento/ })).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: /Novo investimento/ }))

    const dialog = screen.getByRole('dialog')
    await user.type(within(dialog).getByPlaceholderText('Ex: MSCI World'), 'Cripto Fria')
    // muda o tipo para "Outro" (dropdown) → investimento manual sem símbolo
    await user.click(dialog.querySelector('.dd-trigger'))
    await user.click(screen.getByRole('option', { name: 'Outro' }))
    await user.type(within(dialog).getByPlaceholderText('Ex: 1500'), '2000')
    await user.click(within(dialog).getByRole('button', { name: 'Adicionar' }))

    await waitFor(() => expect(api.addInvestment).toHaveBeenCalledTimes(1))
    expect(api.addInvestment.mock.calls[0][0]).toMatchObject({ name: 'Cripto Fria' })
  })

  it('editar um investimento envia as alterações', async () => {
    api.getInvestments.mockResolvedValue(portfolio())
    api.updateInvestment.mockResolvedValue({})
    const user = userEvent.setup()
    render(<InvestmentsPage />)

    await waitFor(() => expect(screen.getByText('PPR Manual')).toBeInTheDocument())
    await user.click(screen.getAllByLabelText(/^Editar /)[0])

    const dialog = screen.getByRole('dialog')
    const nameInput = within(dialog).getAllByRole('textbox')[0]
    await user.clear(nameInput)
    await user.type(nameInput, 'PPR Renomeado')
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }))

    await waitFor(() => expect(api.updateInvestment).toHaveBeenCalledTimes(1))
    expect(api.updateInvestment.mock.calls[0][1]).toMatchObject({ name: 'PPR Renomeado' })
  })

  it('eliminar um investimento confirma e chama a API', async () => {
    api.getInvestments.mockResolvedValue(portfolio())
    api.deleteInvestment.mockResolvedValue({})
    const user = userEvent.setup()
    render(<InvestmentsPage />)

    await waitFor(() => expect(screen.getByText('PPR Manual')).toBeInTheDocument())
    await user.click(screen.getAllByLabelText(/^Eliminar /)[0])
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Eliminar' }))

    await waitFor(() => expect(api.deleteInvestment).toHaveBeenCalledWith(1))
  })

  it('atualizar cotações chama refreshInvestments', async () => {
    api.getInvestments.mockResolvedValue(portfolio())
    api.refreshInvestments.mockResolvedValue(portfolio())
    const user = userEvent.setup()
    render(<InvestmentsPage />)

    await waitFor(() => expect(screen.getByText('PPR Manual')).toBeInTheDocument())
    await user.click(screen.getByLabelText('Atualizar cotações'))

    await waitFor(() => expect(api.refreshInvestments).toHaveBeenCalled())
  })

  it('simular reforço mensal chama applyDeposits para investimentos', async () => {
    api.getInvestments.mockResolvedValue(portfolio())
    api.applyDeposits.mockResolvedValue({ applied: [], totalAmount: 0 })
    const user = userEvent.setup()
    render(<InvestmentsPage />)

    await waitFor(() => expect(screen.getByText('PPR Manual')).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: /Simular reforço mensal/ }))

    await waitFor(() => expect(api.applyDeposits).toHaveBeenCalledWith('investments'))
  })
})
