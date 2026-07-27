import { test, type Locator } from '@playwright/test'
import { type TabLabel } from '../components/Sidebar'
import { type MovementType } from './ExpensesPage'
import { TabPage } from './BasePage'

export interface CalendarEventInput {
  name: string
  amount: number
  /** Por omissão "Saída", tal como o formulário. */
  type?: MovementType
}

/** Calendário financeiro: eventos recorrentes e previsão de saldo. */
export class CalendarPage extends TabPage {
  protected readonly tab: TabLabel = 'Calendário'

  /** A previsão só aparece depois de haver saldo em contas. */
  get forecast(): Locator {
    return this.page.getByText(/previsto a 60 dias/)
  }

  /** O nome do evento também surge no toast de sucesso — daí o `.first()`. */
  event(name: string): Locator {
    return this.page.getByText(name).first()
  }

  async createEvent({ name, amount, type = 'Saída' }: CalendarEventInput): Promise<void> {
    await test.step(`criar evento "${name}"`, async () => {
      await this.page.getByRole('button', { name: 'Novo evento' }).click()
      await this.dialog.field('Ex: Salário, Renda, Netflix').fill(name)
      // frequência por omissão: Mensal, dia 1
      if (type === 'Entrada') await this.dialog.button('Entrada').click()
      await this.dialog.root.getByLabel('Valor').fill(String(amount))
      await this.dialog.save()
    })
  }
}
