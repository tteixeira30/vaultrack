import { randomUUID } from 'node:crypto'

/** Geradores de dados de teste — determinísticos no formato, únicos no valor. */

/**
 * Email único por teste. É o mecanismo de isolamento da suite: cada teste cria o
 * seu utilizador, por isso nunca toca em dados de outro teste nem em contas reais.
 *
 * Usa `randomUUID` em vez de `Math.random()`: com vários workers em paralelo a
 * registar ao mesmo tempo, elimina qualquer hipótese de colisão — e o valor chega
 * a um fluxo de autenticação, onde uma fonte previsível é sempre má ideia.
 */
export function uniqueEmail(): string {
  return `e2e-${randomUUID()}@test.pt`
}

/** Mês atual no formato AAAA-MM — igual ao mês por omissão das páginas mensais. */
export function currentYm(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

export interface CsvRow {
  /** Dia do mês (1-28, para não cair em meses curtos). */
  day: number
  description: string
  /** Negativo = saída, positivo = entrada. */
  amount: number
}

/**
 * Extrato CSV no formato genérico que o importador reconhece. As datas usam o mês
 * atual para os movimentos aparecerem sem ser preciso navegar no filtro de mês.
 */
export function buildCsv(rows: CsvRow[], ym = currentYm()): string {
  return [
    'Data,Descrição,Montante',
    ...rows.map((r) => `${ym}-${String(r.day).padStart(2, '0')},${r.description},${r.amount.toFixed(2)}`),
  ].join('\n')
}
