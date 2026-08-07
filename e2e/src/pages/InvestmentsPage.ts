import { expect, test, type Locator } from '@playwright/test'
import { type TabLabel } from '../components/MainNav'
import { TabPage } from './BasePage'

export interface ManualInvestmentInput {
  name: string
  /** Valor atual da posição, em EUR. */
  value: number
  /** Ganho acumulado em percentagem (pode ser negativo). */
  gain?: number
}

/**
 * Investimentos.
 *
 * Os testes usam sempre o tipo **"Outro"** (manual, sem símbolo): não depende de
 * cotações do Yahoo Finance nem do CoinGecko, por isso é determinístico em CI.
 */
export class InvestmentsPage extends TabPage {
  protected readonly tab: TabLabel = 'Investimentos'

  row(name: string): Locator {
    return this.page.locator('tr', { has: this.page.locator('.row-title', { hasText: name }) })
  }

  title(name: string): Locator {
    return this.page.locator('.row-title', { hasText: name })
  }

  async createManual({ name, value, gain = 0 }: ManualInvestmentInput): Promise<void> {
    await test.step(`criar investimento manual "${name}"`, async () => {
      await this.page.getByRole('button', { name: 'Novo investimento' }).click()
      await this.dialog.field('Ex: MSCI World').fill(name)
      await this.dialog.root.getByRole('button', { name: 'Tipo' }).click()
      await this.page.getByRole('option', { name: 'Outro' }).click()
      await this.dialog.field('Ex: 1500').fill(String(value))
      await this.dialog.field('Ex: 12.5 ou -8').fill(String(gain))
      await this.dialog.button('Adicionar').click()
      await expect(this.title(name)).toBeVisible()
    })
  }

  async rename(from: string, to: string): Promise<void> {
    await this.row(from).getByRole('button', { name: 'Editar' }).click()
    await this.dialog.root.getByLabel('Nome').fill(to)
    await this.dialog.save()
  }

  async delete(name: string): Promise<void> {
    await this.row(name).getByRole('button', { name: 'Eliminar' }).click()
    await this.confirmDialog.accept('Eliminar investimento?')
    await expect(this.title(name)).toHaveCount(0)
  }
}
