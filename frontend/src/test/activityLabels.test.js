import { describe, expect, it } from 'vitest'
import { actionLabel, device, fmtValue, isWarning, summary } from '../activityLabels'

describe('activityLabels', () => {
  it('ação × entidade dá o texto PT-PT com o género certo', () => {
    expect(actionLabel({ action: 'CREATED', entityType: 'GOAL' })).toBe('Objetivo criado')
    expect(actionLabel({ action: 'DELETED', entityType: 'ACCOUNT' })).toBe('Conta apagada')
    expect(actionLabel({ action: 'LOGIN_FAILED' })).toBe('Tentativa de entrada falhada')
    expect(actionLabel({ action: 'UPDATED', entityType: 'USER', details: { changes: { baseCurrency: ['EUR', 'USD'] } } }))
      .toBe('Moeda base alterada')
  })

  it('as alterações mostram campo, antes e depois, com dinheiro formatado', () => {
    const s = summary({
      action: 'UPDATED',
      details: { label: 'Férias', changes: { targetAmount: [1000, 1500] } },
    })
    expect(s).toMatch(/^Férias · Valor do objetivo: 1000,00\s€ → 1500,00\s€$/)
  })

  it('mais de duas alterações resumem-se com um contador', () => {
    const s = summary({
      action: 'UPDATED',
      details: { changes: { name: ['a', 'b'], autoDeposit: [false, true], contributionDay: [1, 5] } },
    })
    expect(s).toBe('Nome: a → b · Depósito automático: não → sim · +1')
  })

  it('importação e reforços mensais têm resumo próprio', () => {
    expect(summary({ action: 'IMPORTED', details: { label: 'CGD', imported: 12, skipped: 3 } }))
      .toBe('CGD · 12 importados, 3 já existiam')
    expect(summary({ action: 'CONTRIBUTIONS_APPLIED', details: { total: 100, items: [{}], forced: true } }))
      .toMatch(/em 1 reforço \(simulação\)$/)
  })

  it('valores vazios e booleanos', () => {
    expect(fmtValue('name', null)).toBe('—')
    expect(fmtValue('active', true)).toBe('sim')
  })

  it('tentativas falhadas e bloqueios são avisos', () => {
    expect(isWarning({ action: 'LOGIN_FAILED' })).toBe(true)
    expect(isWarning({ action: 'RATE_LIMITED' })).toBe(true)
    expect(isWarning({ action: 'LOGIN_SUCCEEDED' })).toBe(false)
  })

  it('o dispositivo resume o user agent', () => {
    const android = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36'
    const win = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36 Edg/129.0'
    expect(device({ actor: 'USER', userAgent: android })).toBe('Chrome · Android')
    expect(device({ actor: 'USER', userAgent: win })).toBe('Edge · Windows')
    expect(device({ actor: 'SYSTEM' })).toBe('Automático')
    expect(device({ actor: 'USER', userAgent: null })).toBeNull()
  })
})
