# Tracky — guia do projeto

Aplicação web de **finanças pessoais**: gestão de rendimento mensal, investimentos (com cotações em tempo real), objetivos de poupança, um dashboard, calendário financeiro e conquistas (gamificação). Interface em **Português de Portugal**, valores por omissão em **EUR**.

> Notas para quem trabalha aqui: os comentários e textos de UI são em PT-PT. Mantém esse registo. Todo o cálculo monetário interno é feito em **EUR**; a moeda base é apenas de apresentação (ver secção *Moeda*).

## Stack

- **Backend**: Spring Boot 3, Java 21, Spring Security + JWT, Spring Data JPA/Hibernate, PostgreSQL 16. Build com Maven.
- **Frontend**: React 18 + Vite, Recharts (gráficos). Sem framework de routing — navegação por separadores em estado.
- **Infra**: Docker Compose. Preços via Yahoo Finance (ações/ETFs) e CoinGecko (cripto), sem API key.

## Estrutura do repositório

```
backend/                 Spring Boot (código em src/main/java/com/tracky)
  ├─ auth/               User, JWT (JwtService, JwtAuthFilter), SecurityConfig, AuthController
  ├─ income/             Rendimento mensal: IncomeSettings, Allocation, IncomeController
  ├─ investment/         Investimentos: Investment, InvestmentController, PriceService (cotações→EUR)
  ├─ goal/               Objetivos de poupança: Goal, GoalController
  ├─ contribution/       Depósitos/reforços mensais automáticos (serviço + scheduler dia 1)
  ├─ dashboard/          DashboardController (agrega os outros controllers)
  ├─ currency/           Moeda base: CurrencyService (câmbio EUR→X), CurrencyController
  ├─ calendar/           Calendário financeiro: CalendarEvent, CalendarController, CalendarEventRepository
  ├─ achievements/       Conquistas/gamificação: AchievementsController (agrega dados; sem entidade)
  └─ config/             WebConfig (CORS)
frontend/                React + Vite (código em src)
  ├─ pages/              DashboardPage, IncomePage, InvestmentsPage, GoalsPage, CalendarPage, AchievementsPage, AuthPage
  ├─ components/         AuthContext, Toast, Modal, Icons (SVG inline)
  ├─ api.js              Cliente HTTP central + helpers de formatação de moeda
  └─ styles.css          Folha de estilos única (design tokens em :root)
docker-compose.yml       Ambiente de desenvolvimento (db + backend + frontend)
docker-compose.prod.yml  Produção (+ Caddy para HTTPS) — ver Deploy
```

`CHEATSHEET.md` e `DEPLOY.md` existem **apenas localmente** (estão no `.gitignore`) e contêm detalhes operacionais sensíveis (IPs, comandos SSH). **Não os recries no repositório nem coloques segredos/IPs/domínios/código de convite em ficheiros versionados** (o repo é público).

## Correr localmente

Toda a stack corre em Docker (base de dados em volume nomeado `tracky-dbdata`, os dados persistem entre rebuilds):

```bash
docker compose up -d --build            # arranca db + backend + frontend
docker compose up -d --build backend    # reconstrói só um serviço
docker compose logs -f backend
docker exec tracky-db psql -U tracky -d tracky   # aceder à BD
```

- Frontend: http://localhost:3000 (Vite dev faz proxy de `/api` → `http://localhost:8080`).
- Backend: http://localhost:8080
- O frontend em Docker é servido por nginx (imagem construída); **para ver alterações é preciso reconstruir a imagem** (`docker compose up -d --build frontend`). Em dev puro pode usar-se `npm run dev` dentro de `frontend/`.

Verificação rápida sem correr o Docker inteiro:

```bash
cd frontend && npx vite build     # apanha erros de JS/JSX/imports
```

## Testes

- **Backend**: JUnit via Maven (`backend/src/test`).
- **Frontend**: Vitest + Testing Library (`cd frontend && npm run test:run`).
- **E2E**: Playwright em TypeScript, contra a stack Docker completa (`e2e/`). Requer a stack a
  correr e registo aberto (`TRACKY_INVITE_CODE` vazio).

```bash
cd e2e && npm test        # suite completa (verifica a stack primeiro)
cd e2e && npm run test:ui  # modo interativo
```

Convenções dos E2E — **lê `e2e/README.md` antes de lá mexer**. Em resumo: os specs só
orquestram Page Objects (`e2e/src/pages`), nunca contêm seletores CSS; a autenticação vem da
fixture `user`, que regista um utilizador novo por teste via API e injeta o token via
`storageState`; nada de `waitForTimeout` (o lint bloqueia). Ao adicionar UI, prefere dar-lhe um
nome acessível (`aria-label`, `<label>` associado) a inventar um `data-testid` — serve os
testes e os leitores de ecrã ao mesmo tempo.

## Convenções do backend

- **Um pacote por funcionalidade.** A lógica vive nos `@RestController` (não há camada de serviço genérica). Exceções que são serviços: `PriceService`, `CurrencyService`, `ContributionService`.
- **Controllers agregadores** (`DashboardController`, `AchievementsController`) **reutilizam** os controllers de funcionalidade (injetam `IncomeController`/`InvestmentController`/`GoalController` e chamam os seus métodos), em vez de duplicar cálculos. Segue este padrão para novas vistas agregadas.
- **Tudo é scoped ao utilizador.** Os repositórios usam `findByUserId...` / `findByIdAndUserId`. O utilizador chega aos endpoints via `@AuthenticationPrincipal User user`.
- **Auth**: JWT Bearer. `SecurityConfig` só permite `/api/auth/register`, `/api/auth/login` e `/error` sem autenticação (o `/error` tem de passar, senão respostas 4xx viram 401). Erros de validação → `ResponseStatusException(HttpStatus.BAD_REQUEST, ...)`.
- **Schema**: Hibernate `ddl-auto: update` — **não há migrations**. Adicionar um campo a uma entidade cria a coluna automaticamente, mas as linhas existentes ficam a `NULL`. Trata o null no getter (ex.: `User.getBaseCurrency()` devolve `"EUR"` se null). Nunca contes com defaults de Java para linhas já existentes.
- **Dados legados**: `IncomeController.migrateLegacyRows` atribui linhas antigas sem `month` ao mês atual. Padrões defensivos semelhantes são bem-vindos.

### Moeda (importante)

- **Todo o cálculo é em EUR.** `PriceService` converte cotações de mercado para EUR (Yahoo `{CUR}EUR=X`).
- A **moeda base** do utilizador (`User.baseCurrency`, default EUR) é só de **apresentação**. `CurrencyService` dá a taxa EUR→base (Yahoo `EUR{CUR}=X`, com cache). `GET /api/currency` devolve `{ base, rate, supported }`.
- No frontend, `api.js` converte na apresentação: `fmtEur(v)` recebe EUR e formata na moeda base; `toEur(v)` converte input da base→EUR antes de enviar. Ao trocar de moeda, as páginas remontam via `key={baseCurrency}` no `App.jsx`.

### Mensal / recorrência

- **Rendimento** é por mês (`IncomeSettings.month` = `AAAA-MM`). Ao entrar num mês novo copia rendimento + categorias do mês anterior.
- **Reforços/depósitos automáticos**: `ContributionScheduler` corre no arranque (catch-up) e diariamente às 00:10; só aplica quando começou um mês novo desde a última aplicação (`lastAppliedMonth`).
- O **calendário** gera ocorrências de eventos manuais + derivados automaticamente dos reforços de investimentos e depósitos de objetivos (dia 1).

## Convenções do frontend

- **Sem router.** `App.jsx` alterna ecrãs por um estado `screen` (sincronizado com o hash e o
  histórico). O mapa de ecrãs vive em `components/nav.js` — para acrescentar um, junta-o a
  `SCREENS`, ao grupo certo de `NAV_GROUPS` (sidebar do desktop) e, se for para telemóvel, ao
  separador certo de `MOBILE_TABS`; depois renderiza-o no `page-swap` do `App.jsx`.
- **Duas navegações, um mapa.** Em desktop é a sidebar agrupada (Principal · Análise · Sistema);
  em mobile são três separadores no fundo (Início · Dinheiro · Crescer), e o ecrã dentro de cada
  um escolhe-se nos segmentos por baixo do cabeçalho. As duas coexistem no DOM — é o CSS que
  decide qual se vê — por isso têm nomes de landmark diferentes.
- **Estado partilhado pelo shell**: `MonthContext` (o mês ativo, que a barra de topo troca e as
  páginas mensais consomem) e `IntentContext` (o menu "Adicionar" e a paleta ⌘K navegam para um
  ecrã e deixam lá a intenção; a página consome-a com `useIntent`).
- **`api.js`** é o único cliente HTTP. Anexa o Bearer token, trata 401 (limpa sessão). Exporta `fmtEur`, `fmtMoneyShort`, `fmtPct`, `toEur`, `setDisplayCurrency`.
- **Contextos/components**: `AuthContext` (sessão + moeda), `Toast` (`useToast()`), `Modal` + `ConfirmDialog`. `Icons.jsx` são SVG inline (adiciona novos aqui).
- **Estilos**: um único `styles.css` com design tokens em `:root`. Segue as classes/tokens existentes; evita estilos inline exceto valores dinâmicos.
- Formata dinheiro **sempre** via `fmtEur`/`fmtMoneyShort` (respeitam a moeda base). Converte inputs monetários com `toEur` antes de enviar.

### Tokens de `styles.css`

A paleta vem do design **Vaultrack v3**: escuro assente em `#0a0b10` e claro "papel" (cinzentos
quentes, `#f6f5f1`) — não um claro azulado. Além das cores (`--bg`, `--panel`, `--surface*`,
`--sel`, `--track`, `--text*`, `--accent*`, `--cyan`, `--green`, `--red`, `--amber`), existem
escalas que **devem** ser usadas em vez de números soltos:

| Grupo | Tokens |
|---|---|
| Tipografia | `--font` (Manrope, interface), `--font-mono` (JetBrains Mono, números) |
| Forma | `--radius` 20px (cartões), `--radius-md` 16px, `--radius-sm` 11px, `--radius-xs` 9px |
| Espaçamento | `--sp-1` (4px) … `--sp-8` (32px) |
| Camadas | `--z-sidebar` 40, `--z-nav` 50, `--z-pop` 60, `--z-modal` 100, `--z-portal` 200, `--z-toast` 200 |
| Movimento | `--dur-1/2/3` (120/200/280ms), `--ease-out`, `--ease-spring` |
| Toque | `--tap` (44px, alvo tátil mínimo) |
| Chrome | `--topbar-h` (60px), `--nav-h` (66px), `--seg-h` (46px) |
| Safe areas | `--safe-t/-b/-l/-r` (envolvem `env(safe-area-inset-*)`) |
| Foco | `--ring` (anel de `:focus-visible`) |

`--z-pop` é para popovers no fluxo (menu "Adicionar"); `--z-portal` é para os popovers em portal
(`Dropdown`, `DatePicker`, paleta ⌘K), que têm de ficar **acima** dos modais.

**Números são mono.** Todo o dinheiro, data e percentagem leva `.mono` (que é o `--font-mono` com
`tabular-nums`). É o que dá o alinhamento das colunas de valores em toda a app.

**Contraste é regra, não gosto.** O `e2e/tests/a11y.spec.ts` corre o axe nos nove ecrãs em tema
claro e escuro e bloqueia em qualquer violação de contraste. Por isso `--text-dim` e `--text-faint`
são mais claros (escuro) e mais escuros (claro) do que os do design: os originais davam 3.1–3.7:1.
Ao pôr texto sobre um fundo com tinte (`--accent-soft` e afins), verifica — foi aí que o nome da
moeda ativa caiu para 4.39:1.

### Breakpoints (só estes quatro)

As custom properties não funcionam dentro de `@media`, por isso os níveis estão documentados num
comentário no topo do `styles.css`. Não inventes valores intermédios — foi assim que se chegou a
sete breakpoints desiguais.

- `<= 600px` — telemóvel em retrato: uma coluna, modais viram bottom sheets, `font-size: 16px` nos
  campos (evita o zoom automático do iOS).
- `<= 760px` — telemóvel em paisagem / tablet pequeno: `table.responsive` vira lista de cartões.
- `<= 900px` — **fronteira "isto é mobile"**: a sidebar desaparece, o cabeçalho da página passa a
  ser a barra de topo, surgem a `.bottom-nav` e os `.segments`, e todo o interativo passa a ter
  pelo menos `--tap` de altura.
- `<= 1000px` — desktop estreito: só ajustes de grelha.

**Grelhas**: usa sempre `minmax(0, 1fr)`, nunca `1fr`. Itens de grelha têm `min-width: auto` e não
encolhem abaixo do conteúdo — com `1fr` os cartões passavam dos 390px e ficavam cortados pelo
`overflow-x: hidden` do body, sem sintoma visível a não ser conteúdo a desaparecer à direita.

**Vistas duplicadas**: quando um ecrã tem duas apresentações (a tabela de Movimentos e os cartões
por dia, por exemplo), as duas ficam no DOM e é o `.desktop-only` / `.mobile-only` que escolhe.
Essas duas classes vivem **no fim** do ficheiro, mesmo antes do bloco dos alvos táteis: são
seletores de classe simples e qualquer `display` declarado depois ganharia por cascata.

Regras globais que já existem e não precisam de ser repetidas: supressão do realce de toque com
`:active` próprios, `touch-action: manipulation`, `overscroll-behavior` nas sobreposições,
`:focus-visible` com `--ring`, e um bloco `prefers-reduced-motion` que desliga animações.
Usa `100dvh` (com `100vh` antes, como fallback) sempre que precises da altura do ecrã.

**Alvos táteis**: o bloco que garante os `--tap` está no **fim** do `styles.css` e tem de lá
ficar. São seletores de classe simples, por isso qualquer regra de dimensão declarada depois
ganha por cascata — foi assim que a caixa de "depósito automático" ficou com 17px e os gatilhos
dos seletores com 38–40px sem ninguém dar por isso. Controlo novo? Acrescenta-o a esse bloco,
não a outro sítio.

### Formulários

- Campos monetários e percentuais são `type="text"` com `inputMode="decimal"`, nunca
  `type="number"`: em PT-PT escreve-se "1,5" e o `type="number"` descarta-o em silêncio. Lê
  sempre esses valores com `parseAmount` (`api.js`) — nunca com `Number()`, `parseFloat` ou `+`.
  `type="number"` fica só para inteiros (dia do mês, horizonte da projeção).
- Um `<Modal>` com formulário recebe `onSubmit` e `busy`; passa a envolver o corpo num `<form>`
  com um botão de submit escondido, que é o que dá ao Enter o significado de submeter. Não
  acrescentes `onKeyDown` de Enter aos campos desse modal — disparariam o gravar duas vezes.

## Modelo de dados (entidades)

- `User` — id, name, email, passwordHash, `baseCurrency`, `currentBalance`, createdAt.
- `IncomeSettings` — userId, `month`, monthlyIncome. `Allocation` — userId, month, name, percentage **ou** fixedAmount.
- `Investment` — userId, name, symbol, type (STOCK/ETF/CRYPTO/OTHER), initialValue, quantity, fallbackValue, monthlyContribution, lastAppliedMonth.
- `Goal` — userId, name, targetAmount, monthlyAllocation, savedAmount, autoDeposit, lastAppliedMonth.
- `CalendarEvent` — userId, name, category, inflow, amount, frequency (MONTHLY/YEARLY/ONCE), dayOfMonth/eventDate, active.
- Conquistas **não têm entidade** — são calculadas a partir dos dados existentes.

## Configuração (variáveis de ambiente)

Definidas em `application.yml` com defaults de dev; sobrepostas por ambiente em produção:

- `SPRING_DATASOURCE_URL` / `_USERNAME` / `_PASSWORD` — Postgres.
- `JWT_SECRET` — segredo de assinatura JWT (**trocar em produção**).
- `TRACKY_INVITE_CODE` — se definido, o registo exige este código; vazio = registo aberto (uso local).
- `TRACKY_CORS_ORIGINS` — origens CORS permitidas (lista separada por vírgulas); default de dev permite tudo. Em produção: domínio do frontend + origens Capacitor (`http://localhost`, `https://localhost`, `capacitor://localhost`).

Nunca comitar segredos. `.env`, `*.key`, `backup-*.sql` estão no `.gitignore`.

## Deploy

Produção corre em VM (Docker) com `docker-compose.prod.yml` + **Caddy** (HTTPS automático via Let's Encrypt). Fluxo:

1. Merge no `main` (via PR) a partir do PC de desenvolvimento.
2. Correr `scripts/deploy.ps1` no PC — faz por SSH o `git pull` (fast-forward) + `up -d --build`
   na VM, com health check HTTPS no fim e comando de rollback em caso de falha. Opções úteis:
   `-Status` (só diagnóstico), `-Backup` (pg_dump antes), `-Service <nome>`, `-Logs`, `-Force`.
   O equivalente manual continua a ser `git pull` + `up -d --build` dentro da VM.

O script **não contém segredos**: lê o IP, a chave SSH e o domínio de `.env.deploy` na raiz
(ignorado pelo git — o template versionado é `.env.deploy.example`). Ficheiros `.ps1` têm de ficar
com **CRLF** (regra no `.gitattributes`): o Windows PowerShell 5.1 não fecha here-strings em
ficheiros só com LF.

Os detalhes concretos (endereços, SSH, domínio) estão no `CHEATSHEET.md` local (não versionado). **Implementar e testar sempre localmente primeiro**; só fazer deploy quando validado.

## App mobile (PWA + Capacitor Android)

O frontend também corre como app mobile — mesma base de código React:

- **PWA**: `vite-plugin-pwa` em `vite.config.js` (manifest + service worker `autoUpdate`). Ícones em `frontend/public/pwa-*.png`, gerados por `frontend/scripts/generate-icons.mjs` a partir de `public/logo.svg` (correr de novo se o logo mudar). Safe areas (notch) tratadas no `styles.css` via `env(safe-area-inset-*)`.
- **Capacitor** (`frontend/capacitor.config.json`, appId `com.tracky.app`): embrulha o build Vite numa app Android nativa. O projeto nativo vive em `frontend/android/` (versionado; `local.properties` e o bundle web copiado estão git-ignored).
- **URL da API**: `api.js` usa `import.meta.env.VITE_API_URL || '/api'`. Na web fica o proxy relativo; nas builds mobile define-se `VITE_API_URL` com o URL absoluto do backend **na hora do build** (o valor fica baked no bundle — nunca comitar builds nem `.env` com o domínio real; instruções completas no `CHEATSHEET.md` local).
- **Gerar APK**: `npx vite build` (com `VITE_API_URL`) → `npx cap sync android` → `cd android && ./gradlew assembleDebug`. Requer Android SDK local (caminho em `local.properties`) e JDK 21. Ícones nativos: `npx @capacitor/assets generate --android --assetPath assets`.

## Notas de trabalho

- **Preservar dados da BD** — a conta real do dono é o `user id 1`. Não apagar/alterar dados dessa conta em testes.
- **Testar localmente antes do deploy.** Reconstruir a imagem Docker do serviço alterado e verificar o arranque limpo do backend + ausência de erros de consola no frontend.
- Ao adicionar colunas a entidades, lembra-te do `ddl-auto: update` (linhas antigas ficam a null → tratar no getter).
