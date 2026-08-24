import { expect, test } from '@fixtures/test'

/**
 * Usa sempre o tipo "Outro" (investimento manual, sem símbolo) — não depende de
 * cotações do Yahoo/CoinGecko, por isso é 100% determinístico em CI.
 */
test.describe('investimentos (manuais, sem cotação)', () => {
  test('criar um investimento manual e vê-lo na tabela como "manual"', async ({ investmentsPage }) => {
    await investmentsPage.goto()

    await investmentsPage.createManual({ name: 'PPR Offline', value: 1000 })

    const row = investmentsPage.row('PPR Offline')
    await expect(row.locator('.badge')).toHaveText('manual')
    await expect(row.locator('.type-chip')).toHaveText('Outro')
  })

  test('% de ganho gera valor investido e ganho coerentes', async ({ investmentsPage }) => {
    await investmentsPage.goto()

    // 1100€ com +10% de ganho → investido = 1000€
    await investmentsPage.createManual({ name: 'Com Ganho', value: 1100, gain: 10 })

    await expect(investmentsPage.row('Com Ganho').getByText('+10,00%')).toBeVisible()
  })

  test('editar o nome de um investimento', async ({ investmentsPage }) => {
    await investmentsPage.goto()
    await investmentsPage.createManual({ name: 'Nome Antigo', value: 500 })

    await investmentsPage.rename('Nome Antigo', 'Nome Novo')

    await expect(investmentsPage.title('Nome Novo')).toBeVisible()
    await expect(investmentsPage.title('Nome Antigo')).toHaveCount(0)
  })

  test('eliminar um investimento remove-o da tabela', async ({ investmentsPage }) => {
    await investmentsPage.goto()
    await investmentsPage.createManual({ name: 'A Eliminar', value: 100 })

    await investmentsPage.delete('A Eliminar')
  })
})
