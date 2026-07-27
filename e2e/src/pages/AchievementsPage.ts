import { expect, type Locator } from '@playwright/test'
import { BasePage } from './BasePage'

/**
 * Conquistas (gamificação). Vive no menu de perfil, não na navegação principal,
 * por isso não estende `TabPage`.
 *
 * Não tem entidade própria no backend: o nível e os pontos são calculados a partir
 * dos dados existentes.
 */
export class AchievementsPage extends BasePage {
  async goto(): Promise<void> {
    await this.page.goto('/')
    await this.sidebar.expectVisible()
    await this.profileMenu.select('Conquistas')
    await expect(this.levelHeading).toBeVisible()
  }

  get levelHeading(): Locator {
    return this.page.getByRole('heading', { name: /Nível \d/ })
  }

  achievement(name: string): Locator {
    return this.page.getByText(name)
  }

  points(total: number): Locator {
    return this.page.getByText(`${total} pontos`)
  }
}
