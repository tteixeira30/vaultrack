/**
 * Código mono de duas letras — o quadradinho que o design usa como ícone de
 * conta, objetivo, categoria e conquista.
 *
 * Duas palavras dão a inicial de cada uma ("Trade Republic" → "TR"); uma só
 * palavra dá as duas primeiras letras ("Santander" → "SA"). Palavras curtas
 * ("de", "ao") são ignoradas para não roubarem o lugar às que importam.
 */
export function codeOf(name) {
  const raw = String(name ?? '').trim()
  if (!raw) return '??'

  const words = raw.split(/\s+/)
  const meaningful = words.filter((w) => w.length > 2)
  const picked = meaningful.length >= 2 ? meaningful.slice(0, 2) : words

  const code = picked.length >= 2
    ? picked.slice(0, 2).map((w) => w[0]).join('')
    : picked[0].slice(0, 2)

  return code.toUpperCase()
}
