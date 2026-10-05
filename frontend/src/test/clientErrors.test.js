import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api, clearToken, setToken } from '../api'
import { platform, reportError, resetClientErrors } from '../clientErrors'

describe('clientErrors', () => {
  let spy

  beforeEach(() => {
    resetClientErrors()
    setToken('t')
    spy = vi.spyOn(api, 'reportClientError').mockResolvedValue(null)
  })

  it('envia mensagem, stack, versão, plataforma e ecrã', () => {
    window.location.hash = '#goals'
    reportError(new TypeError('x is undefined'))
    expect(spy).toHaveBeenCalledOnce()
    expect(spy.mock.calls[0][0]).toMatchObject({ message: 'x is undefined', platform: 'web', screen: 'goals' })
    expect(spy.mock.calls[0][0].version).toBeTruthy()
  })

  it('não repete o mesmo erro e para ao fim de cinco', () => {
    reportError(new Error('a'))
    reportError(new Error('a'))
    for (let i = 0; i < 10; i++) reportError(new Error(`e${i}`))
    expect(spy).toHaveBeenCalledTimes(5)
  })

  it('ignora erros da API, chunks desatualizados e pedidos sem sessão', () => {
    reportError(Object.assign(new Error('Erro 500'), { status: 500 }))
    reportError(new TypeError('Failed to fetch dynamically imported module: /assets/pdf-abc.js'))
    clearToken()
    reportError(new Error('sem sessão'))
    expect(spy).not.toHaveBeenCalled()
  })

  it('uma falha a reportar não rebenta', () => {
    spy.mockRejectedValue(new Error('rede'))
    expect(() => reportError(new Error('b'))).not.toThrow()
  })

  it('deteta a app Android do Capacitor', () => {
    window.Capacitor = { isNativePlatform: () => true }
    expect(platform()).toBe('android')
    delete window.Capacitor
  })
})
