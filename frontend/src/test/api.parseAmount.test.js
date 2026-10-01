import { describe, expect, it } from 'vitest'
import { parseAmount, setDisplayCurrency, toEur, toInput } from '../api'

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

  it('aceita o menos tipográfico (U+2212) copiado da interface', () => {
    expect(parseAmount('−3,20')).toBe(-3.2)
    expect(parseAmount('−1.500')).toBe(-1500)
  })

  it('lê a convenção inglesa', () => {
    expect(parseAmount('1234.56')).toBe(1234.56)
    expect(parseAmount('.5')).toBe(0.5)
  })

  it('com ponto e vírgula, o ponto é separador de milhares', () => {
    expect(parseAmount('1.234,56')).toBe(1234.56)
    expect(parseAmount('1.234.567,89')).toBe(1234567.89)
  })

  it('ponto sozinho em grupos de três dígitos é separador de milhares', () => {
    expect(parseAmount('1.000')).toBe(1000)
    expect(parseAmount('1.234')).toBe(1234)
    expect(parseAmount('12.345.678')).toBe(12345678)
    expect(parseAmount('-1.500')).toBe(-1500)
    expect(parseAmount('+2.000')).toBe(2000)
  })

  it('ponto sozinho que não é milhares continua decimal', () => {
    expect(parseAmount('1.5')).toBe(1.5)
    expect(parseAmount('1.50')).toBe(1.5)
    expect(parseAmount('0.5')).toBe(0.5)
    expect(parseAmount('1234.567')).toBe(1234.567)
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

describe('toInput', () => {
  it('escreve a vírgula decimal, que o parseAmount lê de volta sem a confundir com milhares', () => {
    expect(toInput(1.125)).toBe('1,125')
    expect(parseAmount(toInput(1.125))).toBe(1.125)
    expect(parseAmount(toInput(108.125))).toBe(108.125)
    expect(toInput(1500)).toBe('1500')
    expect(toInput(-12.5)).toBe('-12,5')
  })

  it('vazio quando não há número', () => {
    expect(toInput(null)).toBe('')
    expect(toInput(undefined)).toBe('')
    expect(toInput('')).toBe('')
    expect(toInput('abc')).toBe('')
  })
})

describe('parseAmount — zero à esquerda não é milhares', () => {
  it('"0.125" continua decimal', () => {
    expect(parseAmount('0.125')).toBe(0.125)
  })
})
