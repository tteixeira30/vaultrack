import { describe, expect, it } from 'vitest'
import { codeOf } from '../components/code'

describe('codeOf', () => {
  it('duas palavras dão a inicial de cada uma', () => {
    expect(codeOf('Trade Republic')).toBe('TR')
    expect(codeOf('Fundo de emergência')).toBe('FE') // "de" é curta e é ignorada
  })

  it('uma palavra dá as duas primeiras letras', () => {
    expect(codeOf('Santander')).toBe('SA')
    expect(codeOf('Revolut')).toBe('RE')
  })

  it('trata nomes curtos e vazios sem rebentar', () => {
    expect(codeOf('Ex')).toBe('EX')
    expect(codeOf('A')).toBe('A')
    expect(codeOf('')).toBe('??')
    expect(codeOf(null)).toBe('??')
  })

  it('mantém os acentos do PT-PT', () => {
    expect(codeOf('Água')).toBe('ÁG')
  })
})
