import { test as base, expect } from '@playwright/test'
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
  /** Opção: `test.use({ allowConsoleErrors: true })` desliga a guarda de consola. */
  allowConsoleErrors: boolean
  consoleGuard: void
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
  allowConsoleErrors: [false, { option: true }],

  /**
   * Falha o teste se a página lançar uma exceção não apanhada ou escrever um
   * erro na consola — incluindo violações da CSP, que em modo Report-Only só
   * aparecem aí. Os "Failed to load resource" ficam de fora: são as respostas
   * 4xx/5xx que os testes negativos provocam de propósito (a UI trata-as).
   */
  consoleGuard: [
    async ({ page, allowConsoleErrors }, use) => {
      const errors: string[] = []
      page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`))
      page.on('console', (msg) => {
        if (msg.type() !== 'error') return
        const text = msg.text()
        if (text.startsWith('Failed to load resource')) return
        errors.push(`console.error: ${text}`)
      })
      await use()
      if (!allowConsoleErrors) expect(errors, 'erros na consola do browser').toEqual([])
    },
    { auto: true },
  ],

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
