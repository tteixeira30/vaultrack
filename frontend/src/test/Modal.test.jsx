import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Modal, { ConfirmDialog } from '../components/Modal'

describe('Modal', () => {
  it('não renderiza nada quando fechado', () => {
    const { container } = render(<Modal open={false} title="Olá" onClose={() => {}} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('mostra título, subtítulo, corpo e rodapé quando aberto', () => {
    render(
      <Modal open title="Novo objetivo" subtitle="Preenche os campos" footer={<button>Guardar</button>} onClose={() => {}}>
        <p>conteúdo</p>
      </Modal>,
    )
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('Novo objetivo')).toBeInTheDocument()
    expect(screen.getByText('Preenche os campos')).toBeInTheDocument()
    expect(screen.getByText('conteúdo')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeInTheDocument()
  })

  it('o botão de fechar chama onClose', async () => {
    const onClose = vi.fn()
    render(<Modal open title="X" onClose={onClose} />)
    await userEvent.click(screen.getByLabelText('Fechar'))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('a tecla Escape fecha o modal', () => {
    const onClose = vi.fn()
    render(<Modal open title="X" onClose={onClose} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('clicar no overlay (fora do conteúdo) fecha o modal', () => {
    const onClose = vi.fn()
    render(<Modal open title="X" onClose={onClose} />)
    const overlay = document.querySelector('.modal-overlay')
    fireEvent.mouseDown(overlay)
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('clicar dentro do conteúdo não fecha o modal', () => {
    const onClose = vi.fn()
    render(<Modal open title="X" onClose={onClose}><p>dentro</p></Modal>)
    fireEvent.mouseDown(screen.getByText('dentro'))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('o diálogo tem nome acessível vindo do título', () => {
    render(<Modal open title="Novo objetivo" onClose={() => {}} />)
    expect(screen.getByRole('dialog', { name: 'Novo objetivo' })).toBeInTheDocument()
  })

  it('bloqueia o scroll da página enquanto está aberto e repõe ao fechar', () => {
    const { rerender } = render(<Modal open title="X" onClose={() => {}} />)
    expect(document.body.style.position).toBe('fixed')

    rerender(<Modal open={false} title="X" onClose={() => {}} />)
    expect(document.body.style.position).toBe('')
  })

  it('leva o foco para dentro do diálogo ao abrir', () => {
    render(<Modal open title="X" onClose={() => {}}><button>primeiro</button></Modal>)
    expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true)
  })

  it('com alterações por guardar, fechar pede confirmação em vez de descartar', () => {
    const onClose = vi.fn()
    render(<Modal open title="X" onClose={onClose} dirty />)

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('alertdialog', { name: 'Descartar alterações?' })).toBeInTheDocument()
  })
})

describe('ConfirmDialog', () => {
  it('mostra a mensagem e o rótulo de confirmação personalizado', () => {
    render(
      <ConfirmDialog open title="Eliminar?" message="Esta ação é permanente." confirmLabel="Apagar"
                     onConfirm={() => {}} onCancel={() => {}} />,
    )
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    expect(screen.getByText('Esta ação é permanente.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Apagar' })).toBeInTheDocument()
  })

  it('confirmar e cancelar chamam os respetivos callbacks', async () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    render(<ConfirmDialog open title="T" message="M" onConfirm={onConfirm} onCancel={onCancel} />)
    await userEvent.click(screen.getByRole('button', { name: 'Eliminar' }))
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(onConfirm).toHaveBeenCalledOnce()
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it('quando busy os botões ficam desativados e mostra o estado de progresso', () => {
    render(<ConfirmDialog open title="T" message="M" busy onConfirm={() => {}} onCancel={() => {}} />)
    expect(screen.getByRole('button', { name: 'A eliminar…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled()
  })

  // antes não bloqueava de todo: a página fazia scroll por trás da confirmação
  it('bloqueia o scroll da página enquanto está aberto', () => {
    const { rerender } = render(
      <ConfirmDialog open title="T" message="M" onConfirm={() => {}} onCancel={() => {}} />,
    )
    expect(document.body.style.position).toBe('fixed')

    rerender(<ConfirmDialog open={false} title="T" message="M" onConfirm={() => {}} onCancel={() => {}} />)
    expect(document.body.style.position).toBe('')
  })
})
