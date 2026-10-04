import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'
import { readPdfRows } from '../pdfStatement'
import { analyzeRows, analyzeStatement, buildTransactions, decodeStatementBytes } from '../statementParser'

/**
 * Extratos reais contra o parser. Os bancos mudam o layout sem aviso (o
 * Santander mudou-o em julho de 2026) e os testes com dados escritos à mão só
 * cobrem o layout conhecido quando foram escritos. Aqui o parser corre sobre
 * extratos verdadeiros e verifica invariantes que valem para qualquer extrato,
 * sem valores esperados escritos à mão.
 *
 * Os extratos têm dados pessoais e o repo é público, por isso ficam fora do git:
 * em `frontend/statements-corpus/<formato>/` (no .gitignore) ou na pasta indicada
 * em TRACKY_STATEMENTS_DIR, com uma subpasta por formato esperado (`santander`,
 * `revolut`, `traderepublic`, `generic`). Sem a pasta os testes ficam "skipped",
 * como no CI. Extrato novo de um banco? Junta-o à pasta e corre `npm run test:run`.
 */
const DIR = process.env.TRACKY_STATEMENTS_DIR || resolve(__dirname, '../../statements-corpus')

const cases = existsSync(DIR)
  ? readdirSync(DIR, { withFileTypes: true }).filter((d) => d.isDirectory()).flatMap((d) =>
    readdirSync(join(DIR, d.name)).filter((f) => /\.(pdf|csv)$/i.test(f))
      .map((file) => ({ format: d.name, file, path: join(DIR, d.name, file) })))
  : []

const isPdf = (path) => /\.pdf$/i.test(path)

async function analyze(path) {
  const bytes = readFileSync(path)
  if (!isPdf(path)) return { analysis: analyzeStatement(decodeStatementBytes(bytes)), hasText: true }

  // no browser o pdf.js usa o worker empacotado pelo Vite; em Node usa o build legacy
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(
    createRequire(__filename).resolve('pdfjs-dist/legacy/build/pdf.worker.mjs'),
  ).href
  const task = pdfjs.getDocument({ data: new Uint8Array(bytes) })
  try {
    const { rows, hasText } = await readPdfRows(await task.promise)
    return { analysis: analyzeRows(rows), hasText }
  } finally {
    await task.destroy()
  }
}

describe.skipIf(cases.length === 0)('extratos reais — invariantes do parser', () => {
  it.each(cases)('$format/$file', async ({ format, path }) => {
    const { analysis: a, hasText } = await analyze(path)
    expect(hasText, 'PDF sem texto embebido (digitalizado?)').toBe(true)
    expect(a.format, 'banco detetado').toBe(format)

    const { rows, ignored, closingBalance } = buildTransactions(
      a.dataRows, a.mapping, a.dateHint, a.openingBalance, a.statedClosingBalance,
    )
    expect(rows.length, 'movimentos lidos').toBeGreaterThan(0)
    // num CSV há linhas ignoradas legítimas (pendentes, noutra moeda); num PDF,
    // uma linha com data ou valor que não vira movimento é um movimento perdido
    if (isPdf(path)) expect(ignored, 'linhas com data ou valor descartadas').toBe(0)

    // datas sem ano resolvem-se pela data mais recente do documento: um ano mal
    // inferido (extratos de dezembro/janeiro) põe movimentos depois dela
    if (a.dateHint) {
      const late = rows.filter((t) => t.date > a.dateHint).map((t) => t.date)
      expect(late, 'movimentos depois da data mais recente do extrato').toEqual([])
    }

    // o banco declara os dois saldos: os movimentos lidos têm de os ligar ao cêntimo
    if (a.openingBalance != null && a.statedClosingBalance != null) {
      const net = rows.reduce((s, t) => s + (t.inflow ? t.amount : -t.amount), 0)
      expect(a.openingBalance + net, 'saldo inicial + movimentos = saldo final declarado')
        .toBeCloseTo(a.statedClosingBalance, 2)
    } else if (isPdf(path) && a.mapping.balance !== -1) {
      // sem saldos declarados, a prova é a coluna de saldo: o buildTransactions só
      // devolve o saldo de fecho se cada saldo = anterior + movimento
      expect(closingBalance, 'a coluna de saldo encadeia com os movimentos').not.toBeNull()
    }
  }, 30_000)
})
