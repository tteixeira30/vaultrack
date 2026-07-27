import { expect, test } from '@fixtures/test'

test.describe('calendário financeiro', () => {
  test('criar um evento mensal e vê-lo na lista de eventos', async ({ calendarPage }) => {
    await calendarPage.goto()

    // tipo por omissão: Saída · frequência por omissão: Mensal, dia 1
    await calendarPage.createEvent({ name: 'Renda E2E', amount: 800 })

    await expect(calendarPage.event('Renda E2E')).toBeVisible()
  })

  // O saldo de partida da previsão vem da soma das contas bancárias (Despesas).
  test('o saldo das contas ativa a previsão a 60 dias', async ({ expensesPage, calendarPage }) => {
    await expensesPage.goto()
    await expensesPage.createAccount('Conta E2E', 2500)

    await calendarPage.goto()

    await expect(calendarPage.forecast).toBeVisible()
  })

  test('evento de entrada mensal entra na previsão de saldo', async ({ expensesPage, calendarPage }) => {
    await expensesPage.goto()
    await expensesPage.createAccount('Conta E2E', 1000)

    await calendarPage.goto()
    await expect(calendarPage.forecast).toBeVisible()

    await calendarPage.createEvent({ name: 'Salário E2E', amount: 2000, type: 'Entrada' })

    // a previsão inclui o novo movimento
    await expect(calendarPage.event('Salário E2E')).toBeVisible()
  })
})
