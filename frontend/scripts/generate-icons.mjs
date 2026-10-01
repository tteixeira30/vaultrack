// Gera os ícones PNG da PWA e da app Android a partir do logo SVG (public/logo.svg).
//
// Uso:  node scripts/generate-icons.mjs   (a partir da pasta frontend/)
//
// Produz em public/ (PWA):
//   pwa-192x192.png            — ícone standard 192x192 (cantos arredondados do SVG)
//   pwa-512x512.png            — ícone standard 512x512
//   pwa-maskable-512x512.png   — maskable: fundo índigo full-bleed com o glifo na
//                                zona segura (Android recorta em círculo/squircle)
//   favicon.ico                — 32x32 (PNG dentro de ICO)
//   apple-touch-icon.png       — 180x180 FULL-BLEED para iOS: sem cantos
//                                transparentes (o iOS pinta-os de preto) — o
//                                próprio iOS arredonda os cantos
//
// Produz em assets/ (fontes para `npx @capacitor/assets generate --android`):
//   icon-only.png        — logo full-bleed 1024 (ícone clássico/legacy)
//   icon-foreground.png  — SÓ o glifo branco em canvas transparente, dentro da
//                          zona segura (~57%) do ícone adaptativo Android 8+
//   icon-background.png  — fundo índigo 1024 (camada de trás do adaptativo)
//
// Requer o devDependency `sharp` (npm install -D sharp).

import sharp from 'sharp'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const publicDir = path.join(__dirname, '..', 'public')
const assetsDir = path.join(__dirname, '..', 'assets')
const logoPath = path.join(publicDir, 'logo.svg')

const svg = await readFile(logoPath, 'utf8')

// Versão full-bleed: quadrado sem cantos arredondados (para plataformas que
// aplicam a sua própria máscara — iOS, maskable, ícone adaptativo Android).
const squareSvg = Buffer.from(svg.replaceAll('rx="15"', 'rx="0"'))

// Só o glifo (linha do gráfico + área + ponto), branco sobre transparente,
// centrado num canvas maior para respeitar a zona segura do ícone adaptativo
// (o launcher recorta a parte exterior; o conteúdo deve ficar nos ~61% centrais).
const glyphSvg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 112 112">
  <g transform="translate(24 24)">
    <path d="M13 45 L26 31 L34 38 L51 19 V47 H13 Z" fill="#ffffff" opacity="0.16"/>
    <path d="M13 45 L26 31 L34 38 L51 19" stroke="#ffffff" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="51" cy="19" r="5" fill="#ffffff"/>
  </g>
</svg>`)

// Só o fundo (gradiente índigo, sem o glifo), quadrado full-bleed.
const bgSvg = Buffer.from(
  svg.replaceAll('rx="15"', 'rx="0"')
     .replace(/<path[\s\S]*?\/>\s*<path[\s\S]*?\/>\s*<circle[\s\S]*?\/>/, ''),
)

const render = (input, size) => sharp(input, { density: 300 }).resize(size, size).png()

// --- PWA (public/) ---
await render(Buffer.from(svg), 192).toFile(path.join(publicDir, 'pwa-192x192.png'))
await render(Buffer.from(svg), 512).toFile(path.join(publicDir, 'pwa-512x512.png'))
await render(squareSvg, 180).toFile(path.join(publicDir, 'apple-touch-icon.png'))

// Maskable: fundo índigo full-bleed + glifo na zona segura.
const glyph512 = await render(glyphSvg, 512).toBuffer()
await render(bgSvg, 512)
  .composite([{ input: glyph512, left: 0, top: 0 }])
  .toFile(path.join(publicDir, 'pwa-maskable-512x512.png'))

// favicon.ico: um ICO com uma única imagem PNG 32x32 (formato válido desde o Vista).
const png32 = await render(Buffer.from(svg), 32).toBuffer()
const icoHeader = Buffer.alloc(22)
icoHeader.writeUInt16LE(0, 0) // reservado
icoHeader.writeUInt16LE(1, 2) // tipo: ícone
icoHeader.writeUInt16LE(1, 4) // nº de imagens
icoHeader.writeUInt8(32, 6) // largura
icoHeader.writeUInt8(32, 7) // altura
icoHeader.writeUInt16LE(1, 10) // planos
icoHeader.writeUInt16LE(32, 12) // bits por pixel
icoHeader.writeUInt32LE(png32.length, 14) // tamanho dos dados
icoHeader.writeUInt32LE(22, 18) // deslocamento dos dados
await writeFile(path.join(publicDir, 'favicon.ico'), Buffer.concat([icoHeader, png32]))

console.log('✓ PWA: pwa-192x192, pwa-512x512, pwa-maskable-512x512, apple-touch-icon, favicon.ico')

// --- Android (assets/, consumido pelo @capacitor/assets) ---
await mkdir(assetsDir, { recursive: true })
await render(squareSvg, 1024).toFile(path.join(assetsDir, 'icon-only.png'))
await render(glyphSvg, 1024).toFile(path.join(assetsDir, 'icon-foreground.png'))
await render(bgSvg, 1024).toFile(path.join(assetsDir, 'icon-background.png'))

console.log('✓ Android: icon-only, icon-foreground, icon-background em', assetsDir)
console.log('  → agora corre: npx @capacitor/assets generate --android --assetPath assets')
