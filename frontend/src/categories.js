// Categorias de movimentos — rótulos PT-PT e cores. Partilhado entre a página de
// Despesas e o painel para evitar duplicar a definição.
//
// As categorias por omissão são fixas (têm de acompanhar ExpenseController.DEFAULT_KEYS
// no backend). Além destas, cada utilizador pode criar categorias personalizadas: essas
// chegam do backend e são registadas em memória via setCustomCategories(), ficando
// disponíveis em catLabel/catColor tal como as por omissão.
//
// As cores são hex concretos, não `var(...)`: além de servirem para pintar
// pontos e barras em CSS, são lidas em JS para compor o tinte do quadrado de
// categoria — e uma custom property não se consegue misturar em JS.
export const DEFAULT_CATEGORY_META = {
  INCOME: { label: 'Rendimento', color: '#10b981' },
  GROCERIES: { label: 'Supermercado', color: '#f59e0b' },
  RESTAURANT: { label: 'Restauração', color: '#fb7185' },
  TRANSPORT: { label: 'Transportes', color: '#22d3ee' },
  HOUSING: { label: 'Casa & contas', color: '#a78bfa' },
  SUBSCRIPTION: { label: 'Subscrições', color: '#818cf8' },
  SHOPPING: { label: 'Compras', color: '#f472b6' },
  HEALTH: { label: 'Saúde', color: '#34d399' },
  LEISURE: { label: 'Lazer', color: '#fbbf24' },
  TRANSFER: { label: 'Transferências', color: '#94a3b8' },
  OTHER: { label: 'Outros', color: '#94a3b8' },
}

// Registo (mutável) das categorias personalizadas do utilizador: chave → { label, color }.
let customMeta = {}

/** Substitui o registo de categorias personalizadas (lista vinda de GET /expenses/categories). */
export function setCustomCategories(list) {
  const next = {}
  for (const c of list || []) next[c.key] = { label: c.label, color: c.color }
  customMeta = next
}

export const DEFAULT_CATEGORIES = Object.keys(DEFAULT_CATEGORY_META)

const meta = (c) => customMeta[c] || DEFAULT_CATEGORY_META[c] || DEFAULT_CATEGORY_META.OTHER
export const catLabel = (c) => meta(c).label
export const catColor = (c) => meta(c).color

/**
 * Fundo do quadrado de categoria: a cor da categoria a 15% de opacidade.
 *
 * Devolve sempre `rgba(...)` — os hex de 8 dígitos falhavam em silêncio quando
 * a cor não era hex, e o `color-mix` produz `color(srgb …)`, que nem todas as
 * ferramentas de auditoria sabem ler. O texto por cima é a cor de tinta
 * (`--text`), o que garante o contraste seja qual for a cor escolhida.
 */
export function catTint(c, opacity = 0.15) {
  const hex = catColor(c)
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim())
  if (!m) return 'transparent'
  const n = parseInt(m[1], 16)
  return `rgba(${n >> 16 & 255}, ${n >> 8 & 255}, ${n & 255}, ${opacity})`
}

/** Opções para os seletores de categoria: por omissão + personalizadas do utilizador. */
export function categoryOptions() {
  return [...DEFAULT_CATEGORIES, ...Object.keys(customMeta)].map((c) => ({ value: c, label: catLabel(c) }))
}
