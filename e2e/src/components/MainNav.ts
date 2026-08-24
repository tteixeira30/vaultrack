import { expect, type Locator, type Page } from '@playwright/test'

/** Os ecrãs da aplicação (frontend: components/nav.js → SCREENS). */
export type TabLabel =
  | 'Painel'
  | 'Movimentos'
  | 'Carteira'
  | 'Objetivos'
  | 'Rendimento'
  | 'Calendário'
  | 'Conquistas'
  | 'Contas'
  | 'Perfil'

/**
 * Separadores da barra inferior em mobile e os ecrãs que cada um agrupa
 * (frontend: components/nav.js → MOBILE_TABS).
 */
const MOBILE_TABS: ReadonlyArray<{ label: string; screens: readonly TabLabel[] }> = [
  { label: 'Início', screens: ['Painel'] },
  { label: 'Dinheiro', screens: ['Movimentos', 'Rendimento', 'Calendário'] },
  { label: 'Crescer', screens: ['Carteira', 'Objetivos', 'Conquistas'] },
]

/** Contas e Perfil não estão na barra inferior: chega-se lá pelo avatar. */
const VIA_PROFILE: readonly TabLabel[] = ['Contas', 'Perfil']

/**
 * Navegação principal, seja qual for o viewport.
 *
 * Em desktop é a sidebar agrupada; em mobile são três separadores no fundo, e o
 * ecrã concreto escolhe-se nos segmentos por baixo do cabeçalho. Em vez de
 * decidir pela largura do viewport — que ficaria acoplada ao valor do
 * breakpoint — pergunta-se ao DOM qual das duas está visível.
 */
export class MainNav {
  constructor(private readonly page: Page) {}

  /** A sidebar do desktop. Em mobile está `display: none`. */
  get sidebarTabs(): Locator {
    return this.page.locator('.sidebar .nav')
  }

  /** A barra inferior (mobile). No desktop está no DOM mas escondida por CSS. */
  get bottomNav(): Locator {
    return this.page.locator('.bottom-nav')
  }

  /** Os segmentos que escolhem o ecrã dentro de um separador mobile. */
  get segments(): Locator {
    return this.page.getByRole('tablist')
  }

  /** O avatar do cabeçalho, que abre o Perfil. */
  get profileButton(): Locator {
    return this.page.getByRole('button', { name: 'Perfil e definições' })
  }

  /** A marca vive na sidebar — só existe em desktop. */
  get brand(): Locator {
    return this.page.locator('.sidebar .brand')
  }

  private async isMobile(): Promise<boolean> {
    return this.bottomNav.isVisible()
  }

  private mobileTabOf(label: TabLabel) {
    return MOBILE_TABS.find((t) => t.screens.includes(label))
  }

  /**
   * O item de navegação de um ecrã na sidebar.
   *
   * O nome acessível pode trazer o indicador atrás ("Conquistas, 23 de 32
   * desbloqueadas"), por isso ancora-se ao início em vez de exigir igualdade —
   * `^Contas` continua a não casar com "Conquistas".
   */
  tab(label: TabLabel): Locator {
    return this.sidebarTabs.getByRole('button', { name: new RegExp(`^${label}\\b`) })
  }

  /** O separador da barra inferior (mobile). */
  mobileTab(label: string): Locator {
    return this.bottomNav.getByRole('button', { name: label, exact: true })
  }

  /**
   * Abre um ecrã e espera que fique ativo.
   *
   * Em mobile passa pelo separador que o contém e, se esse separador agrupar
   * mais do que um ecrã, pelo segmento respetivo. Contas e Perfil chegam-se
   * pelo avatar do cabeçalho.
   */
  async open(label: TabLabel): Promise<void> {
    if (!(await this.isMobile())) {
      await this.tab(label).click()
      await expect(this.tab(label)).toHaveClass(/active/)
      return
    }

    if (VIA_PROFILE.includes(label)) {
      // o avatar só existe no separador "Início" — é de lá que se entra no Perfil
      if (!(await this.profileButton.isVisible())) {
        await this.mobileTab('Início').click()
        await expect(this.profileButton).toBeVisible()
      }
      await this.profileButton.click()
      if (label === 'Contas') {
        await this.page.getByRole('button', { name: /Contas e importação/ }).click()
      }
      await expect(this.page.locator('.tb-title h2')).toHaveText(label)
      return
    }

    const group = this.mobileTabOf(label)
    expect(group, `"${label}" tem de pertencer a um separador mobile`).toBeDefined()

    await this.mobileTab(group!.label).click()
    await expect(this.mobileTab(group!.label)).toHaveClass(/active/)

    if (group!.screens.length > 1) {
      const segment = this.segments.getByRole('tab', { name: label, exact: true })
      await segment.click()
      await expect(segment).toHaveAttribute('aria-selected', 'true')
    }
  }

  /** A navegação só existe com sessão iniciada — serve de sinal de "autenticado". */
  async expectVisible(): Promise<void> {
    await expect(this.page.locator('.topbar')).toBeVisible()
  }

  async expectActive(label: TabLabel): Promise<void> {
    if (!(await this.isMobile())) {
      await expect(this.tab(label)).toHaveClass(/active/)
      return
    }
    const group = this.mobileTabOf(label)
    if (group) await expect(this.mobileTab(group.label)).toHaveClass(/active/)
    // em mobile o cabeçalho diz o separador, não o ecrã: os ecrãs de dentro
    // identificam-se pelos segmentos, e o "Início" chama-se "Início"
    await expect(this.page.locator('.tb-title h2')).toHaveText(group ? group.label : label)
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
