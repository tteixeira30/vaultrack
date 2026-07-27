import { type TabLabel } from '../components/Sidebar'
import { TabPage } from './BasePage'

/** Painel — agrega rendimento, investimentos e objetivos. É o separador inicial. */
export class DashboardPage extends TabPage {
  protected readonly tab: TabLabel = 'Painel'

  /**
   * O Painel é o separador por omissão depois do login, por isso basta carregar a
   * raiz — não é preciso clicar no separador.
   */
  override async goto(): Promise<void> {
    await this.page.goto('/')
    await this.sidebar.expectVisible()
    await this.waitForLoaded()
  }
}
