import { expect, test } from '@fixtures/test'
import { type TabLabel } from '@components/MainNav'

/**
 * Layout e navegação no viewport de telemóvel.
 *
 * Corre só no projeto `mobile` (ver playwright.config.ts) — daí a etiqueta
 * `@mobile`, que o projeto `chromium` exclui. A lógica de negócio não se repete
 * aqui: é a mesma nos dois viewports e já está coberta pelos outros specs.
 */
const TABS: TabLabel[] = ['Painel', 'Rendimento', 'Despesas', 'Investimentos', 'Objetivos', 'Calendário']

test.describe('mobile @mobile', () => {
  test('a barra inferior substitui a navegação lateral', async ({ dashboardPage }) => {
    await dashboardPage.goto()

    await expect(dashboardPage.nav.bottomNav).toBeVisible()
    await expect(dashboardPage.nav.sidebarTabs).toBeHidden()
    // a marca fica na barra de topo, que é a sidebar reconfigurada
    await expect(dashboardPage.nav.brand).toContainText('Vaultrack')
    await dashboardPage.nav.expectAnchoredToBottom()
  })

  test('todos os separadores abrem sem esticar a página', async ({ dashboardPage }) => {
    await dashboardPage.goto()

    for (const tab of TABS) {
      await test.step(tab, async () => {
        await dashboardPage.nav.open(tab)
        await dashboardPage.waitForLoaded()
        await dashboardPage.expectNoHorizontalScroll()
        await dashboardPage.nav.expectAnchoredToBottom()
      })
    }
  })

  test('os separadores secundários vivem na sheet "Mais"', async ({ dashboardPage }) => {
    await dashboardPage.goto()

    // Rendimento não está na barra: só se lá chega pelo "Mais"
    await expect(dashboardPage.nav.tab('Rendimento')).toHaveCount(0)

    await dashboardPage.nav.open('Rendimento')
    await dashboardPage.nav.expectActive('Rendimento')
  })

  test('o voltar do browser devolve o separador anterior', async ({ dashboardPage }) => {
    await dashboardPage.goto()

    await dashboardPage.nav.open('Investimentos')
    await dashboardPage.nav.expectActive('Investimentos')

    await dashboardPage.page.goBack()

    await dashboardPage.nav.expectActive('Painel')
  })

  test('um modal abre encostado ao fundo, como bottom sheet', async ({ goalsPage }) => {
    await goalsPage.goto()

    await goalsPage.page.getByRole('button', { name: 'Novo objetivo' }).click()
    await goalsPage.dialog.expectOpen()

    await goalsPage.dialog.expectBottomSheet()
    await expect(goalsPage.dialog.grabber).toBeVisible()
  })

  test('arrastar o modal para baixo fecha-o; um arrasto curto não', async ({ goalsPage }) => {
    await goalsPage.goto()

    await goalsPage.page.getByRole('button', { name: 'Novo objetivo' }).click()
    await goalsPage.dialog.expectOpen()

    // abaixo do limiar (~90px) volta ao sítio
    await goalsPage.dialog.dragDown(40)
    await goalsPage.dialog.expectOpen()

    await goalsPage.dialog.dragDown(160)
    await goalsPage.dialog.expectClosed()
  })

  test('a confirmação destrutiva não tem pega de arrasto', async ({ goalsPage }) => {
    await goalsPage.goto()
    await goalsPage.create({ name: 'Viagem', target: 1000, monthly: 50 })

    await goalsPage.card('Viagem').getByRole('button', { name: 'Eliminar' }).click()

    // é uma saída deliberada: só pelos botões, sem gesto que a feche por engano
    await expect(goalsPage.confirmDialog.root).toBeVisible()
    await expect(goalsPage.confirmDialog.grabber).toHaveCount(0)

    await goalsPage.confirmDialog.dismiss('Eliminar objetivo?')
  })

  test('os seletores abrem como sheet em vez de popover ancorado', async ({ investmentsPage }) => {
    await investmentsPage.goto()

    await investmentsPage.page.getByRole('button', { name: 'Novo investimento' }).click()
    await investmentsPage.dialog.expectOpen()

    await investmentsPage.openTypeSelector()
    await investmentsPage.expectTypeSelectorIsSheet()
  })
})
