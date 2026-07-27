import { expect, test } from '@fixtures/test'
import { eur } from '@utils/money'

/**
 * "Ocultar valores" (modo privacidade) — troca todos os montantes por "••••" na
 * apresentação. É puramente do lado do cliente (fmtEur devolve a máscara) e o
 * estado persiste em localStorage, por isso é 100% determinístico.
 */
const MASK = '••••'

test.describe('modo privacidade (ocultar valores)', () => {
  test('ativar oculta os montantes do painel e desativar volta a mostrá-los', async ({ dashboardPage }) => {
    await dashboardPage.goto()

    // por omissão os valores estão visíveis (conta nova → 0,00 €)
    await expect(dashboardPage.netWorth).toHaveText(eur(0))

    await dashboardPage.profileMenu.togglePrivacy()
    await expect(dashboardPage.netWorth).toContainText(MASK)

    await dashboardPage.profileMenu.togglePrivacy()
    await expect(dashboardPage.netWorth).toHaveText(eur(0))
  })

  test('a preferência de ocultar sobrevive a um reload', async ({ dashboardPage }) => {
    await dashboardPage.goto()
    await dashboardPage.profileMenu.togglePrivacy()
    await expect(dashboardPage.netWorth).toContainText(MASK)

    await dashboardPage.page.reload()

    // continua mascarado após recarregar (persistido em localStorage)
    await expect(dashboardPage.netWorth).toContainText(MASK)
  })
})
