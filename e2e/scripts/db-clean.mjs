#!/usr/bin/env node
/**
 * Remove da base de dados **local** os utilizadores criados pelos testes E2E.
 *
 * Não existe endpoint de eliminação de conta no backend, por isso a limpeza é
 * feita por SQL. Cada execução da suite deixa ~50 utilizadores `e2e-*@test.pt`;
 * em CI a stack é sempre nova e isto não é preciso.
 *
 * Segurança: só apaga contas cujo email casa com o padrão dos testes e nunca o
 * `id = 1` — a conta real do dono (ver CLAUDE.md). Por omissão faz **dry-run**;
 * usa `--yes` para apagar mesmo.
 *
 *   npm run db:clean          # mostra o que seria apagado
 *   npm run db:clean -- --yes # apaga
 */
import { execFileSync } from 'node:child_process'

const CONTAINER = process.env.TRACKY_DB_CONTAINER || 'tracky-db'
const DB_USER = process.env.TRACKY_DB_USER || 'tracky'
const DB_NAME = process.env.TRACKY_DB_NAME || 'tracky'

/** Padrão de email gerado por `uniqueEmail()` em src/utils/data.ts. */
const EMAIL_PATTERN = 'e2e-%@test.pt'

/** Filtro partilhado por todas as instruções — nunca toca no utilizador 1. */
const TARGET = `SELECT id FROM users WHERE email LIKE '${EMAIL_PATTERN}' AND id <> 1`

/** Filhos primeiro; todas estas tabelas têm user_id direto. */
const CHILD_TABLES = [
  'allocation_items',
  'transactions',
  'allocations',
  'accounts',
  'calendar_events',
  'category_rules',
  'expense_categories',
  'goals',
  'income_settings',
  'investments',
]

function psql(sql) {
  return execFileSync('docker', ['exec', '-i', CONTAINER, 'psql', '-U', DB_USER, '-d', DB_NAME, '-t', '-A', '-c', sql], {
    encoding: 'utf8',
  }).trim()
}

let count
try {
  count = Number(psql(`SELECT count(*) FROM (${TARGET}) t`))
} catch (error) {
  console.error(
    `Não foi possível falar com a base de dados no container "${CONTAINER}".\n` +
      'A stack está a correr? `docker compose up -d`\n\n' +
      String(error.stderr || error.message),
  )
  process.exit(1)
}

if (count === 0) {
  console.log('Nada a limpar — não há utilizadores de teste na base de dados.')
  process.exit(0)
}

if (!process.argv.includes('--yes')) {
  console.log(
    `${count} utilizador(es) "${EMAIL_PATTERN}" seriam apagados, com todos os seus dados.\n` +
      'A conta id=1 fica sempre intacta.\n\n' +
      'Para apagar mesmo:  npm run db:clean -- --yes',
  )
  process.exit(0)
}

const statements = [
  ...CHILD_TABLES.map((table) => `DELETE FROM ${table} WHERE user_id IN (${TARGET});`),
  `DELETE FROM users WHERE id IN (${TARGET});`,
]
psql(`BEGIN; ${statements.join(' ')} COMMIT;`)

console.log(`${count} utilizador(es) de teste apagados.`)
