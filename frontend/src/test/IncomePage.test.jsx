import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import IncomePage from '../pages/IncomePage'
import { api } from '../api'

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    api: {
      getIncome: vi.fn(), setIncome: vi.fn(), addAllocation: vi.fn(),
      updateAllocation: vi.fn(), deleteAllocation: vi.fn(),
      addAllocationItem: vi.fn(), updateAllocationItem: vi.fn(), deleteAllocationItem: vi.fn(),
    },
  }
})
vi.mock('../components/Toast', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }),
}))

const income = (over = {}) => ({
  month: '2025-06', current: true, monthlyIncome: 2000,
  allocations: [{
    id: 1, name: 'Poupança', percentage: 20, fixedAmount: null, amount: 400,
    effectivePercentage: 20, items: [], itemsTotal: 0, color: '#33aaff',
  }],
  totalAllocated: 400, totalPercentage: 20, unallocated: 1600, availableMonths: ['2025-06'],
  copiedFrom: null, ...over,
})

describe('IncomePage', () => {
  beforeEach(() => vi.resetAllMocks())

  it('mostra o esqueleto enquanto carrega', () => {
    api.getIncome.mockReturnValue(new Promise(() => {}))
    const { container } = render(<IncomePage />)
    expect(container.querySelector('.skeleton')).toBeInTheDocument()
  })

  it('mostra o rendimento e as categorias', async () => {
    api.getIncome.mockResolvedValue(income())
    render(<IncomePage />)

    await waitFor(() => expect(screen.getAllByText('Poupança').length).toBeGreaterThan(0))
    expect(screen.getAllByText(/2000,00/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/20%/).length).toBeGreaterThan(0)
  })

  it('estado vazio permite criar a primeira categoria', async () => {
    api.getIncome.mockResolvedValue(income({ allocations: [], totalAllocated: 0, unallocated: 2000 }))
    render(<IncomePage />)

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Criar categoria/ })).toBeInTheDocument())
  })

  it('adicionar categoria por percentagem chama a API', async () => {
    api.getIncome.mockResolvedValue(income({ allocations: [], totalAllocated: 0, unallocated: 2000 }))
    api.addAllocation.mockResolvedValue(income())
    const user = userEvent.setup()
    render(<IncomePage />)

    await waitFor(() => expect(screen.getByRole('button', { name: /Criar categoria/ })).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: /Criar categoria/ }))

    const dialog = screen.getByRole('dialog')
    await user.type(within(dialog).getByPlaceholderText('Ex: Poupança, Renda…'), 'Renda')
    await user.type(within(dialog).getByPlaceholderText('Ex: 30'), '25')
    await user.click(within(dialog).getByRole('button', { name: 'Adicionar' }))

    await waitFor(() => expect(api.addAllocation).toHaveBeenCalledTimes(1))
    expect(api.addAllocation.mock.calls[0][0]).toMatchObject({ name: 'Renda', percentage: 25 })
  })

  it('editar o rendimento mensal chama setIncome', async () => {
    api.getIncome.mockResolvedValue(income())
    api.setIncome.mockResolvedValue(income({ monthlyIncome: 2500 }))
    const user = userEvent.setup()
    render(<IncomePage />)

    await waitFor(() => expect(screen.getAllByText('Poupança').length).toBeGreaterThan(0))
    await user.click(screen.getByRole('button', { name: 'Editar' }))

    const dialog = screen.getByRole('dialog')
    // textbox, não spinbutton: os campos monetários são type=text com
    // inputMode=decimal, para aceitarem a vírgula decimal do PT-PT
    const input = within(dialog).getByRole('textbox', { name: 'Rendimento do mês' })
    await user.clear(input)
    await user.type(input, '2500')
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }))

    await waitFor(() => expect(api.setIncome).toHaveBeenCalledWith(2500, '2025-06'))
  })

  it('aceita a vírgula decimal do PT-PT no rendimento', async () => {
    api.getIncome.mockResolvedValue(income())
    api.setIncome.mockResolvedValue(income({ monthlyIncome: 2500.5 }))
    const user = userEvent.setup()
    render(<IncomePage />)

    await waitFor(() => expect(screen.getAllByText('Poupança').length).toBeGreaterThan(0))
    await user.click(screen.getByRole('button', { name: 'Editar' }))

    const dialog = screen.getByRole('dialog')
    const input = within(dialog).getByRole('textbox', { name: 'Rendimento do mês' })
    await user.clear(input)
    await user.type(input, '2500,50')
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }))

    // com type=number isto chegava como NaN e o valor perdia-se
    await waitFor(() => expect(api.setIncome).toHaveBeenCalledWith(2500.5, '2025-06'))
  })

  it('eliminar uma categoria confirma e chama a API', async () => {
    api.getIncome.mockResolvedValue(income())
    api.deleteAllocation.mockResolvedValue(income({ allocations: [] }))
    const user = userEvent.setup()
    render(<IncomePage />)

    await waitFor(() => expect(screen.getAllByText('Poupança').length).toBeGreaterThan(0))
    await user.click(screen.getByLabelText('Remover Poupança'))
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Remover' }))

    await waitFor(() => expect(api.deleteAllocation).toHaveBeenCalledWith(1))
  })

  const withItems = () => income({
    allocations: [{
      id: 1, name: 'Subscrições', percentage: 20, fixedAmount: null, amount: 400,
      effectivePercentage: 20, color: '#33aaff',
      items: [{ id: 9, name: 'Netflix', amount: 12 }], itemsTotal: 12,
    }],
  })

  it('expandir a categoria e adicionar um item chama a API', async () => {
    api.getIncome.mockResolvedValue(withItems())
    api.addAllocationItem.mockResolvedValue(withItems())
    const user = userEvent.setup()
    render(<IncomePage />)

    await waitFor(() => expect(screen.getAllByText('Subscrições').length).toBeGreaterThan(0))
    await user.click(screen.getByLabelText('Ver detalhe'))
    expect(screen.getByText('Netflix')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Item/ }))
    const dialog = screen.getByRole('dialog')
    await user.type(within(dialog).getByPlaceholderText('Ex: Netflix, Claude, HBO…'), 'Spotify')
    await user.type(within(dialog).getByPlaceholderText('Ex: 12'), '10')
    await user.click(within(dialog).getByRole('button', { name: 'Adicionar' }))

    await waitFor(() => expect(api.addAllocationItem).toHaveBeenCalledTimes(1))
    expect(api.addAllocationItem).toHaveBeenCalledWith(1, expect.objectContaining({ name: 'Spotify', amount: 10 }))
  })

  it('permite recuar até 3 meses antes do atual para introduzir rendimento', async () => {
    // helpers alinhados com a lógica da página (aritmética sobre AAAA-MM)
    const ym = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const shift = (delta) => { const n = new Date(); return ym(new Date(n.getFullYear(), n.getMonth() + delta, 1)) }
    const cur = shift(0)
    // a API devolve sempre o mês pedido (mês novo → vazio), só o atual está em availableMonths
    api.getIncome.mockImplementation((m) => Promise.resolve(
      income({ month: m || cur, current: (m || cur) === cur, monthlyIncome: 0, allocations: [],
               totalAllocated: 0, unallocated: 0, availableMonths: [cur] })))
    const user = userEvent.setup()
    render(<IncomePage />)

    // no mês atual: "seguinte" desativado, "anterior" ativo (aponta ao mês anterior)
    await waitFor(() => expect(screen.getByText('atual')).toBeInTheDocument())
    expect(screen.getByLabelText('Mês seguinte')).toBeDisabled()
    expect(screen.getByLabelText('Mês anterior')).toBeEnabled()

    // recua 3 meses, um a um
    for (let i = 1; i <= 3; i++) {
      await user.click(screen.getByLabelText('Mês anterior'))
      await waitFor(() => expect(api.getIncome).toHaveBeenCalledWith(shift(-i)))
    }

    // no limite (atual − 3): "anterior" desativado com a dica do limite
    await waitFor(() => {
      const prev = screen.getByLabelText('Mês anterior')
      expect(prev).toBeDisabled()
      expect(prev).toHaveAttribute('title', 'Só podes recuar até 3 meses atrás')
    })
  })

  it('eliminar um item confirma e chama a API', async () => {
    api.getIncome.mockResolvedValue(withItems())
    api.deleteAllocationItem.mockResolvedValue(withItems())
    const user = userEvent.setup()
    render(<IncomePage />)

    await waitFor(() => expect(screen.getAllByText('Subscrições').length).toBeGreaterThan(0))
    await user.click(screen.getByLabelText('Ver detalhe'))
    await user.click(screen.getByLabelText('Remover Netflix'))
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Remover' }))

    await waitFor(() => expect(api.deleteAllocationItem).toHaveBeenCalledWith(9))
  })
})
