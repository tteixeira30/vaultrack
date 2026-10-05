# Plano: auditoria e logs

Logs técnicos estruturados e um trilho de auditoria por utilizador, com uma vista de admin
que mostra a auditoria de todos os utilizadores.

## Decisões (tomadas)

1. **Quem vê a auditoria**: cada utilizador vê a sua no Perfil e o **admin vê a de todos**.
2. **Retenção**: 12 meses (`tracky.audit.retention-days`, por omissão 365; `0` = não apagar).
   Os IPs são dados pessoais (RGPD).
3. **Destino dos logs**: só na VM (stdout do Docker, com rotação). Não há serviço externo.
4. **Branch bancária**: a auditoria entra antes da primeira ligação real. A
   `feature/conetividade-bancaria` faz depois rebase e acrescenta os eventos
   `BANK_CONSENT_GRANTED/RENEWED/REVOKED/EXPIRED`, `BANK_CREDENTIALS_CHANGED` e um evento de
   resumo por cada sincronização.

Organização: uma branch (`feature/auditoria-e-logs`), um commit por fase e **um PR** no fim.
O repo só aceita squash e as fases dependem umas das outras: com PRs empilhados seria preciso
fazer rebase depois de cada merge.

## Princípios

- **Logs técnicos**: stdout, duram dias, levam IDs e nunca conteúdo. **Auditoria**: Postgres,
  dura meses, é por utilizador e responde a quem, o quê, quando, de onde, com o antes e o depois.
- Nunca em logs nem na auditoria: palavra-passe, JWT/`Authorization`, código de convite,
  corpos de pedido, query strings, credenciais bancárias. Nos logs técnicos também não entra o
  email; usa-se o `userId`.
- A auditoria nunca faz falhar um pedido: se a gravação falhar, fica um `ERROR` no log e o pedido segue.
- Sem dependências novas (o Spring Boot 3.5 já escreve logs em JSON).

## Fase 1 — Logs técnicos

- **`RequestLogFilter`**: `@Order(HIGHEST_PRECEDENCE)`. Gera um `requestId` de 8 hex
  (ignora o `X-Request-Id` do cliente), põe-no no MDC, no header `X-Request-Id` e no atributo
  `REQUEST_ID_ATTR`, e escreve uma linha por pedido (logger `tracky.http`: método, rota-padrão,
  status, ms). Corre também no dispatch de `/error` (`shouldNotFilterErrorDispatch() = false`),
  onde só repõe o MDC a partir dos atributos. O Tomcat só faz esse dispatch depois de o filtro
  original ter limpo o MDC.
- **`JwtAuthFilter`**: com token válido, `MDC.put(USER_ID, id)` e
  `request.setAttribute(USER_ID_ATTR, id)` (constantes no `RequestLogFilter`).
- **`ApiErrorAttributes`**: nos 5xx, `ref` no corpo, lida do atributo `REQUEST_ID_ATTR`, e
  "(ref {})" na linha `log.error`. Os 4xx ficam sem ref. Tem de ir no corpo e não só no header:
  a APK faz pedidos cross-origin e o JS não lê headers não expostos.
- **`api.js`** (`request`): se o corpo do erro trouxer `ref`, a mensagem passa a
  `"<mensagem> (ref. <ref>)"`.
- **`docker-compose.prod.yml`**:
  - âncora `x-logging: &logging` (`driver: local`, `max-size: "10m"`, `max-file: "5"`) nos 4 serviços;
  - no backend, `LOGGING_STRUCTURED_FORMAT_CONSOLE: ecs` e
    `TRACKY_AUDIT_RETENTION_DAYS: ${TRACKY_AUDIT_RETENTION_DAYS:-365}`.
- **`Caddyfile`**: `log { output stdout; format json }` e `log_skip /assets/*` (Caddy ≥ 2.8; já
  esconde o `Authorization`). Validar com
  `docker run --rm -e DOMAIN=localhost -v ./Caddyfile:/etc/caddy/Caddyfile caddy:2-alpine caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile`.
- **Testes**:
  - `RequestLogFilterTest` (unitário, `MockHttpServletRequest` e uma `FilterChain` em lambda):
    MDC preenchido dentro da cadeia e limpo no fim; header e atributo; exceção → linha com 500
    e a exceção relançada; dispatch ERROR repõe o MDC sem gerar id novo nem linha nova.
  - `ApiErrorAttributesTest`: `ref` no 500 e não no 400.
  - `LogSecretsIntegrationTest` (`OutputCaptureExtension`): registo, login e login falhado; o
    output não pode conter a palavra-passe, o token nem o convite.
  - `api.request.test.js`: a ref aparece na mensagem.

## Fase 2 — Auditoria (backend, pacote `audit/`)

- **`AuditAction`** (enum com `kind()`):
  - SECURITY: `REGISTERED`, `LOGIN_SUCCEEDED`, `LOGIN_FAILED`, `RATE_LIMITED`, `INVITE_REJECTED`;
  - DATA: `CREATED`, `UPDATED`, `DELETED`, `CONTRIBUTED` (reforço manual de objetivo),
    `IMPORTED` (um evento por extrato), `CONTRIBUTIONS_APPLIED` (reforços mensais).
- **`AuditEntity`**: `USER, GOAL, INVESTMENT, ACCOUNT, TRANSACTION, CATEGORY, CATEGORY_RULE,
  INCOME, ALLOCATION, ALLOCATION_ITEM, CALENDAR_EVENT`.
- **`AuditEvent`** (`audit_events`, `@org.hibernate.annotations.Immutable`, índice
  `(user_id, id)`). Campos: `id`, `occurredAt`, `userId` (nulo só num login com email
  desconhecido), `actor` (USER/SYSTEM), `kind`, `action`, `entityType`, `entityId`, `details`,
  `ip` (45), `userAgent` (255), `requestId`.
  - `actor`, `kind`, `action` e `entityType` são **String**, nunca `@Enumerated`: o Hibernate gera
    um CHECK com os valores do enum que o `ddl-auto: update` nunca atualiza, e uma ação nova
    falharia a inserção (é o que o `InvestmentSchemaFixup` remedeia).
  - `details`: `@JdbcTypeCode(SqlTypes.JSON) Map<String,Object>` (jsonb).
- **Forma dos `details`**:
  - `UPDATED` → `{label, changes: {campo: [antes, depois]}}`;
  - `CREATED`/`DELETED` → `{label, values: {...}}`;
  - os restantes, chaves livres.

  O `label` identifica a entidade: nome do objetivo, descrição do movimento, mês do rendimento.
  Montantes em EUR. Os valores normalizam-se no helper `AuditService.fields(k, v, ...)`:
  LocalDate, YearMonth e enums → string; strings truncadas a 120; BigDecimal mantém-se (no diff
  compara-se com `compareTo`).
- **`AuditService`**:
  - métodos `security(...)`, `created(...)`, `updated(...)` (sem mudanças não há evento),
    `deleted(...)` e `record(...)`;
  - captura o contexto no momento da chamada: `RequestContextHolder` → `getRemoteAddr()`
    (`forward-headers-strategy: native` já dá o IP real), `User-Agent` e o atributo
    `REQUEST_ID_ATTR`. Sem pedido HTTP, o ator é `SYSTEM` (schedulers);
  - publica um `ApplicationEvent` e **nunca lança exceções**;
  - `public static final AuditService NOOP = new AuditService(e -> {})`.
- **`AuditWriter`**: `@TransactionalEventListener(phase = AFTER_COMMIT, fallbackExecution = true)`.
  Grava com `TransactionTemplate` em `REQUIRES_NEW`, e a chamada **inteira** fica dentro de um
  try/catch, para apanhar também os erros no commit. Escreve uma linha no logger `tracky.audit`
  só com a ação, a entidade e os ids. Um rollback não deixa evento.
  - Grava numa thread própria, com fila limitada (1000; cheia, descarta com ERROR). Na thread
    do pedido, o AFTER_COMMIT pedia uma segunda ligação ao pool com a da transação original
    ainda presa, e escritas concorrentes podiam esgotá-lo (revisão de segurança). Nos testes,
    `tracky.audit.async=false` mantém-no síncrono.
- **`AuditEventRepository`**:
  - `findForUser`: `userId` obrigatório, sem `is null` — um nulo nunca pode listar toda a gente;
  - `findForAdmin`: `userId` opcional;
  - ambos com `kind` e `before` opcionais, `Pageable` (pedir limite + 1 para saber o
    `nextBefore`) e `order by id desc`;
  - `deleteOlderThan` em **query nativa**, porque o DELETE em HQL sobre uma entidade
    `@Immutable` dá o aviso HHH.
- **`AuditRetentionScheduler`**: cron `0 30 3 * * *`, `Clock` injetável.
- **Injeção nos controllers**: setter
  `@Autowired void setAudit(AuditService a)`, com `AuditService.NOOP` por omissão. Os testes
  unitários fazem `new XController(...)` em cerca de 30 sítios; com injeção pelo construtor
  seria preciso mexer em todos. Vale o mesmo para o `AuthController` e o `ContributionService`.
- **Eventos de autenticação** (`AuthController`):
  - registo: `RATE_LIMITED {endpoint: register}`, `INVITE_REJECTED`, `REGISTERED`;
  - `RATE_LIMITED`: no máximo um por chave (endpoint, IP e email) e por minuto — um cliente
    bloqueado que insista não enche a tabela (revisão de segurança);
  - login: `RATE_LIMITED {endpoint: login}` (userId por `findByEmail`, se a conta existir),
    `LOGIN_FAILED` (userId ou nulo), `LOGIN_SUCCEEDED`;
  - moeda base: `UPDATED USER {baseCurrency}`.

  ⚠️ O commit `b84708f` tirou ao login a fuga por tempo de resposta. Os três casos (sucesso,
  falha com conta, falha sem conta) gravam **exatamente um** evento cada. Gravar só quando a
  conta existe voltava a revelar que emails estão registados.
- **Admin**:
  - `User.admin` é `Boolean`; nulo conta como false, via `isAdmin()`;
  - o `JwtAuthFilter` dá `ROLE_ADMIN`;
  - `SecurityConfig`: `/api/admin/**` exige `hasRole("ADMIN")`, com `accessDeniedHandler` → 403
    "Sem permissão.", e o controller verifica outra vez;
  - o `UserDto` ganha `admin`;
  - a promoção é **só por SQL**: `UPDATE users SET admin = true WHERE id = 1;` (o dono corre-a
    em produção; documentar no CLAUDE.md).
- **`AuditController`**:
  - `GET /api/audit` devolve os eventos do próprio;
  - `GET /api/admin/audit` devolve os de todos, com filtro `userId`, e acrescenta `userName` e
    `userEmail` via `userRepository.findAllById`;
  - parâmetros: `kind=security|data`, `before`, `limit` (50, no máximo 100);
  - resposta: `{events, nextBefore}`.
- **Eventos de dados**:
  - Goal: criar, editar, `CONTRIBUTED {amount}`, apagar.
  - Investment: criar, editar, apagar. O `refresh` fica de fora.
  - Calendar: criar, editar, apagar.
  - Income: `PUT` → `UPDATED INCOME {monthlyIncome}` com label = mês; alocações e itens: criar,
    editar, apagar.
  - Expense:
    - contas: criar, editar, apagar;
    - movimentos: criar, editar, apagar, com `applyToSimilar` nos values quando vem a true;
    - regras: apagar;
    - categorias: criar, editar, apagar (com o nº de movimentos que passam a OTHER);
    - import: `IMPORTED ACCOUNT {rows, imported, skipped, from, to, closingBalance}`.
  - `ContributionService.apply`: `CONTRIBUTIONS_APPLIED {total, forced, items}` quando aplicou
    alguma coisa (SYSTEM no scheduler, USER no POST).
- **Testes**:
  - **Teste-guarda** `AuditCoverageTest`: percorre os `@RestController` de `com.tracky`, monta
    "MÉTODO /caminho" para cada POST/PUT/PATCH/DELETE e compara com AUDITADOS ∪ EXCLUÍDOS.
    Excluídos: `POST /api/investments/refresh` e `POST /api/client-errors`.
  - **`AuditIntegrationTest`**:
    - os eventos encontram-se pelo header `X-Request-Id`;
    - login: um evento em cada um dos três casos;
    - CRUD de objetivo; edição sem mudanças não gera evento;
    - isolamento entre utilizadores em `/api/audit`;
    - admin: 403 sem papel, 200 com papel, filtro por `userId`;
    - rollback (`TransactionTemplate` com `setRollbackOnly`) → nenhum evento.
  - Unitários: `AuditWriter` com o repositório a falhar não lança; `ContributionService` chama
    a auditoria (mock pelo setter); retenção com relógio fixo.
  - `RequestBoundsTest`: acrescentar os records de pedido novos com `@Size`.
- **`e2e/scripts/db-clean.mjs`**: acrescentar `audit_events` a `CHILD_TABLES`.

## Fase 3 — "Atividade recente" no Perfil

- **`api.js`**: `getActivity({kind, before})` e `getAdminActivity({kind, before, userId})`.
- **`components/ActivityCard.jsx`**, no `ProfilePage.jsx`, a seguir ao `split-2`. Sem ecrã
  novo: não mexe no `nav.js` nem na lista do a11y.
  - Filtros com `.filter-chips` / `.filter-chip`: Tudo · Segurança · Alterações.
  - Para admins, um interruptor "Só eu · Todos os utilizadores". Em "Todos", cada linha mostra o
    nome do utilizador; clicar nele filtra por esse utilizador (chip com ×).
  - "Ver mais" usa o cursor.
  - As linhas reutilizam `.row-item.flat`, `.row-icon` e `.row-main`:
    - datas em `.mono` (`fmtDayMonth` de `MonthContext` + hora);
    - montantes com `fmtEur`/`fmtSigned`;
    - login falhado e limite de tentativas com `.badge.amber`;
    - estado vazio com `.empty-state`.
- **`src/activityLabels.js`**:
  - ação × entidade → PT-PT ("Objetivo criado", "Tentativa de entrada falhada"…);
  - rótulos dos campos e lista dos campos que são dinheiro;
  - dispositivo resumido a partir do user agent.
- **Testes**:
  - `ActivityCard.test.jsx` e `activityLabels.test.js`;
  - o `ProfilePage.test.jsx` tem de fazer stub de `api.getActivity`
    (`vi.spyOn(api, 'getActivity')`), porque o cartão faz o pedido ao montar.
- **E2E**:
  - Page Object novo `e2e/src/pages/ProfilePage.ts`, mais a fixture em `fixtures/test.ts`;
  - `tests/activity.spec.ts`:
    - um objetivo criado aparece na atividade;
    - um login falhado via API aparece em Segurança;
    - admin: promovido com
      `docker exec tracky-db psql -U tracky -d tracky -c "UPDATE users SET admin = true WHERE id = N"`
      (`execFileSync`, como em `scripts/db-clean.mjs`; nunca o id 1) e vê os eventos de outro
      utilizador;
    - um utilizador normal não vê o interruptor.
  - O `consoleGuard` falha o teste com erros de consola.
  - O `a11y.spec` já testa o Perfil nos dois temas: confirmar o contraste do âmbar.

## Fase 4 — Erros do frontend

- **Backend `config/ClientErrorController`**: `POST /api/client-errors`, autenticado, com limite
  em memória de cerca de 10 por minuto por utilizador. O record leva `message`, `stack`,
  `version`, `platform` e `screen`, com `@Size` e truncagem. Escreve um WARN no logger
  `tracky.client` e responde 204.
- **`components/ErrorBoundary.jsx`**: ecrã "Algo correu mal" com o botão "Recarregar". Vai
  dentro do `page-swap` (a navegação continua a funcionar) e na raiz do `App`.
- **`src/clientErrors.js`**:
  - deduplica e envia no máximo 5 por carregamento; não envia sem token;
  - ignora erros com `status` (pedidos à API) e falhas de `import()` de chunks (são versão
    desatualizada);
  - `installGlobalHandlers()` no `main.jsx`, para `error` e `unhandledrejection`;
  - plataforma: `window.Capacitor?.isNativePlatform?.()` → android; `display-mode: standalone`
    → pwa; senão web;
  - versão: `define: { 'import.meta.env.VITE_BUILD_ID': JSON.stringify(new Date().toISOString()) }`
    no `vite.config.js`.

## Fase 5 — Operação

- **`scripts/deploy.ps1 -Status`** (tem de ficar com **CRLF**):
  - nº de linhas `"log.level":"ERROR"` nas últimas 24 h;
  - nº de eventos SECURITY que não são `LOGIN_SUCCEEDED` nas últimas 24 h, via `psql`,
    tolerando que a tabela ainda não exista.
- Resumo diário por email só depois do merge da branch bancária (reaproveitar o
  `ConsentReminderMailer`).
- **`frontend/public/privacy.html`**: um parágrafo sobre o registo de atividade (IP,
  dispositivo, 12 meses, acesso do admin). Ver antes o `e2e/tests/privacy.spec.ts`.
- **CLAUDE.md**:
  - `audit/` na estrutura e `AuditService` nas exceções de serviço;
  - uma linha "Auditoria" no *Onde vive X*;
  - a regra "endpoint novo que altera dados = evento de auditoria (o teste-guarda obriga)";
  - logs com IDs e nunca conteúdo;
  - admin só por SQL;
  - modelo de dados: `AuditEvent` e `User.admin`;
  - configuração: `TRACKY_AUDIT_RETENTION_DAYS` e `LOGGING_STRUCTURED_FORMAT_CONSOLE`;
  - rotação de logs no deploy.

## Checks e PR

- Backend: `./mvnw -B verify`. Frontend: `npm run lint && npm run test:run && npx vite build`.
  E2E: com a stack reconstruída (`docker compose up -d --build`).
- Num ambiente sem Docker, os testes de integração e o E2E correm no CI do PR. Dizer quais
  checks não correram.
- Agente `security-reviewer` sobre auth, admin e auditoria.
- PR: descrição só técnica, sem links de sessões (repo público).
