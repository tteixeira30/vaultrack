import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import DatePicker from '../components/DatePicker'
import { setMediaQuery } from './setup'

// "Hoje" depende da data real do sistema; calculamos o valor esperado com a
// mesma lógica do componente para o teste ser determinístico em qualquer dia.
const pad = (n) => String(n).padStart(2, '0')
const todayIso = () => {
  const t = new Date()
  return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`
}

describe('DatePicker', () => {
  it('mostra o placeholder quando não há valor', () => {
    render(<DatePicker value="" onChange={() => {}} placeholder="Escolhe a data" />)
    expect(screen.getByText('Escolhe a data')).toBeInTheDocument()
  })

  it('mostra a data selecionada no formato dd/mm/aaaa', () => {
    render(<DatePicker value="2025-03-08" onChange={() => {}} />)
    expect(screen.getByText('08/03/2025')).toBeInTheDocument()
  })

  it('abre o calendário e mostra o mês do valor atual', async () => {
    const user = userEvent.setup()
    render(<DatePicker value="2025-06-15" onChange={() => {}} />)
    await user.click(screen.getByRole('button', { name: '15/06/2025' }))
    expect(screen.getByText('Junho de 2025')).toBeInTheDocument()
  })

  it('escolher um dia chama onChange com a data ISO', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<DatePicker value="2025-06-01" onChange={onChange} />)
    await user.click(screen.getByRole('button', { name: '01/06/2025' }))
    await user.click(screen.getByRole('button', { name: '20' }))
    expect(onChange).toHaveBeenCalledWith('2025-06-20')
  })

  it('navega para o mês anterior e seguinte', async () => {
    const user = userEvent.setup()
    render(<DatePicker value="2025-06-15" onChange={() => {}} />)
    await user.click(screen.getByRole('button', { name: '15/06/2025' }))
    await user.click(screen.getByLabelText('Mês anterior'))
    expect(screen.getByText('Maio de 2025')).toBeInTheDocument()
    await user.click(screen.getByLabelText('Mês seguinte'))
    await user.click(screen.getByLabelText('Mês seguinte'))
    expect(screen.getByText('Julho de 2025')).toBeInTheDocument()
  })

  it('o botão Limpar envia string vazia', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<DatePicker value="2025-06-10" onChange={onChange} />)
    await user.click(screen.getByRole('button', { name: '10/06/2025' }))
    await user.click(screen.getByRole('button', { name: 'Limpar' }))
    expect(onChange).toHaveBeenCalledWith('')
  })

  it('o botão Hoje envia a data de hoje', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<DatePicker value="2025-06-10" onChange={onChange} />)
    await user.click(screen.getByRole('button', { name: '10/06/2025' }))
    await user.click(screen.getByRole('button', { name: 'Hoje' }))
    expect(onChange).toHaveBeenCalledWith(todayIso())
  })

  describe('em mobile', () => {
    beforeEach(() => setMediaQuery('(max-width: 900px)', true))

    it('abre como bottom sheet em vez de popover ancorado', async () => {
      const user = userEvent.setup()
      render(<DatePicker value="2025-06-15" onChange={() => {}} placeholder="Data do evento" />)
      await user.click(screen.getByRole('button', { name: '15/06/2025' }))

      const sheet = screen.getByRole('dialog', { name: 'Data do evento' })
      expect(within(sheet).getByText('Junho de 2025')).toBeInTheDocument()
    })

    it('escolher um dia na sheet chama onChange e fecha', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()
      render(<DatePicker value="2025-06-01" onChange={onChange} />)
      await user.click(screen.getByRole('button', { name: '01/06/2025' }))
      await user.click(screen.getByRole('button', { name: '20' }))

      expect(onChange).toHaveBeenCalledWith('2025-06-20')
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })
})
