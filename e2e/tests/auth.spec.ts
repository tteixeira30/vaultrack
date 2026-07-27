import { expect, test } from '@fixtures/test'

/**
 * O formulário de autenticação é aqui o objeto do teste, por isso este spec — e só
 * este — passa mesmo pela UI. Começa sem sessão: desliga a injeção de token que a
 * fixture `user` faz por omissão.
 */
test.use({ storageState: { cookies: [], origins: [] } })

test.describe('autenticação', () => {
  test('registo → painel → logout → login de novo @smoke', async ({ authPage }) => {
    const { email, password } = await authPage.register({ name: 'Maria Teste' })

    // sessão iniciada: brand, separadores e identidade visíveis
    await expect(authPage.sidebar.brand).toContainText('Vaultrack')
    await expect(authPage.sidebar.tab('Rendimento')).toBeVisible()
    await expect(authPage.profileMenu.identity).toContainText('Maria Teste')

    await authPage.profileMenu.logout()
    await authPage.expectLoggedOut()

    // entrar de novo com as mesmas credenciais
    await authPage.login(email, password)
    await authPage.sidebar.expectVisible()
  })

  test('password errada mostra erro e não inicia sessão', async ({ authPage }) => {
    const { email } = await authPage.register()
    await authPage.profileMenu.logout()
    await authPage.expectLoggedOut()

    await authPage.login(email, 'errada999')

    await expect(authPage.page.getByText('Erro ao iniciar sessão')).toBeVisible()
    await authPage.expectLoggedOut()
  })

  test('submeter sem preencher mostra "Campos em falta"', async ({ authPage }) => {
    await authPage.goto()
    await authPage.submitLogin.click()
    await expect(authPage.page.getByText('Campos em falta')).toBeVisible()
  })
})
