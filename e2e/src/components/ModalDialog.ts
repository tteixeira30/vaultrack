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

  /**
   * Em ecrãs pequenos o modal é um bottom sheet: colado ao fundo e à largura
   * toda.
   *
   * A medição usa `expect.poll` porque a sheet entra com uma animação de 280ms
   * (`sheet-in`, translateY): ficar visível não significa ter chegado ao sítio,
   * e uma leitura única apanhava-a a meio do percurso.
   */
  async expectBottomSheet(): Promise<void> {
    const viewport = this.page.viewportSize()
    expect(viewport, 'o viewport tem de estar definido').not.toBeNull()

    await expect.poll(async () => {
      const box = await this.root.boundingBox()
      return box ? Math.round(box.y + box.height) : null
    }, { message: 'o modal tem de assentar no fundo do ecrã' }).toBe(viewport!.height)

    const box = await this.root.boundingBox()
    expect(Math.round(box!.width)).toBe(viewport!.width)
  }

  /** A pega de arrasto, presente só na variante sheet. */
  get grabber(): Locator {
    return this.root.locator('.sheet-grabber')
  }

  /**
   * Arrasta o painel para baixo a partir da pega. `distance` acima de ~90px
   * fecha; abaixo disso volta ao sítio.
   */
  async dragDown(distance: number): Promise<void> {
    const box = await this.grabber.boundingBox()
    expect(box, 'a pega tem de estar visível').not.toBeNull()

    const x = box!.x + box!.width / 2
    const y = box!.y + box!.height / 2

    await this.page.mouse.move(x, y)
    await this.page.mouse.down()
    // em vários passos: um único move pode ser lido como salto, não como arrasto
    for (let i = 1; i <= 5; i++) await this.page.mouse.move(x, y + (distance * i) / 5)
    await this.page.mouse.up()
  }

  /** Submete e espera o fecho — evita corridas com a re-renderização da página. */
  async save(): Promise<void> {
    await this.button('Guardar').click()
    await this.expectClosed()
  }
}
