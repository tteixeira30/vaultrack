// Extração de movimentos de extratos bancários em PDF (pdf.js / pdfjs-dist).
// Reconstrói a tabela a partir das coordenadas dos itens de texto: agrupa itens
// por linha (Y), junta itens próximos na mesma célula (X) e alinha as células
// das linhas de dados às colunas do cabeçalho. Só funciona com PDFs com texto
// embebido — extratos digitalizados (imagem) precisariam de OCR.

import { findHeaderIndex } from './statementParser.js'

/**
 * Converte itens de texto do pdf.js para o formato interno, descartando texto
 * rodado (rodapés verticais nas margens, que de outra forma se colam às linhas
 * da tabela com o mesmo Y). `size` é a altura da letra, usada para distinguir
 * linhas distintas de linhas que são continuação da mesma (ver mergeWrappedLines).
 */
export const mapTextItems = (items) => items
  .filter((it) => Math.abs(it.transform[1]) < 0.001)
  .map((it) => ({
    str: it.str, x: it.transform[4], y: it.transform[5], width: it.width,
    size: it.height || Math.abs(it.transform[3]) || Math.abs(it.transform[0]),
  }))

/**
 * Agrupa itens de texto {str, x, y, width, size} numa lista de linhas, cada uma
 * com células {text, x, end, y, size, parts}. `parts` guarda os itens originais
 * que compõem a célula — permite voltar a separá-la se afinal pertencer a mais do
 * que uma coluna (ver linesToTable). Função pura (testável fora do browser).
 */
export function itemsToLines(items) {
  const clean = items.filter((it) => it.str && it.str.trim() !== '')
  clean.sort((a, b) => b.y - a.y || a.x - b.x)

  // agrupar por Y com tolerância (as baselines variam ligeiramente dentro da mesma linha)
  const lines = []
  for (const it of clean) {
    const line = lines.find((l) => Math.abs(l.y - it.y) <= 2.5)
    if (line) line.items.push(it)
    else lines.push({ y: it.y, items: [it] })
  }

  return lines.map((line) => {
    line.items.sort((a, b) => a.x - b.x)
    const cells = []
    let cur = null
    for (const it of line.items) {
      const part = { text: it.str.trim(), x: it.x, end: it.x + (it.width || 0) }
      const gap = cur ? it.x - cur.end : Infinity
      if (cur && gap <= 7) {
        cur.text += (gap > 1 ? ' ' : '') + it.str
        cur.end = Math.max(cur.end, part.end)
        if (part.text) cur.parts.push(part)
      } else {
        cur = { text: it.str, x: it.x, end: part.end, y: line.y, size: it.size, parts: part.text ? [part] : [] }
        cells.push(cur)
      }
    }
    return cells.map((c) => ({ ...c, text: c.text.trim() }))
  })
}

const lineY = (line) => Math.min(...line.map((c) => c.y))
const lineSize = (line) => Math.max(...line.map((c) => c.size || 0))

/** Sobreposição horizontal entre dois segmentos {x, end} (≤ 0 se não se tocarem). */
const overlap = (a, b) => Math.min(a.end, b.end) - Math.max(a.x, b.x)

/**
 * Junta linhas visuais que são continuação da mesma linha da tabela. Há extratos
 * (Trade Republic) em que as células têm várias linhas de texto: a data vem em
 * "17 Jul" + "2026", o tipo em "Card" + "Transaction" e até o cabeçalho parte
 * "MONEY OUT" em duas. Sem isto cada movimento aparece como 3 linhas soltas,
 * nenhuma delas com data e valor ao mesmo tempo.
 *
 * O critério é geométrico e não depende do banco: duas linhas de texto
 * independentes nunca ficam mais próximas do que a altura da letra, por isso um
 * espaçamento claramente menor do que isso só pode ser texto da mesma linha da
 * tabela. As células são reagrupadas por sobreposição horizontal — cada coluna
 * junta o seu próprio texto, pela ordem de cima para baixo.
 */
export function mergeWrappedLines(lines) {
  const out = []
  for (const line of lines) {
    if (line.length === 0) continue
    const prev = out[out.length - 1]
    const gap = prev ? lineY(prev) - lineY(line) : Infinity
    // gap ≤ 0 → página nova (o Y recomeça no topo); sem `size` não há critério → não junta
    if (!prev || gap <= 0 || !lineSize(prev) || !lineSize(line)
        || gap >= Math.max(lineSize(prev), lineSize(line)) * 0.8) {
      out.push(line.map((c) => ({ ...c })))
      continue
    }
    for (const cell of line) {
      let target = null, best = 0
      for (const c of prev) {
        const ov = overlap(c, cell)
        if (ov > best) { best = ov; target = c }
      }
      if (target) {
        target.text = `${target.text} ${cell.text}`.trim()
        target.x = Math.min(target.x, cell.x)
        target.end = Math.max(target.end, cell.end)
        target.y = Math.min(target.y, cell.y)
        target.parts = [...(target.parts || []), ...(cell.parts || [])]
      } else {
        prev.push({ ...cell })
      }
    }
    prev.sort((a, b) => a.x - b.x)
  }
  return out
}

/**
 * Converte linhas de células {text, x, end} em linhas de strings alinhadas às
 * colunas do cabeçalho da tabela (numa tabela PDF as células vazias não existem,
 * pelo que o alinhamento por índice falharia — usa-se a posição X).
 */
export function linesToTable(lines) {
  const headerIdx = findHeaderIndex(lines.map((l) => l.map((c) => c.text)))
  if (headerIdx === -1) return lines.map((l) => l.map((c) => c.text))

  const cols = lines[headerIdx].map((c) => ({ x: c.x, end: c.end, center: (c.x + c.end) / 2 }))
  const nearestCol = (cell) => {
    const center = (cell.x + cell.end) / 2
    let best = 0, bestDist = Infinity
    for (let k = 0; k < cols.length; k++) {
      // números costumam estar alinhados à direita e o cabeçalho à esquerda —
      // usa a menor das distâncias entre inícios, fins e centros
      const d = Math.min(
        Math.abs(center - cols[k].center),
        Math.abs(cell.x - cols[k].x),
        Math.abs(cell.end - cols[k].end),
      )
      if (d < bestDist) { bestDist = d; best = k }
    }
    return best
  }

  // coluna que mais se sobrepõe ao segmento, ou -1 se ele não tocar nenhuma
  const coveringCol = (seg) => {
    let best = -1, bestOv = 0
    for (let k = 0; k < cols.length; k++) {
      const ov = overlap(seg, cols[k])
      if (ov > bestOv) { bestOv = ov; best = k }
    }
    return best
  }

  /**
   * Reparte uma célula pelas colunas que ela cobre. Colunas estreitas e coladas
   * (as de valores) fazem com que dois números fiquem perto demais e sejam lidos
   * como uma só célula ("€10.54 €237.66"); quando os pedaços caem sobre colunas
   * diferentes, separa-os. Se nenhum pedaço assenta claramente numa coluna
   * (texto largo, como as descrições), a célula segue inteira para a coluna mais
   * próxima, como antes.
   */
  const splitCell = (cell) => {
    const parts = cell.parts && cell.parts.length > 1 ? cell.parts : null
    if (!parts) return [{ text: cell.text, k: nearestCol(cell) }]
    const partCol = parts.map(coveringCol)
    if (new Set(partCol.filter((k) => k !== -1)).size < 2) return [{ text: cell.text, k: nearestCol(cell) }]

    const groups = []
    parts.forEach((p, i) => {
      const last = groups[groups.length - 1]
      if (last && (partCol[i] === -1 || partCol[i] === last.k)) { last.parts.push(p) }
      else groups.push({ k: partCol[i], parts: [p] })
    })
    return groups.map((g) => ({
      text: g.parts.map((p) => p.text).join(' '),
      k: g.k !== -1 ? g.k : nearestCol({ x: g.parts[0].x, end: g.parts[g.parts.length - 1].end }),
    }))
  }

  const leftEdge = Math.min(...cols.map((c) => c.x))
  return lines.map((line, i) => {
    if (i === headerIdx) return cols.map((_, k) => lines[headerIdx][k].text)
    const row = new Array(cols.length).fill('')
    for (const cell of line) {
      // ignora texto fora da tabela, à esquerda da primeira coluna (rodapés verticais, símbolos soltos)
      if ((cell.x + cell.end) / 2 < leftEdge - 15) continue
      for (const { text, k } of splitCell(cell)) {
        row[k] = row[k] ? `${row[k]} ${text}` : text
      }
    }
    return row
  })
}

/**
 * Lê um PDF (ArrayBuffer) e devolve { rows, hasText } com as linhas de células
 * de todas as páginas, prontas para analyzeRows(). A biblioteca é carregada por
 * dynamic import para não pesar no bundle principal.
 */
export async function extractPdfRows(data) {
  const pdfjs = await import('pdfjs-dist')
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default

  const task = pdfjs.getDocument({ data })
  const lines = []
  let hasText = false
  try {
    const doc = await task.promise
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p)
      const content = await page.getTextContent()
      const items = mapTextItems(content.items)
      if (content.items.some((it) => it.str && it.str.trim() !== '')) hasText = true
      lines.push(...itemsToLines(items))
    }
  } finally {
    await task.destroy()
  }
  return { rows: linesToTable(mergeWrappedLines(lines)), hasText }
}
