# Plano — revisão profunda do mobile

> **Histórico — executado e depois substituído.** Este plano foi cumprido e serviu de base à
> camada mobile (alvos táteis, bottom sheets, projeto Playwright de telemóvel), mas a navegação
> que descreve — quatro separadores mais uma sheet "Mais" — deixou de existir com o design
> Vaultrack v3: são agora três separadores (Início · Dinheiro · Crescer) com segmentos no topo,
> e o `components/MoreSheet.jsx` foi removido. Para o estado atual, o `CLAUDE.md` e o
> `e2e/README.md` são a referência; isto fica pelo racional das decisões que continuam de pé.

Documento de trabalho para a renovação da camada mobile do Vaultrack: interações, UI, UX e
design. Escrito para ser executado por fases, cada uma a terminar num estado committável com a
pipeline verde.

## Porquê

O Vaultrack corre como web, PWA e app Android (Capacitor) a partir da mesma base de código React,
mas o mobile é hoje um *responsive* colado por cima de um desenho pensado para desktop.
Concretamente:

- **A camada mobile não tem qualquer teste.** O `e2e/playwright.config.ts:46` declara exatamente
  um projeto (`devices['Desktop Chrome']`). Nunca correu nada num viewport de telemóvel.
- **Os alvos táteis são de desktop.** O `.icon-btn` mede 32×32 (`styles.css:481-491`) e é o
  controlo de *todas* as ações de linha, do fecho dos modais e das setas de mês. Não existe
  nenhuma regra de 44px no ficheiro.
- **Há informação só acessível por hover.** Os pontos de evento do calendário têm o rótulo apenas
  num atributo `title=` (`CalendarPage.jsx:215`); o "+" da célula do dia é `:hover::after`
  (`styles.css:1510`). Ambos invisíveis ao toque.
- **Os campos não estão configurados para mobile.** Zero `inputMode` / `enterKeyHint` /
  `autoComplete` / `autoCapitalize` em todo o `src` (verificado por grep). O `AuthPage` não recebe
  preenchimento automático de gestores de palavras-passe e o `autoFocus` faz o teclado tapar o
  cartão logo ao abrir.
- **Não há sensação de app nativa.** Sem transições entre páginas, sem restauro de scroll, sem
  indicador de separador ativo, sem haptics, sem botão físico "voltar", e sem arrastar-para-fechar
  nos "bottom sheets" — que são afinal diálogos centrados com CSS de sheet
  (`styles.css:1006-1029`). Não há **nenhum** plugin Capacitor instalado nem uma única importação
  da API do Capacitor em `src/`.
- **O CSS não tem vocabulário partilhado.** Sete breakpoints desiguais
  (560/600/700/760/860/900/1000) espalhados por 20 blocos, z-index em números soltos, sem escala
  de espaçamento nem de movimento, sem `prefers-reduced-motion`, e `100vh` ainda em quatro sítios.
  A `.bottom-nav` está definida em dois blocos não contíguos (`styles.css:289-319` e `1597-1600`).
  Há um padrão de bug recorrente: os comentários em `styles.css:246-249`, `856-859`, `1347-1349` e
  `1534-1537` avisam todos que conteúdo demasiado largo estica o *layout viewport* e desposiciona
  a barra inferior fixa.

**Resultado pretendido:** o mobile passa a ser uma superfície de primeira classe — navegação com
comportamento nativo, sheets a sério, alvos táteis corretos, ecrãs desenhados para telemóvel e
resiliência offline.

## Pressupostos

Decisões tomadas por omissão. Se alguma não fizer sentido, é aqui que se muda antes de começar.

1. **Renovação profunda mantendo a identidade visual.** Sem reescrita da paleta nem da
   tipografia. Os tokens já estão afinados para WCAG AA de propósito (`styles.css:12-13`, `42-43`)
   e o `e2e/tests/a11y.spec.ts` corre o axe sobre contraste em *ambos* os temas e em todos os
   separadores — mexer na paleta é um projeto à parte.
2. **A barra inferior passa a 5 separadores + uma sheet "Mais"** (Painel, Despesas, Investimentos,
   Objetivos + Mais → Rendimento, Calendário, Conquistas, definições). Seis separadores a ~56px
   cada num ecrã de 360px é apertado, e as Conquistas estão hoje escondidas no popover de perfil
   (`App.jsx:188`). *Se preferires manter os seis, muda apenas a divisão do array `TABS` — o resto
   do redesenho da navegação é igual.*
3. **Vale a pena adicionar plugins Capacitor** (Fase 6). Fica isolado numa fase própria para poder
   ser retirado sem tocar nas Fases 1–5.
4. **Entrega por fases, uma commit por fase, e um projeto E2E mobile a sério.**

---

## Fase 1 — Fundação do CSS

*Quase só `styles.css`, mais duas correções pontuais em JS. Não toca em nomes de classes, por isso
os 190 testes Vitest e os 39 E2E ficam verdes por construção.*

**Acrescentar ao `:root` (`styles.css:3-30`)**, ao lado dos tokens existentes:

```css
--sp-1:4px; --sp-2:8px; --sp-3:12px; --sp-4:16px; --sp-5:20px; --sp-6:24px; --sp-8:32px;
--z-sidebar:40; --z-nav:50; --z-pop:60; --z-modal:100; --z-toast:200;  /* hoje: números soltos */
--dur-1:120ms; --dur-2:200ms; --dur-3:280ms;
--ease-out:cubic-bezier(.22,1,.36,1);
--ease-spring:cubic-bezier(.3,1.05,.4,1);   /* já usado pelo sheet-in, styles.css:1015 */
--tap:44px; --nav-h:62px; --topbar-h:56px;
--safe-t:env(safe-area-inset-top,0px); --safe-b:env(safe-area-inset-bottom,0px);
--safe-l:env(safe-area-inset-left,0px); --safe-r:env(safe-area-inset-right,0px);
--ring:0 0 0 3px var(--accent-soft);
```

Depois substituir pelos tokens os seis usos literais de `env(safe-area-inset-*)`
(`styles.css:263, 286, 299, 1017, 1022, 1026`) e os z-index soltos. Nota: o `padding-bottom` do
`.main` (`styles.css:286`) tem hoje `96px` — um palpite sobre a altura da barra — e passa a
`calc(var(--nav-h) + var(--safe-b) + var(--sp-5))`.

**Consolidar 7 breakpoints em 4: `600 / 760 / 900 / 1000`.** Dobrar 560→600, 700→760, 860→900.
Os 900px passam a ser a única fronteira "isto é mobile" (já é onde a sidebar colapsa), pelo que o
`.dash-hero` (`1297`) e o `.goals-grid` (`580`) passam a uma coluna aí em vez de aos 860.
Juntar as regras órfãs da `.bottom-nav` (`1597-1600`) ao bloco principal (`289-319`).
As custom properties não funcionam dentro de `@media`, por isso os quatro níveis ficam registados
num comentário no topo do ficheiro e no `CLAUDE.md`.

**Unidades de viewport:** `100vh` → `100dvh` (com uma linha `100vh` antes, como fallback) em
`styles.css:64` (`body`), `89` (`.shell`), `623` (`.modal`) e `1170` (`.auth-wrap`). Só a linha
`1014` usa `dvh` hoje.

**Alvos táteis** — dentro do bloco ≤900px, sem estragar a densidade do desktop:
`.icon-btn` passa a `min-width/min-height: var(--tap)` (de 32px); o mesmo para `.btn.small`,
`.seg button` (`1481`), `.account-chip` (`1628`), `.theme-toggle .tt-opt` (`1619`),
`.dp-day` (`1421`), `.dd-option` e `.toast-close`.

**Comportamento de toque, global:**
`* { -webkit-tap-highlight-color: transparent }` acompanhado de estados `:active` explícitos, para
não se perder o feedback; `touch-action: manipulation` nos elementos interativos;
`user-select: none` na navegação, chips e botões (evita a seleção de texto no toque longo);
`overscroll-behavior-y: contain` no `.main`, `.modal-body` (`639`) e `.dd-pop`;
`overscroll-behavior-x: contain` no `.table-wrap` (`499`).

**Movimento e foco:** um bloco global `@media (prefers-reduced-motion: reduce)` a neutralizar todas
as animações e transições (hoje não existe nenhum); `:focus-visible { box-shadow: var(--ring) }`
em `.btn, .icon-btn, .nav-item, .bottom-nav button, .dd-trigger, .seg button, .account-chip` —
hoje só a `.cal-cell` (`1509`) tem indicação de foco.

**Notch em paisagem:** `.main` e `.bottom-nav` passam a incluir `var(--safe-l)`/`var(--safe-r)` no
padding lateral. Hoje só as margens de topo e fundo são tratadas.

**Duas correções em JS:** o skeleton pré-autenticação em `App.jsx:152` é
`style={{width:380,height:420}}`, mais largo do que um viewport de 360px → passa a
`min(380px, calc(100vw - 32px))`. E confirmar que a regra de `.page-actions` a ocupar a largura
toda (`961-962`) sobrevive à dobra de 700 para 760.

---

## Fase 2 — Navegação e rede de testes mobile

**Frontend.** Extrair a navegação inline (`App.jsx:207-218`) para
`frontend/src/components/BottomNav.jsx`:

- 5 separadores principais + **Mais**, que abre uma sheet com Rendimento, Calendário, Conquistas e
  as definições hoje presas no popover de perfil (`App.jsx:102-119`: moeda base, aparência,
  ocultar valores, terminar sessão).
- Indicador de ativo deslizante: um único `.bn-indicator` posicionado em absoluto, movido por
  `style={{ '--i': index }}` e `transform: translateX(calc(var(--i) * 100%))` — CSS puro, sem
  biblioteca, e respeita `prefers-reduced-motion`.
- `aria-current="page"` no botão ativo (hoje não existe), cor e ligeira escala no ícone ativo.
- **Tocar outra vez no separador ativo faz scroll suave até ao topo.**
- **Restauro de scroll por separador:** um `useRef({})` com o mapa separador→scrollY no `Shell`,
  guardado na troca e reposto num `useLayoutEffect`. Hoje cada troca desmonta a página, refaz os
  pedidos e cai no topo.
- **Transição de página:** fade curto + 8px de `translateY` no conteúdo do `<main>` com `key`
  (`--dur-2`, `--ease-out`), desativado com movimento reduzido.
- **Estado da barra de topo:** a sidebar-como-topbar (`styles.css:254-267`) ganha uma classe
  `scrolled` que acrescenta borda e sombra. É barato e é o detalhe que se lê como "nativo".

**Histórico (sem dependências, ~30 linhas).** `history.pushState({tab}, '', '#'+tab)` na troca de
separador mais um listener de `popstate` a chamar `setTab`. As sheets e modais abertos empurram a
sua própria entrada. Isto faz o "voltar" do browser funcionar na web mobile *e* é o pré-requisito
para o botão físico do Android com `@capacitor/app` na Fase 6. **Sem react-router** — seria uma
dependência para algo que 30 linhas resolvem.

**Rede E2E — é isto que torna todas as fases seguintes seguras.**

- `e2e/playwright.config.ts:46` — acrescentar um segundo projeto, `mobile`, com
  `devices['Pixel 7']`.
- Novo `e2e/src/components/MainNav.ts`: a mesma API `tab(label)/open(label)/expectVisible()` do
  `Sidebar.ts`, escolhendo `.sidebar` ou `.bottom-nav` conforme a largura do viewport, e abrindo a
  sheet "Mais" quando o rótulo não está entre os principais. O `e2e/src/pages/BasePage.ts:12-29`
  passa a guardar `nav: MainNav` em vez de `sidebar`. Isto resolve exatamente a restrição
  documentada em `Sidebar.ts:13-15` — os locators estão limitados a `.sidebar` *precisamente
  porque* os mesmos rótulos existem na barra inferior, pelo que um projeto mobile daria violações
  de *strict mode*.
- Novo `e2e/tests/mobile.spec.ts`: barra inferior visível e navegação da sidebar escondida, troca
  de separadores, o "voltar" a repor o separador anterior, um modal a abrir como sheet e a fechar
  por arrasto e por backdrop, o toast a aparecer acima da barra, e — em todos os separadores —
  **`scrollWidth <= clientWidth`**, que é uma proteção direta contra o padrão de bug documentado em
  `styles.css:246-249`.
- Estender a matriz do `e2e/tests/a11y.spec.ts` ao projeto mobile.
- Atualizar o `e2e/README.md` ("Como está organizado" e "Regras da casa") com os dois projetos.
- O CI (`.github/workflows/ci.yml:113-117`) não precisa de alterações — o `npx playwright test`
  apanha os dois projetos. O tempo de execução aproximadamente duplica; se incomodar, limitar o
  projeto mobile com `testMatch`.

---

## Fase 3 — Camadas sobrepostas: sheets a sério

Duas primitivas partilhadas novas em `frontend/src/components/`: `Sheet.jsx` e um hook
`useSheetDrag.js` (pointer events → `translateY`, fecha a partir de ~90px ou com um gesto rápido,
caso contrário volta ao sítio; ~50 linhas, sem biblioteca). Usadas pelo Modal, Dropdown, DatePicker
e Toast.

**`Modal.jsx` (92 linhas):**
- Passar a renderizar por `createPortal` para o `document.body` — o padrão que o `Dropdown.jsx:2,93`
  já usa. As classes `.modal-overlay`/`.modal` mantêm-se, por isso o `Modal.test.jsx:42` e o Page
  Object `ModalDialog` continuam verdes.
- Prender o foco dentro do diálogo e devolvê-lo ao elemento de origem ao fechar;
  `aria-labelledby` no `<h3>` via `useId` (hoje é `role="dialog" aria-modal="true"` sem nome
  acessível, `Modal.jsx:37`).
- **Bloqueio de scroll que preserva a posição** — `position: fixed; top: -scrollY`, reposto ao
  fechar. Hoje o `document.body.style.overflow='hidden'` (`Modal.jsx:23,26`) perde a posição.
- **O `ConfirmDialog` (`Modal.jsx:68-92`) não bloqueia o body de todo** — o fundo faz scroll por
  trás dele. Corrige-se ao passar pela mesma primitiva.
- Pega de arrasto (`.sheet-grabber`) apenas abaixo dos 900px; o fecho por arrasto passa pelo
  `requestClose`, para que a proteção de alterações por guardar (`Modal.jsx:9-12`) continue a
  disparar.

**`Toast.jsx` + CSS (`styles.css:663-672`, `1026`):** em mobile passa a ocupar a largura toda
(`left/right: var(--sp-3)`) em `calc(var(--nav-h) + var(--safe-b) + var(--sp-3))`; a animação de
entrada/saída passa do eixo X (`translateX(30px)`, `styles.css:689-690`) para o eixo Y, agora que
o toast está em baixo; fechar por deslize; e pausar o temporizador de 4500ms (`Toast.jsx:28`)
enquanto o dedo estiver pousado.

**`Dropdown.jsx` / `DatePicker.jsx`:** abaixo dos 900px passam a abrir como bottom sheet em vez de
popover ancorado, com opções de 44px e células de dia com ≥40px (a `.dp-day` tem hoje ~34px).
**Manter a classe `.dd-pop` na variante sheet** — o `App.jsx:58` e o `styles.css:284` dependem dela
para a lógica de clique-fora.

---

## Fase 4 — Formulários e campos

- **Campos monetários → `type="text" inputMode="decimal"`** com normalização
  (`String(v).replace(',', '.')`) antes do `toEur` já existente (`api.js:148`). Isto é uma app em
  PT-PT: o `type="number"` descarta `1,5` em silêncio. Afeta os 27 campos numéricos do IncomePage,
  GoalsPage, CalendarPage, ExpensesPage e InvestmentsPage. Os campos de dia do mês continuam
  `type="number"`.
  ⚠️ Verificar as asserções Vitest que usem `getByRole('spinbutton')` — o role passa a `textbox`.
- `enterKeyHint` (`next`/`done`) nos campos dos modais; envolver os corpos dos modais em `<form
  onSubmit>` a sério, para que o "Ir/Concluir" do teclado submeta (hoje só o `AuthPage.jsx:55` o
  faz).
- **`AuthPage.jsx`**: `autoComplete="name"` (`:59`), `"email"` com `autoCapitalize="none"
  autoCorrect="off" spellCheck={false}` (`:65`), `"current-password"`/`"new-password"` (`:70`).
  Retirar o `autoFocus` em mobile (`:59, :65`) — tapa o cartão com o teclado ao abrir.
- Associar os `<label>` aos campos com `useId`/`htmlFor`. Substitui a solução de recurso com
  `aria-label` introduzida na commit `553592c` *e* faz o rótulo passar a fazer parte do alvo de
  toque. Manter os `aria-label` do `Dropdown` (o `Dropdown.jsx:8-16` explica porque são precisos).
- Substituir os `✕` literais pelos `IconTrash`/`IconX` já existentes em `Icons.jsx`:
  `InvestmentsPage.jsx:532`, `GoalsPage.jsx:188`, `CalendarPage.jsx:292`, `ExpensesPage.jsx:480`.
- Larguras fixas sem escape por media query: `style={{width:110}}` em
  `InvestmentsPage.jsx:615,697` e `GoalsPage.jsx:293,352` → uma classe `.field-narrow` que passa a
  largura total abaixo dos 600px (os campos de projeção em `InvestmentsPage.jsx:371,384,393` já
  estão cobertos pelo `styles.css:968`).
- Revisão de texto: "clica" → "toca" nos contextos táteis (ex.: `DashboardPage.jsx:303`).

---

## Fase 5 — Ecrã a ecrã

Prioridade: Painel → Despesas → Investimentos → Rendimento → Calendário → Objetivos → Conquistas →
Autenticação.

**Tabelas — manter o `table.responsive` e corrigi-lo.** Tanto o
`e2e/src/pages/InvestmentsPage.ts:23` como o `frontend/src/test/InvestmentsPage.test.jsx:52`
dependem do `<tr>`; substituir as tabelas por componentes de cartão próprios parte os dois e ganha
pouco face à transformação em cartões que já existe (`styles.css:974-1003`). Em vez disso:

- O primeiro `<td>` de cada linha não tem `data-label` e aparece como um bloco sem rótulo
  (`IncomePage.jsx:328`, `:413`; `InvestmentsPage.jsx:512`). Promovê-lo a **cabeçalho do cartão**
  abaixo dos 760px (maior, mais forte, borda inferior mais marcada, sem `::before`) — o nome é o
  título do cartão, não um campo rotulado.
- O InvestmentsPage tem **8 colunas** → 8 linhas empilhadas por cartão. Marcar Preço e Investido
  como `td.secondary` e colapsá-las atrás de um "Detalhes" abaixo dos 760px. *Opcional.*

**Gráficos** (as props do recharts são JS, por isso acrescenta-se
`frontend/src/components/useMediaQuery.js`):

- O donut do IncomePage (`:445-457`) usa raios fixos em píxeis `innerRadius={70} outerRadius={104}`
  (`:447`) e por isso não escala → passar a percentagens (`"58%"`/`"86%"`).
- O `YAxis width={72/64/78}` (`DashboardPage.jsx:236,341`; `InvestmentsPage.jsx:341,438`) come ~20%
  de um ecrã de 360px. Abaixo dos 600px usar `width={44}` com um formatador compacto novo, ao lado
  do `fmtMoneyShort` (`api.js:169`), com `notation:'compact'` do `Intl`.
- As 12 barras de despesa clicáveis (`DashboardPage.jsx:344-346`) têm ~28px de largura num
  telemóvel. Acrescentar um alvo de coluna inteira por trás e subir o `maxBarSize`.

**Calendário** — o maior defeito de UX. Em `CalendarPage.jsx:202-217`, uma célula de 45px salta
diretamente para o modal de criar evento (`openAddForDay`, `:71-76`), enquanto os eventos que
existem nesse dia são pontos de 7px cujo único rótulo é um `title=` (`:215`), invisível ao toque.
Substituir por uma **sheet do dia** que lista os eventos desse dia, com "Adicionar" lá dentro.
Retirar o "+" de `:hover::after` (`styles.css:1510`) em toque e dar às células um `aria-label` com
a contagem de eventos.

**Painel** — valor principal e variação primeiro; a grelha de KPIs mantém-se a **2 colunas** no
telemóvel em vez de colapsar para 1 (`styles.css:1388`), porque a uma coluna o scroll fica
interminável. Mini-cabeçalho fixo com o património assim que o hero sai do ecrã.

**Despesas** — as `.account-chips` (`ExpensesPage.jsx:379-395`) passam a uma faixa horizontal com
scroll-snap e chips de 44px; as linhas de movimento (`:466`) ganham deslizar-para-revelar
editar/eliminar através do `useSheetDrag`, mantendo os botões atuais como alternativa acessível.
Os 3 `data-testid` desta página têm de sobreviver.

**Objetivos** — barra de progresso mais alta e ações do cartão a 44px; o campo de contribuição
inline já larga o limite de 180px abaixo dos 700px (`styles.css:1063`).

**Conquistas** — a `.ach-grid` mantém-se a 2 colunas no telemóvel em vez de 1
(`styles.css:1597`); os emblemas leem-se bem a 2 e a página deixa de ser um scroll de 20 ecrãs.

**Estados de carregamento e vazio** — alinhar as alturas dos skeletons com os layouts que
representam (hoje são arbitrárias: 236/118/240, 210, 270, 460).

---

## Fase 6 — Sensação nativa e offline

*Opcional. A metade Capacitor acrescenta dependências e deve ser confirmada antes de instalar,
porque o Trivy no CI bloqueia CRITICAL/HIGH.*

**Só web, sem dependências novas:**

- **`theme-color` dinâmico** — um efeito no `ThemeContext.jsx` a escrever o `--bg` calculado no
  `<meta name="theme-color">`. Hoje o `index.html:7` e o manifest fixam ambos `#0b0d13`, por isso
  a barra de estado fica azul-escura mesmo no tema claro.
- **Alojar o Inter localmente.** O `index.html:11-13` carrega-o do CDN do Google Fonts —
  bloqueia o render, é um terceiro, e nunca entra na cache, pelo que a PWA "offline" não tem
  tipo de letra offline.
- **Workbox** no `vite.config.js:11-30` (hoje **não existe chave `workbox` nenhuma**):
  `navigateFallback`, `maximumFileSizeToCacheInBytes` (relevante — o `pdfjs-dist` é dependência) e
  `runtimeCaching` com `NetworkFirst` + `networkTimeoutSeconds` em `/api/*`, para a app abrir com
  os últimos dados conhecidos sem rede.
- **Resiliência no `api.js`** (`:13-33`): `AbortController` com timeout (~12s) e verificação de
  `navigator.onLine`, para que uma rede morta mostre "Sem ligação" em vez de um skeleton eterno.
  A acompanhar por uma faixa de offline no `App.jsx`.
- **Aviso de atualização** — o `registerType:'autoUpdate'` troca a versão em silêncio; mostrar um
  toast através do `virtual:pwa-register`.
- **Lacunas do manifest**: `id`, `scope`, `orientation`, `display_override`, `shortcuts`,
  `categories`.

**Capacitor:**

- `@capacitor/haptics` — impacto leve na troca de separador, no fecho de sheets e ao guardar com
  sucesso; haptic de notificação no erro. Atrás de um helper `haptics.js` que não faz nada quando
  `!Capacitor.isNativePlatform()`.
- `@capacitor/status-bar` — estilo e fundo a seguir o token do tema.
- `@capacitor/keyboard` — `resize: 'native'`, mais `android:windowSoftInputMode="adjustResize"` no
  `AndroidManifest.xml`, que hoje **não está definido**.
- `@capacitor/app` — listener de `backButton`: fechar sheet → recuar no histórico de separadores →
  `exitApp()`. Depende do histórico feito na Fase 2.
- `@capacitor/splash-screen` + `values-night/styles.xml` (não existe hoje) + edge-to-edge com
  `WindowCompat.setDecorFitsSystemWindows(false)` no `MainActivity.java` (hoje é um
  `BridgeActivity` vazio).
- O `capacitor.config.json` ganha um bloco `plugins` (não tem nenhum).

---

## O que fica de fora, e porquê

- **Redesenho da paleta e da tipografia.** Os tokens estão afinados para AA de propósito
  (`styles.css:12-13, 42-43`) e o axe corre contraste em todos os separadores nos dois temas.
  Projeto à parte.
- **Componentes de cartão próprios a substituir as duas tabelas.** Parte um Page Object E2E e um
  teste Vitest para ganhar pouco face a corrigir o `table.responsive`.
- **react-router.** ~30 linhas de `pushState` cobrem a necessidade real.
- **Dividir o `styles.css`.** O `CLAUDE.md` estabelece folha de estilos única; dividir é ruído que
  o utilizador nunca vê. Reordena-se dentro do ficheiro.
- **Deslizar entre separadores.** Entra em conflito com o scroll horizontal de gráficos e tabelas.

## Riscos

- A troca de `type="number"` para `type="text"` na Fase 4 é a única alteração que parte asserções
  Vitest de forma não óbvia (o role muda). Fazer numa commit isolada.
- Dobrar o breakpoint de 860 para 900 muda o momento em que o `.dash-hero` e o `.goals-grid`
  colapsam — verificar visualmente a 880px antes de fechar a Fase 1.
- O projeto E2E mobile aproximadamente duplica o tempo de E2E no CI.
- A metade Android da Fase 6 exige SDK do Android e JDK 21 locais para ser validada.

## Verificação

Por fase, antes de cada commit:

```bash
cd frontend && npm run lint && npm run test:run && npx vite build
docker compose up -d --build frontend     # a imagem tem de ser reconstruída para ver alterações
cd e2e && npm run typecheck && npm run lint && npm test   # stack a correr, TRACKY_INVITE_CODE vazio
```

Depois, à mão sobre a stack a correr: devtools do Chrome em Pixel 7 (412px) **e** iPhone SE
(375px), nos dois temas — verificar a posição da barra inferior, as safe areas, o arrasto das
sheets, o comportamento do teclado sobre os campos, e que nenhuma página faz scroll horizontal.

Os testes automáticos que servem de porta são a asserção `scrollWidth <= clientWidth` do novo
`e2e/tests/mobile.spec.ts` e a matriz alargada do `a11y.spec.ts` — o axe tem de ficar verde nos
dois temas e nos dois viewports.

Android (só na Fase 6, com SDK local): `VITE_API_URL=… npx vite build && npx cap sync android &&
cd android && ./gradlew assembleDebug`.

**Não tocar nos dados do `user id 1`** (ver `CLAUDE.md`) e testar sempre localmente antes de
qualquer deploy.

## Ficheiros

| Área | Ficheiros |
|---|---|
| Fundação | `frontend/src/styles.css` (todas as fases) |
| Navegação | `frontend/src/App.jsx`, novo `components/BottomNav.jsx`, novo `components/MoreSheet.jsx` |
| Primitivas | novos `components/Sheet.jsx`, `components/useSheetDrag.js`, `components/useMediaQuery.js` |
| Componentes | `Modal.jsx`, `Toast.jsx`, `Dropdown.jsx`, `DatePicker.jsx`, `Icons.jsx`, `ThemeContext.jsx` |
| Páginas | as 8 em `frontend/src/pages/` |
| Dados | `frontend/src/api.js` |
| Build / nativo | `frontend/index.html`, `vite.config.js`, `capacitor.config.json`, `frontend/android/**` |
| Testes | `e2e/playwright.config.ts`, novo `e2e/src/components/MainNav.ts`, `e2e/src/pages/BasePage.ts`, novo `e2e/tests/mobile.spec.ts`, `e2e/README.md`, `frontend/src/test/*` |
| Documentação | `CLAUDE.md` — tokens novos, os 4 níveis de breakpoint, convenções mobile |
