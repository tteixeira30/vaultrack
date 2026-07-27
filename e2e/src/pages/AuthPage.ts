import { expect, type Locator } from '@playwright/test'
import { PASSWORD } from '../fixtures/api'
import { uniqueEmail } from '../utils/data'
import { BasePage } from './BasePage'

/**
 * Página de autenticação — o **único** sítio do projeto que passa pelo formulário.
 *
 * Os restantes testes recebem sessão pronta da fixture `user` (registo por API);
 * aqui o formulário é o objeto do teste, por isso é exercido a sério.
 */
export class AuthPage extends BasePage {
  get emailField(): Locator {
    return this.page.getByPlaceholder('exemplo@email.com')
  }

  get passwordField(): Locator {
    return this.page.getByPlaceholder('A tua palavra-passe')
  }

  get submitLogin(): Locator {
    return this.page.getByRole('button', { name: 'Entrar' })
  }

  async goto(): Promise<void> {
    await this.page.goto('/')
    await expect(this.submitLogin).toBeVisible()
  }

  /** Alterna do formulário de login para o de registo. */
  async switchToRegister(): Promise<void> {
    await this.page.getByRole('button', { name: 'Criar conta' }).first().click()
  }

  /**
   * Registo completo pela UI. Devolve as credenciais criadas para o teste poder
   * voltar a autenticar-se com elas.
   */
  async register({
    name = 'Utilizador E2E',
    email = uniqueEmail(),
    password = PASSWORD,
  } = {}): Promise<{ name: string; email: string; password: string }> {
    await this.goto()
    await this.switchToRegister()
    await this.page.getByPlaceholder('O teu nome').fill(name)
    await this.emailField.fill(email)
    await this.page.getByPlaceholder('Mínimo 6 caracteres').fill(password)
    // código de convite fica vazio (registo aberto em dev)
    await this.page.getByRole('button', { name: 'Criar conta' }).last().click()
    await this.sidebar.expectVisible()
    return { name, email, password }
  }

  /** Preenche e submete o login. Não assume sucesso — o teste é que valida. */
  async login(email: string, password: string): Promise<void> {
    await this.emailField.fill(email)
    await this.passwordField.fill(password)
    await this.submitLogin.click()
  }

  /** Estamos no ecrã de autenticação (sem sessão). */
  async expectLoggedOut(): Promise<void> {
    await expect(this.submitLogin).toBeVisible()
  }
}
