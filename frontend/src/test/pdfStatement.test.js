import { describe, expect, it } from 'vitest'
import { mapTextItems, itemsToLines, linesToTable, mergeWrappedLines } from '../pdfStatement'
import { analyzeRows, buildTransactions } from '../statementParser'

/**
 * Testa a reconstrução da tabela de um extrato PDF a partir das coordenadas dos
 * itens de texto (as funções puras de pdfStatement.js — o extractPdfRows depende
 * do pdf.js/worker e não é testável fora do browser).
 */

/** Item de texto no formato do pdf.js: transform = [escalaX, inclY, inclX, escalaY, x, y]. */
const pdfItem = (str, x, y, width, skewY = 0) => ({ str, width, transform: [10, skewY, 0, 10, x, y] })
/** Item já mapeado {str, x, y, width, size} para alimentar itemsToLines diretamente. */
const item = (str, x, y, width, size = 10) => ({ str, x, y, width, size })
/** Célula {text, x, end} para alimentar linesToTable diretamente. */
const cell = (text, x, end) => ({ text, x, end })

describe('mapTextItems — normaliza itens do pdf.js', () => {
  it('extrai str/x/y/width/size do transform', () => {
    const [m] = mapTextItems([pdfItem('Continente', 100, 700, 48)])
    expect(m).toEqual({ str: 'Continente', x: 100, y: 700, width: 48, size: 10 })
  })

  it('descarta texto rodado (rodapés verticais nas margens)', () => {
    const items = [
      pdfItem('Movimento', 100, 700, 48),
      pdfItem('rodapé vertical', 20, 400, 60, 9.9), // transform[1] ≠ 0 → rodado
    ]
    const mapped = mapTextItems(items)
    expect(mapped).toHaveLength(1)
    expect(mapped[0].str).toBe('Movimento')
  })
})

describe('itemsToLines — agrupa itens em linhas e células', () => {
  it('agrupa itens com Y próximo na mesma linha e separa colunas afastadas', () => {
    const lines = itemsToLines([
      item('Data', 50, 700, 20),
      item('Descrição', 120, 701, 40), // baseline ligeiramente diferente, mesma linha
      item('Valor', 300, 700, 20),
    ])
    expect(lines).toHaveLength(1)
    expect(lines[0].map((c) => c.text)).toEqual(['Data', 'Descrição', 'Valor'])
  })

  it('junta itens próximos na mesma célula, com espaço quando há folga', () => {
    // "Pingo"(50–70) + "Doce"(74–92): gap 4 ≤ 7 e > 1 → "Pingo Doce"
    const [line] = itemsToLines([
      item('Pingo', 50, 700, 20),
      item('Doce', 74, 700, 18),
    ])
    expect(line).toHaveLength(1)
    expect(line[0].text).toBe('Pingo Doce')
  })

  it('junta itens colados sem espaço (gap ≤ 1)', () => {
    // "12"(50–56) + ",34"(56.5–62.5): gap 0.5 → "12,34"
    const [line] = itemsToLines([
      item('12', 50, 700, 6),
      item(',34', 56.5, 700, 6),
    ])
    expect(line[0].text).toBe('12,34')
  })

  it('separa itens com folga grande em células distintas', () => {
    // gap 20 > 7 → duas células
    const [line] = itemsToLines([
      item('A', 50, 700, 6),
      item('B', 76, 700, 6),
    ])
    expect(line.map((c) => c.text)).toEqual(['A', 'B'])
  })

  it('ordena as linhas de cima para baixo (Y decrescente)', () => {
    const lines = itemsToLines([
      item('baixo', 50, 680, 20),
      item('cima', 50, 700, 20),
    ])
    expect(lines.map((l) => l[0].text)).toEqual(['cima', 'baixo'])
  })

  it('ignora strings vazias ou só com espaços', () => {
    const [line] = itemsToLines([
      item('Real', 50, 700, 20),
      item('   ', 120, 700, 20),
      item('', 300, 700, 20),
    ])
    expect(line.map((c) => c.text)).toEqual(['Real'])
  })
})

describe('linesToTable — alinha células às colunas do cabeçalho por posição X', () => {
  // Cabeçalho reconhecível: Data / Descrição / Débito / Crédito
  const header = [cell('Data', 50, 90), cell('Descrição', 120, 200), cell('Débito', 300, 340), cell('Crédito', 380, 420)]

  it('preenche a coluna certa mesmo quando faltam células na linha', () => {
    // linha sem débito: o crédito (x≈392) tem de cair na 4ª coluna, deixando a 3ª vazia
    const dataRow = [cell('05-03', 50, 78), cell('Pingo Doce', 120, 190), cell('45,90', 392, 418)]
    const table = linesToTable([header, dataRow])

    expect(table[0]).toEqual(['Data', 'Descrição', 'Débito', 'Crédito'])
    expect(table[1]).toEqual(['05-03', 'Pingo Doce', '', '45,90'])
  })

  it('ignora texto à esquerda da tabela (rodapé vertical / símbolo solto)', () => {
    // célula muito à esquerda da 1ª coluna (centro < leftEdge − 15) é descartada
    const dataRow = [cell('¤', 5, 15), cell('05-03', 50, 78), cell('Compras', 120, 190), cell('10,00', 312, 338)]
    const table = linesToTable([header, dataRow])
    expect(table[1]).toEqual(['05-03', 'Compras', '10,00', ''])
  })

  it('sem cabeçalho reconhecível devolve a matriz de texto crua', () => {
    const l1 = [cell('foo', 50, 70), cell('bar', 120, 140)]
    const l2 = [cell('baz', 50, 70), cell('qux', 120, 140)]
    const table = linesToTable([l1, l2])
    expect(table).toEqual([['foo', 'bar'], ['baz', 'qux']])
  })

  it('separa numa célula dois valores de colunas coladas', () => {
    // colunas de valores estreitas e encostadas: "10,54" e "237,66" ficam a 6pt de
    // distância e são lidos como uma célula só — têm de voltar a separar-se
    const hdr = [cell('Data', 50, 90), cell('Descrição', 120, 200), cell('Débito', 300, 322), cell('Crédito', 330, 355)]
    const glued = { text: '10,54 237,66', x: 300, end: 355, parts: [cell('10,54', 300, 320), cell('237,66', 330, 355)] }
    const table = linesToTable([hdr, [cell('05-03', 50, 78), cell('Mercadona', 120, 190), glued]])
    expect(table[1]).toEqual(['05-03', 'Mercadona', '10,54', '237,66'])
  })

  it('não parte descrições longas que passam por cima de outra coluna', () => {
    // os pedaços da descrição não assentam em coluna nenhuma → a célula segue inteira
    const hdr = [cell('Data', 50, 90), cell('Descrição', 120, 200), cell('Montante', 400, 440)]
    const desc = { text: 'Pagamento de serviços ACME', x: 120, end: 330, parts: [cell('Pagamento de serviços', 120, 250), cell('ACME', 260, 330)] }
    const table = linesToTable([hdr, [cell('05-03', 50, 78), desc, cell('45,90', 410, 438)]])
    expect(table[1]).toEqual(['05-03', 'Pagamento de serviços ACME', '45,90'])
  })
})

describe('mergeWrappedLines — junta linhas partidas da mesma linha da tabela', () => {
  it('junta linhas mais próximas do que a altura da letra, coluna a coluna', () => {
    // linha de movimento da Trade Republic: data em "17 Jul"/"2026" e tipo em
    // "Card"/"Transaction", com 3.8pt entre baselines para letra de 6.75pt
    const lines = itemsToLines([
      item('17 Jul', 74, 472.6, 19, 6.75), item('MERCADONA', 163, 472.6, 45, 6.75),
      item('Card', 110, 468.9, 16, 6.75), item('10,54', 462, 468.9, 24, 6.75),
      item('2026', 74, 465.1, 17, 6.75), item('Transaction', 110, 465.1, 39, 6.75),
    ])
    expect(lines).toHaveLength(3)
    const [merged] = mergeWrappedLines(lines)
    expect(merged.map((c) => c.text)).toEqual(['17 Jul 2026', 'Card Transaction', 'MERCADONA', '10,54'])
  })

  it('não junta linhas de texto normais', () => {
    // espaçamento igual à altura da letra → linhas independentes
    const lines = itemsToLines([
      item('Movimento A', 74, 500, 40, 6), item('Movimento B', 74, 492, 40, 6),
    ])
    expect(mergeWrappedLines(lines).map((l) => l[0].text)).toEqual(['Movimento A', 'Movimento B'])
  })

  it('não junta a última linha de uma página com a primeira da seguinte', () => {
    // o Y volta ao topo entre páginas → o "espaçamento" seria negativo
    const lines = [...itemsToLines([item('rodapé', 74, 21, 20, 6)]), ...itemsToLines([item('topo', 74, 732, 20, 6)])]
    expect(mergeWrappedLines(lines).map((l) => l[0].text)).toEqual(['rodapé', 'topo'])
  })
})

describe('extrato Trade Republic — do PDF aos movimentos', () => {
  // Coordenadas reais de um extrato mensal (Trade Republic Bank GmbH, Sucursal em
  // Portugal). Duas particularidades: o cabeçalho parte "MONEY OUT" em duas linhas
  // e cada movimento ocupa três, com a data em "23 Jul" + "2026".
  const items = [
    item('TRADE REPUBLIC BANK GMBH, SUCURSAL EM PORTUGAL', 73.7, 732.7, 167.5, 6),
    item('ACCOUNT TRANSACTIONS', 73.7, 520, 138.6, 10.5),
    item('DATE', 74.4, 491.9, 13.8, 5.25),
    item('TYPE', 110.2, 491.9, 13.2, 5.25),
    item('DESCRIPTION', 162.9, 491.9, 35.2, 5.25),
    item('MONEY IN ', 432.6, 491.9, 29.3, 5.25),
    item('MONEY', 462, 494.8, 19.6, 5.25),
    item('OUT', 462, 488.9, 11.1, 5.25),
    item('BALANCE', 494.6, 491.9, 24.7, 5.25),
    item('17 Jul', 74.4, 472.6, 18.9, 6.75),
    item('Incoming transfer from TIAGO ANDRE TORGO TEIXEIRA', 162.9, 472.6, 180.7, 6.75),
    item('Transfer', 110.2, 468.9, 27.4, 6.75),
    item('€250.00', 432.6, 468.9, 27.8, 6.75),
    item('€250.00', 491.5, 468.9, 27.8, 6.75),
    item('2026', 74.4, 465.1, 17.2, 6.75),
    item('(PT50001800035114513402081)', 162.9, 465.1, 112.1, 6.75),
    item('22 Jul', 74.4, 441, 18.9, 6.75),
    item('Card', 110.2, 441, 15.8, 6.75),
    item('EUREST ISEP', 162.9, 437.2, 41.4, 6.75),
    item('€1.80', 462, 437.2, 19.2, 6.75),
    item('€248.20', 491.5, 437.2, 27.8, 6.75),
    item('2026', 74.4, 433.4, 17.2, 6.75),
    item('Transaction', 110.2, 433.4, 38.5, 6.75),
    item('23 Jul', 74.4, 409.4, 18.9, 6.75),
    item('Card', 110.2, 409.4, 15.8, 6.75),
    item('MERCADONA', 162.9, 405.6, 44.5, 6.75),
    item('€10.54', 462, 405.6, 23.5, 6.75),
    item('€237.66', 491.5, 405.6, 27.8, 6.75),
    item('2026', 74.4, 401.8, 17.2, 6.75),
    item('Transaction', 110.2, 401.8, 38.5, 6.75),
    item('Generated on 2026-08-02 15:31:29 Europe/Lisbon (UTC+01:00)', 74.4, 21.4, 187.9, 6),
  ]
  const rows = linesToTable(mergeWrappedLines(itemsToLines(items)))

  it('reconstrói o cabeçalho, incluindo a coluna partida em duas linhas', () => {
    const analysis = analyzeRows(rows)
    expect(analysis.headers).toEqual(['DATE', 'TYPE', 'DESCRIPTION', 'MONEY IN', 'MONEY OUT', 'BALANCE'])
    expect(analysis.format).toBe('traderepublic')
    // "MONEY IN"/"MONEY OUT" fazem as vezes de crédito/débito
    expect(analysis.mapping).toMatchObject({ date: 0, description: 2, credit: 3, debit: 4, balance: 5, amount: -1 })
  })

  it('importa os movimentos com data, sentido e valor certos', () => {
    const analysis = analyzeRows(rows)
    const { rows: txs, ignored } = buildTransactions(analysis.dataRows, analysis.mapping, analysis.dateHint)
    expect(txs).toEqual([
      {
        date: '2026-07-17',
        description: 'Incoming transfer from TIAGO ANDRE TORGO TEIXEIRA (PT50001800035114513402081)',
        amount: 250, inflow: true, category: 'TRANSFER',
      },
      { date: '2026-07-22', description: 'EUREST ISEP', amount: 1.8, inflow: false, category: 'RESTAURANT' },
      { date: '2026-07-23', description: 'MERCADONA', amount: 10.54, inflow: false, category: 'GROCERIES' },
    ])
    // o texto à volta da tabela (título, rodapé) não conta como movimento falhado
    expect(ignored).toBe(0)
  })

  it('traz o saldo de fecho do extrato para atualizar o saldo da conta', () => {
    const analysis = analyzeRows(rows)
    const { closingBalance } = buildTransactions(analysis.dataRows, analysis.mapping, analysis.dateHint)
    // saldo da última linha da coluna BALANCE, depois de confirmar que encadeia
    // com os movimentos: 250,00 − 1,80 − 10,54
    expect(closingBalance).toBe(237.66)
  })
})
