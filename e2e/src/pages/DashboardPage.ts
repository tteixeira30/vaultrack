import { expect, type Locator } from '@playwright/test'
import { KpiCards } from '../components/KpiCards'
import { type TabLabel } from '../components/MainNav'
import { eur } from '../utils/money'
import { TabPage } from './BasePage'

/** Painel — agrega rendimento, investimentos e objetivos. É o separador inicial. */
export class DashboardPage extends TabPage {
  protected readonly tab: TabLabel = 'Painel'
  readonly kpis = new KpiCards(this.page)

  /** Património líquido, em destaque no topo. */
  get netWorth(): Locator {
    return this.page.locator('.hero-value')
  }

  get emptyHint(): Locator {
    return this.page.getByText(/Adiciona investimentos ou objetivos/)
  }

  /**
   * O Painel é o separador por omissão depois do login, por isso basta carregar a
   * raiz — não é preciso clicar no separador.
   */
  override async goto(): Promise<void> {
    await this.page.goto('/')
    await this.nav.expectVisible()
    await this.waitForLoaded()
  }

  async expectNetWorth(amount: number): Promise<void> {
    await expect(this.netWorth).toHaveText(eur(amount))
  }
}
