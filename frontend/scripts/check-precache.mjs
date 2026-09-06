// Verifica que nenhum ficheiro de código do build fica fora da pré-cache da PWA.
// Corre a seguir ao `vite build` (ver o script "build" do package.json).
//
// Porquê: o service worker serve a app inteira da sua pré-cache, mas o
// `globPatterns` do Workbox só apanha as extensões que lá estão listadas. O
// worker do pdf.js era emitido como `.mjs` e ficava de fora — o único ficheiro
// que o browser ia buscar à rede. Bastava um deploy para o ficheiro com o hash
// antigo desaparecer do servidor enquanto a app continuava a correr da cache:
// 404 no worker e "Erro ao ler" em qualquer importação de extrato PDF.
//
// A regra é simples e vale para tudo o que venha a seguir: se o browser pode
// pedir o ficheiro em runtime, ele tem de estar na pré-cache.

import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const dist = fileURLToPath(new URL('../dist', import.meta.url))

// O próprio service worker e o que ele carrega não se pré-cacheiam a si mesmos.
const SERVICE_WORKER_FILES = /^(sw\.js|workbox-[^/]+\.js)$/

function scriptFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return scriptFiles(path)
    return /\.(js|mjs|cjs)$/.test(entry.name) ? [relative(dist, path).replaceAll('\\', '/')] : []
  })
}

if (!existsSync(join(dist, 'sw.js'))) {
  console.error('check-precache: dist/sw.js não existe — corre o `vite build` primeiro.')
  process.exit(1)
}

const precached = new Set(
  [...readFileSync(join(dist, 'sw.js'), 'utf8').matchAll(/url:"([^"]+)"/g)].map((m) => m[1]),
)
const missing = scriptFiles(dist).filter((f) => !SERVICE_WORKER_FILES.test(f) && !precached.has(f))

if (missing.length > 0) {
  console.error(
    'check-precache: ficheiros de código fora da pré-cache do service worker:\n'
    + missing.map((f) => `  - ${f}`).join('\n')
    + '\n\nUm deploy faz desaparecer estes ficheiros do servidor enquanto os browsers'
    + '\nainda correm o build anterior a partir da cache — o pedido dá 404 e a'
    + '\nfuncionalidade que os usa rebenta. Acrescenta a extensão ao `globPatterns`'
    + '\ndo VitePWA (vite.config.js) ou faz o Vite empacotá-los como `.js`.',
  )
  process.exit(1)
}

console.log(`check-precache: ${precached.size} ficheiros na pré-cache, nenhum código de fora.`)
