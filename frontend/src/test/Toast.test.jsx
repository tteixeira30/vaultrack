import { describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ToastProvider, useToast } from '../components/Toast'

function Demo() {
  const toast = useToast()
  return (
    <div>
      <button onClick={() => toast.success('Guardado', 'Tudo certo.')}>ok</button>
      <button onClick={() => toast.error('Falhou', 'Algo correu mal.')}>erro</button>
    </div>
  )
}

describe('Toast', () => {
  it('mostra toasts de sucesso e erro com título e mensagem', async () => {
    const user = userEvent.setup()
    render(
      <ToastProvider>
        <Demo />
      </ToastProvider>,
    )

    await user.click(screen.getByRole('button', { name: 'ok' }))
    expect(screen.getByText('Guardado')).toBeInTheDocument()
    expect(screen.getByText('Tudo certo.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'erro' }))
    expect(screen.getByText('Falhou')).toBeInTheDocument()
  })

  it('o botão de fechar remove o toast', async () => {
    const user = userEvent.setup()
    render(
      <ToastProvider>
        <Demo />
      </ToastProvider>,
    )

    await user.click(screen.getByRole('button', { name: 'ok' }))
    await user.click(screen.getByRole('button', { name: 'Fechar' }))

    // a animação de saída demora 220ms
    await act(() => new Promise((r) => setTimeout(r, 300)))
    expect(screen.queryByText('Guardado')).not.toBeInTheDocument()
  })

  it('o temporizador pára enquanto o ponteiro está pousado no toast', () => {
    vi.useFakeTimers()
    try {
      render(
        <ToastProvider>
          <Demo />
        </ToastProvider>,
      )

      fireEvent.click(screen.getByRole('button', { name: 'ok' }))
      const toast = screen.getByText('Guardado').closest('.toast')

      // com o dedo/rato pousado, os 4,5s não correm
      fireEvent.pointerEnter(toast)
      act(() => { vi.advanceTimersByTime(6000) })
      expect(screen.getByText('Guardado')).toBeInTheDocument()

      // ao sair, a contagem retoma
      fireEvent.pointerLeave(toast)
      act(() => { vi.advanceTimersByTime(5000) })
      expect(screen.queryByText('Guardado')).not.toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('desaparece sozinho ao fim de ~4,5s', () => {
    // fireEvent (síncrono) em vez de userEvent — este último encrava com fake timers
    vi.useFakeTimers()
    try {
      render(
        <ToastProvider>
          <Demo />
        </ToastProvider>,
      )

      fireEvent.click(screen.getByRole('button', { name: 'ok' }))
      expect(screen.getByText('Guardado')).toBeInTheDocument()

      act(() => {
        vi.advanceTimersByTime(5000)
      })
      expect(screen.queryByText('Guardado')).not.toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })
})
