/**
 * Formatação monetária tal como a UI a apresenta (pt-PT: vírgula decimal, símbolo
 * no fim). O espaço antes do símbolo é NBSP, por isso os matchers usam `\s*`.
 */

/**
 * `eur(1500)` → /1\s?500,00\s*€/ — para usar em `toHaveText` / `toContainText`.
 *
 * A partir de 1000 o Intl separa os milhares com um espaço estreito não
 * separável (U+202F): 10000.5 sai como "10 000,50 €". Sem tolerar esse espaço,
 * qualquer asserção com valores de quatro dígitos ou mais nunca casava.
 */
export function eur(value: number): RegExp {
  const [int, dec] = Math.abs(value).toFixed(2).split('.')
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, '\\s?')
  return new RegExp(`${grouped},${dec}\\s*€`)
}
