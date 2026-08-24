import { expect, type Locator, type Page } from '@playwright/test'
import { eur } from '../utils/money'

/**
 * Cartões de indicadores. O Painel usa `.kpi` (quatro grandes) e os Movimentos
 * e a Carteira usam `.mini-kpi` (a fila compacta) — o seletor apanha os dois.
 * Identificam-se pelo texto do rótulo, que é conteúdo visível ao utilizador.
 */
export class KpiCards {
  constructor(private readonly page: Page) {}

  card(label: string): Locator {
    return this.page.locator('.kpi, .mini-kpi').filter({ hasText: label })
  }

  value(label: string): Locator {
    return this.card(label).locator('.kpi-value, .mono').first()
  }

  sub(label: string): Locator {
    return this.card(label).locator('.kpi-sub, small').first()
  }

  async expectValue(label: string, amount: number): Promise<void> {
    await expect(this.value(label)).toHaveText(eur(amount))
  }
}
