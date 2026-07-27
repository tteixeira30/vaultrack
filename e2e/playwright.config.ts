import { defineConfig, devices } from '@playwright/test'

/**
 * Testes E2E contra a stack completa em Docker (nginx + backend + Postgres):
 *   docker compose up -d --build
 *   npm test
 *
 * Cada teste recebe um utilizador próprio (fixture `user`, registado via API), por
 * isso nenhum teste toca em dados de outro nem em contas existentes. Ver README.md.
 */
const CI = !!process.env.CI

export default defineConfig({
  testDir: './tests',
  outputDir: './test-results',

  timeout: 30_000,
  // Sem isto, cada expect() herda apenas o timeout global do teste.
  expect: { timeout: 10_000 },

  // TODO(PR3): passar a `fullyParallel: true` + workers quando todos os specs
  // estiverem migrados para a fixture `user` (registo por API).
  fullyParallel: false,
  workers: 1,

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
