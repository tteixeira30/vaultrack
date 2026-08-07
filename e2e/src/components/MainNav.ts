import { expect, type Locator, type Page } from '@playwright/test'

/** Os separadores da navegação principal (App.jsx → TABS). */
export type TabLabel =
  | 'Painel'
  | 'Rendimento'
  | 'Despesas'
  | 'Investimentos'
  | 'Objetivos'
  | 'Calendário'

/**
 * Em mobile só os primários cabem na barra inferior; estes vivem dentro da
 * sheet "Mais" (App.jsx → MORE_TABS). No desktop estão todos na sidebar.
 */
const SECONDARY: readonly TabLabel[] = ['Rendimento', 'Calendário']

/**
 * Navegação principal, seja qual for o viewport.
 *
 * A sidebar e a barra inferior têm os mesmos rótulos e o CSS garante que só uma
 * delas está visível de cada vez (fronteira dos 900px). Em vez de decidir pela
 * largura do viewport — que ficaria acoplada ao valor do breakpoint — a raiz usa
 * `:visible` e apanha a que estiver em uso, mantendo `tab()` síncrono.
 */
export class MainNav {
  constructor(private readonly page: Page) {}

  private get root(): Locator {
    return this.page.locator('.sidebar .nav:visible, .bottom-nav:visible')
  }

  private get moreButton(): Locator {
    return this.root.getByRole('button', { name: 'Mais' })
  }

  private get moreSheet(): Locator {
    return this.page.getByRole('dialog', { name: 'Mais' })
  }

  tab(label: TabLabel): Locator {
    return this.root.getByRole('button', { name: label })
  }

  /** A marca vive na sidebar, que em mobile é a barra de topo. */
  get brand(): Locator {
    return this.page.locator('.sidebar .brand')
  }

  /** Abre um separador e espera que fique ativo, passando pelo "Mais" se preciso. */
  async open(label: TabLabel): Promise<void> {
    const viaSheet = SECONDARY.includes(label) && (await this.page.locator('.bottom-nav').isVisible())

    if (viaSheet) {
      await this.moreButton.click()
      await this.moreSheet.getByRole('button', { name: label }).click()
      // num separador secundário é o "Mais" que fica em destaque
      await expect(this.moreButton).toHaveClass(/active/)
      return
    }

    await this.tab(label).click()
    await expect(this.tab(label)).toHaveClass(/active/)
  }

  /** A navegação só existe com sessão iniciada — serve de sinal de "autenticado". */
  async expectVisible(): Promise<void> {
    await expect(this.tab('Painel')).toBeVisible()
  }

  async expectActive(label: TabLabel): Promise<void> {
    const active = SECONDARY.includes(label) && (await this.bottomNav.isVisible())
      ? this.moreButton
      : this.tab(label)
    await expect(active).toHaveClass(/active/)
  }

  /** A barra inferior (mobile). No desktop está no DOM mas escondida por CSS. */
  get bottomNav(): Locator {
    return this.page.locator('.bottom-nav')
  }

  /** A lista de separadores da sidebar, que em mobile desaparece. */
  get sidebarTabs(): Locator {
    return this.page.locator('.sidebar .nav')
  }

  /**
   * A barra tem de estar encostada ao fundo e ocupar a largura toda. É a
   * asserção que apanha o bug recorrente descrito no styles.css: conteúdo
   * demasiado largo estica o layout viewport e desposiciona o position: fixed.
   */
  async expectAnchoredToBottom(): Promise<void> {
    const viewport = this.page.viewportSize()
    expect(viewport, 'o viewport tem de estar definido').not.toBeNull()

    const box = await this.bottomNav.boundingBox()
    expect(box, 'a barra inferior tem de estar visível').not.toBeNull()

    expect(Math.round(box!.y + box!.height)).toBe(viewport!.height)
    expect(Math.round(box!.width)).toBe(viewport!.width)
  }
}
