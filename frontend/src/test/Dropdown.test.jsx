import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Dropdown from '../components/Dropdown'
import { setMediaQuery } from './setup'

const OPTIONS = [
  { value: 'EUR', label: 'Euro' },
  { value: 'USD', label: 'Dólar' },
  { value: 'GBP', label: 'Libra' },
]

describe('Dropdown', () => {
  it('mostra o rótulo da opção selecionada', () => {
    render(<Dropdown value="USD" onChange={() => {}} options={OPTIONS} />)
    expect(screen.getByRole('button', { name: /Dólar/ })).toBeInTheDocument()
  })

  it('mostra o placeholder quando não há valor', () => {
    render(<Dropdown value="" onChange={() => {}} options={OPTIONS} placeholder="Escolhe…" />)
    expect(screen.getByText('Escolhe…')).toBeInTheDocument()
  })

  it('abre a lista ao clicar e mostra as opções', async () => {
    render(<Dropdown value="EUR" onChange={() => {}} options={OPTIONS} />)
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Euro/ }))
    expect(screen.getByRole('listbox')).toBeInTheDocument()
    expect(screen.getAllByRole('option')).toHaveLength(3)
  })

  it('escolher uma opção chama onChange e fecha a lista', async () => {
    const onChange = vi.fn()
    render(<Dropdown value="EUR" onChange={onChange} options={OPTIONS} />)
    await userEvent.click(screen.getByRole('button', { name: /Euro/ }))
    await userEvent.click(screen.getByRole('option', { name: 'Libra' }))
    expect(onChange).toHaveBeenCalledWith('GBP')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('marca a opção ativa com aria-selected', async () => {
    render(<Dropdown value="USD" onChange={() => {}} options={OPTIONS} />)
    await userEvent.click(screen.getByRole('button', { name: /Dólar/ }))
    expect(screen.getByRole('option', { name: 'Dólar' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('option', { name: 'Euro' })).toHaveAttribute('aria-selected', 'false')
  })

  it('a tecla Escape fecha a lista', async () => {
    render(<Dropdown value="EUR" onChange={() => {}} options={OPTIONS} />)
    await userEvent.click(screen.getByRole('button', { name: /Euro/ }))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('clicar fora fecha a lista', async () => {
    render(
      <div>
        <Dropdown value="EUR" onChange={() => {}} options={OPTIONS} />
        <button>fora</button>
      </div>,
    )
    await userEvent.click(screen.getByRole('button', { name: /Euro/ }))
    expect(screen.getByRole('listbox')).toBeInTheDocument()
    fireEvent.mouseDown(screen.getByRole('button', { name: 'fora' }))
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  describe('em mobile', () => {
    beforeEach(() => setMediaQuery('(max-width: 900px)', true))

    it('abre como bottom sheet em vez de popover ancorado', async () => {
      render(<Dropdown value="EUR" onChange={() => {}} options={OPTIONS} label="Moeda" />)
      await userEvent.click(screen.getByRole('button', { name: 'Moeda' }))

      const sheet = screen.getByRole('dialog', { name: 'Moeda' })
      expect(within(sheet).getByRole('listbox')).toBeInTheDocument()
      expect(within(sheet).getAllByRole('option')).toHaveLength(3)
    })

    it('escolher uma opção na sheet chama onChange e fecha', async () => {
      const onChange = vi.fn()
      render(<Dropdown value="EUR" onChange={onChange} options={OPTIONS} label="Moeda" />)
      await userEvent.click(screen.getByRole('button', { name: 'Moeda' }))
      await userEvent.click(screen.getByRole('option', { name: 'Libra' }))

      expect(onChange).toHaveBeenCalledWith('GBP')
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('mantém a classe .dd-pop, de que depende o menu de perfil', async () => {
      render(<Dropdown value="EUR" onChange={() => {}} options={OPTIONS} label="Moeda" />)
      await userEvent.click(screen.getByRole('button', { name: 'Moeda' }))

      expect(document.querySelector('.dd-pop')).toBeInTheDocument()
    })
  })
})
