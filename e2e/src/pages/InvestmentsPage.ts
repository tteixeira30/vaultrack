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
  protected readonly tab: TabLabel = 'Carteira'

  /**
   * Linha de um ativo.
   *
   * Desktop desenha `.asset-row` (grelha de colunas) e mobile `.m-asset`
   * (cartão com o código do ativo à esquerda) — nunca coexistem.
   */
  row(name: string): Locator {
    return this.page.locator('.asset-row, .m-asset').filter({ hasText: name })
  }

  title(name: string): Locator {
    return this.page.locator('.asset-title, .m-asset-main', { hasText: name })
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

  /** Abre o seletor de tipo dentro do modal (assume o modal já aberto). */
  async openTypeSelector(): Promise<void> {
    await this.dialog.root.getByRole('button', { name: 'Tipo' }).click()
  }

  /**
   * Em mobile o Dropdown abre como bottom sheet — encostado ao fundo e à largura
   * toda — em vez do popover ancorado que se usa no desktop.
   */
  async expectTypeSelectorIsSheet(): Promise<void> {
    const sheet = this.page.getByRole('dialog', { name: 'Tipo' })
    await expect(sheet.getByRole('listbox')).toBeVisible()

    const viewport = this.page.viewportSize()
    expect(viewport, 'o viewport tem de estar definido').not.toBeNull()

    // poll: a sheet entra com uma animação de 280ms e estar visível não é o
    // mesmo que ter chegado ao fundo
    await expect.poll(async () => {
      const box = await sheet.boundingBox()
      return box ? Math.round(box.y + box.height) : null
    }, { message: 'a sheet do seletor tem de assentar no fundo do ecrã' }).toBe(viewport!.height)

    const box = await sheet.boundingBox()
    expect(Math.round(box!.width)).toBe(viewport!.width)
  }

  async rename(from: string, to: string): Promise<void> {
    await this.row(from).getByRole('button', { name: `Editar ${from}` }).click()
    await this.dialog.root.getByLabel('Nome').fill(to)
    await this.dialog.save()
  }

  async delete(name: string): Promise<void> {
    await this.row(name).getByRole('button', { name: `Eliminar ${name}` }).click()
    await this.confirmDialog.accept('Eliminar investimento?')
    await expect(this.title(name)).toHaveCount(0)
  }
}
