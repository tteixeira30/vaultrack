import { expect, test } from '@fixtures/test'

test.describe('rendimento', () => {
  test('criar uma categoria de rendimento e vê-la na lista', async ({ incomePage }) => {
    await incomePage.goto()

    await incomePage.createCategory({ name: 'Poupança E2E', percentage: 20 })

    await expect(incomePage.categoryTitle('Poupança E2E')).toBeVisible()
  })

  test('categoria por valor fixo mostra o valor mensal definido', async ({ incomePage }) => {
    await incomePage.goto()

    await incomePage.createCategory({ name: 'Renda Fixa E2E', fixedAmount: 450 })

    await expect(incomePage.monthlyValue('Renda Fixa E2E')).toContainText('450,00')
  })

  test('eliminar uma categoria remove-a da lista', async ({ incomePage }) => {
    await incomePage.goto()
    await incomePage.createCategory({ name: 'Temporária E2E', percentage: 15 })

    await incomePage.deleteCategory('Temporária E2E')
  })
})
