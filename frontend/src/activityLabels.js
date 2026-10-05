import { fmtEur, fmtSigned } from './api'
import { fmtDayMonth } from './components/MonthContext'

/**
 * Textos da "Atividade recente": ação × entidade em PT-PT, rótulos dos campos e o
 * dispositivo resumido a partir do user agent. Os montantes chegam em EUR e
 * formatam-se com fmtEur (respeita a moeda base).
 */

// [nome, feminino?] — "Objetivo criado", "Conta criada"
const ENTITIES = {
  USER: ['Conta de utilizador', true],
  GOAL: ['Objetivo', false],
  INVESTMENT: ['Investimento', false],
  ACCOUNT: ['Conta', true],
  TRANSACTION: ['Movimento', false],
  CATEGORY: ['Categoria', true],
  CATEGORY_RULE: ['Regra de categoria', true],
  INCOME: ['Rendimento', false],
  ALLOCATION: ['Categoria do orçamento', true],
  ALLOCATION_ITEM: ['Item do orçamento', false],
  CALENDAR_EVENT: ['Evento do calendário', false],
}

const VERBS = {
  CREATED: ['criado', 'criada'],
  UPDATED: ['alterado', 'alterada'],
  DELETED: ['apagado', 'apagada'],
}

const ACTIONS = {
  REGISTERED: 'Conta registada',
  LOGIN_SUCCEEDED: 'Sessão iniciada',
  LOGIN_FAILED: 'Tentativa de entrada falhada',
  RATE_LIMITED: 'Demasiadas tentativas',
  INVITE_REJECTED: 'Código de convite recusado',
  CONTRIBUTED: 'Reforço de objetivo',
  IMPORTED: 'Extrato importado',
  CONTRIBUTIONS_APPLIED: 'Reforços mensais aplicados',
}

/** Ações que merecem destaque (âmbar): alguém a tentar entrar. */
export const isWarning = (e) => e.action === 'LOGIN_FAILED' || e.action === 'RATE_LIMITED'
  || e.action === 'INVITE_REJECTED'

export const FIELD_LABELS = {
  name: 'Nome', label: 'Nome', key: 'Chave', symbol: 'Símbolo', type: 'Tipo', description: 'Descrição',
  targetAmount: 'Valor do objetivo', monthlyAllocation: 'Contribuição mensal', savedAmount: 'Poupado',
  autoDeposit: 'Depósito automático', contributionDay: 'Dia do reforço',
  initialValue: 'Valor investido', fallbackValue: 'Valor atual', monthlyContribution: 'Reforço mensal',
  category: 'Categoria', inflow: 'Entrada', amount: 'Montante', frequency: 'Frequência',
  dayOfMonth: 'Dia do mês', eventDate: 'Data', date: 'Data', active: 'Ativo',
  monthlyIncome: 'Rendimento mensal', percentage: 'Percentagem', fixedAmount: 'Valor fixo', color: 'Cor',
  currentBalance: 'Saldo', accountId: 'Conta', allocationId: 'Categoria', month: 'Mês',
  baseCurrency: 'Moeda base', applyToSimilar: 'Aplicar aos semelhantes',
}

export const MONEY_FIELDS = new Set([
  'targetAmount', 'monthlyAllocation', 'savedAmount', 'initialValue', 'fallbackValue',
  'monthlyContribution', 'amount', 'monthlyIncome', 'fixedAmount', 'currentBalance',
  'total', 'closingBalance',
])

export function actionLabel(e) {
  if (ACTIONS[e.action]) return ACTIONS[e.action]
  if (e.entityType === 'USER' && e.details?.changes?.baseCurrency) return 'Moeda base alterada'
  const [noun, fem] = ENTITIES[e.entityType] || ['Registo', false]
  const verb = VERBS[e.action]
  return verb ? `${noun} ${verb[fem ? 1 : 0]}` : noun
}

export function fmtValue(field, v) {
  if (v == null || v === '') return '—'
  if (MONEY_FIELDS.has(field)) return fmtEur(v)
  if (typeof v === 'boolean') return v ? 'sim' : 'não'
  if (field === 'percentage') return `${String(v).replace('.', ',')}%`
  return String(v)
}

/** Uma linha de contexto: o que mudou, quanto, quantos. */
export function summary(e) {
  const d = e.details || {}
  switch (e.action) {
    case 'UPDATED': {
      const changes = Object.entries(d.changes || {})
      const shown = changes.slice(0, 2).map(([f, [a, b]]) =>
        `${FIELD_LABELS[f] || f}: ${fmtValue(f, a)} → ${fmtValue(f, b)}`)
      if (changes.length > 2) shown.push(`+${changes.length - 2}`)
      return [d.label, ...shown].filter(Boolean).join(' · ')
    }
    case 'CONTRIBUTED':
      return [d.label, fmtSigned(d.amount)].filter(Boolean).join(' · ')
    case 'IMPORTED':
      return `${d.label ? `${d.label} · ` : ''}${d.imported ?? 0} importados, ${d.skipped ?? 0} já existiam`
    case 'CONTRIBUTIONS_APPLIED': {
      const n = Array.isArray(d.items) ? d.items.length : 0
      return `${fmtEur(d.total)} em ${n} ${n === 1 ? 'reforço' : 'reforços'}${d.forced ? ' (simulação)' : ''}`
    }
    case 'RATE_LIMITED':
      return d.endpoint === 'register' ? 'No registo' : 'Na entrada'
    default:
      return d.label || ''
  }
}

/** "05 out 14:32" — data e hora locais. */
export function fmtWhen(iso) {
  const t = new Date(iso)
  const hh = String(t.getHours()).padStart(2, '0')
  const mm = String(t.getMinutes()).padStart(2, '0')
  return `${fmtDayMonth(iso)} ${hh}:${mm}`
}

/** "Chrome · Android"; sem user agent (ação automática) → "Automático". */
export function device(e) {
  if (e.actor === 'SYSTEM') return 'Automático'
  const ua = e.userAgent || ''
  if (!ua) return null
  const os = /Android/i.test(ua) ? 'Android'
    : /iPhone|iPad|iPod/i.test(ua) ? 'iOS'
      : /Windows/i.test(ua) ? 'Windows'
        : /Mac OS X|Macintosh/i.test(ua) ? 'macOS'
          : /Linux/i.test(ua) ? 'Linux' : null
  const browser = /Edg\//.test(ua) ? 'Edge'
    : /Firefox\//.test(ua) ? 'Firefox'
      : /Chrome\//.test(ua) ? 'Chrome'
        : /Safari\//.test(ua) ? 'Safari' : null
  const parts = [browser, os].filter(Boolean)
  return parts.length ? parts.join(' · ') : 'Outro dispositivo'
}
