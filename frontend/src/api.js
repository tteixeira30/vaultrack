// Em web usa o proxy relativo ('/api'); em builds mobile (Capacitor/PWA instalada
// noutro host) define-se VITE_API_URL com o URL absoluto do backend.
const BASE = import.meta.env.VITE_API_URL || '/api'
const TOKEN_KEY = 'tracky_token'

let onUnauthorized = null
export const setOnUnauthorized = (fn) => { onUnauthorized = fn }

export const getToken = () => localStorage.getItem(TOKEN_KEY)
export const setToken = (token) => localStorage.setItem(TOKEN_KEY, token)
export const clearToken = () => localStorage.removeItem(TOKEN_KEY)

/**
 * Erro com o código HTTP anexado.
 *
 * Quem apanha precisa de distinguir "o servidor recusou o token" (401) de "não
 * se chegou ao servidor" (502, timeout, telemóvel sem rede): só o primeiro é
 * motivo para terminar a sessão.
 */
const httpError = (message, status) => Object.assign(new Error(message), { status })

async function request(path, options = {}) {
  const headers = { 'Content-Type': 'application/json' }
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`

  const res = await fetch(BASE + path, { headers, ...options })

  if (res.status === 401 && !path.startsWith('/auth/')) {
    clearToken()
    onUnauthorized?.()
    throw httpError('Sessão expirada. Inicia sessão novamente.', 401)
  }

  const text = await res.text()
  if (!res.ok) {
    let message = `Erro ${res.status}`
    try { message = JSON.parse(text).message || message } catch { if (text) message = text }
    throw httpError(message, res.status)
  }
  return text ? JSON.parse(text) : null
}

export const api = {
  // Painel geral
  getDashboard: () => request('/dashboard'),

  // Conquistas
  getAchievements: () => request('/achievements'),

  // Contagens dos indicadores da navegação (os números da sidebar)
  getNavCounts: () => request('/nav'),

  // Calendário financeiro
  getCalendar: (month) => request(`/calendar${month ? `?month=${month}` : ''}`),
  getUpcoming: (days = 60) => request(`/calendar/upcoming?days=${days}`),
  addCalendarEvent: (data) => request('/calendar/events', { method: 'POST', body: JSON.stringify(data) }),
  updateCalendarEvent: (id, data) => request(`/calendar/events/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteCalendarEvent: (id) => request(`/calendar/events/${id}`, { method: 'DELETE' }),

  // Moeda
  getCurrency: () => request('/currency'),
  setCurrency: (baseCurrency) => request('/auth/me/currency', { method: 'PUT', body: JSON.stringify({ baseCurrency }) }),

  // Autenticação
  register: (data) => request('/auth/register', { method: 'POST', body: JSON.stringify(data) }),
  login: (data) => request('/auth/login', { method: 'POST', body: JSON.stringify(data) }),
  me: () => request('/auth/me'),

  // Rendimento (mensal)
  getIncome: (month) => request(`/income${month ? `?month=${month}` : ''}`),
  setIncome: (monthlyIncome, month) => request(`/income${month ? `?month=${month}` : ''}`, { method: 'PUT', body: JSON.stringify({ monthlyIncome }) }),
  addAllocation: (data, month) => request(`/income/allocations${month ? `?month=${month}` : ''}`, { method: 'POST', body: JSON.stringify(data) }),
  updateAllocation: (id, data) => request(`/income/allocations/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteAllocation: (id) => request(`/income/allocations/${id}`, { method: 'DELETE' }),
  addAllocationItem: (allocId, data) => request(`/income/allocations/${allocId}/items`, { method: 'POST', body: JSON.stringify(data) }),
  updateAllocationItem: (id, data) => request(`/income/allocations/items/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteAllocationItem: (id) => request(`/income/allocations/items/${id}`, { method: 'DELETE' }),

  // Investimentos
  getInvestments: () => request('/investments'),
  refreshInvestments: () => request('/investments/refresh', { method: 'POST' }),
  addInvestment: (data) => request('/investments', { method: 'POST', body: JSON.stringify(data) }),
  updateInvestment: (id, data) => request(`/investments/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteInvestment: (id) => request(`/investments/${id}`, { method: 'DELETE' }),
  getPortfolioHistory: (range) => request(`/investments/portfolio/history?range=${range}`),
  getProjection: (months, monthly, type, customRate) => {
    let q = `months=${months}&monthly=${monthly || 0}`
    if (type && type !== 'all') q += `&type=${type}`
    if (customRate != null && customRate !== '') q += `&customRate=${customRate}`
    return request(`/investments/projection?${q}`)
  },

  // Depósitos mensais automáticos
  applyDeposits: (scope) => request(`/contributions/apply?scope=${scope}&force=true`, { method: 'POST' }),

  // Objetivos
  getGoals: () => request('/goals'),
  addGoal: (data) => request('/goals', { method: 'POST', body: JSON.stringify(data) }),
  updateGoal: (id, data) => request(`/goals/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  contributeGoal: (id, amount) => request(`/goals/${id}/contribute`, { method: 'POST', body: JSON.stringify({ amount }) }),
  deleteGoal: (id) => request(`/goals/${id}`, { method: 'DELETE' }),

  // Despesas e contas correntes
  getExpenses: (month, accountId) => {
    const q = new URLSearchParams()
    if (month) q.set('month', month)
    if (accountId) q.set('accountId', accountId)
    const s = q.toString()
    return request(`/expenses${s ? `?${s}` : ''}`)
  },
  addExpenseAccount: (data) => request('/expenses/accounts', { method: 'POST', body: JSON.stringify(data) }),
  updateExpenseAccount: (id, data) => request(`/expenses/accounts/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteExpenseAccount: (id) => request(`/expenses/accounts/${id}`, { method: 'DELETE' }),
  addTransaction: (data) => request('/expenses/transactions', { method: 'POST', body: JSON.stringify(data) }),
  updateTransaction: (id, data) => request(`/expenses/transactions/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteTransaction: (id) => request(`/expenses/transactions/${id}`, { method: 'DELETE' }),
  importTransactions: (data) => request('/expenses/import', { method: 'POST', body: JSON.stringify(data) }),
  getPeriodUsage: (accountId, from, to) =>
    request(`/expenses/period-usage?accountId=${accountId}&from=${from}&to=${to}`),
  getCategoryRules: () => request('/expenses/rules'),
  deleteCategoryRule: (id) => request(`/expenses/rules/${id}`, { method: 'DELETE' }),

  // Categorias de despesa personalizadas (as por omissão vivem em categories.js)
  getExpenseCategories: () => request('/expenses/categories'),
  addExpenseCategory: (data) => request('/expenses/categories', { method: 'POST', body: JSON.stringify(data) }),
  updateExpenseCategory: (id, data) => request(`/expenses/categories/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteExpenseCategory: (id) => request(`/expenses/categories/${id}`, { method: 'DELETE' }),
}

// ---------- Modo privacidade ----------
// Quando ativo, todos os valores monetários formatados aparecem mascarados.
// As percentagens e contagens continuam visíveis (padrão das apps bancárias).
let privacyMode = false
const PRIVACY_MASK = '••••'

export const setPrivacyMode = (on) => { privacyMode = !!on }
export const getPrivacyMode = () => privacyMode

// ---------- Moeda de apresentação ----------
// O backend devolve sempre valores em EUR; aqui convertem-se para a moeda base
// escolhida pelo utilizador (rate = quantas unidades da base valem 1 EUR).
let displayCurrency = 'EUR'
let displayRate = 1

export const setDisplayCurrency = (currency, rateFromEur) => {
  displayCurrency = currency || 'EUR'
  displayRate = Number(rateFromEur) > 0 ? Number(rateFromEur) : 1
}
export const getDisplayCurrency = () => displayCurrency

// Moedas suportadas (código, símbolo e nome em PT-PT). A ordem é a do seletor.
export const CURRENCIES = [
  { code: 'EUR', symbol: '€', name: 'Euro' },
  { code: 'USD', symbol: '$', name: 'Dólar EUA' },
  { code: 'GBP', symbol: '£', name: 'Libra' },
  { code: 'BRL', symbol: 'R$', name: 'Real' },
  { code: 'CHF', symbol: 'Fr', name: 'Franco suíço' },
  { code: 'CAD', symbol: 'C$', name: 'Dólar canadiano' },
  { code: 'AUD', symbol: 'A$', name: 'Dólar australiano' },
  { code: 'JPY', symbol: '¥', name: 'Iene' },
]

// Símbolos das moedas suportadas — usados nos afixos dos campos de input.
export const CURRENCY_SYMBOLS = Object.fromEntries(CURRENCIES.map((c) => [c.code, c.symbol]))

/** Símbolo da moeda base ativa (ex: '€', '$'), para rótulos de campos monetários. */
export const getCurrencySymbol = () => CURRENCY_SYMBOLS[displayCurrency] || displayCurrency

/**
 * Lê um número escrito por uma pessoa em PT-PT.
 *
 * Os campos monetários são `type="text"` com `inputMode="decimal"`: o teclado
 * numérico do telemóvel oferece vírgula, e um `type="number"` descartava
 * "1,5" em silêncio. Aceita as duas convenções:
 *   "1234,56" → 1234.56    "1.234,56" → 1234.56    "1234.56" → 1234.56
 * Devolve NaN quando não dá para ler — quem chama decide o que fazer.
 */
export const parseAmount = (v) => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN
  if (v == null) return NaN

  let s = String(v).trim().replace(/\s/g, '')
  if (s === '') return NaN

  const hasComma = s.includes(',')
  const hasDot = s.includes('.')
  // com ambos, o ponto é separador de milhares e a vírgula é a decimal
  if (hasComma && hasDot) s = s.replace(/\./g, '').replace(',', '.')
  else if (hasComma) s = s.replace(',', '.')

  const n = Number(s)
  return Number.isFinite(n) ? n : NaN
}

/** Converte um valor introduzido na moeda base para EUR (para enviar ao backend). */
export const toEur = (baseValue) => {
  const n = parseAmount(baseValue)
  if (!Number.isFinite(n)) return baseValue
  return displayRate === 1 ? n : n / displayRate
}

/** Converte um valor em EUR (do backend) para a moeda base, para pré-preencher inputs. */
export const fromEur = (eurValue) => {
  const n = Number(eurValue)
  if (!Number.isFinite(n)) return eurValue
  return displayRate === 1 ? n : Math.round(n * displayRate * 100) / 100
}

/** Formata um valor em EUR, convertido e apresentado na moeda base. */
export const fmtEur = (v) => {
  if (v == null) return '—'
  if (privacyMode) return PRIVACY_MASK
  return new Intl.NumberFormat('pt-PT', { style: 'currency', currency: displayCurrency }).format(v * displayRate)
}

/**
 * Valor com sinal explícito — o `sgn()` do design.
 *
 * O design escreve sempre "+3819,88 €" / "−250,00 €" nos números que são uma
 * variação (ganho da carteira, saldo do mês, líquido do calendário): sem o
 * sinal, um saldo negativo só se distingue pela cor, e a cor sozinha não chega.
 * O "−" é o menos tipográfico (U+2212), não o hífen.
 */
export const fmtSigned = (v) => {
  if (v == null) return '—'
  const n = Number(v)
  if (!Number.isFinite(n)) return '—'
  return `${n >= 0 ? '+' : '−'}${fmtEur(Math.abs(n))}`
}

/** Versão curta (sem casas decimais) para eixos de gráficos, na moeda base. */
export const fmtMoneyShort = (v) => {
  if (v == null) return ''
  if (privacyMode) return PRIVACY_MASK
  const parts = new Intl.NumberFormat('pt-PT', {
    style: 'currency', currency: displayCurrency, maximumFractionDigits: 0,
  }).formatToParts(v * displayRate)
  return parts.map((p) => p.value).join('')
}

/**
 * Percentagem na convenção pt-PT: vírgula decimal, como todos os outros números
 * da app, e sem espaço antes do "%" (o `style: 'percent'` do Intl mete lá um
 * espaço fino que o design não tem).
 *
 * `digits` fixa as casas decimais; omitido, mostra até duas e só as que
 * existirem — é o que serve as percentagens escritas pelo utilizador (12,5%
 * fica "12,5%", 30% fica "30%"), enquanto os valores calculados pedem um
 * número fixo de casas para as colunas alinharem.
 */
export const fmtPercent = (v, digits = null) => {
  if (v == null) return '—'
  const n = Number(v)
  if (!Number.isFinite(n)) return '—'
  const fmt = new Intl.NumberFormat('pt-PT', digits == null
    ? { minimumFractionDigits: 0, maximumFractionDigits: 2 }
    : { minimumFractionDigits: digits, maximumFractionDigits: digits })
  return `${fmt.format(n)}%`
}

/**
 * Percentagem que é uma **variação** (rentabilidade), com duas casas e o sinal
 * sempre à frente — o `fmtSigned` do mundo das percentagens, incluindo o menos
 * tipográfico (U+2212). Para percentagens que são uma proporção (peso na
 * carteira, progresso de um objetivo) usa-se o `fmtPercent`, sem sinal.
 */
export const fmtPct = (v) => {
  if (v == null) return '—'
  const n = Number(v)
  if (!Number.isFinite(n)) return '—'
  return `${n >= 0 ? '+' : '−'}${fmtPercent(Math.abs(n), 2)}`
}
