import { useState, useEffect, useRef, useCallback } from 'react'
import DashboardPage from './pages/DashboardPage'
import IncomePage from './pages/IncomePage'
import InvestmentsPage from './pages/InvestmentsPage'
import GoalsPage from './pages/GoalsPage'
import CalendarPage from './pages/CalendarPage'
import ExpensesPage from './pages/ExpensesPage'
import AchievementsPage from './pages/AchievementsPage'
import AuthPage from './pages/AuthPage'
import { ToastProvider } from './components/Toast'
import { AuthProvider, useAuth } from './components/AuthContext'
import { ThemeProvider, useTheme } from './components/ThemeContext'
import Dropdown from './components/Dropdown'
import BottomNav from './components/BottomNav'
import MoreSheet from './components/MoreSheet'
import { IconLogo, IconGrid, IconWallet, IconTrendingUp, IconTarget, IconCalendar, IconReceipt, IconTrophy, IconLogout, IconSun, IconMoon, IconEye, IconEyeOff, IconChevronRight } from './components/Icons'
import { setPrivacyMode } from './api'

const TABS = [
  { id: 'dashboard', label: 'Painel', icon: IconGrid },
  { id: 'income', label: 'Rendimento', icon: IconWallet },
  { id: 'expenses', label: 'Despesas', icon: IconReceipt },
  { id: 'investments', label: 'Investimentos', icon: IconTrendingUp },
  { id: 'goals', label: 'Objetivos', icon: IconTarget },
  { id: 'calendar', label: 'Calendário', icon: IconCalendar },
]

/** Conquistas não é um separador da sidebar — chega-se pelo menu de perfil. */
const ACHIEVEMENTS_TAB = { id: 'achievements', label: 'Conquistas', icon: IconTrophy }

/**
 * Em mobile só quatro separadores cabem com folga (a seis, cada botão ficava
 * com ~60px num ecrã de 360px). Os restantes vão para a sheet "Mais", que é
 * também onde as Conquistas passam a ser visíveis na navegação.
 */
const PRIMARY_IDS = ['dashboard', 'expenses', 'investments', 'goals']
const PRIMARY_TABS = PRIMARY_IDS.map((id) => TABS.find((t) => t.id === id))
const MORE_TABS = [...TABS.filter((t) => !PRIMARY_IDS.includes(t.id)), ACHIEVEMENTS_TAB]

const ALL_TAB_IDS = [...TABS.map((t) => t.id), ACHIEVEMENTS_TAB.id]

/** Separador inicial a partir do URL, para o refresh e as ligações diretas. */
const tabFromHash = () => {
  const id = window.location.hash.replace(/^#/, '')
  return ALL_TAB_IDS.includes(id) ? id : 'dashboard'
}

const reducedMotion = () =>
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

const CURRENCIES = [
  { code: 'EUR', symbol: '€', name: 'Euro' },
  { code: 'USD', symbol: '$', name: 'Dólar EUA' },
  { code: 'GBP', symbol: '£', name: 'Libra' },
  { code: 'BRL', symbol: 'R$', name: 'Real' },
  { code: 'CHF', symbol: 'Fr', name: 'Franco suíço' },
  { code: 'CAD', symbol: 'C$', name: 'Dólar canadiano' },
  { code: 'AUD', symbol: 'A$', name: 'Dólar australiano' },
  { code: 'JPY', symbol: '¥', name: 'Iene' },
]

function ThemeToggle() {
  const { theme, toggle } = useTheme()
  const dark = theme === 'dark'
  return (
    <button className="theme-toggle" onClick={toggle} role="switch" aria-checked={dark}
            aria-label={dark ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
            title={dark ? 'Tema claro' : 'Tema escuro'}>
      <span className={`tt-opt ${dark ? 'active' : ''}`}><IconMoon size={14} /></span>
      <span className={`tt-opt ${!dark ? 'active' : ''}`}><IconSun size={14} /></span>
    </button>
  )
}

function ProfileMenu({ user, initials, baseCurrency, changeCurrency, privacy, togglePrivacy, onOpenAchievements, achievementsActive, onLogout }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e) => {
      // ignora cliques no próprio menu e no popover (em portal) do seletor de moeda
      if (ref.current?.contains(e.target) || e.target.closest?.('.dd-pop')) return
      setOpen(false)
    }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className={`profile-menu ${open ? 'open' : ''}`} ref={ref}>
      <button type="button" className="profile-trigger" onClick={() => setOpen((o) => !o)}
              aria-expanded={open} aria-haspopup="menu" aria-label="Perfil e definições">
        <span className="user-avatar">{initials}</span>
        <div className="user-info">
          <strong>{user.name}</strong>
          <small>{user.email}</small>
        </div>
        <IconChevronRight size={16} className="profile-caret" />
      </button>

      {open && (
        <div className="profile-pop" role="menu">
          <div className="profile-head">
            <span className="user-avatar">{initials}</span>
            <div className="user-info">
              <strong>{user.name}</strong>
              <small>{user.email}</small>
            </div>
          </div>

          <button type="button" role="menuitem"
                  className={`profile-item ${achievementsActive ? 'active' : ''}`}
                  onClick={() => { onOpenAchievements(); setOpen(false) }}>
            <IconTrophy size={17} />
            <span>Conquistas</span>
            <IconChevronRight size={15} className="profile-item-caret" />
          </button>

          <div className="profile-sep" />

          <div className="profile-row">
            <span>Moeda base</span>
            <Dropdown value={baseCurrency} onChange={changeCurrency}
                      options={CURRENCIES.map((c) => ({ value: c.code, label: `${c.code} · ${c.symbol}` }))} />
          </div>
          <div className="profile-row">
            <span>Aparência</span>
            <ThemeToggle />
          </div>
          <div className="profile-row">
            <span>Ocultar valores</span>
            <button type="button" className="theme-toggle" onClick={togglePrivacy} role="switch" aria-checked={privacy}
                    aria-label={privacy ? 'Mostrar valores' : 'Esconder valores'}
                    title={privacy ? 'Mostrar valores' : 'Esconder valores'}>
              <span className={`tt-opt ${privacy ? 'active' : ''}`}><IconEyeOff size={14} /></span>
              <span className={`tt-opt ${!privacy ? 'active' : ''}`}><IconEye size={14} /></span>
            </button>
          </div>

          <div className="profile-sep" />

          <button type="button" role="menuitem" className="profile-item danger" onClick={onLogout}>
            <IconLogout size={16} />
            <span>Terminar sessão</span>
          </button>
        </div>
      )}
    </div>
  )
}

function Shell() {
  const { user, loading, logout, baseCurrency, changeCurrency } = useAuth()
  const [tab, setTab] = useState(tabFromHash)
  const [moreOpen, setMoreOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [privacy, setPrivacy] = useState(() => {
    const on = localStorage.getItem('tracky_privacy') === '1'
    setPrivacyMode(on)
    return on
  })

  /**
   * Navegação com histórico: o voltar do browser (e, na app Android, o botão
   * físico) percorre os separadores em vez de sair da aplicação. Chega
   * `pushState` — um router seria uma dependência para trinta linhas.
   */
  const go = useCallback((id) => {
    setMoreOpen(false)
    if (id === tab) return
    window.history.pushState({ tab: id }, '', `#${id}`)
    setTab(id)
  }, [tab])

  useEffect(() => {
    const onPop = (e) => {
      const state = e.state
      setMoreOpen(state?.sheet === 'more')
      setTab(ALL_TAB_IDS.includes(state?.tab) ? state.tab : tabFromHash())
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  // a barra de topo ganha borda e sombra assim que o conteúdo passa por baixo
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // a sheet tem entrada própria no histórico, para o voltar a fechar em vez de
  // mudar de separador
  const openMore = () => {
    window.history.pushState({ tab, sheet: 'more' }, '', `#${tab}`)
    setMoreOpen(true)
  }
  const closeMore = () => {
    if (window.history.state?.sheet === 'more') window.history.back()
    else setMoreOpen(false)
  }
  // substitui a entrada da sheet (em vez de empilhar) para o voltar ir dar ao
  // separador de onde se abriu o "Mais"
  const selectFromMore = (id) => {
    window.history.replaceState({ tab: id }, '', `#${id}`)
    setTab(id)
    setMoreOpen(false)
  }

  // tocar outra vez no separador ativo sobe ao topo, como nas apps nativas
  const onNavSelect = (id) => {
    if (id !== tab) return go(id)
    window.scrollTo({ top: 0, behavior: reducedMotion() ? 'auto' : 'smooth' })
  }

  const togglePrivacy = () => {
    const next = !privacy
    setPrivacy(next)
    setPrivacyMode(next)
    localStorage.setItem('tracky_privacy', next ? '1' : '0')
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

  return (
    <div className="shell">
      <aside className={`sidebar ${scrolled ? 'scrolled' : ''}`}>
        <div className="brand">
          <IconLogo size={34} />
          <div>
            <h1>Vault<span>rack</span></h1>
            <small>Finanças pessoais</small>
          </div>
        </div>
        <nav className="nav">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`nav-item ${tab === t.id ? 'active' : ''}`}
              aria-current={tab === t.id ? 'page' : undefined}
              onClick={() => go(t.id)}
            >
              <t.icon size={18} />
              <span>{t.label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          <ProfileMenu
            user={user} initials={initials}
            baseCurrency={baseCurrency} changeCurrency={changeCurrency}
            privacy={privacy} togglePrivacy={togglePrivacy}
            onOpenAchievements={() => go('achievements')}
            achievementsActive={tab === 'achievements'}
            onLogout={logout}
          />
          <div className="live-note">
            <span className="dot" />Cotações em tempo real<br />
            Yahoo Finance · CoinGecko
          </div>
        </div>
      </aside>
      <main className="main" key={`${baseCurrency}-${privacy ? 'p1' : 'p0'}`}>
        {/* key={tab}: reinicia a animação de entrada a cada troca de separador */}
        <div className="page-swap" key={tab}>
          {tab === 'dashboard' && <DashboardPage />}
          {tab === 'income' && <IncomePage />}
          {tab === 'expenses' && <ExpensesPage />}
          {tab === 'investments' && <InvestmentsPage />}
          {tab === 'goals' && <GoalsPage />}
          {tab === 'calendar' && <CalendarPage />}
          {tab === 'achievements' && <AchievementsPage />}
        </div>
      </main>

      <BottomNav
        tabs={PRIMARY_TABS} tab={tab} onSelect={onNavSelect}
        moreActive={moreOpen || MORE_TABS.some((t) => t.id === tab)}
        onOpenMore={openMore}
      />
      <MoreSheet
        open={moreOpen} tabs={MORE_TABS} tab={tab}
        onSelect={selectFromMore} onClose={closeMore}
      />
    </div>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <AuthProvider>
          <Shell />
        </AuthProvider>
      </ToastProvider>
    </ThemeProvider>
  )
}
