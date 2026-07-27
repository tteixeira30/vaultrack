import { type Locator, type Page } from '@playwright/test'

/** Ações que vivem no menu de perfil (atrás do avatar), não na navegação. */
export type ProfileAction = 'Conquistas' | 'Terminar sessão'

/** Menu de perfil: identificação do utilizador, conquistas, definições e logout. */
export class ProfileMenu {
  constructor(private readonly page: Page) {}

  get trigger(): Locator {
    return this.page.getByRole('button', { name: 'Perfil e definições' })
  }

  /** O botão mostra nome e email do utilizador com sessão iniciada. */
  get identity(): Locator {
    return this.page.locator('.profile-trigger')
  }

  /** Toggle "Ocultar valores" (role=switch, label varia com o estado). */
  get privacyToggle(): Locator {
    return this.page.getByRole('switch', { name: /valores/ })
  }

  async open(): Promise<void> {
    await this.trigger.click()
  }

  async select(action: ProfileAction): Promise<void> {
    await this.open()
    await this.page.getByRole('menuitem', { name: action }).click()
  }

  async logout(): Promise<void> {
    await this.select('Terminar sessão')
  }

  /**
   * Alterna o modo privacidade. Fecha o menu no fim (Escape) para deixar a página
   * por baixo visível, que é onde os montantes mascarados se verificam.
   */
  async togglePrivacy(): Promise<void> {
    await this.open()
    await this.privacyToggle.click()
    await this.page.keyboard.press('Escape')
  }
}
