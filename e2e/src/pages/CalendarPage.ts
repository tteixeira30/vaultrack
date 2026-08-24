import { test, type Locator } from '@playwright/test'
import { type TabLabel } from '../components/MainNav'
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

  /**
   * Um dia da grelha. Com movimentos, o nome acessível é "Dia N: x evento(s)" e
   * o clique abre a lista desse dia; vazio, abre logo o formulário.
   */
  day(n: number): Locator {
    return this.page.getByRole('button', { name: new RegExp(`^Dia ${n}:`) })
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

  /**
   * Pausa (ou retoma) um evento pelo alternador da lista de eventos.
   *
   * Pausado, o evento fica guardado mas o backend deixa de gerar ocorrências —
   * sai da grelha do mês e da previsão de saldo.
   */
  async toggleEvent(name: string, action: 'Pausar' | 'Retomar'): Promise<void> {
    await test.step(`${action.toLowerCase()} o evento "${name}"`, async () => {
      await this.page.getByRole('button', { name: `${action} ${name}` }).click()
    })
  }

  /**
   * O crachá que marca um evento como fora do calendário. Exato de propósito:
   * o toast de confirmação diz "Evento pausado" e casaria com uma procura solta.
   */
  get pausedBadge(): Locator {
    return this.page.getByText('pausado', { exact: true })
  }

  /**
   * Um dia sem ocorrências convida a criar — é assim que se vê que ficou vazio.
   * Exato: sem isso o "dia 1" apanhava também o 10 até ao 19.
   */
  emptyDay(n: number): Locator {
    return this.page.getByRole('button', { name: `Adicionar evento no dia ${n}`, exact: true })
  }

  /** Edita um movimento a partir da lista do dia em que ele cai. */
  async renameEventFromDay(day: number, from: string, to: string): Promise<void> {
    await test.step(`editar "${from}" pelo dia ${day} do calendário`, async () => {
      await this.day(day).click()
      await this.dialog.button(`Editar ${from}`).click()
      await this.dialog.field('Ex: Salário, Renda, Netflix').fill(to)
      await this.dialog.save()
    })
  }
}
