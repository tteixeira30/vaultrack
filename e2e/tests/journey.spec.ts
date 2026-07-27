import { expect, test } from '@fixtures/test'
import { buildCsv } from '@utils/data'

/**
 * Percurso completo de um utilizador novo: passa por todas as áreas principais
 * (rendimento → despesas + import → investimento → objetivo) e confirma no fim
 * que o Painel agrega tudo. Complementa os specs por-feature: aqui interessa a
 * integração entre elas, não cada CRUD isolado.
 *
 * Tudo determinístico — investimento manual (tipo "Outro", sem cotação) e
 * movimentos criados pelo próprio teste.
 */
test('percurso completo: rendimento, despesas, investimento e objetivo agregam no painel @smoke', async ({
  incomePage,
  expensesPage,
  investmentsPage,
  goalsPage,
  dashboardPage,
}) => {
  await test.step('1) rendimento mensal', async () => {
    await incomePage.goto()
    await incomePage.setMonthlyIncome(2000)
    await incomePage.expectIncome(2000)
  })

  await test.step('2) despesas — conta e importação de extrato', async () => {
    await expensesPage.goto()
    await expensesPage.createAccount('Conta Principal', 3000)
    await expensesPage.importStatement(
      buildCsv([
        { day: 4, description: 'Continente', amount: -60 },
        { day: 8, description: 'Salário', amount: 2000 },
      ]),
      2,
    )
    await expect(expensesPage.movement('Continente')).toBeVisible()
  })

  await test.step('3) investimento manual', async () => {
    await investmentsPage.goto()
    await investmentsPage.createManual({ name: 'Carteira Longo Prazo', value: 1000 })
  })

  await test.step('4) objetivo com 500€ já poupados', async () => {
    await goalsPage.goto()
    await goalsPage.create({ name: 'Fundo de Emergência', target: 5000, monthly: 200, saved: 500 })
  })

  await test.step('5) o painel agrega tudo', async () => {
    await dashboardPage.goto()
    // património = investido (1000) + poupado (500)
    await dashboardPage.expectNetWorth(1500)
    await dashboardPage.kpis.expectValue('Valor investido', 1000)
    await dashboardPage.kpis.expectValue('Poupado em objetivos', 500)
    await dashboardPage.kpis.expectValue('Rendimento do mês', 2000)
  })
})
