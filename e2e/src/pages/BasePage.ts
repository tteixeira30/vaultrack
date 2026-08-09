import { expect, type Page } from '@playwright/test'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { ModalDialog } from '../components/ModalDialog'
import { ProfileMenu } from '../components/ProfileMenu'
import { MainNav, type TabLabel } from '../components/MainNav'

/**
 * Base de todos os Page Objects. Concentra aqui o acesso à navegação, ao menu de
 * perfil e aos diálogos partilhados, para que os specs nunca precisem de tocar em
 * seletores CSS.
 */
export abstract class BasePage {
  readonly nav: MainNav
  readonly profileMenu: ProfileMenu
  readonly dialog: ModalDialog
  readonly confirmDialog: ConfirmDialog

  constructor(readonly page: Page) {
    this.nav = new MainNav(page)
    this.profileMenu = new ProfileMenu(page)
    this.dialog = new ModalDialog(page)
    this.confirmDialog = new ConfirmDialog(page)
  }

  /** As páginas mostram um skeleton enquanto carregam os dados. */
  async waitForLoaded(): Promise<void> {
    await expect(this.page.locator('.skeleton')).toHaveCount(0)
  }

  /**
   * Nenhuma página pode fazer scroll horizontal. Em mobile isso não é só feio:
   * um layout viewport esticado desposiciona a barra inferior fixa e deixa-a
   * inacessível (ver os comentários no styles.css).
   */
  async expectNoHorizontalScroll(): Promise<void> {
    const { scrollWidth, clientWidth } = await this.page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }))
    expect(scrollWidth, `scroll horizontal: ${scrollWidth} > ${clientWidth}`)
      .toBeLessThanOrEqual(clientWidth + 1)
  }
}

/**
 * Página alcançável por um separador da navegação principal.
 *
 * `goto()` assume sessão iniciada — é o caso quando o teste usa a fixture `user`,
 * que injeta o token antes do primeiro carregamento.
 */
export abstract class TabPage extends BasePage {
  protected abstract readonly tab: TabLabel

  async goto(): Promise<void> {
    await this.page.goto('/')
    await this.nav.expectVisible()
    await this.nav.open(this.tab)
    await this.waitForLoaded()
  }
}
