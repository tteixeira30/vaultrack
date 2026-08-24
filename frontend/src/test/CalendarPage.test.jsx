import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CalendarPage from '../pages/CalendarPage'
import { api } from '../api'

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    api: {
      getCalendar: vi.fn(), getUpcoming: vi.fn(), addCalendarEvent: vi.fn(),
      updateCalendarEvent: vi.fn(), deleteCalendarEvent: vi.fn(),
    },
  }
})
vi.mock('../components/Toast', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }),
}))

const monthData = (over = {}) => ({
  month: '2025-06',
  events: [{
    id: 1, name: 'Renda', category: 'BILL', inflow: false, amount: 800,
    frequency: 'MONTHLY', dayOfMonth: 1, eventDate: null, active: true,
  }],
  occurrences: [], inflows: 0, outflows: 800, net: -800, ...over,
})
const forecast = { startingBalance: 1000, hasBalance: true, days: 60, points: [], endBalance: 200 }

describe('CalendarPage', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    api.getUpcoming.mockResolvedValue(forecast)
  })

  it('mostra o esqueleto enquanto carrega', () => {
    api.getCalendar.mockReturnValue(new Promise(() => {}))
    const { container } = render(<CalendarPage />)
    expect(container.querySelector('.skeleton')).toBeInTheDocument()
  })

  it('mostra os eventos e os totais do mês', async () => {
    api.getCalendar.mockResolvedValue(monthData())
    render(<CalendarPage />)

    await waitFor(() => expect(screen.getByText('Renda')).toBeInTheDocument())
    expect(screen.getByText(/todo dia 1/)).toBeInTheDocument()
  })

  it('criar um evento mensal chama a API com o payload certo', async () => {
    api.getCalendar.mockResolvedValue(monthData({ events: [] }))
    api.addCalendarEvent.mockResolvedValue({})
    const user = userEvent.setup()
    render(<CalendarPage />)

    await waitFor(() => expect(screen.getByRole('button', { name: /Novo evento/ })).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: /Novo evento/ }))

    const dialog = screen.getByRole('dialog')
    await user.type(within(dialog).getByPlaceholderText('Ex: Salário, Renda, Netflix'), 'Luz')
    await user.type(within(dialog).getByPlaceholderText('0'), '60')
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }))

    await waitFor(() => expect(api.addCalendarEvent).toHaveBeenCalledTimes(1))
    expect(api.addCalendarEvent.mock.calls[0][0]).toMatchObject({ name: 'Luz', amount: 60 })
  })

  it('editar um evento envia as alterações', async () => {
    api.getCalendar.mockResolvedValue(monthData())
    api.updateCalendarEvent.mockResolvedValue({})
    const user = userEvent.setup()
    render(<CalendarPage />)

    await waitFor(() => expect(screen.getByText('Renda')).toBeInTheDocument())
    await user.click(screen.getAllByLabelText(/^Editar /)[0])

    const dialog = screen.getByRole('dialog')
    const nameInput = within(dialog).getByPlaceholderText('Ex: Salário, Renda, Netflix')
    await user.clear(nameInput)
    await user.type(nameInput, 'Renda nova')
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }))

    await waitFor(() => expect(api.updateCalendarEvent).toHaveBeenCalledTimes(1))
    expect(api.updateCalendarEvent.mock.calls[0][1]).toMatchObject({ name: 'Renda nova' })
  })

  it('eliminar um evento confirma e chama a API', async () => {
    api.getCalendar.mockResolvedValue(monthData())
    api.deleteCalendarEvent.mockResolvedValue({})
    const user = userEvent.setup()
    render(<CalendarPage />)

    await waitFor(() => expect(screen.getByText('Renda')).toBeInTheDocument())
    await user.click(screen.getAllByLabelText(/^Eliminar /)[0])
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Eliminar' }))

    await waitFor(() => expect(api.deleteCalendarEvent).toHaveBeenCalledWith(1))
  })

  // O backend já excluía os eventos inativos das ocorrências; faltava a UI
  // deixar pausar um sem ter de o eliminar e recriar.
  it('pausar um evento reenvia-o com active: false', async () => {
    api.getCalendar.mockResolvedValue(monthData())
    api.updateCalendarEvent.mockResolvedValue({})
    const user = userEvent.setup()
    render(<CalendarPage />)

    await waitFor(() => expect(screen.getByText('Renda')).toBeInTheDocument())
    await user.click(screen.getByLabelText('Pausar Renda'))

    await waitFor(() => expect(api.updateCalendarEvent).toHaveBeenCalledWith(1,
      expect.objectContaining({ name: 'Renda', amount: 800, active: false })))
  })

  it('um evento pausado aparece assinalado e retoma-se pelo mesmo botão', async () => {
    api.getCalendar.mockResolvedValue(monthData({
      events: [{
        id: 1, name: 'Ginásio', category: 'SUBSCRIPTION', inflow: false, amount: 40,
        frequency: 'MONTHLY', dayOfMonth: 5, eventDate: null, active: false,
      }],
    }))
    api.updateCalendarEvent.mockResolvedValue({})
    const user = userEvent.setup()
    render(<CalendarPage />)

    await waitFor(() => expect(screen.getByText('Ginásio')).toBeInTheDocument())
    expect(screen.getByText('pausado')).toBeInTheDocument()

    await user.click(screen.getByLabelText('Retomar Ginásio'))
    await waitFor(() => expect(api.updateCalendarEvent).toHaveBeenCalledWith(1,
      expect.objectContaining({ active: true })))
  })
})
