import { expect, test } from '@fixtures/test'
import { type TabLabel } from '@components/MainNav'

/**
 * Layout e navegação no viewport de telemóvel.
 *
 * Corre só no projeto `mobile` (ver playwright.config.ts) — daí a etiqueta
 * `@mobile`, que o projeto `chromium` exclui. A lógica de negócio não se repete
 * aqui: é a mesma nos dois viewports e já está coberta pelos outros specs.
 */
const TABS: TabLabel[] = [
  'Painel', 'Movimentos', 'Rendimento', 'Calendário',
  'Carteira', 'Objetivos', 'Conquistas',
]

test.describe('mobile @mobile', () => {
  test('a barra inferior substitui a navegação lateral', async ({ dashboardPage }) => {
    await dashboardPage.goto()

    await expect(dashboardPage.nav.bottomNav).toBeVisible()
    await expect(dashboardPage.nav.sidebarTabs).toBeHidden()
    // três separadores largos, em vez de quatro apertados mais um "Mais"
    await expect(dashboardPage.nav.bottomNav.getByRole('button')).toHaveText(['Início', 'Dinheiro', 'Crescer'])
    await dashboardPage.nav.expectAnchoredToBottom()
  })

  test('todos os ecrãs abrem sem esticar a página', async ({ dashboardPage }) => {
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

  test('os ecrãs de um separador chegam-se pelos segmentos, não por um menu', async ({ dashboardPage }) => {
    await dashboardPage.goto()

    // "Início" só tem um ecrã, por isso não mostra segmentos
    await expect(dashboardPage.nav.segments).toHaveCount(0)

    await dashboardPage.nav.mobileTab('Dinheiro').click()
    await expect(dashboardPage.nav.segments.getByRole('tab'))
      .toHaveText(['Movimentos', 'Rendimento', 'Calendário'])

    await dashboardPage.nav.open('Rendimento')
    await dashboardPage.nav.expectActive('Rendimento')
  })

  test('o Perfil chega-se pelo avatar do cabeçalho', async ({ dashboardPage }) => {
    await dashboardPage.goto()

    await dashboardPage.profileMenu.open()
    await expect(dashboardPage.profileMenu.identity).toBeVisible()
    await dashboardPage.expectNoHorizontalScroll()
  })

  test('o voltar do browser devolve o separador anterior', async ({ dashboardPage }) => {
    await dashboardPage.goto()

    await dashboardPage.nav.open('Carteira')
    await dashboardPage.nav.expectActive('Carteira')

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

    await goalsPage.card('Viagem').getByRole('button', { name: 'Eliminar Viagem' }).click()

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
