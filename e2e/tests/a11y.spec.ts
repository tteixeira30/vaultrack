import { expect, test } from '@fixtures/test'
import { type TabLabel } from '@components/MainNav'
import { formatViolations, scanA11y } from '@utils/axe'

/**
 * Bateria de acessibilidade (axe-core WCAG 2.0/2.1 A + AA) nas páginas principais,
 * em tema claro E escuro. Falha em qualquer violação de impacto
 * "serious"/"critical" (inclui contraste de cor); as de impacto menor não bloqueiam
 * mas ficam registadas no anexo do relatório.
 *
 * O tema resolve-se de `prefers-color-scheme` no primeiro arranque (ThemeContext),
 * por isso alterna-se via `colorScheme` do contexto Playwright.
 */
const TABS: TabLabel[] = ['Painel', 'Rendimento', 'Despesas', 'Investimentos', 'Objetivos', 'Calendário']

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`acessibilidade (axe-core) — tema ${colorScheme}`, () => {
    test.use({ colorScheme })

    test.describe('sem sessão', () => {
      test.use({ storageState: { cookies: [], origins: [] } })

      test('página de autenticação', async ({ authPage }, testInfo) => {
        await authPage.goto()

        const violations = await scanA11y(authPage.page, testInfo, `auth-${colorScheme}`)
        expect(violations, formatViolations(violations)).toEqual([])
      })
    })

    for (const tab of TABS) {
      test(`separador ${tab}`, async ({ dashboardPage }, testInfo) => {
        await dashboardPage.goto()
        await dashboardPage.nav.open(tab)
        // espera o conteúdo real (as páginas mostram um skeleton enquanto carregam)
        await dashboardPage.waitForLoaded()

        const violations = await scanA11y(dashboardPage.page, testInfo, `${tab.toLowerCase()}-${colorScheme}`)
        expect(violations, formatViolations(violations)).toEqual([])
      })
    }

    test('conquistas', async ({ achievementsPage }, testInfo) => {
      await achievementsPage.goto()

      const violations = await scanA11y(achievementsPage.page, testInfo, `conquistas-${colorScheme}`)
      expect(violations, formatViolations(violations)).toEqual([])
    })
  })
}
