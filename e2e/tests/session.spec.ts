import { test } from '@fixtures/test'

test.describe('sessão e rendimento', () => {
  test('a sessão sobrevive a um reload da página', async ({ dashboardPage, user }) => {
    await dashboardPage.goto()

    await dashboardPage.page.reload()

    // continua autenticado — o token em localStorage revalida via /auth/me
    await dashboardPage.nav.expectVisible()
    await dashboardPage.profileMenu.expectIdentity(user.name)
  })

  test('depois de logout o reload não recupera a sessão', async ({ dashboardPage, authPage }) => {
    await dashboardPage.goto()
    await dashboardPage.profileMenu.logout()
    await authPage.expectLoggedOut()

    await dashboardPage.page.reload()

    await authPage.expectLoggedOut()
  })

  test('definir o rendimento mensal reflete-se na página', async ({ incomePage }) => {
    await incomePage.goto()

    await incomePage.setMonthlyIncome(2500)

    await incomePage.expectIncome(2500)
  })
})
