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
 * Navegação principal. Os mesmos labels existem na bottom-nav mobile (escondida
 * por CSS em desktop), por isso todos os locators são scoped à sidebar.
 */
export class Sidebar {
  private readonly root: Locator

  constructor(page: Page) {
    this.root = page.locator('.sidebar')
  }

  tab(label: TabLabel): Locator {
    return this.root.getByRole('button', { name: label })
  }

  get brand(): Locator {
    return this.root.locator('.brand')
  }

  /** Abre um separador e espera que fique ativo. */
  async open(label: TabLabel): Promise<void> {
    await this.tab(label).click()
    await expect(this.tab(label)).toHaveClass(/active/)
  }

  /** A sidebar só existe com sessão iniciada — serve de sinal de "autenticado". */
  async expectVisible(): Promise<void> {
    await expect(this.tab('Painel')).toBeVisible()
  }
}
