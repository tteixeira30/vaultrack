import { expect, test } from '@fixtures/test'

test.describe('conquistas', () => {
  test('conta nova começa no nível 1 · Iniciante', async ({ achievementsPage }) => {
    await achievementsPage.goto()

    await expect(achievementsPage.page.getByRole('heading', { name: /Nível 1 · Iniciante/ })).toBeVisible()
    // entrar na app cria a linha do mês atual → "Organizado" (10 pts) desbloqueia logo
    await expect(achievementsPage.points(10)).toBeVisible()
  })

  test('criar o primeiro objetivo desbloqueia "Sonhador"', async ({ goalsPage, achievementsPage }) => {
    await goalsPage.goto()
    await goalsPage.create({ name: 'Primeiro Objetivo', target: 1000, monthly: 100 })

    await achievementsPage.goto()

    // os pontos somam: Sonhador (10) + Organizado (10)
    await expect(achievementsPage.achievement('Sonhador')).toBeVisible()
    await expect(achievementsPage.points(20)).toBeVisible()
  })
})
