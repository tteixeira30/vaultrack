import AxeBuilder from '@axe-core/playwright'
import type { Page, TestInfo } from '@playwright/test'
import type { Result } from 'axe-core'

/**
 * Auditoria de acessibilidade com axe-core (WCAG 2.0/2.1 níveis A e AA).
 *
 * Só bloqueiam as violações de impacto "serious"/"critical" (inclui contraste de
 * cor); as menores ficam registadas no anexo do relatório sem falhar o teste.
 */
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']
const BLOCKING = new Set(['serious', 'critical'])

/**
 * Corre o axe na página atual, anexa o resultado completo ao relatório e devolve
 * só as violações que bloqueiam.
 *
 * Exclui as conquistas por desbloquear (`.ach-card.locked`): estão esbatidas de
 * propósito como estado inativo, que o critério WCAG 1.4.3 dispensa de contraste —
 * mas o axe não distingue "inativo" de "texto real".
 */
export async function scanA11y(page: Page, testInfo: TestInfo, label: string): Promise<Result[]> {
  const results = await new AxeBuilder({ page }).withTags(TAGS).exclude('.ach-card.locked').analyze()

  await testInfo.attach(`axe-${label}`, {
    body: JSON.stringify(results.violations, null, 2),
    contentType: 'application/json',
  })

  return results.violations.filter((v) => BLOCKING.has(v.impact ?? ''))
}

/** Mensagem legível para o `expect`: id · impacto · nós afetados. */
export function formatViolations(violations: Result[]): string {
  return violations.map((v) => `${v.id} [${v.impact}] ×${v.nodes.length}: ${v.help}`).join('\n')
}
