# Testes E2E (Playwright)

Testes ponta a ponta contra a stack completa em Docker: nginx (frontend) → backend Spring → Postgres.

## Pré-requisitos

1. **A stack tem de estar a correr.** A partir da raiz do repositório:
   ```bash
   docker compose up -d --build
   ```
   O `npm test` verifica isto por ti (`scripts/ensure-stack.mjs`) e falha com instruções se não estiver.

2. **Registo aberto.** Os testes criam utilizadores, por isso `TRACKY_INVITE_CODE` tem de estar
   vazio — que é o default de desenvolvimento.

3. **Browsers do Playwright** instalados: `npx playwright install chromium`.

## Comandos

```bash
npm ci
npm test              # suite completa (verifica a stack primeiro)
npm run test:smoke    # só os testes marcados @smoke
npm run test:ui       # modo interativo, ideal para desenvolver
npm run test:debug    # inspector passo a passo
npm run report        # abre o último relatório HTML
npm run typecheck     # tsc --noEmit
npm run lint          # eslint (inclui regras do eslint-plugin-playwright)
```

Para apontar a outro ambiente: `BASE_URL=https://... npm test`.

## Como está organizado

```
src/
├── fixtures/     `test` estendido do projeto — importa daqui, não de @playwright/test
├── pages/        Page Objects (um por página da app)
├── components/   Peças partilhadas: Sidebar, ProfileMenu, ModalDialog, ConfirmDialog
└── utils/        Dados de teste (emails, CSV, meses) e formatação monetária
tests/            Os specs. Só orquestram Page Objects e fazem asserções.
```

Aliases de importação (definidos em `tsconfig.json`): `@fixtures/*`, `@pages/*`,
`@components/*`, `@utils/*`.

## Autenticação e isolamento

Cada teste recebe **um utilizador novo e virgem**, criado via `POST /api/auth/register` pela
fixture `user`. A override de `storageState` injeta o JWT em `localStorage` antes de a página
abrir, por isso o teste começa já com sessão iniciada — sem passar pelo formulário.

```ts
test('...', async ({ dashboardPage, user }) => {
  await dashboardPage.goto()   // já autenticado
})
```

É este isolamento por utilizador que permite correr em paralelo e que garante que os testes
**nunca tocam em contas reais** (ver `CLAUDE.md`: o `user id 1` é a conta do dono).

Para começar **sem** sessão — só o `auth.spec.ts`, que testa o próprio formulário:

```ts
test.use({ storageState: { cookies: [], origins: [] } })
```

## Regras da casa

- **Nunca `waitForTimeout`.** Usa asserções web-first (`expect(locator).toBeVisible()`), que
  esperam sozinhas. O lint bloqueia o contrário.
- **Zero seletores CSS nos specs.** Vivem todos nos Page Objects — é o único sítio a mudar
  quando a UI muda.
- **Prefere `getByRole` / `getByLabel` / `getByPlaceholder`** a `data-testid`. O testid é para
  quando não há alternativa estável (dropdowns sem label, linhas de tabela, cartões de KPI).
- **Testes independentes.** Nenhum teste pode depender de outro ter corrido antes.
- **Sem dependências externas.** Os investimentos usam sempre o tipo "Outro" para não chamar o
  Yahoo Finance nem o CoinGecko; os movimentos são criados ou importados pelo próprio teste.
- **Valores em euros** via `eur(1500)` (`@utils/money`), que trata da vírgula decimal e do
  espaço não-quebrável antes do símbolo.

## Dados deixados para trás

Cada execução cria utilizadores `e2e-*@test.pt` que ficam na base de dados local. Não há
endpoint de eliminação de conta no backend, por isso a limpeza é feita por SQL — manual e
opcional (no CI a stack é sempre nova e a questão não se põe):

```bash
npm run db:clean            # mostra o que seria apagado (dry-run)
npm run db:clean -- --yes   # apaga
```

O script só toca em emails que casam com o padrão dos testes e **nunca** no `id = 1`, a conta
real do dono.
