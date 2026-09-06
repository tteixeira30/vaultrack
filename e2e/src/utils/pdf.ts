import { currentYm } from './data'

/**
 * Gerador de extratos bancários em PDF para os testes de importação.
 *
 * Existe porque o caminho do PDF não é testável em unitário: o `extractPdfRows`
 * precisa do pdf.js e do seu web worker, que só existem no browser. Um extrato
 * real também não serve de fixture — são dados bancários de uma pessoa, e o
 * repositório é público. Daí escrever aqui um PDF mínimo (texto posicionado por
 * coordenadas, sem compressão) com a forma do extrato consolidado do Santander.
 *
 * O que este ficheiro garante que continua a funcionar:
 * - o worker do pdf.js carrega no bundle servido pelo nginx (era isto que
 *   rebentava em produção com "Erro ao ler", com o worker fora da pré-cache);
 * - a reconstrução da tabela a partir das coordenadas;
 * - o extrato acabar no saldo de fecho da primeira conta, sem arrastar a tabela
 *   da conta poupança que vem a seguir.
 */

/** Colunas do extrato, na coordenada X onde cada uma começa. */
const COL = { mov: 40, dataValor: 78, desc: 118, moeda: 330, valor: 380, saldo: 470 }

const FONT_SIZE = 8
const LINE_HEIGHT = 14   // > 0.8 × FONT_SIZE, senão o mergeWrappedLines junta as linhas

interface Cell { text: string; x: number }
interface Line { y: number; cells: Cell[] }

export interface StatementMovement {
  /** Dia do mês (1-28, para não cair em meses curtos). */
  day: number
  description: string
  /** Negativo = saída, positivo = entrada — como no extrato, que traz o sinal. */
  amount: number
}

export interface StatementAccount {
  opening: number
  movements: StatementMovement[]
}

export interface ConsolidatedStatement {
  /** Mês do extrato (AAAA-MM). Por omissão o mês atual, que é o da página. */
  ym?: string
  /** Conta à ordem — a única que deve ser importada. */
  current: StatementAccount
  /** Conta poupança, o segundo quadro do extrato consolidado. */
  savings?: StatementAccount
}

/** Valor no formato do extrato: milhares com ponto, decimais com vírgula. */
function fmt(value: number): string {
  const [int, dec] = Math.abs(value).toFixed(2).split('.')
  return `${value < 0 ? '-' : ''}${int.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${dec}`
}

/** Saldo depois de cada movimento — a coluna que o importador usa para validar. */
function withBalances(account: StatementAccount): { movement: StatementMovement, balance: number }[] {
  let balance = account.opening
  return account.movements.map((movement) => {
    balance += movement.amount
    return { movement, balance }
  })
}

/** Extrato consolidado do Santander: conta à ordem e, a seguir, conta poupança. */
export function buildConsolidatedStatementPdf({ ym = currentYm(), current, savings }: ConsolidatedStatement): Buffer {
  const [, month] = ym.split('-')
  const lines: Line[] = []
  let y = 800
  const line = (cells: Cell[]): void => { lines.push({ y, cells }); y -= LINE_HEIGHT }
  const blank = (): void => { y -= LINE_HEIGHT }

  const table = (title: string, account: StatementAccount, closingLabel: string): number => {
    line([{ text: title, x: COL.desc }])
    line([
      { text: 'Mov', x: COL.mov }, { text: 'Valor', x: COL.dataValor },
      { text: 'Descritivo do Movimento', x: COL.desc }, { text: 'Moeda', x: COL.moeda },
      { text: 'Valor', x: COL.valor }, { text: 'Saldo', x: COL.saldo },
    ])
    line([{ text: 'Saldo Inicial EUR', x: COL.desc }, { text: fmt(account.opening), x: COL.saldo }])
    let balance = account.opening
    for (const row of withBalances(account)) {
      const day = `${String(row.movement.day).padStart(2, '0')}-${month}`
      balance = row.balance
      line([
        { text: day, x: COL.mov }, { text: day, x: COL.dataValor },
        { text: row.movement.description, x: COL.desc },
        { text: fmt(row.movement.amount), x: COL.valor },
        { text: fmt(row.balance), x: COL.saldo },
      ])
    }
    line([{ text: closingLabel, x: COL.desc }, { text: fmt(balance), x: COL.saldo }])
    return balance
  }

  line([{ text: 'EXTRATO Nº 84', x: COL.mov }])
  // a data completa é o que permite resolver as datas curtas ("05-09") das linhas
  line([{ text: `PERÍODO DE ${ym}-01 A ${ym}-28`, x: COL.mov }])
  blank()

  const closing = table('Detalhe de Movimentos da Conta à Ordem', current, 'Saldo Contabilístico Final EUR')
  line([{ text: 'Saldo Disponível Final EUR', x: COL.desc }, { text: fmt(closing - 40), x: COL.saldo }])
  blank()

  if (savings) table('Detalhes de Movimentos da Conta Rendimento e Poupança', savings, 'Saldo Final EUR')

  return renderPdf(lines)
}

/** O saldo com que a conta à ordem fecha — o que a importação deve escrever na conta. */
export function closingBalanceOf({ current }: ConsolidatedStatement): number {
  return current.movements.reduce((total, m) => total + m.amount, current.opening)
}

// ---------- PDF ----------

const latin1 = (s: string): Buffer => Buffer.from(s, 'latin1')

/** Dentro de uma string PDF só `(`, `)` e `\` precisam de escape. */
const escapePdf = (s: string): string => s.replace(/([\\()])/g, '\\$1')

/**
 * Escreve um PDF de uma página com o texto nas coordenadas dadas. Sem compressão
 * e com a tabela xref calculada à mão — chega para o pdf.js e mantém o ficheiro
 * legível se algum dia for preciso depurá-lo.
 */
function renderPdf(lines: Line[]): Buffer {
  const content = [
    'BT', `/F1 ${FONT_SIZE} Tf`,
    ...lines.flatMap((l) => l.cells
      .filter((c) => c.text !== '')
      .map((c) => `1 0 0 1 ${c.x} ${l.y} Tm (${escapePdf(c.text)}) Tj`)),
    'ET',
  ].join('\n')

  const objects = [
    '<</Type/Catalog/Pages 2 0 R>>',
    '<</Type/Pages/Kids[3 0 R]/Count 1>>',
    '<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]'
      + '/Resources<</Font<</F1 5 0 R>>>>/Contents 4 0 R>>',
    `<</Length ${Buffer.byteLength(content, 'latin1')}>>\nstream\n${content}\nendstream`,
    // WinAnsiEncoding para os acentuados (à, í, º) saírem como no extrato real
    '<</Type/Font/Subtype/Type1/BaseFont/Helvetica/Encoding/WinAnsiEncoding>>',
  ]

  const parts = [latin1('%PDF-1.4\n')]
  const offsets: number[] = []
  let position = parts[0].length
  objects.forEach((body, i) => {
    const object = latin1(`${i + 1} 0 obj\n${body}\nendobj\n`)
    offsets.push(position)
    parts.push(object)
    position += object.length
  })

  const size = objects.length + 1
  const xref = [
    `xref\n0 ${size}\n`, '0000000000 65535 f \n',
    ...offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`),
  ].join('')
  parts.push(latin1(`${xref}trailer\n<</Size ${size}/Root 1 0 R>>\nstartxref\n${position}\n%%EOF\n`))

  return Buffer.concat(parts)
}
