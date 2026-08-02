// Parser de extratos bancários (CSV) no cliente.
// Suporta deteção automática de formatos conhecidos (Revolut, Santander PT,
// Trade Republic e exportações genéricas com colunas Data/Descrição/Montante,
// Débito/Crédito ou Money in/Money out) e mapeamento manual de colunas quando
// a deteção falha.
// Os valores do extrato são assumidos em EUR (linhas noutra moeda são ignoradas).

// ---------- CSV ----------

/** Divide o texto CSV em linhas de células, respeitando aspas. */
export function parseCsv(text) {
  const delimiter = detectDelimiter(text)
  const rows = []
  let row = []
  let cell = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++ } else inQuotes = false
      } else cell += ch
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === delimiter) {
      row.push(cell); cell = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(cell); cell = ''
      if (row.some((c) => c.trim() !== '')) rows.push(row)
      row = []
    } else cell += ch
  }
  row.push(cell)
  if (row.some((c) => c.trim() !== '')) rows.push(row)
  return rows
}

function detectDelimiter(text) {
  const sample = text.slice(0, 4000)
  const counts = [';', ',', '\t'].map((d) => ({ d, n: (sample.match(new RegExp(`\\${d}`, 'g')) || []).length }))
  counts.sort((a, b) => b.n - a.n)
  return counts[0].n > 0 ? counts[0].d : ','
}

// ---------- Datas e valores ----------

/**
 * Converte texto para data ISO (AAAA-MM-DD); devolve null se não reconhecer.
 * `dateHint` (data ISO mais recente conhecida do documento) permite resolver
 * datas sem ano, tipo "02-03", comuns nos extratos PDF do Santander.
 */
export function parseDate(raw, dateHint) {
  if (!raw) return null
  const full = String(raw).trim()

  // datas com o mês por extenso, PT ou EN ("17 Jul 2026", "5 de março de 2026",
  // "Jul 17, 2026") — usadas pela Trade Republic e por vários bancos estrangeiros
  let mn = full.match(/^(\d{1,2})\s*(?:de\s+)?([a-zA-Zçãéê]{3,})\.?,?\s*(?:de\s+)?(\d{4})\b/)
  if (mn) return valid(mn[3], monthFromName(mn[2]), mn[1])
  mn = full.match(/^([a-zA-Zçãéê]{3,})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/)
  if (mn) return valid(mn[3], monthFromName(mn[1]), mn[2])

  const s = full.slice(0, 10)
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return valid(m[1], m[2], m[3])
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/)
  if (m) return valid(m[3], m[2], m[1]) // dia/mês/ano (formato PT)
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2})$/)
  if (m) return valid(`20${m[3]}`, m[2], m[1])
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})$/)
  if (m && dateHint) {
    const year = Number(dateHint.slice(0, 4))
    const iso = valid(year, m[2], m[1])
    if (!iso) return null
    // se a data ficar bem depois da última data do documento, é do ano anterior
    // (ex.: extrato de janeiro com movimentos de dezembro)
    return iso > addDaysIso(dateHint, 45) ? valid(year - 1, m[2], m[1]) : iso
  }
  return null
}

function addDaysIso(iso, days) {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

// Mês pelas 3 primeiras letras, sem acentos — chega para PT e EN (jan/janeiro/january,
// mar/março/march, mai/maio/may, out/outubro/october, dez/dezembro/december, …).
const MONTH_ABBR = ['jan', 'fev|feb', 'mar', 'abr|apr', 'mai|may', 'jun', 'jul', 'ago|aug', 'set|sep', 'out|oct', 'nov', 'dez|dec']

/** Número do mês (1–12) a partir do nome em PT ou EN; 0 se não reconhecer. */
function monthFromName(name) {
  const key = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().slice(0, 3)
  return MONTH_ABBR.findIndex((abbr) => abbr.split('|').includes(key)) + 1
}

function valid(y, mo, d) {
  const year = Number(y), month = Number(mo), day = Number(d)
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1990 || year > 2100) return null
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** Converte texto monetário ("1.234,56", "-1,234.56", "(12,34)") para número; null se inválido. */
export function parseAmount(raw) {
  if (raw == null) return null
  let s = String(raw).trim().replace(/[€$£\s]/g, '')
  if (!s) return null
  let negative = false
  if (/^\(.*\)$/.test(s)) { negative = true; s = s.slice(1, -1) }
  if (s.startsWith('-')) { negative = true; s = s.slice(1) }
  if (s.startsWith('+')) s = s.slice(1)
  if (!/^[\d.,]+$/.test(s)) return null
  const lastComma = s.lastIndexOf(',')
  const lastDot = s.lastIndexOf('.')
  if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.')
  else s = s.replace(/,/g, '')
  const n = Number(s)
  if (!Number.isFinite(n)) return null
  return negative ? -n : n
}

// ---------- Categorização automática ----------

const CATEGORY_RULES = [
  ['GROCERIES', /continente|pingo doce|lidl|aldi|mercadona|auchan|intermarch|minipre[çc]o|supermercado|froiz|spar\b/i],
  ['RESTAURANT', /restaurante|mcdonald|burger|kfc|pizza|sushi|caf[eé]\b|pastelaria|padaria|uber\s*eats|glovo|bolt\s*food|telepizza|starbucks|eurest|cantina/i],
  ['TRANSPORT', /uber(?!\s*eats)|bolt(?!\s*food)|cp\s|metro|carris|galp|bp\b|repsol|cepsa|prio\b|combust|gasolina|via\s*verde|brisa|flixbus|ryanair|easyjet|tap\b/i],
  ['HOUSING', /renda|condom[ií]nio|edp\b|endesa|iberdrola|goldenergy|[aá]guas|meo\b|nos\b|vodafone|digi\b|luz\b|g[aá]s\b|eletricidade/i],
  ['SUBSCRIPTION', /netflix|spotify|hbo|disney|\bprime\b|youtube|icloud|apple\.com|google\s*(one|play)|playstation|xbox|crunchyroll|dazn|patreon|subscri/i],
  ['SHOPPING', /amazon|fnac|worten|zara|pull\s*&?\s*bear|bershka|stradivarius|massimo\s*dutti|h&m|primark|decathlon|ikea|leroy|aliexpress|temu|shein|el\s*corte/i],
  ['HEALTH', /farm[aá]cia|hospital|cl[ií]nica|dentista|wells|cuf\b|lus[ií]adas|seguro\s*sa[uú]de|gin[aá]sio|fitness|solinca/i],
  ['LEISURE', /cinema|teatro|concerto|museu|bilhete|ticketline|steam|epic\s*games|nintendo|viagem|hotel|booking|airbnb/i],
  ['INCOME', /sal[aá]rio|vencimento|ordenado|payroll|reembolso|juros\s*(recebidos)?|dividendo/i],
  ['TRANSFER', /transfer[eê]ncia|\btransfer\b|trf\b|mb\s*way|mbway|levantamento|dep[oó]sito|top.?up|carregamento|revolut|trade\s*republic/i],
]

/**
 * Chave de categorização: identifica o "comerciante" da descrição ignorando as
 * partes variáveis (referências, datas, valores, pontuação), para que a mesma
 * regra apanhe movimentos do mesmo sítio mesmo com números diferentes.
 * Tem de ser idêntica à versão do backend (ExpenseController.categoryKey).
 */
export const categoryKey = (description) =>
  (description || '')
    .toLowerCase()
    .replace(/\d+/g, ' ')          // referências, datas, valores
    .replace(/[^\p{L}\s]/gu, ' ')  // pontuação e símbolos
    .replace(/\s+/g, ' ')          // colapsa espaços
    .trim()

/** Sugere uma categoria a partir da descrição do movimento. */
export function autoCategory(description, inflow) {
  const d = description || ''
  for (const [cat, re] of CATEGORY_RULES) {
    if (re.test(d)) return cat
  }
  return inflow ? 'INCOME' : 'OTHER'
}

// ---------- Deteção de formato / mapeamento ----------

export const HEADER_HINTS = /data|date|descri|description|montante|amount|valor|d[eé]bito|debit|cr[eé]dito|credit|money\s*(in|out)|paid\s*(in|out)|movimento|saldo|balance|currency|moeda/i

// Colunas de saída (débito) e de entrada (crédito), quando o extrato as separa.
// Além do débito/crédito clássico há os extratos em inglês com "Money in"/"Money out"
// (Trade Republic) ou "Paid in"/"Paid out", e os PT com "Entradas"/"Saídas".
const DEBIT_HEADER = /d[eé]bito|debit(?!\s*card)|money\s*out|paid\s*out|sa[ií]das?\b/i
const CREDIT_HEADER = /cr[eé]dito|credit(?!\s*card)|money\s*in|paid\s*in|entradas?\b/i

const OPENING_BALANCE_LABEL = /saldo\s*(anterior|inicial|de\s*abertura)|opening\s*balance/i

/**
 * Procura o saldo inicial do extrato (linha "Saldo anterior"/"Saldo inicial"),
 * usado para determinar o sentido do primeiro movimento em extratos sem sinais.
 * Devolve o valor numérico ou null se não existir.
 */
export function findOpeningBalance(rows) {
  if (!rows) return null
  for (const r of rows) {
    const idx = r.findIndex((c) => OPENING_BALANCE_LABEL.test(String(c)))
    if (idx === -1) continue
    // valor noutra célula numérica da mesma linha (o rótulo e o valor costumam estar separados)
    for (let k = r.length - 1; k >= 0; k--) {
      if (k === idx) continue
      const v = parseAmount(r[k])
      if (v != null) return v
    }
    // ou um número no fim da própria célula do rótulo ("Saldo anterior: 1.000,00 €")
    const m = String(r[idx]).match(/(-?\(?[\d.,]+\)?)\s*€?\s*$/)
    if (m) { const v = parseAmount(m[1]); if (v != null) return v }
  }
  return null
}

// Categorias de colunas usadas para reconhecer a linha de cabeçalho de uma tabela de movimentos.
const HEADER_CATEGORIES = [
  /data|date|\bmov\b/i,
  /descri|description|movimento|detalhe|details?|narrative|memo|concept/i,
  /montante|amount|valor|import[aâ]ncia|d[eé]bito|debit|cr[eé]dito|credit|money\s*(in|out)|paid\s*(in|out)/i,
  /saldo|balance/i,
]

/**
 * Procura a linha de cabeçalho da tabela de movimentos. Primeiro procura em todo o
 * documento uma linha "forte" (≥3 categorias de colunas reconhecidas) — necessário
 * nos PDFs, em que a tabela aparece depois de páginas de texto; em último recurso,
 * a primeira linha inicial com ≥2 células com cara de cabeçalho (CSVs simples).
 */
export function findHeaderIndex(rows) {
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].length < 3) continue
    const score = HEADER_CATEGORIES.filter((re) => rows[i].some((c) => re.test(c))).length
    if (score >= 3) return i
  }
  for (let i = 0; i < Math.min(rows.length, 12); i++) {
    if (rows[i].filter((c) => HEADER_HINTS.test(c)).length >= 2) return i
  }
  return -1
}

/**
 * Analisa um CSV de extrato: encontra a linha de cabeçalho, deteta o formato e
 * propõe um mapeamento de colunas. Devolve { format, headers, dataRows, mapping }.
 * mapping: índices { date, description, amount, debit, credit, currency, state, fee, balance }
 * (amount OU debit/credit; -1 = coluna inexistente).
 */
export function analyzeStatement(text) {
  return analyzeRows(parseCsv(text))
}

/** Variante de analyzeStatement para linhas já estruturadas (ex.: extraídas de um PDF). */
export function analyzeRows(rows) {
  if (!rows || rows.length === 0) return null

  // data mais recente com ano presente no documento — resolve datas sem ano ("02-03")
  let dateHint = null
  for (const r of rows.slice(0, 400)) {
    for (const c of r) {
      const found = String(c).match(/\b(20\d{2}-\d{2}-\d{2}|\d{1,2}[-/.]\d{1,2}[-/.]20\d{2})\b/g)
      if (!found) continue
      for (const token of found) {
        const iso = parseDate(token)
        if (iso && (!dateHint || iso > dateHint)) dateHint = iso
      }
    }
  }

  const openingBalance = findOpeningBalance(rows)

  const headerIdx = findHeaderIndex(rows)
  if (headerIdx === -1) return { format: 'unknown', headers: rows[0], dataRows: rows.slice(1), mapping: emptyMapping(), dateHint, openingBalance }

  const headers = rows[headerIdx].map((h) => h.trim())
  const dataRows = rows.slice(headerIdx + 1)
  const lower = headers.map((h) => h.toLowerCase())
  const find = (re) => lower.findIndex((h) => re.test(h))

  const mapping = {
    date: -1, description: -1, amount: -1, debit: -1, credit: -1,
    currency: find(/^currency$|^moeda$/), state: find(/^state$|^estado$/), fee: find(/^fee$|^comiss/),
    balance: find(/saldo|balance/),
  }

  let format = 'generic'
  if ((find(/completed date/) !== -1 && find(/started date/) !== -1)
      || (find(/data de conclus/) !== -1 && find(/data de in[ií]cio/) !== -1)) {
    // Revolut (EN): Type, Product, Started Date, Completed Date, Description, Amount, Fee, Currency, State, Balance
    // Revolut (PT): Tipo, Produto, Data de início, Data de Conclusão, Descrição, Montante, Comissão, Moeda, Estado, Saldo
    format = 'revolut'
    mapping.date = find(/completed date|data de conclus/)
    mapping.description = find(/^description$|^descri/)
    mapping.amount = find(/^amount$|^montante$/)
  } else {
    mapping.date = find(/data.*(opera|mov|lan[çc])/) !== -1 ? find(/data.*(opera|mov|lan[çc])/) : find(/^data\b|date/)
    mapping.description = find(/descri|description|movimento|detalhe|details?|narrative|memo|referência|referencia|concept/)
    mapping.debit = find(DEBIT_HEADER)
    mapping.credit = find(CREDIT_HEADER)
    if (mapping.debit === -1 || mapping.credit === -1) {
      mapping.debit = -1; mapping.credit = -1
      mapping.amount = find(/montante|^amount$|^valor\b|import[aâ]ncia|^value/)
    }
    const brand = (re) => find(re) !== -1 || rows.slice(0, 40).some((r) => r.some((c) => re.test(c)))
    if (brand(/santander/i)) format = 'santander'
    else if (brand(/trade\s*republic/i)) format = 'traderepublic'
  }

  refineMappingWithData(mapping, headers, dataRows, dateHint)

  if (mapping.date === -1 || mapping.description === -1 || (mapping.amount === -1 && mapping.debit === -1)) {
    format = 'unknown'
  }
  return { format, headers, dataRows, mapping, dateHint, openingBalance }
}

/**
 * Confirma/corrige o mapeamento olhando para os próprios dados — nos PDFs os nomes
 * das colunas nem sempre chegam (ex.: no extrato Santander a data chama-se "Mov" e
 * há duas colunas "Valor": a data-valor e o montante).
 */
function refineMappingWithData(mapping, headers, dataRows, dateHint) {
  const sample = dataRows.filter((r) => r.some((c) => c && String(c).trim() !== '')).slice(0, 150)
  if (sample.length === 0) return
  const ncols = Math.max(headers.length, ...sample.map((r) => r.length))

  const rate = (idx, fn) => {
    if (idx == null || idx < 0) return 0
    let hit = 0, total = 0
    for (const r of sample) {
      const v = r[idx]
      if (v != null && String(v).trim() !== '') { total++; if (fn(v) != null) hit++ }
    }
    return total === 0 ? 0 : hit / total
  }
  const dateRate = (k) => rate(k, (v) => parseDate(v, dateHint))

  // coluna da data: a que mais parece conter datas
  if (dateRate(mapping.date) < 0.5) {
    let best = -1, bestRate = 0.5
    for (let k = 0; k < ncols; k++) {
      const r = dateRate(k)
      if (r > bestRate) { bestRate = r; best = k }
    }
    if (best !== -1) mapping.date = best
  }

  // coluna do montante (quando não há débito/crédito): valores numéricos, excluindo
  // data e saldo; em caso de empate fica a coluna mais à direita (posição habitual)
  if (mapping.debit === -1
      && (mapping.amount === -1 || mapping.amount === mapping.date || rate(mapping.amount, parseAmount) < 0.5)) {
    let best = -1, bestRate = 0.5
    for (let k = 0; k < ncols; k++) {
      if (k === mapping.date || k === mapping.balance || k === mapping.description) continue
      const r = rate(k, parseAmount)
      if (r >= bestRate) { bestRate = r; best = k }
    }
    if (best !== -1) mapping.amount = best
  }

  // coluna da descrição: a de texto mais longo que não seja data nem número
  if (mapping.description === -1 || mapping.description === mapping.date || mapping.description === mapping.amount) {
    let best = -1, bestLen = 0
    for (let k = 0; k < ncols; k++) {
      if (k === mapping.date || k === mapping.amount || k === mapping.balance
          || k === mapping.debit || k === mapping.credit) continue
      if (rate(k, parseAmount) > 0.5 || dateRate(k) > 0.5) continue
      let len = 0, n = 0
      for (const r of sample) {
        const v = r[k]
        if (v && String(v).trim() !== '') { len += String(v).length; n++ }
      }
      const avg = n === 0 ? 0 : len / n
      if (avg > bestLen) { bestLen = avg; best = k }
    }
    if (best !== -1 && bestLen >= 4) mapping.description = best
  }
}

function emptyMapping() {
  return { date: -1, description: -1, amount: -1, debit: -1, credit: -1, currency: -1, state: -1, fee: -1, balance: -1 }
}

/**
 * Constrói as transações a importar a partir das linhas de dados e do mapeamento.
 * Devolve { rows: [{date, description, amount, inflow, category}], ignored }.
 */
export function buildTransactions(dataRows, mapping, dateHint, openingBalance = null) {
  const out = []
  let ignored = 0
  for (const cells of dataRows) {
    const date = parseDate(cells[mapping.date], dateHint)
    const description = (cells[mapping.description] || '').trim()

    let value = null
    if (mapping.amount !== -1) {
      value = parseAmount(cells[mapping.amount])
      if (value != null && mapping.fee !== -1) {
        const fee = parseAmount(cells[mapping.fee])
        if (fee) value -= Math.abs(fee)
      }
    } else {
      const debit = parseAmount(cells[mapping.debit])
      const credit = parseAmount(cells[mapping.credit])
      if (debit) value = -Math.abs(debit)
      else if (credit) value = Math.abs(credit)
    }

    // Linhas sem data nem valor não são movimentos falhados — é o texto que rodeia
    // a tabela nos PDF (cabeçalhos repetidos entre páginas, resumos, rodapés).
    // Não contam para o total de ignoradas, senão o utilizador vê dezenas delas.
    if (date == null && value == null) continue
    if (!date || !description) { ignored++; continue }

    if (mapping.state !== -1) {
      // ignora movimentos não finalizados (pendentes, revertidos, recusados…) em qualquer idioma conhecido
      const state = (cells[mapping.state] || '').trim()
      if (state && /pend|revert|declin|fail|cancel|recus|anulad|estorn/i.test(state)) { ignored++; continue }
    }
    if (mapping.currency !== -1) {
      const cur = (cells[mapping.currency] || '').trim().toUpperCase()
      if (cur && cur !== 'EUR') { ignored++; continue }
    }

    if (value == null || value === 0) { ignored++; continue }

    out.push({
      date, description, value,
      balance: mapping.balance !== -1 ? parseAmount(cells[mapping.balance]) : null,
    })
  }

  // Extratos sem sinal no montante (comum em PDF): infere entrada/saída pela evolução do saldo.
  if (mapping.amount !== -1 && mapping.balance !== -1 && out.length >= 1 && !out.some((r) => r.value < 0)) {
    const signs = inferSignsFromBalance(out, openingBalance)
    if (signs) for (let i = 0; i < out.length; i++) {
      if (signs[i] !== 0) out[i].value = signs[i] * Math.abs(out[i].value)
    }
  }

  return {
    rows: out.map((r) => {
      const inflow = r.value > 0
      return {
        date: r.date, description: r.description,
        amount: Math.round(Math.abs(r.value) * 100) / 100,
        inflow,
        category: autoCategory(r.description, inflow),
      }
    }),
    ignored,
    closingBalance: closingBalanceOf(out),
  }
}

/**
 * Saldo da conta no fim do extrato — o saldo do movimento mais recente. É o
 * próprio banco a dizer o saldo, por isso vale mais do que ir somando movimentos
 * (que duplicaria se o extrato for de um período já refletido no saldo).
 *
 * Só o devolve depois de confirmar que a coluna de saldo bate certo com os
 * movimentos (cada saldo = saldo anterior + valor do movimento). Se a coluna foi
 * mal lida, ou se o extrato começa a meio de um período, os saldos não encadeiam
 * e mais vale não mexer no saldo da conta do que pô-lo errado.
 */
function closingBalanceOf(entries) {
  if (entries.length === 0 || entries.some((r) => r.balance == null)) return null

  // documento por ordem decrescente (mais recente primeiro) → o fecho é a 1.ª linha
  const chronological = entries[0].date > entries[entries.length - 1].date ? [...entries].reverse() : entries
  for (let i = 1; i < chronological.length; i++) {
    const delta = chronological[i].balance - chronological[i - 1].balance
    if (Math.abs(delta - chronological[i].value) > 0.015) return null
  }
  return chronological[chronological.length - 1].balance
}

/**
 * Dado [{value (abs), balance}], tenta deduzir o sinal de cada movimento comparando
 * saldos consecutivos, nas duas ordens possíveis (mais antigo primeiro / mais recente
 * primeiro). Devolve um array de -1/0/+1, ou null se os saldos não forem consistentes.
 */
function inferSignsFromBalance(entries, openingBalance = null) {
  const n = entries.length
  let best = null, bestScore = -1
  let comparable = 0
  for (const dir of [1, -1]) {
    const signs = new Array(n).fill(0)
    let score = 0
    let pairs = 0
    // Semente: o saldo inicial resolve o sentido do 1.º movimento cronológico
    // (dir=1 → entries[0]; dir=-1 → entries[n-1]), que de outra forma não tem
    // saldo anterior com que comparar. Só conta quando bate certo — um saldo
    // inicial errado é simplesmente ignorado (sem regressão).
    if (openingBalance != null) {
      const fc = dir === 1 ? 0 : n - 1
      const e = entries[fc]
      if (e && e.balance != null) {
        const delta = e.balance - openingBalance
        const amt = Math.abs(e.value)
        if (Math.abs(delta - amt) < 0.015) { signs[fc] = 1; score++; pairs++ }
        else if (Math.abs(delta + amt) < 0.015) { signs[fc] = -1; score++; pairs++ }
      }
    }
    for (let i = 0; i < n - 1; i++) {
      // dir=1: ordem cronológica (saldo[i+1] = saldo[i] ± valor[i+1]); dir=-1: mais recente primeiro
      const [prev, next, j] = dir === 1 ? [entries[i], entries[i + 1], i + 1] : [entries[i + 1], entries[i], i]
      if (prev.balance == null || next.balance == null) continue
      pairs++
      const delta = next.balance - prev.balance
      const amt = Math.abs(entries[j].value)
      if (Math.abs(delta - amt) < 0.015) { signs[j] = 1; score++ }
      else if (Math.abs(delta + amt) < 0.015) { signs[j] = -1; score++ }
    }
    comparable = Math.max(comparable, pairs)
    if (score > bestScore) { bestScore = score; best = signs }
  }
  // só aceita se a grande maioria dos pares consecutivos bater certo
  if (comparable === 0 || bestScore < Math.max(1, Math.ceil(comparable * 0.6))) return null
  return best
}
