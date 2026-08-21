import { expect, test, type Locator } from '@playwright/test'
import { KpiCards } from '../components/KpiCards'
import { type TabLabel } from '../components/MainNav'
import { TabPage } from './BasePage'

export type MovementType = 'Entrada' | 'Saída'

export interface MovementInput {
  description: string
  amount: number
  type?: MovementType
  category?: string
}

/** Despesas — contas correntes, movimentos manuais e importação de extratos. */
export class ExpensesPage extends TabPage {
  protected readonly tab: TabLabel = 'Movimentos'
  readonly kpis = new KpiCards(this.page)

  // ---- locators ----------------------------------------------------------

  /**
   * O botão de importar extrato.
   *
   * Em desktop está na linha das contas, em mobile é o botão largo no fim da
   * lista (o cabeçalho mobile só tem o "+"). Ambos levam o mesmo testid porque
   * o estado vazio tem um terceiro botão com o mesmo rótulo visível.
   */
  get importButton(): Locator {
    return this.page.getByTestId('import-statement')
  }

  get newMovementButton(): Locator {
    return this.page.getByRole('button', { name: 'Novo movimento' })
  }

  get emptyAccountsHint(): Locator {
    return this.page.getByText('Começa por criar as tuas contas')
  }

  get emptyMovementsHint(): Locator {
    return this.page.getByText(/Sem movimentos em/)
  }

  accountChip(name: string): Locator {
    return this.page.getByTestId('account-chip').filter({ hasText: name })
  }

  /**
   * Um movimento da lista.
   *
   * A página desenha as duas vistas ao mesmo tempo — a tabela do desktop e os
   * cartões por dia do telemóvel — e é o CSS que escolhe qual se vê. Daí o
   * `:visible`: sem ele o locator apanha as duas cópias.
   */
  movement(description: string): Locator {
    return this.page.locator('[data-testid="movement-row"]:visible', { hasText: description })
  }

  /** Barra do gráfico de despesas por categoria. */
  categoryBar(category: string): Locator {
    return this.page.locator('.cat-bars', { hasText: category })
  }

  // ---- ações -------------------------------------------------------------

  async createAccount(name: string, balance?: number): Promise<void> {
    await test.step(`criar conta "${name}"`, async () => {
      // sem contas nenhumas a fila de chips não existe — a entrada é o botão do
      // estado vazio, que é o que o utilizador vê da primeira vez
      const addChip = this.page.getByTestId('account-chip-add')
      if (await addChip.isVisible()) await addChip.click()
      else await this.page.getByRole('button', { name: 'Criar conta' }).click()
      await this.dialog.field('Ex: Santander').fill(name)
      if (balance != null) await this.dialog.field(/Deixa em branco/).fill(String(balance))
      await this.dialog.save()
      await expect(this.accountChip(name)).toBeVisible()
    })
  }

  /** Filtra a página por uma conta. */
  async selectAccount(name: string): Promise<void> {
    await this.accountChip(name).click()
  }

  async deleteAccount(name: string): Promise<void> {
    await test.step(`eliminar conta "${name}"`, async () => {
      const chip = this.accountChip(name)
      await chip.hover()
      await chip.getByRole('button', { name: `Eliminar ${name}` }).click()
      await this.confirmDialog.accept('Eliminar conta?')
      await expect(this.accountChip(name)).toHaveCount(0)
    })
  }

  async addMovement({ description, amount, type = 'Saída', category }: MovementInput): Promise<void> {
    await test.step(`adicionar movimento "${description}"`, async () => {
      await this.newMovementButton.click()
      await this.dialog.field('Ex: Supermercado Continente').fill(description)
      if (type === 'Entrada') await this.dialog.button('Entrada').click()
      if (category) {
        await this.dialog.root.getByRole('button', { name: 'Categoria' }).click()
        await this.page.getByRole('option', { name: category, exact: true }).click()
      }
      await this.dialog.root.getByLabel('Valor').fill(String(amount))
      await this.dialog.save()
    })
  }

  async renameMovement(from: string, to: string): Promise<void> {
    await this.movement(from).getByRole('button', { name: `Editar ${from}` }).click()
    await this.dialog.field('Ex: Supermercado Continente').fill(to)
    await this.dialog.save()
  }

  async deleteMovement(description: string): Promise<void> {
    await this.movement(description).getByRole('button', { name: `Eliminar ${description}` }).click()
    await this.confirmDialog.accept('Eliminar movimento?')
  }

  /**
   * Importa um extrato CSV. `expectedCount` valida a pré-visualização antes de
   * confirmar — é o que distingue "importou 3" de "importou 0 em silêncio".
   */
  async importStatement(csv: string, expectedCount: number): Promise<void> {
    await test.step(`importar extrato (${expectedCount} movimentos)`, async () => {
      await this.importButton.click()
      await this.dialog.root.locator('input[type="file"]').setInputFiles({
        name: 'extrato.csv',
        mimeType: 'text/csv',
        buffer: Buffer.from(csv),
      })
      await expect(this.dialog.root.getByText(`${expectedCount} movimento(s) prontos a importar`)).toBeVisible()
      await this.dialog.button(new RegExp(`Importar ${expectedCount} movimento`)).click()
      await this.dialog.expectClosed()
    })
  }
}
