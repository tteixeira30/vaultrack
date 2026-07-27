import { expect, test } from '@fixtures/test'

test.describe('painel (dashboard) — agregação', () => {
  test('conta nova mostra património zero e sugere adicionar dados', async ({ dashboardPage }) => {
    await dashboardPage.goto()

    await dashboardPage.expectNetWorth(0)
    await expect(dashboardPage.emptyHint).toBeVisible()
  })

  test('património líquido = investimentos + poupança', async ({
    dashboardPage,
    incomePage,
    investmentsPage,
    goalsPage,
  }) => {
    await incomePage.goto()
    await incomePage.setMonthlyIncome(2000)
    await incomePage.expectIncome(2000)

    await investmentsPage.goto()
    await investmentsPage.createManual({ name: 'Carteira Painel', value: 1000 })

    await goalsPage.goto()
    await goalsPage.create({ name: 'Meta Painel', target: 5000, monthly: 100, saved: 500 })

    // Painel: 1000 (investido) + 500 (poupado) = 1500 de património líquido
    await dashboardPage.goto()
    await dashboardPage.expectNetWorth(1500)
    await dashboardPage.kpis.expectValue('Valor investido', 1000)
    await dashboardPage.kpis.expectValue('Poupado em objetivos', 500)
    await dashboardPage.kpis.expectValue('Rendimento do mês', 2000)
  })
})
