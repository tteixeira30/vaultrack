import { expect, test } from '@fixtures/test'
import { registerViaApi } from '@fixtures/api'
import { formatViolations, scanA11y } from '@utils/axe'
import { promoteToAdmin } from '@utils/db'

test.describe('atividade recente (auditoria)', () => {
  test('um objetivo criado aparece na atividade', async ({ goalsPage, profilePage }) => {
    await goalsPage.goto()
    await goalsPage.create({ name: 'Férias E2E', target: 1000, monthly: 100 })

    await profilePage.goto()
    await expect(profilePage.entry('Objetivo criado', 'Férias E2E')).toBeVisible()
  })

  test('um login falhado aparece em Segurança', async ({ user, request, profilePage }) => {
    const res = await request.post('/api/auth/login', { data: { email: user.email, password: 'errada999' } })
    expect(res.status()).toBe(401)

    await profilePage.goto()
    await profilePage.filter('Segurança')
    await expect(profilePage.entry('Tentativa de entrada falhada', 'Atenção')).toBeVisible()
    await expect(profilePage.entry('Conta registada')).toBeVisible()
  })

  test('um utilizador normal não vê o interruptor de admin', async ({ profilePage }) => {
    await profilePage.goto()
    await expect(profilePage.scopeToggle).toHaveCount(0)
  })

  test('o admin vê a atividade de outro utilizador', async ({ user, playwright, baseURL, profilePage }) => {
    const ctx = await playwright.request.newContext({ baseURL })
    const name = `Outro E2E ${Date.now()}`
    try {
      await registerViaApi(ctx, { name })
    } finally {
      await ctx.dispose()
    }
    promoteToAdmin(user.id)

    await profilePage.goto()
    await profilePage.showEveryone()
    await profilePage.onlyUser(name)
    await expect(profilePage.entry('Conta registada', name)).toBeVisible()
    await expect(profilePage.entry(user.name)).toHaveCount(0)
  })
})

// O a11y.spec corre o Perfil de um utilizador sem falhas; aqui há uma linha de aviso
// (selo âmbar sobre fundo âmbar), que é onde o contraste costuma cair.
for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`atividade — acessibilidade do aviso, tema ${colorScheme}`, () => {
    test.use({ colorScheme })

    test('a linha de login falhado passa no axe', async ({ user, request, profilePage }, testInfo) => {
      await request.post('/api/auth/login', { data: { email: user.email, password: 'errada999' } })
      await profilePage.goto()
      await expect(profilePage.entry('Tentativa de entrada falhada', 'Atenção')).toBeVisible()

      const violations = await scanA11y(profilePage.page, testInfo, `atividade-${colorScheme}`)
      expect(violations, formatViolations(violations)).toEqual([])
    })
  })
}
