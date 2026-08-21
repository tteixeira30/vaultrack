import {
  IconGrid, IconLines, IconTrendingUp, IconTarget, IconWallet,
  IconCalendar, IconTrophy, IconBank, IconUser, IconHome,
} from './Icons'

/**
 * Mapa de ecrãs da aplicação.
 *
 * `label` é o nome no design ("Movimentos", "Carteira"); `subtitle` é a linha
 * mono que a barra de topo mostra ao lado do título em desktop; `badge` é o
 * indicador da sidebar — recebe as contagens de `GET /api/nav` e devolve o que
 * escrever, ou nada quando o ecrã não tem número que valha a pena mostrar.
 *
 * O `text` do badge é só para os olhos: "12" ou "23/32" lidos em voz alta não
 * dizem nada. O `spoken` é o que vai para o nome acessível do botão.
 *
 * `add` é a ação primária do ecrã em mobile: o design substitui a barra de
 * ferramentas do desktop por um único "+" a tinta no cabeçalho, e é ele que
 * dispara a intenção correspondente (ver IntentContext).
 */
/** Só mostra o número quando há algo — um "0" ao lado de um ecrã vazio é ruído. */
const count = (n, noun) => (n > 0 ? { text: String(n), spoken: `${n} ${noun}` } : null)

export const SCREENS = {
  dashboard: { label: 'Painel', icon: IconGrid, subtitle: 'resumo geral' },
  expenses: {
    label: 'Movimentos', icon: IconLines, subtitle: 'entradas e saídas do mês', monthly: true,
    badge: (c) => count(c.transactions, 'este mês'),
    add: { intent: 'newTransaction', label: 'Novo movimento' },
  },
  investments: {
    label: 'Carteira', icon: IconTrendingUp, subtitle: 'cotações em tempo real',
    badge: (c) => count(c.investments, 'ativos'),
    add: { intent: 'newInvestment', label: 'Novo investimento' },
  },
  goals: {
    label: 'Objetivos', icon: IconTarget, subtitle: 'metas de poupança',
    badge: (c) => count(c.goals, 'em curso'),
    add: { intent: 'newGoal', label: 'Novo objetivo' },
  },
  income: {
    label: 'Rendimento', icon: IconWallet, subtitle: 'distribuição mensal', monthly: true,
    add: { intent: 'newAllocation', label: 'Nova categoria' },
  },
  calendar: {
    label: 'Calendário', icon: IconCalendar, subtitle: 'previsão a 60 dias', monthly: true,
    badge: (c) => count(c.events, 'eventos'),
    add: { intent: 'newEvent', label: 'Novo evento' },
  },
  achievements: {
    label: 'Conquistas', icon: IconTrophy, subtitle: 'progresso e nível',
    badge: (c) => (c.achievementsTotal > 0
      ? {
        text: `${c.achievementsUnlocked}/${c.achievementsTotal}`,
        spoken: `${c.achievementsUnlocked} de ${c.achievementsTotal} desbloqueadas`,
      }
      : null),
  },
  accounts: {
    label: 'Contas', icon: IconBank, subtitle: 'contas correntes e importação',
    add: { intent: 'newAccount', label: 'Nova conta' },
    // âmbar, não azul: é um aviso (conta sem saldo → sem previsão no calendário)
    badge: (c) => (c.accountsNeedAttention
      ? { text: '!', tone: 'warn', spoken: 'há contas sem saldo registado' }
      : null),
  },
  profile: { label: 'Perfil', icon: IconUser, subtitle: 'preferências' },
}

export const SCREEN_IDS = Object.keys(SCREENS)

/** Sidebar do desktop: três grupos, como no design. */
export const NAV_GROUPS = [
  { name: 'Principal', ids: ['dashboard', 'expenses', 'investments', 'goals'] },
  { name: 'Análise', ids: ['income', 'calendar', 'achievements'] },
  { name: 'Sistema', ids: ['accounts', 'profile'] },
]

/**
 * Mobile: três separadores em vez de quatro mais uma sheet "Mais".
 *
 * "Dinheiro" e "Crescer" abrem com segmentos no topo, por isso nenhum destino
 * fica escondido atrás de um menu — era o problema da versão anterior.
 * O Perfil chega-se pelo avatar do cabeçalho, e as Contas pelo Perfil.
 */
export const MOBILE_TABS = [
  { id: 'inicio', label: 'Início', icon: IconHome, screens: ['dashboard'] },
  { id: 'dinheiro', label: 'Dinheiro', icon: IconLines, screens: ['expenses', 'income', 'calendar'] },
  { id: 'crescer', label: 'Crescer', icon: IconTrendingUp, screens: ['investments', 'goals', 'achievements'] },
]

/** Separador mobile que contém um ecrã (ou null para Perfil/Contas). */
export const tabOfScreen = (screen) =>
  MOBILE_TABS.find((t) => t.screens.includes(screen)) ?? null
