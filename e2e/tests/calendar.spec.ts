import { expect, test } from '@fixtures/test'

test.describe('calendário financeiro', () => {
  test('criar um evento mensal e vê-lo na lista de eventos', async ({ calendarPage }) => {
    await calendarPage.goto()

    // tipo por omissão: Saída · frequência por omissão: Mensal, dia 1
    await calendarPage.createEvent({ name: 'Renda E2E', amount: 800 })

    await expect(calendarPage.event('Renda E2E')).toBeVisible()
  })

  test('um evento edita-se a partir do dia em que cai', async ({ calendarPage }) => {
    await calendarPage.goto()
    await calendarPage.createEvent({ name: 'Netflix E2E', amount: 12 })

    // o dia 1 é onde caem os eventos mensais criados por omissão
    await calendarPage.renameEventFromDay(1, 'Netflix E2E', 'Netflix Família E2E')

    await expect(calendarPage.event('Netflix Família E2E')).toBeVisible()
  })

  // Antes só se podia eliminar e recriar: o backend já sabia excluir eventos
  // inativos das ocorrências, mas nada na UI os sabia pausar.
  test('pausar um evento tira-o do calendário sem o eliminar', async ({ calendarPage }) => {
    await calendarPage.goto()
    await calendarPage.createEvent({ name: 'Ginásio E2E', amount: 40 })
    await expect(calendarPage.day(1)).toBeVisible()

    await calendarPage.toggleEvent('Ginásio E2E', 'Pausar')

    // continua na lista, assinalado, mas o dia 1 volta a estar vazio
    await expect(calendarPage.pausedBadge).toBeVisible()
    await expect(calendarPage.emptyDay(1)).toBeVisible()

    await calendarPage.toggleEvent('Ginásio E2E', 'Retomar')

    await expect(calendarPage.day(1)).toBeVisible()
    await expect(calendarPage.pausedBadge).toBeHidden()
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
