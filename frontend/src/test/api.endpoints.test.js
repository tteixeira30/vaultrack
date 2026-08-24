import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../api'

// Verifica que cada método do cliente monta o URL, método HTTP e corpo certos —
// em especial a construção condicional de query strings (mês, range, projeção).
const jsonResponse = (body = {}) => Promise.resolve(new Response(JSON.stringify(body), { status: 200 }))

const call = async (fn) => {
  fetch.mockClear()
  fetch.mockReturnValue(jsonResponse())
  await fn()
  const [url, options = {}] = fetch.mock.calls[0]
  return { url, method: options.method, body: options.body ? JSON.parse(options.body) : undefined }
}

describe('endpoints da API', () => {
  beforeEach(() => { global.fetch = vi.fn() })

  it('calendário: mês opcional e eventos', async () => {
    expect((await call(() => api.getCalendar())).url).toBe('/api/calendar')
    expect((await call(() => api.getCalendar('2025-06'))).url).toBe('/api/calendar?month=2025-06')
    expect((await call(() => api.getUpcoming())).url).toBe('/api/calendar/upcoming?days=60')
    expect((await call(() => api.getUpcoming(30))).url).toBe('/api/calendar/upcoming?days=30')

    const add = await call(() => api.addCalendarEvent({ name: 'Renda' }))
    expect(add).toMatchObject({ url: '/api/calendar/events', method: 'POST', body: { name: 'Renda' } })

    const upd = await call(() => api.updateCalendarEvent(5, { name: 'Luz' }))
    expect(upd).toMatchObject({ url: '/api/calendar/events/5', method: 'PUT' })

    const del = await call(() => api.deleteCalendarEvent(5))
    expect(del).toMatchObject({ url: '/api/calendar/events/5', method: 'DELETE' })
  })

  it('moeda: leitura e alteração', async () => {
    expect((await call(() => api.getCurrency())).url).toBe('/api/currency')
    const set = await call(() => api.setCurrency('USD'))
    expect(set).toMatchObject({ url: '/api/auth/me/currency', method: 'PUT', body: { baseCurrency: 'USD' } })
  })

  it('rendimento: mês opcional em leitura e escrita', async () => {
    expect((await call(() => api.getIncome())).url).toBe('/api/income')
    expect((await call(() => api.getIncome('2025-06'))).url).toBe('/api/income?month=2025-06')

    const setNoMonth = await call(() => api.setIncome(2000))
    expect(setNoMonth).toMatchObject({ url: '/api/income', method: 'PUT', body: { monthlyIncome: 2000 } })
    const setMonth = await call(() => api.setIncome(2000, '2025-06'))
    expect(setMonth.url).toBe('/api/income?month=2025-06')

    const addAlloc = await call(() => api.addAllocation({ name: 'Poupança' }, '2025-06'))
    expect(addAlloc).toMatchObject({ url: '/api/income/allocations?month=2025-06', method: 'POST' })
    const addItem = await call(() => api.addAllocationItem(3, { name: 'Renda', amount: 500 }))
    expect(addItem).toMatchObject({ url: '/api/income/allocations/3/items', method: 'POST' })
  })

  it('investimentos: refresh, projeção e histórico com query condicional', async () => {
    expect((await call(() => api.getInvestments())).url).toBe('/api/investments')
    expect((await call(() => api.refreshInvestments())).method).toBe('POST')
    expect((await call(() => api.getPortfolioHistory('6mo'))).url)
      .toBe('/api/investments/portfolio/history?range=6mo')

    // projeção: monthly cai para 0, tipo "all" e customRate vazio são omitidos
    expect((await call(() => api.getProjection(12))).url)
      .toBe('/api/investments/projection?months=12&monthly=0')
    expect((await call(() => api.getProjection(24, 100, 'STOCK', 7))).url)
      .toBe('/api/investments/projection?months=24&monthly=100&type=STOCK&customRate=7')
    expect((await call(() => api.getProjection(24, 100, 'all', ''))).url)
      .toBe('/api/investments/projection?months=24&monthly=100')
  })

  it('depósitos automáticos e objetivos', async () => {
    const apply = await call(() => api.applyDeposits('all'))
    expect(apply).toMatchObject({ url: '/api/contributions/apply?scope=all&force=true', method: 'POST' })

    const contribute = await call(() => api.contributeGoal(2, 50))
    expect(contribute).toMatchObject({ url: '/api/goals/2/contribute', method: 'POST', body: { amount: 50 } })
    const upd = await call(() => api.updateGoal(2, { name: 'Casa' }))
    expect(upd).toMatchObject({ url: '/api/goals/2', method: 'PUT' })
  })

  it('conquistas e dashboard', async () => {
    expect((await call(() => api.getAchievements())).url).toBe('/api/achievements')
    expect((await call(() => api.getDashboard())).url).toBe('/api/dashboard')
  })

  it('despesas: categorias personalizadas (CRUD)', async () => {
    expect((await call(() => api.getExpenseCategories())).url).toBe('/api/expenses/categories')

    const add = await call(() => api.addExpenseCategory({ label: 'Educação', color: '#22d3ee' }))
    expect(add).toMatchObject({
      url: '/api/expenses/categories', method: 'POST', body: { label: 'Educação', color: '#22d3ee' },
    })

    const upd = await call(() => api.updateExpenseCategory(7, { label: 'Formação', color: '#4ade80' }))
    expect(upd).toMatchObject({ url: '/api/expenses/categories/7', method: 'PUT', body: { label: 'Formação', color: '#4ade80' } })

    const del = await call(() => api.deleteExpenseCategory(7))
    expect(del).toMatchObject({ url: '/api/expenses/categories/7', method: 'DELETE' })
  })

  it('despesas: regras de categoria aprendidas', async () => {
    expect((await call(() => api.getCategoryRules())).url).toBe('/api/expenses/rules')

    const del = await call(() => api.deleteCategoryRule(3))
    expect(del).toMatchObject({ url: '/api/expenses/rules/3', method: 'DELETE' })
  })
})
