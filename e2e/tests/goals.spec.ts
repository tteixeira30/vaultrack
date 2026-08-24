import { expect, test } from '@fixtures/test'
import { eur } from '@utils/money'

test.describe('objetivos', () => {
  test('criar um objetivo e vê-lo na lista com progresso', async ({ goalsPage }) => {
    await goalsPage.goto()

    await goalsPage.create({ name: 'Férias no Japão', target: 3000, monthly: 250 })

    await expect(goalsPage.card('Férias no Japão')).toBeVisible()
  })

  test('contribuir para um objetivo aumenta o poupado e o progresso', async ({ goalsPage }) => {
    await goalsPage.goto()
    await goalsPage.create({ name: 'Fundo E2E', target: 1000, monthly: 100 })
    await expect(goalsPage.progress('Fundo E2E')).toContainText('0,0%')

    // contribuir 200€ → 20% de 1000
    await goalsPage.contribute('Fundo E2E', 200)

    await expect(goalsPage.savedAmount('Fundo E2E')).toHaveText(eur(200))
    await expect(goalsPage.progress('Fundo E2E')).toContainText('20,0%')
  })

  test('eliminar um objetivo remove-o da lista', async ({ goalsPage }) => {
    await goalsPage.goto()
    await goalsPage.create({ name: 'Objetivo temporário', target: 100, monthly: 10 })

    await goalsPage.delete('Objetivo temporário')
  })
})
