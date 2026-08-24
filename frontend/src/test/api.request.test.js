import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api, getToken, setOnUnauthorized, setToken } from '../api'

const jsonResponse = (status, body) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }))

describe('cliente HTTP central', () => {
  beforeEach(() => {
    global.fetch = vi.fn()
  })

  it('anexa o Bearer token quando existe sessão', async () => {
    setToken('o-meu-token')
    fetch.mockReturnValue(jsonResponse(200, []))

    await api.getGoals()

    const [url, options] = fetch.mock.calls[0]
    expect(url).toBe('/api/goals')
    expect(options.headers.Authorization).toBe('Bearer o-meu-token')
  })

  it('não anexa Authorization sem token', async () => {
    fetch.mockReturnValue(jsonResponse(200, []))

    await api.getGoals()

    const [, options] = fetch.mock.calls[0]
    expect(options.headers.Authorization).toBeUndefined()
  })

  it('401 fora de /auth limpa o token e dispara onUnauthorized', async () => {
    setToken('expirado')
    const onUnauthorized = vi.fn()
    setOnUnauthorized(onUnauthorized)
    fetch.mockReturnValue(jsonResponse(401, { message: 'unauthorized' }))

    await expect(api.getGoals()).rejects.toThrow('Sessão expirada')
    expect(getToken()).toBeNull()
    expect(onUnauthorized).toHaveBeenCalledOnce()

    setOnUnauthorized(null)
  })

  it('401 no login NÃO limpa sessão nem dispara onUnauthorized — mostra a mensagem do backend', async () => {
    const onUnauthorized = vi.fn()
    setOnUnauthorized(onUnauthorized)
    fetch.mockReturnValue(jsonResponse(401, { message: 'Email ou palavra-passe incorretos.' }))

    await expect(api.login({ email: 'a@b.pt', password: 'x' }))
      .rejects.toThrow('Email ou palavra-passe incorretos.')
    expect(onUnauthorized).not.toHaveBeenCalled()

    setOnUnauthorized(null)
  })

  it('erros não-OK usam a mensagem JSON do backend quando existe', async () => {
    fetch.mockReturnValue(jsonResponse(400, { message: 'Mês inválido — usa o formato AAAA-MM.' }))

    await expect(api.getIncome('2020-13')).rejects.toThrow('Mês inválido')
  })

  it('erros não-OK sem corpo JSON caem para "Erro <status>"', async () => {
    fetch.mockReturnValue(Promise.resolve(new Response('', { status: 500 })))

    await expect(api.getDashboard()).rejects.toThrow('Erro 500')
  })

  // Quem apanha o erro precisa de distinguir "o token não presta" (401) de
  // "não se chegou ao servidor" (502): só o primeiro termina a sessão.
  it('os erros levam o código HTTP anexado', async () => {
    fetch.mockReturnValue(Promise.resolve(new Response('', { status: 502 })))
    await expect(api.getDashboard()).rejects.toMatchObject({ status: 502 })

    fetch.mockReturnValue(Promise.resolve(new Response('', { status: 401 })))
    await expect(api.getDashboard()).rejects.toMatchObject({ status: 401 })
  })

  it('respostas vazias devolvem null', async () => {
    fetch.mockReturnValue(Promise.resolve(new Response('', { status: 200 })))

    await expect(api.deleteGoal(1)).resolves.toBeNull()
  })

  it('métodos de escrita enviam método e corpo corretos', async () => {
    fetch.mockReturnValue(jsonResponse(200, {}))

    await api.addGoal({ name: 'Férias', targetAmount: 1000, monthlyAllocation: 100 })

    const [url, options] = fetch.mock.calls[0]
    expect(url).toBe('/api/goals')
    expect(options.method).toBe('POST')
    expect(JSON.parse(options.body).name).toBe('Férias')
  })
})
