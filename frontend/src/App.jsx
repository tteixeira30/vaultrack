import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import DashboardPage from './pages/DashboardPage'
import IncomePage from './pages/IncomePage'
import InvestmentsPage from './pages/InvestmentsPage'
import GoalsPage from './pages/GoalsPage'
import CalendarPage from './pages/CalendarPage'
import ExpensesPage from './pages/ExpensesPage'
import AchievementsPage from './pages/AchievementsPage'
import AccountsPage from './pages/AccountsPage'
import ProfilePage from './pages/ProfilePage'
import AuthPage from './pages/AuthPage'
import { ToastProvider } from './components/Toast'
import { AuthProvider, useAuth } from './components/AuthContext'
import { ThemeProvider, useTheme } from './components/ThemeContext'
import { MonthProvider, useMonth, fmtMonthShort } from './components/MonthContext'
import { IntentProvider, useIntentSetter } from './components/IntentContext'
import BottomNav from './components/BottomNav'
import Segments from './components/Segments'
import CommandPalette from './components/CommandPalette'
import { SCREENS, SCREEN_IDS, NAV_GROUPS, MOBILE_TABS, tabOfScreen } from './components/nav'
import { useIsMobile } from './components/useMediaQuery'
import {
  IconLogo, IconSun, IconMoon, IconEye, IconEyeOff, IconSearch, IconPlus, IconChevronLeft,
} from './components/Icons'
import { api, setPrivacyMode, CURRENCIES, CURRENCY_SYMBOLS } from './api'

/** Ecrã inicial a partir do URL, para o refresh e as ligações diretas. */
const screenFromHash = () => {
  const id = window.location.hash.replace(/^#/, '')
  return SCREEN_IDS.includes(id) ? id : 'dashboard'
}

const reducedMotion = () =>
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false


/**
 * Ações do menu "Adicionar" (e da paleta). Cada uma navega para o ecrã que a
 * executa e deixa lá a intenção — ver `IntentContext`.
 */
const ADD_ACTIONS = [
  { id: 'newTransaction', code: 'MV', label: 'Movimento', note: 'entrada ou saída', screen: 'expenses', tone: 'accent' },
  { id: 'newInvestment', code: 'AT', label: 'Ativo', note: 'ação, ETF ou cripto', screen: 'investments', tone: 'cyan' },
  { id: 'newGoal', code: 'OB', label: 'Objetivo', note: 'meta de poupança', screen: 'goals', tone: 'green' },
  { id: 'newAllocation', code: 'RD', label: 'Categoria de rendimento', note: 'percentagem ou valor fixo', screen: 'income', tone: 'amber' },
  { id: 'newEvent', code: 'CL', label: 'Evento do calendário', note: 'recorrente ou único', screen: 'calendar', tone: 'accent' },
  { id: 'newAccount', code: 'CT', label: 'Conta corrente', note: 'para importar extratos', screen: 'accounts', tone: 'cyan' },
]

function MonthStepper({ compact = false }) {
  const { month, step } = useMonth()
  return (
    <div className={`month-stepper${compact ? ' compact' : ''}`}>
      <button type="button" onClick={() => step(-1)} aria-label="Mês anterior">‹</button>
      <span className="ms-label">{fmtMonthShort(month)}</span>
      <button type="button" onClick={() => step(1)} aria-label="Mês seguinte">›</button>
    </div>
  )
}

function AddMenu({ open, setOpen, onPick }) {
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e) => { if (!ref.current?.contains(e.target)) setOpen(false) }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className={`add-menu ${open ? 'open' : ''}`} ref={ref}>
      <button type="button" className="btn add-trigger" onClick={() => setOpen((o) => !o)}
              aria-expanded={open} aria-haspopup="menu">
        <IconPlus size={15} />
        <span>Adicionar</span>
        <kbd>N</kbd>
      </button>
      {open && (
        <div className="add-pop" role="menu">
          {ADD_ACTIONS.map((a) => (
            <button key={a.id} type="button" role="menuitem"
                    onClick={() => { setOpen(false); onPick(a) }}>
              <span className={`code-chip ${a.tone}`}>{a.code}</span>
              <span className="am-text">
                <strong>{a.label}</strong>
                <small>{a.note}</small>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function Shell() {
  const { user, loading, logout, baseCurrency, changeCurrency } = useAuth()
  const { theme, toggle: toggleTheme } = useTheme()
  const { month } = useMonth()
  const setIntent = useIntentSetter()
  const isMobile = useIsMobile()

  const [screen, setScreen] = useState(screenFromHash)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [counts, setCounts] = useState(null)
  const [privacy, setPrivacy] = useState(() => {
    const on = localStorage.getItem('tracky_privacy') === '1'
    setPrivacyMode(on)
    return on
  })

  /**
   * Navegação com histórico: o voltar do browser (e, na app Android, o botão
   * físico) percorre os ecrãs em vez de sair da aplicação. Chega `pushState` —
   * um router seria uma dependência para trinta linhas.
   */
  const go = useCallback((id) => {
    setPaletteOpen(false)
    if (id === screen) return
    window.history.pushState({ tab: id }, '', `#${id}`)
    setScreen(id)
  }, [screen])

  useEffect(() => {
    const onPop = (e) => setScreen(SCREEN_IDS.includes(e.state?.tab) ? e.state.tab : screenFromHash())
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  /**
   * Contagens dos indicadores da sidebar. Recarregam ao trocar de ecrã porque é
   * aí que os números podem ter mudado (criar um objetivo, importar um extrato).
   * São decorativas: se o pedido falhar, os itens ficam simplesmente sem número.
   */
  useEffect(() => {
    if (!user) return
    let cancelled = false
    api.getNavCounts()
      .then((c) => { if (!cancelled) setCounts(c) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [user, screen])

  const togglePrivacy = useCallback(() => {
    setPrivacy((p) => {
      const next = !p
      setPrivacyMode(next)
      localStorage.setItem('tracky_privacy', next ? '1' : '0')
      return next
    })
  }, [])

  const runAction = useCallback((a) => {
    setAddOpen(false)
    setIntent(a.id)
    go(a.screen)
  }, [go, setIntent])

  // Atalhos do design: ⌘K/Ctrl+K abre a paleta, N o menu Adicionar, H oculta os
  // valores, Shift+T troca o tema. Nenhum dispara com o foco num campo.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault(); setPaletteOpen((o) => !o); setAddOpen(false); return
      }
      if (e.key === 'Escape') { setPaletteOpen(false); setAddOpen(false); return }
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const tag = e.target?.tagName
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || e.target?.isContentEditable) return
      if (e.key === 'n' || e.key === 'N') { e.preventDefault(); setAddOpen((o) => !o) }
      else if (e.key === 'h' || e.key === 'H') togglePrivacy()
      else if (e.key === 'T' && e.shiftKey) toggleTheme()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [togglePrivacy, toggleTheme])

  const activeTab = useMemo(() => tabOfScreen(screen), [screen])

  // tocar outra vez no separador ativo sobe ao topo, como nas apps nativas
  const onTabSelect = (t) => {
    if (t.id === activeTab?.id) {
      window.scrollTo({ top: 0, behavior: reducedMotion() ? 'auto' : 'smooth' })
      return
    }
    go(t.screens[0])
  }

  if (loading) {
    return (
      <div className="auth-wrap">
        <div className="skeleton" style={{ width: 'min(380px, 100%)', height: 420, borderRadius: 18 }} />
      </div>
    )
  }

  if (!user) return <AuthPage />

  const initials = user.name.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('')
  const meta = SCREENS[screen]
  // em mobile o título é o do separador — são os segmentos por baixo que dizem
  // em que ecrã se está; em desktop o título é o do próprio ecrã
  const hasSegments = !!activeTab && activeTab.screens.length > 1
  const title = isMobile && hasSegments ? activeTab.label : meta.label
  const isSystemScreen = screen === 'profile' || screen === 'accounts'
  const nextCurrency = () => {
    const i = CURRENCIES.findIndex((c) => c.code === baseCurrency)
    changeCurrency(CURRENCIES[(i + 1) % CURRENCIES.length].code)
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <IconLogo size={30} />
          <h1>Vault<span>rack</span></h1>
        </div>

        <nav className="nav" aria-label="Navegação principal">
          {NAV_GROUPS.map((g) => (
            <div className="nav-group" key={g.name}>
              <p className="nav-group-name">{g.name}</p>
              {g.ids.map((id) => {
                const S = SCREENS[id]
                const badge = counts && S.badge ? S.badge(counts) : null
                return (
                  <button key={id} type="button"
                          className={`nav-item ${screen === id ? 'active' : ''}`}
                          aria-current={screen === id ? 'page' : undefined}
                          onClick={() => go(id)}>
                    <S.icon size={18} />
                    <span>{S.label}</span>
                    {badge && (
                      <>
                        {/* o número é decorativo: quem ouve recebe a frase abaixo */}
                        <span className={`nav-badge mono ${badge.tone ?? ''}`} aria-hidden="true">
                          {badge.text}
                        </span>
                        <span className="sr-only">, {badge.spoken}</span>
                      </>
                    )}
                  </button>
                )
              })}
            </div>
          ))}
        </nav>

        <div className="sidebar-foot">
          <div className="live-note">
            <span className="dot" />Cotações em tempo real<br />
            Yahoo Finance · CoinGecko
          </div>
          <div className="side-user">
            <span className="user-avatar">{initials}</span>
            <div className="user-info">
              <strong>{user.name}</strong>
              <small>{user.email}</small>
            </div>
            <button type="button" className="icon-btn" onClick={toggleTheme}
                    aria-label={theme === 'dark' ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
                    title="Aparência">
              {theme === 'dark' ? <IconSun size={15} /> : <IconMoon size={15} />}
            </button>
          </div>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          {isSystemScreen && (
            <button type="button" className="icon-btn tb-back" onClick={() => go('dashboard')}
                    aria-label="Voltar ao painel">
              <IconChevronLeft size={18} />
            </button>
          )}
          <div className="tb-title">
            {/* em mobile a sobrancelha é o mês — e nos ecrãs mensais é também
                a forma de o trocar, já que a barra de ferramentas não cabe */}
            {isMobile && meta.monthly
              ? <MonthStepper compact />
              : <span className="tb-eyebrow">{fmtMonthShort(month)}</span>}
            <h2>{title}</h2>
            <span className="tb-sub">{meta.subtitle}</span>
          </div>

          <div className="tb-tools">
            {meta.monthly && <MonthStepper />}
            <button type="button" className="tb-chip mono" onClick={nextCurrency}
                    title="Moeda base" aria-label={`Moeda base: ${baseCurrency}. Mudar.`}>
              {baseCurrency} <span>{CURRENCY_SYMBOLS[baseCurrency] ?? baseCurrency}</span>
            </button>
            <button type="button" className={`icon-btn ${privacy ? 'on' : ''}`} onClick={togglePrivacy}
                    aria-pressed={privacy}
                    aria-label={privacy ? 'Mostrar valores' : 'Ocultar valores'}
                    title={privacy ? 'Mostrar valores' : 'Ocultar valores'}>
              {privacy ? <IconEyeOff size={16} /> : <IconEye size={16} />}
            </button>
            <button type="button" className="tb-search" onClick={() => setPaletteOpen(true)}>
              <IconSearch size={15} />
              <span>Ir para…</span>
              <kbd>⌘K</kbd>
            </button>
            <AddMenu open={addOpen} setOpen={setAddOpen} onPick={runAction} />
          </div>

          <button type="button" className="tb-avatar" onClick={() => go('profile')}
                  aria-label="Perfil e definições">
            {initials}
          </button>
        </header>

        {hasSegments && (
          <Segments
            items={activeTab.screens.map((id) => ({ id, label: SCREENS[id].label }))}
            active={screen} onSelect={go} label={activeTab.label}
          />
        )}

        {/* key: reinicia a animação de entrada a cada troca de ecrã */}
        <div className="page-swap" key={`${screen}-${baseCurrency}-${privacy ? 'p1' : 'p0'}`}>
          {screen === 'dashboard' && <DashboardPage onGo={go} />}
          {screen === 'income' && <IncomePage />}
          {screen === 'expenses' && <ExpensesPage />}
          {screen === 'investments' && <InvestmentsPage />}
          {screen === 'goals' && <GoalsPage />}
          {screen === 'calendar' && <CalendarPage />}
          {screen === 'achievements' && <AchievementsPage />}
          {screen === 'accounts' && <AccountsPage />}
          {screen === 'profile' && (
            <ProfilePage
              user={user} initials={initials}
              baseCurrency={baseCurrency} changeCurrency={changeCurrency}
              privacy={privacy} togglePrivacy={togglePrivacy}
              onGo={go} onLogout={logout}
            />
          )}
        </div>
      </main>

      <BottomNav tabs={MOBILE_TABS} activeTab={activeTab?.id} onSelect={onTabSelect} />

      <CommandPalette
        open={paletteOpen} onClose={() => setPaletteOpen(false)} onGo={go}
        actions={ADD_ACTIONS.map((a) => ({ ...a, run: () => runAction(a) }))}
      />
    </div>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <AuthProvider>
          <MonthProvider>
            <IntentProvider>
              <Shell />
            </IntentProvider>
          </MonthProvider>
        </AuthProvider>
      </ToastProvider>
    </ThemeProvider>
  )
}
