import { expect, test } from '@fixtures/test'
import { eur } from '@utils/money'

/**
 * Comportamento dos formulários que é próprio de uma app em PT-PT usada ao
 * telemóvel: a vírgula decimal e as pistas que o teclado e os gestores de
 * palavras-passe precisam de receber.
 */
test.describe('formulários', () => {
  test('os campos monetários aceitam a vírgula decimal', async ({ goalsPage }) => {
    await goalsPage.goto()

    // é assim que se escreve em português; com type="number" o valor era
    // descartado em silêncio e o objetivo ficava sem meta
    await goalsPage.create({ name: 'Carro usado', target: '10000,50', monthly: '250,25' })

    await expect(goalsPage.progress('Carro usado')).toContainText(eur(10000.5))
  })

  test('contribuir com vírgula decimal soma o valor certo', async ({ goalsPage }) => {
    await goalsPage.goto()
    await goalsPage.create({ name: 'Fundo vírgula', target: 1000, monthly: 100 })

    await goalsPage.contribute('Fundo vírgula', '12,34')

    await expect(goalsPage.savedAmount('Fundo vírgula')).toHaveText(eur(12.34))
  })

  test('os campos monetários pedem o teclado numérico', async ({ goalsPage }) => {
    await goalsPage.goto()
    await goalsPage.openCreateForm()

    // inputMode=decimal dá o teclado com vírgula; type=number dava spinners
    // e recusava a vírgula
    await expect(goalsPage.dialog.field('Ex: 10000')).toHaveAttribute('inputmode', 'decimal')
  })

  test('o Enter num campo do modal submete o formulário', async ({ goalsPage }) => {
    await goalsPage.goto()
    await goalsPage.openCreateForm()

    await goalsPage.dialog.field('Ex: Fundo de emergência').fill('Objetivo por Enter')
    await goalsPage.dialog.field('Ex: 10000').fill('500')
    // a alocação mensal é obrigatória: sem ela o guardar recusa e o modal fica
    await goalsPage.dialog.field('Ex: 300').fill('50')
    await goalsPage.dialog.field('Ex: 300').press('Enter')

    await goalsPage.dialog.expectClosed()
    await expect(goalsPage.card('Objetivo por Enter')).toBeVisible()
  })

  test('o Enter cria o objetivo uma só vez', async ({ goalsPage }) => {
    await goalsPage.goto()
    await goalsPage.openCreateForm()

    await goalsPage.dialog.field('Ex: Fundo de emergência').fill('Sem duplicados')
    await goalsPage.dialog.field('Ex: 10000').fill('500')
    await goalsPage.dialog.field('Ex: 300').fill('50')
    await goalsPage.dialog.field('Ex: 300').press('Enter')
    await goalsPage.dialog.expectClosed()

    // o botão-fantasma fica desativado durante o gravar; sem isso ficavam dois
    await expect(goalsPage.title('Sem duplicados')).toHaveCount(1)
  })

  // A fixture `user` injeta o token antes da página abrir, por isso estes
  // precisam de desligá-la — senão a app arranca com sessão e nunca mostra o
  // formulário. Mesmo padrão do auth.spec.ts.
  test.describe('sem sessão', () => {
    test.use({ storageState: { cookies: [], origins: [] } })

    test('o formulário de sessão dá as pistas de preenchimento automático', async ({ authPage }) => {
      await authPage.goto()

      await expect(authPage.emailField).toHaveAttribute('autocomplete', 'username')
      await expect(authPage.emailField).toHaveAttribute('autocapitalize', 'none')
      await expect(authPage.passwordField).toHaveAttribute('autocomplete', 'current-password')
    })

    test('no registo a palavra-passe é anunciada como nova', async ({ authPage }) => {
      await authPage.goto()
      await authPage.switchToRegister()

      await expect(authPage.newPasswordField).toHaveAttribute('autocomplete', 'new-password')
      await expect(authPage.nameField).toHaveAttribute('autocomplete', 'name')
    })
  })
})
