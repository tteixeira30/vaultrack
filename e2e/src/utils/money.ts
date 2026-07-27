/**
 * Formatação monetária tal como a UI a apresenta (pt-PT: vírgula decimal, símbolo
 * no fim). O espaço antes do símbolo é NBSP, por isso os matchers usam `\s*`.
 */

/** `eur(1500)` → /1500,00\s*€/ — para usar em `toHaveText` / `toContainText`. */
export function eur(value: number): RegExp {
  const [int, dec] = Math.abs(value).toFixed(2).split('.')
  return new RegExp(`${int},${dec}\\s*€`)
}
