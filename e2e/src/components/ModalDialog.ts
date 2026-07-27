import { expect, type Locator, type Page } from '@playwright/test'

/**
 * Modal genérico (components/Modal.jsx). Scoped a `role=dialog` para desambiguar
 * dos botões da página por trás, que muitas vezes têm o mesmo label
 * ("Criar conta", "Guardar", "Eliminar"...).
 */
export class ModalDialog {
  readonly root: Locator

  constructor(page: Page) {
    this.root = page.getByRole('dialog')
  }

  field(placeholder: string | RegExp): Locator {
    return this.root.getByPlaceholder(placeholder)
  }

  button(name: string | RegExp): Locator {
    return this.root.getByRole('button', { name })
  }

  async expectOpen(): Promise<void> {
    await expect(this.root).toBeVisible()
  }

  async expectClosed(): Promise<void> {
    await expect(this.root).toBeHidden()
  }

  /** Submete e espera o fecho — evita corridas com a re-renderização da página. */
  async save(): Promise<void> {
    await this.button('Guardar').click()
    await this.expectClosed()
  }
}
