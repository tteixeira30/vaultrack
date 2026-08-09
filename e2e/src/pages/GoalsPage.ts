import { expect, test, type Locator } from '@playwright/test'
import { type TabLabel } from '../components/MainNav'
import { TabPage } from './BasePage'

/**
 * Os montantes aceitam string para os testes poderem escrever exatamente o que
 * uma pessoa escreveria — incluindo a vírgula decimal do PT-PT ("10000,50").
 */
export interface GoalInput {
  name: string
  /** Meta a atingir, em EUR. */
  target: number | string
  /** Alocação mensal, em EUR. */
  monthly: number | string
  /** Montante já poupado à data de criação. */
  saved?: number | string
}

/** Objetivos de poupança. */
export class GoalsPage extends TabPage {
  protected readonly tab: TabLabel = 'Objetivos'

  card(name: string): Locator {
    return this.page.locator('.goal-card', { has: this.page.locator('.goal-title', { hasText: name }) })
  }

  title(name: string): Locator {
    return this.page.locator('.goal-title', { hasText: name })
  }

  /** Montante poupado, em destaque no cartão. */
  savedAmount(name: string): Locator {
    return this.card(name).locator('.big')
  }

  /** Linha "de X € · Y%" por baixo do montante. */
  progress(name: string): Locator {
    return this.card(name).locator('.of')
  }

  /** Abre o modal de criação sem preencher — para inspecionar os campos. */
  async openCreateForm(): Promise<void> {
    await this.page.getByRole('button', { name: 'Novo objetivo' }).click()
    await this.dialog.expectOpen()
  }

  async create({ name, target, monthly, saved }: GoalInput): Promise<void> {
    await test.step(`criar objetivo "${name}"`, async () => {
      await this.page.getByRole('button', { name: 'Novo objetivo' }).click()
      await this.dialog.field('Ex: Fundo de emergência').fill(name)
      await this.dialog.field('Ex: 10000').fill(String(target))
      await this.dialog.field('Ex: 300').fill(String(monthly))
      if (saved != null) await this.dialog.field('0', { exact: true }).fill(String(saved))
      // o estado vazio tem outro botão "Criar objetivo" — este é o do modal
      await this.dialog.button('Criar objetivo').click()
      await expect(this.title(name)).toBeVisible()
    })
  }

  async contribute(name: string, amount: number | string): Promise<void> {
    const card = this.card(name)
    await card.getByPlaceholder('Valor').fill(String(amount))
    await card.getByRole('button', { name: 'Contribuir' }).click()
  }

  async delete(name: string): Promise<void> {
    await this.card(name).getByRole('button', { name: 'Eliminar' }).click()
    await this.confirmDialog.accept('Eliminar objetivo?')
    await expect(this.title(name)).toHaveCount(0)
  }
}
