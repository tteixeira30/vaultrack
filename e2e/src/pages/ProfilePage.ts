import { expect, type Locator } from '@playwright/test'
import { type TabLabel } from '../components/MainNav'
import { TabPage } from './BasePage'

type ActivityFilter = 'Tudo' | 'Segurança' | 'Alterações'

/**
 * Perfil: o cartão "Atividade recente" (trilho de auditoria). A moeda, o tema e a
 * privacidade continuam no `ProfileMenu`, partilhado por todas as páginas.
 *
 * O cartão lê a atividade ao montar; um evento acabado de gravar aparece da próxima
 * vez que se abre o Perfil (ou se troca de filtro).
 */
export class ProfilePage extends TabPage {
  protected readonly tab: TabLabel = 'Perfil'

  override async goto(): Promise<void> {
    await super.goto()
    await expect(this.activity).toBeVisible()
  }

  get activity(): Locator {
    return this.page.getByRole('region', { name: 'Atividade recente' })
  }

  /** "Só eu · Todos os utilizadores" — só existe para admins. */
  get scopeToggle(): Locator {
    return this.activity.getByRole('group', { name: 'De quem' })
  }

  async filter(name: ActivityFilter): Promise<void> {
    await this.activity.getByRole('button', { name, exact: true }).click()
  }

  async showEveryone(): Promise<void> {
    await this.scopeToggle.getByRole('button', { name: 'Todos os utilizadores' }).click()
  }

  /** Filtra a vista de admin pelo utilizador de uma linha. */
  async onlyUser(name: string): Promise<void> {
    await this.activity.getByRole('button', { name: `Ver só a atividade de ${name}` }).first().click()
  }

  /** As linhas da atividade que contêm todos os textos dados. */
  entry(...texts: (string | RegExp)[]): Locator {
    return texts.reduce((rows, t) => rows.filter({ hasText: t }), this.activity.getByRole('listitem'))
  }
}
