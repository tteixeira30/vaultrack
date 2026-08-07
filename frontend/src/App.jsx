import { useState, useEffect, useRef } from 'react'
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
  const [tab, setTab] = useState('dashboard')
  const [privacy, setPrivacy] = useState(() => {
    const on = localStorage.getItem('tracky_privacy') === '1'
    setPrivacyMode(on)
    return on
  })

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
      <aside className="sidebar">
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
              onClick={() => setTab(t.id)}
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
            onOpenAchievements={() => setTab('achievements')}
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
        {tab === 'dashboard' && <DashboardPage />}
        {tab === 'income' && <IncomePage />}
        {tab === 'expenses' && <ExpensesPage />}
        {tab === 'investments' && <InvestmentsPage />}
        {tab === 'goals' && <GoalsPage />}
        {tab === 'calendar' && <CalendarPage />}
        {tab === 'achievements' && <AchievementsPage />}
      </main>
      <nav className="bottom-nav" aria-label="Navegação">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={tab === t.id ? 'active' : ''}
            onClick={() => setTab(t.id)}
          >
            <t.icon size={21} />
            <span>{t.label}</span>
          </button>
        ))}
      </nav>
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
