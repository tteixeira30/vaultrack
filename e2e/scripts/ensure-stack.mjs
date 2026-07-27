#!/usr/bin/env node
/**
 * Espera que a stack (nginx + backend + Postgres) esteja a responder antes de
 * correr os testes. Usado pelo `pretest` local e pelo job de e2e no CI.
 *
 * O sinal de "backend pronto" é o endpoint de login responder alguma coisa: com um
 * corpo vazio devolve 4xx, o que já prova que a app arrancou e o Spring está a
 * servir. Enquanto o container não está de pé, o fetch rebenta por connection refused.
 */
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'
const TIMEOUT_MS = Number(process.env.STACK_TIMEOUT_MS || 120_000)
const INTERVAL_MS = 2_000

async function isUp() {
  try {
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
      signal: AbortSignal.timeout(5_000),
    })
    // qualquer resposta HTTP serve — inclusive 400/401 de validação
    return res.status > 0
  } catch {
    return false
  }
}

const deadline = Date.now() + TIMEOUT_MS
process.stdout.write(`A aguardar pela stack em ${BASE_URL} `)

while (Date.now() < deadline) {
  if (await isUp()) {
    process.stdout.write(' pronta.\n')
    process.exit(0)
  }
  process.stdout.write('.')
  await new Promise((resolve) => setTimeout(resolve, INTERVAL_MS))
}

process.stdout.write('\n')
console.error(
  `A stack não respondeu em ${BASE_URL} ao fim de ${TIMEOUT_MS / 1000}s.\n\n` +
    'Arranca-a a partir da raiz do repositório:\n' +
    '  docker compose up -d --build\n\n' +
    'Ou aponta os testes a outro sítio com BASE_URL=<url>.',
)
process.exit(1)
