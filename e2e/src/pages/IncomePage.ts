import { expect, test, type Locator } from '@playwright/test'
import { type TabLabel } from '../components/MainNav'
import { eur } from '../utils/money'
import { TabPage } from './BasePage'

export interface AllocationInput {
  name: string
  /** Percentagem do rendimento. Mutuamente exclusivo com `fixedAmount`. */
  percentage?: number
  /** Valor fixo mensal em EUR. Mutuamente exclusivo com `percentage`. */
  fixedAmount?: number
}

/** Rendimento mensal e categorias de alocação (percentagem ou valor fixo). */
export class IncomePage extends TabPage {
  protected readonly tab: TabLabel = 'Rendimento'

  /** Linha da tabela de categorias. */
  row(name: string): Locator {
    return this.page.locator('tr', { has: this.categoryTitle(name) })
  }

  /** O nome da categoria também aparece no toast — daí ser scoped ao título da linha. */
  categoryTitle(name: string): Locator {
    return this.page.locator('.row-title', { hasText: name })
  }

  /** Define o rendimento mensal do mês corrente. */
  async setMonthlyIncome(amount: number): Promise<void> {
    await test.step(`definir rendimento mensal de ${amount}`, async () => {
      await this.page.getByRole('button', { name: 'Editar rendimento' }).click()
      await this.dialog.root.getByLabel('Rendimento do mês').fill(String(amount))
      await this.dialog.save()
    })
  }

  /** O valor formatado aparece algures na página (KPI ou cabeçalho). */
  async expectIncome(amount: number): Promise<void> {
    await expect(this.page.getByText(eur(amount)).first()).toBeVisible()
  }

  async createCategory({ name, percentage, fixedAmount }: AllocationInput): Promise<void> {
    await test.step(`criar categoria "${name}"`, async () => {
      await this.page.getByRole('button', { name: 'Criar categoria' }).first().click()
      await this.dialog.field('Ex: Poupança, Renda…').fill(name)

      if (fixedAmount != null) {
        await this.dialog.button('Valor fixo').click()
        await this.dialog.field('Ex: 400').fill(String(fixedAmount))
      } else {
        // por omissão a categoria é por percentagem
        await this.dialog.field('Ex: 30').fill(String(percentage))
      }

      await this.dialog.button('Adicionar').click()
      await expect(this.categoryTitle(name)).toBeVisible()
    })
  }

  async deleteCategory(name: string): Promise<void> {
    await this.row(name).getByRole('button', { name: 'Remover' }).click()
    await this.confirmDialog.accept('Remover categoria?')
    await expect(this.categoryTitle(name)).toHaveCount(0)
  }

  /** Célula "Valor" da linha — o montante mensal calculado da categoria. */
  monthlyValue(name: string): Locator {
    return this.row(name).locator('td[data-label="Valor"]')
  }
}
