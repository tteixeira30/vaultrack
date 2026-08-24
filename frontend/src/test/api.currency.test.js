import { describe, expect, it } from 'vitest'
import {
  CURRENCY_SYMBOLS,
  fmtEur,
  fmtMoneyShort,
  fmtPct,
  fmtPercent,
  fromEur,
  getCurrencySymbol,
  getDisplayCurrency,
  setDisplayCurrency,
  toEur,
} from '../api'

// O Intl.NumberFormat pt-PT usa espaços não separáveis (U+00A0 / U+202F) —
// normalizamos para comparações legíveis.
const normalize = (s) => s.replace(/[\u00A0\u202F]/g, ' ')

describe('conversão de moeda', () => {
  it('com taxa 1 (EUR) os valores passam inalterados', () => {
    expect(toEur(100)).toBe(100)
    expect(fromEur(100)).toBe(100)
  })

  it('toEur converte da moeda base para EUR dividindo pela taxa', () => {
    setDisplayCurrency('USD', 1.25)
    expect(toEur(125)).toBe(100)
  })

  it('fromEur converte de EUR para a moeda base com arredondamento a 2 casas', () => {
    setDisplayCurrency('USD', 1.0937)
    expect(fromEur(100)).toBe(109.37)
    expect(fromEur(33.333)).toBe(36.46)
  })

  it('roundtrip toEur(fromEur(x)) devolve aproximadamente x', () => {
    setDisplayCurrency('GBP', 0.85)
    const eur = 250
    expect(toEur(fromEur(eur))).toBeCloseTo(eur, 2)
  })

  it('valores não numéricos passam inalterados', () => {
    expect(toEur('abc')).toBe('abc')
    expect(fromEur(undefined)).toBe(undefined)
  })

  it('taxa inválida ou não positiva cai para 1', () => {
    setDisplayCurrency('USD', 0)
    expect(toEur(100)).toBe(100)
    setDisplayCurrency('USD', -2)
    expect(toEur(100)).toBe(100)
    setDisplayCurrency('USD', 'não-é-número')
    expect(toEur(100)).toBe(100)
  })
})

describe('formatação', () => {
  it('fmtEur formata em EUR por omissão', () => {
    // nota: o pt-PT só agrupa milhares a partir de 5 dígitos (minimumGroupingDigits=2)
    expect(normalize(fmtEur(12345.5))).toBe('12 345,50 €')
    expect(normalize(fmtEur(1234.5))).toBe('1234,50 €')
  })

  it('fmtEur aplica a taxa e a moeda base ativa', () => {
    setDisplayCurrency('USD', 2)
    expect(normalize(fmtEur(100))).toContain('200,00')
    expect(fmtEur(100)).toContain('US$')
  })

  it('fmtEur devolve travessão para null/undefined', () => {
    expect(fmtEur(null)).toBe('—')
    expect(fmtEur(undefined)).toBe('—')
  })

  it('fmtMoneyShort não tem casas decimais e devolve vazio para null', () => {
    expect(normalize(fmtMoneyShort(12345.6))).toBe('12 346 €')
    expect(fmtMoneyShort(null)).toBe('')
  })

  it('fmtPercent usa vírgula decimal e não põe espaço antes do %', () => {
    expect(fmtPercent(30)).toBe('30%')
    expect(fmtPercent(12.5)).toBe('12,5%')
    expect(fmtPercent(33.333, 1)).toBe('33,3%')
    expect(fmtPercent(33.333, 0)).toBe('33%')
    expect(fmtPercent(40, 0)).toBe('40%')
    expect(fmtPercent(null)).toBe('—')
  })

  it('fmtPct prefixa o sinal e usa 2 casas com vírgula decimal', () => {
    expect(fmtPct(3.456)).toBe('+3,46%')
    expect(fmtPct(-1.5)).toBe('−1,50%')
    expect(fmtPct(0)).toBe('+0,00%')
    expect(fmtPct(null)).toBe('—')
  })

  it('getCurrencySymbol devolve o símbolo da moeda ativa', () => {
    expect(getCurrencySymbol()).toBe('€')
    setDisplayCurrency('GBP', 0.85)
    expect(getCurrencySymbol()).toBe('£')
    expect(getDisplayCurrency()).toBe('GBP')
    expect(CURRENCY_SYMBOLS.BRL).toBe('R$')
  })
})
