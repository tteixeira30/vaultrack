import { expect, type Locator, type Page } from '@playwright/test'
import { eur } from '../utils/money'

/**
 * Cartões de indicadores (`.kpi-card`), partilhados pelo Painel e por Despesas.
 * Identificam-se pelo texto do rótulo, que é conteúdo visível ao utilizador.
 */
export class KpiCards {
  constructor(private readonly page: Page) {}

  card(label: string): Locator {
    return this.page.locator('.kpi-card', { hasText: label })
  }

  value(label: string): Locator {
    return this.card(label).locator('.kpi-value')
  }

  sub(label: string): Locator {
    return this.card(label).locator('.kpi-sub')
  }

  async expectValue(label: string, amount: number): Promise<void> {
    await expect(this.value(label)).toHaveText(eur(amount))
  }
}
