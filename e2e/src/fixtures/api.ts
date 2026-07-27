import { expect, type APIRequestContext } from '@playwright/test'
import { uniqueEmail } from '../utils/data'

/**
 * Registo de utilizadores pela API em vez do formulário.
 *
 * O registo pela UI custa ~6 interações + um carregamento de página por teste; a
 * API resolve o mesmo num pedido. O formulário continua coberto — mas só onde é
 * o objeto do teste (`auth.spec.ts`, via `AuthPage`).
 */

/** Chave do token em localStorage (frontend/src/api.js). */
export const TOKEN_KEY = 'tracky_token'

export const PASSWORD = 'segredo123'

export interface TestUser {
  id: number
  name: string
  email: string
  baseCurrency: string
  /** Password em claro, para os testes que voltam a autenticar pela UI. */
  password: string
  /** JWT devolvido pelo registo, injetado em localStorage via storageState. */
  token: string
}

export interface RegisterOptions {
  name?: string
  email?: string
  password?: string
}

/**
 * Cria um utilizador novo e devolve-o já com token.
 *
 * Requer registo aberto (`TRACKY_INVITE_CODE` vazio), que é o default de dev.
 */
export async function registerViaApi(
  request: APIRequestContext,
  { name = 'Utilizador E2E', email = uniqueEmail(), password = PASSWORD }: RegisterOptions = {},
): Promise<TestUser> {
  const response = await request.post('/api/auth/register', {
    data: { name, email, password, inviteCode: null },
  })

  expect(
    response.ok(),
    `registo falhou (${response.status()}): ${await response.text()}\n` +
      'A stack está a correr e TRACKY_INVITE_CODE está vazio?',
  ).toBeTruthy()

  const { token, user } = (await response.json()) as {
    token: string
    user: { id: number; name: string; email: string; baseCurrency: string }
  }

  return { ...user, password, token }
}
