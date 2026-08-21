import { expect, type Locator } from '@playwright/test'
import { type TabLabel } from '../components/MainNav'
import { TabPage } from './BasePage'

/**
 * Conquistas (gamificação). Passou a ser um ecrã da navegação — em desktop no
 * grupo "Análise" da sidebar, em mobile no separador "Crescer".
 *
 * Não tem entidade própria no backend: o nível e os pontos são calculados a partir
 * dos dados existentes.
 */
export class AchievementsPage extends TabPage {
  protected readonly tab: TabLabel = 'Conquistas'

  override async goto(): Promise<void> {
    await super.goto()
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
