import { expect, type Locator } from '@playwright/test'
import { type TabLabel } from '../components/Sidebar'
import { eur } from '../utils/money'
import { TabPage } from './BasePage'

/** Rendimento mensal e categorias de alocação (percentagem ou valor fixo). */
export class IncomePage extends TabPage {
  protected readonly tab: TabLabel = 'Rendimento'

  /** Define o rendimento mensal do mês corrente. */
  async setMonthlyIncome(amount: number): Promise<void> {
    await this.page.getByRole('button', { name: 'Editar' }).first().click()
    await this.dialog.root.getByLabel('Rendimento do mês').fill(String(amount))
    await this.dialog.save()
  }

  /** O valor formatado aparece algures na página (KPI ou cabeçalho). */
  async expectIncome(amount: number): Promise<void> {
    await expect(this.page.getByText(eur(amount)).first()).toBeVisible()
  }

  category(name: string): Locator {
    return this.page.locator('.row-title', { hasText: name })
  }
}
