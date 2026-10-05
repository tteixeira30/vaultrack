import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import ErrorBoundary from '../components/ErrorBoundary'
import * as clientErrors from '../clientErrors'

function Boom() {
  throw new Error('rebentou')
}

describe('ErrorBoundary', () => {
  it('mostra "Algo correu mal" e reporta o erro', () => {
    const spy = vi.spyOn(clientErrors, 'reportError').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    render(<ErrorBoundary><Boom /></ErrorBoundary>)

    expect(screen.getByRole('alert')).toHaveTextContent('Algo correu mal')
    expect(screen.getByRole('button', { name: 'Recarregar' })).toBeInTheDocument()
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ message: 'rebentou' }))
  })

  it('sem erro mostra os filhos', () => {
    render(<ErrorBoundary><p>tudo bem</p></ErrorBoundary>)
    expect(screen.getByText('tudo bem')).toBeInTheDocument()
  })
})
