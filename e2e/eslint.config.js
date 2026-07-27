import js from '@eslint/js'
import playwright from 'eslint-plugin-playwright'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['node_modules/', 'playwright-report/', 'test-results/'] },

  js.configs.recommended,
  tseslint.configs.recommended,

  // Tudo aqui corre em Node (os testes também: Buffer, process, fetch...).
  { languageOptions: { globals: globals.node } },

  {
    files: ['src/**/*.ts', 'tests/**/*.ts'],
    ...playwright.configs['flat/recommended'],
  },
  {
    files: ['src/**/*.ts', 'tests/**/*.ts'],
    rules: {
      // Regras que valem a pena endurecer: são exatamente os erros que tornam
      // uma suite E2E lenta e instável.
      'playwright/no-wait-for-timeout': 'error',
      'playwright/no-force-option': 'error',
      'playwright/no-page-pause': 'error',
      'playwright/prefer-web-first-assertions': 'error',
      'playwright/no-networkidle': 'error',

      // As asserções vivem nos Page Objects, por isso um teste pode legitimamente
      // não ter nenhum `expect` visível no corpo.
      'playwright/expect-expect': 'off',
    },
  },
)
