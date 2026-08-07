import { expect, type Locator, type Page } from '@playwright/test'

/**
 * Modal genérico (components/Modal.jsx). Scoped a `role=dialog` para desambiguar
 * dos botões da página por trás, que muitas vezes têm o mesmo label
 * ("Criar conta", "Guardar", "Eliminar"...).
 */
export class ModalDialog {
  readonly root: Locator

  constructor(private readonly page: Page) {
    this.root = page.getByRole('dialog')
  }

  /**
   * Campo pelo placeholder. Usa `exact` quando o placeholder é um prefixo de
   * outro no mesmo modal — "0" também casa com "Ex: 10000" e "Ex: 300".
   */
  field(placeholder: string | RegExp, options?: { exact?: boolean }): Locator {
    return this.root.getByPlaceholder(placeholder, options)
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

  /** Em ecrãs pequenos o modal é um bottom sheet: colado ao fundo e à largura toda. */
  async expectBottomSheet(): Promise<void> {
    const viewport = this.page.viewportSize()
    expect(viewport, 'o viewport tem de estar definido').not.toBeNull()

    const box = await this.root.boundingBox()
    expect(box, 'o modal tem de estar visível').not.toBeNull()

    expect(Math.round(box!.y + box!.height)).toBe(viewport!.height)
    expect(Math.round(box!.width)).toBe(viewport!.width)
  }

  /** Submete e espera o fecho — evita corridas com a re-renderização da página. */
  async save(): Promise<void> {
    await this.button('Guardar').click()
    await this.expectClosed()
  }
}
