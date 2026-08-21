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
 * Exclui as conquistas por desbloquear (`.ach-card.locked` em desktop,
 * `.m-medal.locked` em mobile): estão esbatidas de propósito como estado
 * inativo, que o critério WCAG 1.4.3 dispensa de contraste — mas o axe não
 * distingue "inativo" de "texto real".
 */
export async function scanA11y(page: Page, testInfo: TestInfo, label: string): Promise<Result[]> {
  await freezeAnimations(page)

  const results = await new AxeBuilder({ page }).withTags(TAGS)
    .exclude('.ach-card.locked').exclude('.m-medal.locked').analyze()

  await testInfo.attach(`axe-${label}`, {
    body: JSON.stringify(results.violations, null, 2),
    contentType: 'application/json',
  })

  return results.violations.filter((v) => BLOCKING.has(v.impact ?? ''))
}

/**
 * Congela transições e animações antes de auditar.
 *
 * Sem isto o axe pode medir uma cor a meio caminho: os itens de navegação
 * animam a cor durante 120ms ao mudar de ecrã e, com a máquina sob carga (a
 * suite corre com vários workers), a leitura calha lá no meio e reporta um
 * contraste que não existe em repouso. O que interessa auditar é o estado
 * final — que é o que o utilizador lê.
 */
async function freezeAnimations(page: Page): Promise<void> {
  await page.addStyleTag({
    content: `*, *::before, *::after {
      transition: none !important;
      animation: none !important;
    }`,
  })
}

/** Mensagem legível para o `expect`: id · impacto · nós afetados. */
export function formatViolations(violations: Result[]): string {
  return violations.map((v) => `${v.id} [${v.impact}] ×${v.nodes.length}: ${v.help}`).join('\n')
}
