import { expect, type Locator, type Page } from '@playwright/test'

/**
 * Diálogo de confirmação destrutiva (ConfirmDialog em components/Modal.jsx).
 *
 * É um `role=alertdialog` com o título num heading, o que permite locators por
 * papel em vez do antigo `.btn.danger` global. O label do botão de confirmação é
 * configurável na app (`confirmLabel`), por isso identifica-se por exclusão do
 * "Cancelar" em vez de por texto fixo.
 */
export class ConfirmDialog {
  readonly root: Locator

  constructor(page: Page) {
    this.root = page.getByRole('alertdialog')
  }

  private get acceptButton(): Locator {
    return this.root.getByRole('button').filter({ hasNotText: 'Cancelar' })
  }

  private get cancelButton(): Locator {
    return this.root.getByRole('button', { name: 'Cancelar' })
  }

  /**
   * Pega de arrasto. Ao contrário das outras sobreposições, esta **não a tem**:
   * uma confirmação destrutiva não deve fechar-se por gesto acidental. O
   * locator existe para o teste poder afirmar que continua ausente.
   */
  get grabber(): Locator {
    return this.root.locator('.sheet-grabber')
  }

  /** Confirma a ação, validando primeiro que é o diálogo esperado. */
  async accept(title: string | RegExp): Promise<void> {
    await expect(this.root.getByRole('heading', { name: title })).toBeVisible()
    await this.acceptButton.click()
    await expect(this.root).toBeHidden()
  }

  async dismiss(title: string | RegExp): Promise<void> {
    await expect(this.root.getByRole('heading', { name: title })).toBeVisible()
    await this.cancelButton.click()
    await expect(this.root).toBeHidden()
  }
}
