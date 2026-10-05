import { api, getToken } from './api'

/**
 * Envia para o backend (POST /api/client-errors) os erros que o utilizador vê e o
 * servidor não: exceções não apanhadas e o que o ErrorBoundary apanha. Ficam no log do
 * servidor com o requestId e o userId do pedido.
 *
 * Não envia: sem sessão (o endpoint é autenticado); erros com `status` (vêm de pedidos
 * à API, que o servidor já regista); falhas de import() de chunks (são uma versão
 * desatualizada da app, não um bug — ver main.jsx); repetidos; mais de
 * MAX_PER_LOAD por carregamento da página.
 */
const MAX_PER_LOAD = 5
const BUILD_ID = import.meta.env.VITE_BUILD_ID || 'dev'
const CHUNK_ERROR = /dynamically imported module|Importing a module script failed|ChunkLoadError|Loading chunk/i

let sent = new Set()

/** Só para testes: recomeça a contagem e a deduplicação. */
export const resetClientErrors = () => { sent = new Set() }

export function platform() {
  if (window.Capacitor?.isNativePlatform?.()) return 'android'
  if (window.matchMedia?.('(display-mode: standalone)')?.matches) return 'pwa'
  return 'web'
}

const currentScreen = () => (window.location.hash || '').replace(/^#\/?/, '').split(/[/?]/)[0].slice(0, 40) || null

export function reportError(err) {
  try {
    if (err == null || err.status != null) return
    const message = String(err.message ?? err).slice(0, 2000)
    if (CHUNK_ERROR.test(message)) return
    if (!getToken() || sent.size >= MAX_PER_LOAD || sent.has(message)) return
    sent.add(message)
    api.reportClientError({
      message,
      stack: String(err.stack || '').slice(0, 10000),
      version: BUILD_ID.slice(0, 64),
      platform: platform(),
      screen: currentScreen(),
    }).catch(() => {})
  } catch {
    // reportar um erro nunca pode causar outro
  }
}

export function installGlobalHandlers() {
  window.addEventListener('error', (e) => reportError(e.error ?? new Error(e.message)))
  window.addEventListener('unhandledrejection', (e) => reportError(e.reason))
}
