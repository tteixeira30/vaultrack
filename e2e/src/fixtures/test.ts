import { test as base } from '@playwright/test'
import { AchievementsPage } from '../pages/AchievementsPage'
import { AuthPage } from '../pages/AuthPage'
import { CalendarPage } from '../pages/CalendarPage'
import { DashboardPage } from '../pages/DashboardPage'
import { ExpensesPage } from '../pages/ExpensesPage'
import { GoalsPage } from '../pages/GoalsPage'
import { IncomePage } from '../pages/IncomePage'
import { InvestmentsPage } from '../pages/InvestmentsPage'
import { registerViaApi, TOKEN_KEY, type TestUser } from './api'

/**
 * `test` estendido do projeto. Importa daqui, nunca de `@playwright/test`
 * diretamente.
 *
 * A fixture `user` cria um utilizador novo por teste **via API** e a override de
 * `storageState` injeta o token em localStorage antes de a página abrir — quando o
 * teste arranca, a sessão já está iniciada. Cada teste continua com um utilizador
 * virgem e isolado, que é o que permite correr em paralelo.
 *
 * Testes que precisam de começar sem sessão (auth.spec) fazem
 * `test.use({ storageState: { cookies: [], origins: [] } })`.
 */
export interface Fixtures {
  user: TestUser
  achievementsPage: AchievementsPage
  authPage: AuthPage
  calendarPage: CalendarPage
  dashboardPage: DashboardPage
  expensesPage: ExpensesPage
  goalsPage: GoalsPage
  incomePage: IncomePage
  investmentsPage: InvestmentsPage
}

export const test = base.extend<Fixtures>({
  user: async ({ playwright, baseURL }, use) => {
    // Contexto de request próprio: usar a fixture `request` criaria um ciclo,
    // porque essa também consome a opção `storageState` que redefinimos abaixo.
    const context = await playwright.request.newContext({ baseURL })
    try {
      await use(await registerViaApi(context))
    } finally {
      await context.dispose()
    }
  },

  storageState: async ({ user, baseURL }, use) => {
    await use({
      cookies: [],
      origins: [{ origin: new URL(baseURL!).origin, localStorage: [{ name: TOKEN_KEY, value: user.token }] }],
    })
  },

  achievementsPage: async ({ page }, use) => use(new AchievementsPage(page)),
  authPage: async ({ page }, use) => use(new AuthPage(page)),
  calendarPage: async ({ page }, use) => use(new CalendarPage(page)),
  dashboardPage: async ({ page }, use) => use(new DashboardPage(page)),
  expensesPage: async ({ page }, use) => use(new ExpensesPage(page)),
  goalsPage: async ({ page }, use) => use(new GoalsPage(page)),
  incomePage: async ({ page }, use) => use(new IncomePage(page)),
  investmentsPage: async ({ page }, use) => use(new InvestmentsPage(page)),
})

export { expect } from '@playwright/test'
export type { TestUser }
