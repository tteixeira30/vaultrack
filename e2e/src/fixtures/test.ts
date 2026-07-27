import { test as base } from '@playwright/test'
import { AuthPage } from '../pages/AuthPage'
import { DashboardPage } from '../pages/DashboardPage'
import { IncomePage } from '../pages/IncomePage'
import { registerViaApi, TOKEN_KEY, type TestUser } from './api'

/**
 * `test` estendido do projeto. Importa daqui, nunca de `@playwright/test`
 * diretamente (exceto `expect`).
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
  authPage: AuthPage
  dashboardPage: DashboardPage
  incomePage: IncomePage
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

  authPage: async ({ page }, use) => use(new AuthPage(page)),
  dashboardPage: async ({ page }, use) => use(new DashboardPage(page)),
  incomePage: async ({ page }, use) => use(new IncomePage(page)),
})

export { expect } from '@playwright/test'
export type { TestUser }
