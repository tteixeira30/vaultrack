import { expect, type Locator, type Page } from '@playwright/test'
import { MainNav } from './MainNav'

/**
 * Perfil e definições.
 *
 * Deixou de ser um popover atrás do avatar: é um ecrã próprio (`ProfilePage`),
 * a que se chega pelo avatar do cabeçalho em qualquer viewport. O nome desta
 * classe manteve-se porque é o papel que desempenha nos specs — o sítio onde
 * vivem sessão, moeda, tema e privacidade.
 */
export class ProfileMenu {
  private readonly nav: MainNav

  constructor(private readonly page: Page) {
    this.nav = new MainNav(page)
  }

  /** O avatar do cabeçalho. Só existe em mobile — em desktop o Perfil é um item da sidebar. */
  get trigger(): Locator {
    return this.page.getByRole('button', { name: 'Perfil e definições' })
  }

  /**
   * Nome e email de quem tem sessão iniciada.
   *
   * Em desktop estão sempre à vista no pé da sidebar; em mobile só existem no
   * ecrã de Perfil. O `:visible` apanha o que estiver em uso — ver
   * `expectIdentity`, que trata de lá chegar quando é preciso.
   */
  get identity(): Locator {
    return this.page.locator('.side-user:visible, .profile-id:visible')
  }

  /** Interruptor "Ocultar saldos". */
  get privacyToggle(): Locator {
    return this.page.getByRole('switch', { name: 'Ocultar saldos' })
  }

  /** As três miniaturas de tema: claro, escuro, sistema. */
  themeOption(name: 'Claro' | 'Escuro' | 'Sistema'): Locator {
    return this.page.getByRole('radio', { name })
  }

  /** Um dos botões de moeda base. */
  currencyOption(code: string): Locator {
    return this.page.getByRole('button', { name: new RegExp(`\\b${code}\\b`) })
  }

  async open(): Promise<void> {
    await this.nav.open('Perfil')
    await expect(this.page.locator('.profile-id')).toBeVisible()
  }

  /** Confirma quem tem a sessão iniciada, seja qual for o viewport. */
  async expectIdentity(text: string): Promise<void> {
    if (await this.page.locator('.side-user').isVisible()) {
      await expect(this.page.locator('.side-user')).toContainText(text)
      return
    }
    await this.open()
    await expect(this.page.locator('.profile-id')).toContainText(text)
  }

  async logout(): Promise<void> {
    await this.open()
    await this.page.getByRole('button', { name: /Terminar sessão/ }).click()
  }

  /** Abre o ecrã de Contas. */
  async openAccounts(): Promise<void> {
    await this.nav.open('Contas')
  }

  /**
   * Alterna o modo privacidade e volta ao Painel.
   *
   * O interruptor vive no ecrã de Perfil, mas o que os testes querem verificar
   * são os montantes das outras páginas — daí o regresso.
   */
  async togglePrivacy(): Promise<void> {
    await this.open()
    await this.privacyToggle.click()
    await this.page.goBack()
    await expect(this.page.locator('.tb-title h2')).toHaveText('Painel')
  }
}
