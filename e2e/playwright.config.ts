import { defineConfig, devices } from '@playwright/test'

/**
 * Testes E2E contra a stack completa em Docker (nginx + backend + Postgres):
 *   docker compose up -d --build
 *   npm test
 *
 * Cada teste recebe um utilizador próprio (fixture `user`, registado via API), por
 * isso nenhum teste toca em dados de outro nem em contas existentes — é isso que
 * permite correr em paralelo. Ver README.md.
 */
const CI = !!process.env.CI

export default defineConfig({
  testDir: './tests',
  outputDir: './test-results',

  timeout: 30_000,
  // Sem isto, cada expect() herda apenas o timeout global do teste.
  expect: { timeout: 10_000 },

  // Seguro porque cada teste tem o seu próprio utilizador (fixture `user`): não
  // há estado partilhado mutável no backend e nenhum teste depende de outro.
  fullyParallel: true,
  workers: CI ? 4 : undefined, // local: metade dos cores

  retries: CI ? 2 : 0,
  forbidOnly: CI,

  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3000',
    testIdAttribute: 'data-testid',
    // Em local guarda sempre o trace de quem falha (não há retries para o gerar).
    trace: CI ? 'on-first-retry' : 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: CI ? 'retain-on-failure' : 'off',
  },

  reporter: CI
    ? [['github'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'never' }]],

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
