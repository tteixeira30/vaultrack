import { describe, expect, it } from 'vitest'
import { parseAmount, setDisplayCurrency, toEur } from '../api'

/**
 * Os campos monetários são `type="text"` com `inputMode="decimal"` para o
 * teclado do telemóvel oferecer vírgula. Toda a leitura passa por aqui.
 */
describe('parseAmount', () => {
  it('lê a convenção portuguesa', () => {
    expect(parseAmount('1234,56')).toBe(1234.56)
    expect(parseAmount('0,5')).toBe(0.5)
    expect(parseAmount('-8,25')).toBe(-8.25)
  })

  it('lê a convenção inglesa', () => {
    expect(parseAmount('1234.56')).toBe(1234.56)
    expect(parseAmount('.5')).toBe(0.5)
  })

  it('com ponto e vírgula, o ponto é separador de milhares', () => {
    expect(parseAmount('1.234,56')).toBe(1234.56)
    expect(parseAmount('1.234.567,89')).toBe(1234567.89)
  })

  it('ignora espaços, incluindo o não separável do Intl', () => {
    expect(parseAmount(' 1 234,56 ')).toBe(1234.56)
    expect(parseAmount('1 234,56')).toBe(1234.56)
  })

  it('devolve números inalterados', () => {
    expect(parseAmount(12.5)).toBe(12.5)
    expect(parseAmount(0)).toBe(0)
  })

  it('devolve NaN para o que não dá para ler', () => {
    expect(parseAmount('')).toBeNaN()
    expect(parseAmount('   ')).toBeNaN()
    expect(parseAmount('abc')).toBeNaN()
    expect(parseAmount(null)).toBeNaN()
    expect(parseAmount(undefined)).toBeNaN()
    expect(parseAmount(NaN)).toBeNaN()
  })
})

describe('toEur com entrada escrita à mão', () => {
  it('aceita vírgula decimal', () => {
    setDisplayCurrency('EUR', 1)
    expect(toEur('1,5')).toBe(1.5)
  })

  it('converte da moeda base para EUR depois de ler a vírgula', () => {
    setDisplayCurrency('USD', 2) // 1 EUR = 2 USD
    expect(toEur('10,5')).toBe(5.25)
  })

  it('mantém o valor original quando não é um número', () => {
    setDisplayCurrency('EUR', 1)
    expect(toEur('')).toBe('')
  })
})
