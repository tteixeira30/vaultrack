import { expect, test } from '@fixtures/test'
import { buildCsv } from '@utils/data'
import { eur } from '@utils/money'

/**
 * Despesas — contas correntes, movimentos manuais e importação de extratos.
 * Tudo determinístico: os movimentos são criados/importados pelo teste. As datas
 * do extrato usam o mês atual, que é o mês por omissão da página (para os
 * movimentos aparecerem sem navegar).
 */
test.describe('despesas — contas', () => {
  test('sem contas mostra estado vazio e as ações estão bloqueadas', async ({ expensesPage }) => {
    await expensesPage.goto()

    await expect(expensesPage.emptyAccountsHint).toBeVisible()
    // sem contas não se pode adicionar/importar movimentos
    await expect(expensesPage.newMovementButton).toBeDisabled()
    await expect(expensesPage.importButton).toBeDisabled()
  })

  test('criar a primeira conta desbloqueia os movimentos', async ({ expensesPage }) => {
    await expensesPage.goto()

    await expensesPage.createAccount('Conta Corrente E2E')

    await expect(expensesPage.newMovementButton).toBeEnabled()
    await expect(expensesPage.importButton).toBeEnabled()
    // já não é o estado "cria contas", passa a "sem movimentos"
    await expect(expensesPage.emptyMovementsHint).toBeVisible()
  })

  test('conta com saldo alimenta o KPI "Saldo em contas"', async ({ expensesPage }) => {
    await expensesPage.goto()

    await expensesPage.createAccount('Poupança E2E', 1000)
    await expensesPage.createAccount('Ordenado E2E', 500)

    // soma das duas contas com saldo definido
    await expensesPage.kpis.expectValue('Saldo em contas', 1500)
    await expect(expensesPage.kpis.sub('Saldo em contas')).toContainText('2 de 2 conta(s) com saldo')
  })

  test('filtrar por conta mostra o saldo dessa conta', async ({ expensesPage }) => {
    await expensesPage.goto()
    await expensesPage.createAccount('Conta A E2E', 1000)
    await expensesPage.createAccount('Conta B E2E', 250)

    await expensesPage.selectAccount('Conta B E2E')

    await expensesPage.kpis.expectValue('Saldo da conta', 250)
  })

  test('eliminar uma conta remove-a e aos seus movimentos', async ({ expensesPage }) => {
    await expensesPage.goto()
    await expensesPage.createAccount('Descartável E2E')
    await expensesPage.addMovement({ description: 'Movimento na conta', amount: 10 })
    await expect(expensesPage.movement('Movimento na conta')).toBeVisible()

    await expensesPage.deleteAccount('Descartável E2E')

    // volta ao estado vazio inicial
    await expect(expensesPage.emptyAccountsHint).toBeVisible()
  })
})

test.describe('despesas — movimentos', () => {
  test('adicionar uma despesa atualiza saídas, saldo e categorias', async ({ expensesPage }) => {
    await expensesPage.goto()
    await expensesPage.createAccount('Conta E2E')

    await expensesPage.addMovement({ description: 'Continente E2E', amount: 45.3, category: 'Supermercado' })

    await expect(expensesPage.movement('Continente E2E')).toBeVisible()

    // KPIs: saídas = 45,30 · saldo do mês negativo
    await expensesPage.kpis.expectValue('Saídas', 45.3)
    const saldoMes = expensesPage.kpis.value('Saldo do mês')
    await expect(saldoMes).toHaveText(eur(45.3))
    await expect(saldoMes).toHaveClass(/neg/)

    // gráfico de despesas por categoria inclui "Supermercado"
    await expect(expensesPage.categoryBar('Supermercado')).toBeVisible()
  })

  test('uma entrada conta como entrada e deixa o saldo positivo', async ({ expensesPage }) => {
    await expensesPage.goto()
    await expensesPage.createAccount('Conta E2E')

    await expensesPage.addMovement({ description: 'Salário E2E', amount: 1500, type: 'Entrada' })

    await expensesPage.kpis.expectValue('Entradas', 1500)
    const saldoMes = expensesPage.kpis.value('Saldo do mês')
    await expect(saldoMes).toHaveText(eur(1500))
    await expect(saldoMes).toHaveClass(/pos/)
  })

  test('editar a descrição de um movimento', async ({ expensesPage }) => {
    await expensesPage.goto()
    await expensesPage.createAccount('Conta E2E')
    await expensesPage.addMovement({ description: 'Descrição Antiga', amount: 20 })

    await expensesPage.renameMovement('Descrição Antiga', 'Descrição Nova')

    await expect(expensesPage.movement('Descrição Nova')).toBeVisible()
    await expect(expensesPage.movement('Descrição Antiga')).toHaveCount(0)
  })

  test('eliminar um movimento remove-o da lista', async ({ expensesPage }) => {
    await expensesPage.goto()
    await expensesPage.createAccount('Conta E2E')
    await expensesPage.addMovement({ description: 'A Eliminar', amount: 5 })

    await expensesPage.deleteMovement('A Eliminar')

    await expect(expensesPage.movement('A Eliminar')).toHaveCount(0)
  })
})

test.describe('despesas — importação de extrato', () => {
  test('importar um CSV genérico cria os movimentos e ignora duplicados na 2.ª vez', async ({ expensesPage }) => {
    await expensesPage.goto()
    await expensesPage.createAccount('Conta Extrato E2E')

    const csv = buildCsv([
      { day: 5, description: 'Continente Lisboa', amount: -45.3 },
      { day: 6, description: 'Salário Julho', amount: 1500 },
      { day: 7, description: 'Netflix', amount: -12.99 },
    ])

    await expensesPage.importStatement(csv, 3)

    await expect(expensesPage.movement('Continente Lisboa')).toBeVisible()
    await expect(expensesPage.movement('Salário Julho')).toBeVisible()
    await expect(expensesPage.movement('Netflix')).toBeVisible()
    // categorização automática: Continente → Supermercado
    await expect(expensesPage.categoryBar('Supermercado')).toBeVisible()

    // 2.ª importação do mesmo ficheiro: tudo ignorado (dedupe)
    await expensesPage.importStatement(csv, 3)

    await expect(expensesPage.movement('Continente Lisboa')).toHaveCount(1)
  })
})
