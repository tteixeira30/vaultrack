import { describe, expect, it } from 'vitest'
import { parseAmount, parseDate, buildTransactions, findOpeningBalance, analyzeRows, categoryKey } from '../statementParser'

describe('parseAmount — formatos monetários', () => {
  it('formato PT (1.234,56)', () => {
    expect(parseAmount('1.234,56')).toBe(1234.56)
  })
  it('formato EN (1,234.56)', () => {
    expect(parseAmount('1,234.56')).toBe(1234.56)
  })
  it('negativo com sinal', () => {
    expect(parseAmount('-45,90')).toBe(-45.9)
  })
  it('negativo entre parênteses (contabilístico)', () => {
    expect(parseAmount('(12,34)')).toBe(-12.34)
  })
  it('com símbolo de moeda e espaços', () => {
    expect(parseAmount(' 1 234,50 €')).toBe(1234.5)
  })
  it('vazio ou inválido devolve null', () => {
    expect(parseAmount('')).toBeNull()
    expect(parseAmount('abc')).toBeNull()
    expect(parseAmount(null)).toBeNull()
  })
})

describe('parseDate — datas com e sem ano', () => {
  it('ISO', () => expect(parseDate('2026-03-15')).toBe('2026-03-15'))
  it('DD/MM/AAAA (PT)', () => expect(parseDate('15/03/2026')).toBe('2026-03-15'))
  it('DD-MM sem ano usa a data de referência do documento', () => {
    expect(parseDate('05-03', '2026-03-31')).toBe('2026-03-05')
  })
  it('DD-MM muito depois da referência recua um ano (extrato de janeiro com movimentos de dezembro)', () => {
    expect(parseDate('28-12', '2026-01-10')).toBe('2025-12-28')
  })
  it('mês por extenso em inglês (Trade Republic)', () => {
    expect(parseDate('17 Jul 2026')).toBe('2026-07-17')
    expect(parseDate('1 September 2026')).toBe('2026-09-01')
    expect(parseDate('Jul 17, 2026')).toBe('2026-07-17')
  })
  it('mês por extenso em português, com ou sem "de" e acentos', () => {
    expect(parseDate('5 de março de 2026')).toBe('2026-03-05')
    expect(parseDate('05 Out 2026')).toBe('2026-10-05')
  })
  it('mês desconhecido devolve null', () => {
    expect(parseDate('17 Xyz 2026')).toBeNull()
  })
})

describe('buildTransactions — sinal e valor dos movimentos', () => {
  it('coluna montante com sinais: separa entradas e saídas e guarda o valor absoluto', () => {
    const mapping = { date: 0, description: 1, amount: 2, debit: -1, credit: -1, currency: -1, state: -1, fee: -1, balance: -1 }
    const { rows, ignored } = buildTransactions([
      ['2026-03-01', 'Salário', '2000,00'],
      ['2026-03-05', 'Continente', '-85,40'],
    ], mapping, '2026-03-31')

    expect(ignored).toBe(0)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ description: 'Salário', amount: 2000, inflow: true })
    expect(rows[1]).toMatchObject({ description: 'Continente', amount: 85.4, inflow: false })
  })

  it('colunas débito/crédito: débito é saída, crédito é entrada', () => {
    const mapping = { date: 0, description: 1, amount: -1, debit: 2, credit: 3, currency: -1, state: -1, fee: -1, balance: -1 }
    const { rows } = buildTransactions([
      ['2026-03-01', 'Ordenado', '', '1500,00'],
      ['2026-03-08', 'Renda', '700,00', ''],
    ], mapping, '2026-03-31')

    expect(rows[0]).toMatchObject({ amount: 1500, inflow: true })
    expect(rows[1]).toMatchObject({ amount: 700, inflow: false })
  })

  it('ignora movimentos em moeda diferente de EUR', () => {
    const mapping = { date: 0, description: 1, amount: 2, debit: -1, credit: -1, currency: 3, state: -1, fee: -1, balance: -1 }
    const { rows, ignored } = buildTransactions([
      ['2026-03-01', 'Compra EUR', '-10,00', 'EUR'],
      ['2026-03-02', 'Compra USD', '-10,00', 'USD'],
    ], mapping, '2026-03-31')

    expect(rows).toHaveLength(1)
    expect(rows[0].description).toBe('Compra EUR')
    expect(ignored).toBe(1)
  })

  it('ignora movimentos pendentes/revertidos pela coluna de estado', () => {
    const mapping = { date: 0, description: 1, amount: 2, debit: -1, credit: -1, currency: -1, state: 3, fee: -1, balance: -1 }
    const { rows, ignored } = buildTransactions([
      ['2026-03-01', 'Compra ok', '-10,00', 'COMPLETED'],
      ['2026-03-02', 'Compra pendente', '-10,00', 'PENDING'],
    ], mapping, '2026-03-31')

    expect(rows).toHaveLength(1)
    expect(rows[0].description).toBe('Compra ok')
    expect(ignored).toBe(1)
  })

  it('extrato sem sinais (PDF): infere entrada/saída pela evolução do saldo', () => {
    // saldos: 1000 → 914,60 (−85,40 Continente) → 899,60 (−15 Farmácia) → 2899,60 (+2000 Salário)
    const mapping = { date: 0, description: 1, amount: 2, debit: -1, credit: -1, currency: -1, state: -1, fee: -1, balance: 3 }
    const { rows } = buildTransactions([
      ['2026-03-05', 'Continente', '85,40', '914,60'],
      ['2026-03-15', 'Farmácia', '15,00', '899,60'],
      ['2026-03-25', 'Salário', '2000,00', '2899,60'],
    ], mapping, '2026-03-31')

    // movimentos deriváveis a partir da diferença entre saldos consecutivos
    expect(rows.find((r) => r.description === 'Farmácia').inflow).toBe(false)
    expect(rows.find((r) => r.description === 'Salário').inflow).toBe(true)
  })

  // BUG conhecido: num extrato PDF sem sinais, o PRIMEIRO movimento (o mais antigo) não
  // tem saldo anterior com que comparar, por isso o seu sentido não é determinável e fica
  // por omissão como ENTRADA — mesmo quando é uma saída. Este teste fixa o comportamento
  // atual para o tornar visível; afeta 1 movimento por importação (só PDFs sem sinais).
  it('sem saldo inicial, o primeiro movimento de um extrato sem sinais fica como entrada (fallback)', () => {
    const mapping = { date: 0, description: 1, amount: 2, debit: -1, credit: -1, currency: -1, state: -1, fee: -1, balance: 3 }
    const { rows } = buildTransactions([
      ['2026-03-05', 'Continente', '85,40', '914,60'],
      ['2026-03-15', 'Farmácia', '15,00', '899,60'],
      ['2026-03-25', 'Salário', '2000,00', '2899,60'],
    ], mapping, '2026-03-31')

    // sem saldo anterior com que comparar, mantém-se o fallback (entrada)
    expect(rows.find((r) => r.description === 'Continente').inflow).toBe(true)
  })

  it('com saldo inicial, o primeiro movimento é sinalizado corretamente (saída)', () => {
    // saldo inicial 1000 → 914,60 (−85,40 Continente, agora determinável)
    const mapping = { date: 0, description: 1, amount: 2, debit: -1, credit: -1, currency: -1, state: -1, fee: -1, balance: 3 }
    const { rows } = buildTransactions([
      ['2026-03-05', 'Continente', '85,40', '914,60'],
      ['2026-03-15', 'Farmácia', '15,00', '899,60'],
      ['2026-03-25', 'Salário', '2000,00', '2899,60'],
    ], mapping, '2026-03-31', 1000)

    expect(rows.find((r) => r.description === 'Continente').inflow).toBe(false)
    expect(rows.find((r) => r.description === 'Farmácia').inflow).toBe(false)
    expect(rows.find((r) => r.description === 'Salário').inflow).toBe(true)
  })

  it('resolve extratos por ordem inversa (mais recente primeiro) com saldo inicial', () => {
    const mapping = { date: 0, description: 1, amount: 2, debit: -1, credit: -1, currency: -1, state: -1, fee: -1, balance: 3 }
    const { rows } = buildTransactions([
      ['2026-03-25', 'Salário', '2000,00', '2899,60'],
      ['2026-03-15', 'Farmácia', '15,00', '899,60'],
      ['2026-03-05', 'Continente', '85,40', '914,60'],
    ], mapping, '2026-03-31', 1000)

    expect(rows.find((r) => r.description === 'Continente').inflow).toBe(false)
    expect(rows.find((r) => r.description === 'Salário').inflow).toBe(true)
  })

  it('um saldo inicial incoerente não altera o resultado (fallback seguro)', () => {
    const mapping = { date: 0, description: 1, amount: 2, debit: -1, credit: -1, currency: -1, state: -1, fee: -1, balance: 3 }
    const { rows } = buildTransactions([
      ['2026-03-05', 'Continente', '85,40', '914,60'],
      ['2026-03-15', 'Farmácia', '15,00', '899,60'],
      ['2026-03-25', 'Salário', '2000,00', '2899,60'],
    ], mapping, '2026-03-31', 42) // valor que não bate com os saldos

    expect(rows.find((r) => r.description === 'Farmácia').inflow).toBe(false)
    expect(rows.find((r) => r.description === 'Salário').inflow).toBe(true)
    expect(rows.find((r) => r.description === 'Continente').inflow).toBe(true) // volta ao fallback
  })

  it('subtrai a comissão (fee) ao valor do movimento', () => {
    const mapping = { date: 0, description: 1, amount: 2, debit: -1, credit: -1, currency: -1, state: -1, fee: 3, balance: -1 }
    const { rows } = buildTransactions([
      ['2026-03-01', 'Levantamento', '-100,00', '2,00'],
    ], mapping, '2026-03-31')

    // saída de 100 + 2 de comissão = 102 a sair da conta
    expect(rows[0]).toMatchObject({ amount: 102, inflow: false })
  })

  it('texto de fora da tabela não conta como movimento ignorado', () => {
    const mapping = { date: 0, description: 1, amount: 2, debit: -1, credit: -1, currency: -1, state: -1, fee: -1, balance: -1 }
    const { rows, ignored } = buildTransactions([
      ['2026-03-01', 'Continente', '-85,40'],
      ['NOTAS AO EXTRATO'],                       // título de secção do PDF
      ['Banco XPTO, S.A.', 'NIPC 500000000'],     // rodapé
      ['2026-03-02', '', '-10,00'],               // este sim: parece movimento e falhou
    ], mapping, '2026-03-31')

    expect(rows).toHaveLength(1)
    expect(ignored).toBe(1)
  })
})

describe('findOpeningBalance — deteção do saldo inicial', () => {
  it('rótulo e valor em células separadas', () => {
    expect(findOpeningBalance([['SALDO ANTERIOR', '', '1.000,00']])).toBe(1000)
  })
  it('rótulo "Saldo inicial"', () => {
    expect(findOpeningBalance([['Saldo inicial', '2.345,67']])).toBe(2345.67)
  })
  it('rótulo e valor na mesma célula', () => {
    expect(findOpeningBalance([['Saldo anterior: 1.000,00 €']])).toBe(1000)
  })
  it('devolve null quando não há linha de saldo inicial', () => {
    expect(findOpeningBalance([['Data', 'Descrição', 'Valor'], ['2026-03-01', 'X', '10']])).toBeNull()
  })
})

describe('categoryKey — chave de categorização (paridade com o backend)', () => {
  it('ignora referências e datas: mesmo comerciante → mesma chave', () => {
    expect(categoryKey('COMPRA 1234 CONTINENTE COLOMBO 12/03')).toBe('compra continente colombo')
    expect(categoryKey('COMPRA 5678 CONTINENTE COLOMBO 15/04')).toBe('compra continente colombo')
  })
  it('mantém letras acentuadas', () => {
    expect(categoryKey('CAFÉ CENTRAL 99')).toBe('café central')
  })
  it('descrições só com números/pontuação → vazio', () => {
    expect(categoryKey('  1234 //  ')).toBe('')
    expect(categoryKey(null)).toBe('')
    expect(categoryKey(undefined)).toBe('')
  })
})

describe('analyzeRows — integra o saldo inicial de ponta a ponta', () => {
  it('extrato PDF sem sinais com "Saldo anterior" fica todo com o sentido certo', () => {
    const rows = [
      ['Extrato de conta'],
      ['SALDO ANTERIOR', '1.000,00'],
      ['Data', 'Descrição', 'Valor', 'Saldo'],
      ['2026-03-05', 'Continente', '85,40', '914,60'],
      ['2026-03-15', 'Farmácia', '15,00', '899,60'],
      ['2026-03-25', 'Salário', '2000,00', '2899,60'],
    ]
    const analysis = analyzeRows(rows)
    expect(analysis.openingBalance).toBe(1000)

    const { rows: txs } = buildTransactions(analysis.dataRows, analysis.mapping, analysis.dateHint, analysis.openingBalance)
    expect(txs.find((r) => r.description === 'Continente').inflow).toBe(false)
    expect(txs.find((r) => r.description === 'Salário').inflow).toBe(true)
  })

  it('reconhece colunas de entradas/saídas em inglês como crédito/débito', () => {
    const analysis = analyzeRows([
      ['Date', 'Description', 'Money in', 'Money out', 'Balance'],
      ['17 Jul 2026', 'Incoming transfer', '250.00', '', '250.00'],
      ['23 Jul 2026', 'MERCADONA', '', '10.54', '239.46'],
    ])
    expect(analysis.mapping).toMatchObject({ credit: 2, debit: 3, amount: -1 })

    const { rows: txs } = buildTransactions(analysis.dataRows, analysis.mapping, analysis.dateHint)
    expect(txs.map((r) => [r.description, r.inflow, r.amount]))
      .toEqual([['Incoming transfer', true, 250], ['MERCADONA', false, 10.54]])
  })
})
