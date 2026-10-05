import { execFileSync } from 'node:child_process'

/**
 * Acesso direto à BD da stack Docker (como em scripts/db-clean.mjs), para o que não
 * tem endpoint de propósito — promover a admin só se faz por SQL.
 */
const CONTAINER = process.env.TRACKY_DB_CONTAINER || 'tracky-db'
const DB_USER = process.env.TRACKY_DB_USER || 'tracky'
const DB_NAME = process.env.TRACKY_DB_NAME || 'tracky'

/** Dá o papel de admin a um utilizador de teste. Nunca ao id 1 (a conta real do dono). */
export function promoteToAdmin(userId: number): void {
  if (!Number.isInteger(userId) || userId <= 1) throw new Error(`id inválido para promover: ${userId}`)
  execFileSync('docker', ['exec', '-i', CONTAINER, 'psql', '-U', DB_USER, '-d', DB_NAME, '-v', 'ON_ERROR_STOP=1',
    '-c', `UPDATE users SET admin = true WHERE id = ${userId}`], { encoding: 'utf8' })
}
