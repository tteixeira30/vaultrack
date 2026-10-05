import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ActivityCard from '../components/ActivityCard'
import { api } from '../api'

const ev = (over) => ({
  id: 1, occurredAt: '2026-10-05T14:32:00Z', userId: 7, actor: 'USER', kind: 'DATA',
  action: 'CREATED', entityType: 'GOAL', details: { label: 'Férias' }, ip: '203.0.113.9',
  userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/129.0 Safari/537.36', ...over,
})

describe('ActivityCard', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('mostra os eventos do próprio', async () => {
    vi.spyOn(api, 'getActivity').mockResolvedValue({
      events: [ev(), ev({ id: 2, kind: 'SECURITY', action: 'LOGIN_FAILED', entityType: null, details: null })],
      nextBefore: null,
    })
    render(<ActivityCard />)

    expect(await screen.findByText('Objetivo criado')).toBeInTheDocument()
    expect(screen.getByText('Férias')).toBeInTheDocument()
    expect(screen.getByText('Tentativa de entrada falhada')).toBeInTheDocument()
    expect(screen.getByText('Atenção')).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'De quem' })).not.toBeInTheDocument()
  })

  it('os filtros pedem o tipo certo', async () => {
    const spy = vi.spyOn(api, 'getActivity').mockResolvedValue({ events: [], nextBefore: null })
    const user = userEvent.setup()
    render(<ActivityCard />)
    expect(await screen.findByText('Sem atividade')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Segurança' }))
    await waitFor(() => expect(spy).toHaveBeenLastCalledWith(expect.objectContaining({ kind: 'security' })))
  })

  it('"Ver mais" segue o cursor e acrescenta à lista', async () => {
    const spy = vi.spyOn(api, 'getActivity')
      .mockResolvedValueOnce({ events: [ev({ id: 5 })], nextBefore: 5 })
      .mockResolvedValueOnce({ events: [ev({ id: 4, details: { label: 'Casa' } })], nextBefore: null })
    const user = userEvent.setup()
    render(<ActivityCard />)

    await user.click(await screen.findByRole('button', { name: 'Ver mais' }))
    expect(await screen.findByText('Casa')).toBeInTheDocument()
    expect(screen.getByText('Férias')).toBeInTheDocument()
    expect(spy).toHaveBeenLastCalledWith(expect.objectContaining({ before: 5 }))
    expect(screen.queryByRole('button', { name: 'Ver mais' })).not.toBeInTheDocument()
  })

  it('o admin vê todos e filtra por utilizador', async () => {
    vi.spyOn(api, 'getActivity').mockResolvedValue({ events: [], nextBefore: null })
    const admin = vi.spyOn(api, 'getAdminActivity').mockResolvedValue({
      events: [ev({ userName: 'Rui' })], nextBefore: null,
    })
    const user = userEvent.setup()
    render(<ActivityCard isAdmin />)

    await user.click(screen.getByRole('button', { name: 'Todos os utilizadores' }))
    await user.click(await screen.findByRole('button', { name: 'Ver só a atividade de Rui' }))
    await waitFor(() => expect(admin).toHaveBeenLastCalledWith(expect.objectContaining({ userId: 7 })))
    expect(screen.getByRole('button', { name: /Mostrar todos os utilizadores/ })).toBeInTheDocument()
  })

  it('um erro do pedido aparece como aviso', async () => {
    vi.spyOn(api, 'getActivity').mockRejectedValue(new Error('Erro interno. Tenta novamente. (ref. 1a2b3c4d)'))
    render(<ActivityCard />)
    expect(await screen.findByRole('alert')).toHaveTextContent('ref. 1a2b3c4d')
  })
})
