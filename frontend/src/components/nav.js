import {
  IconGrid, IconLines, IconTrendingUp, IconTarget, IconWallet,
  IconCalendar, IconTrophy, IconBank, IconUser, IconHome,
} from './Icons'

/**
 * Mapa de ecrãs da aplicação.
 *
 * `label` é o nome no design ("Movimentos", "Carteira"); `subtitle` é a linha
 * mono que a barra de topo mostra ao lado do título em desktop.
 */
export const SCREENS = {
  dashboard: { label: 'Painel', icon: IconGrid, subtitle: 'resumo geral' },
  expenses: { label: 'Movimentos', icon: IconLines, subtitle: 'entradas e saídas do mês', monthly: true },
  investments: { label: 'Carteira', icon: IconTrendingUp, subtitle: 'cotações em tempo real' },
  goals: { label: 'Objetivos', icon: IconTarget, subtitle: 'metas de poupança' },
  income: { label: 'Rendimento', icon: IconWallet, subtitle: 'distribuição mensal', monthly: true },
  calendar: { label: 'Calendário', icon: IconCalendar, subtitle: 'previsão a 60 dias', monthly: true },
  achievements: { label: 'Conquistas', icon: IconTrophy, subtitle: 'progresso e nível' },
  accounts: { label: 'Contas', icon: IconBank, subtitle: 'contas correntes e importação' },
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
