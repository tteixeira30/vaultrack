// Em web usa o proxy relativo ('/api'); em builds mobile (Capacitor/PWA instalada
// noutro host) define-se VITE_API_URL com o URL absoluto do backend.
const BASE = import.meta.env.VITE_API_URL || '/api'
const TOKEN_KEY = 'tracky_token'

let onUnauthorized = null
export const setOnUnauthorized = (fn) => { onUnauthorized = fn }

export const getToken = () => localStorage.getItem(TOKEN_KEY)
export const setToken = (token) => localStorage.setItem(TOKEN_KEY, token)
export const clearToken = () => localStorage.removeItem(TOKEN_KEY)

async function request(path, options = {}) {
  const headers = { 'Content-Type': 'application/json' }
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`

  const res = await fetch(BASE + path, { headers, ...options })

  if (res.status === 401 && !path.startsWith('/auth/')) {
    clearToken()
    onUnauthorized?.()
    throw new Error('Sessão expirada. Inicia sessão novamente.')
  }

  const text = await res.text()
  if (!res.ok) {
    let message = `Erro ${res.status}`
    try { message = JSON.parse(text).message || message } catch { if (text) message = text }
    throw new Error(message)
  }
  return text ? JSON.parse(text) : null
}

export const api = {
  // Painel geral
  getDashboard: () => request('/dashboard'),

  // Conquistas
  getAchievements: () => request('/achievements'),

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

// Símbolos das moedas suportadas — usados nos afixos dos campos de input.
export const CURRENCY_SYMBOLS = {
  EUR: '€', USD: '$', GBP: '£', BRL: 'R$', CHF: 'Fr', CAD: 'C$', AUD: 'A$', JPY: '¥',
}

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

/** Versão curta (sem casas decimais) para eixos de gráficos, na moeda base. */
export const fmtMoneyShort = (v) => {
  if (v == null) return ''
  if (privacyMode) return PRIVACY_MASK
  const parts = new Intl.NumberFormat('pt-PT', {
    style: 'currency', currency: displayCurrency, maximumFractionDigits: 0,
  }).formatToParts(v * displayRate)
  return parts.map((p) => p.value).join('')
}

export const fmtPct = (v) =>
  v == null ? '—' : `${v >= 0 ? '+' : ''}${Number(v).toFixed(2)}%`
