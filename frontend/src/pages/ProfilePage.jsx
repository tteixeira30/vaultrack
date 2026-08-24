import { useTheme } from '../components/ThemeContext'
import { CURRENCIES } from '../api'
import { IconChevronRight, IconEyeOff, IconBank, IconLogout } from '../components/Icons'

/**
 * Miniaturas de tema — claro, escuro e "sistema" (metade/metade), como no
 * design mobile. Substituem o interruptor de dois estados: "sistema" passa a
 * ser uma escolha visível em vez de um comportamento implícito.
 */
const THEME_OPTIONS = [
  { id: 'light', label: 'Claro' },
  { id: 'dark', label: 'Escuro' },
  { id: 'system', label: 'Sistema' },
]

export default function ProfilePage({ user, initials, baseCurrency, changeCurrency, rateLive = true,
                                     currencies = CURRENCIES, privacy, togglePrivacy, onGo, onLogout }) {
  const { pref, setPref } = useTheme()

  return (
    <div className="profile-page">
      <section className="card profile-id">
        <span className="user-avatar lg">{initials}</span>
        <div className="user-info">
          <strong>{user.name}</strong>
          <small>{user.email}</small>
        </div>
      </section>

      <div className="split-2">
        <section className="card">
          <div className="card-header">
            <div>
              <h3>Moeda base</h3>
              <div className="sub">
                O servidor guarda tudo em euros; a moeda base só muda a apresentação e os campos de introdução.
              </div>
            </div>
          </div>
          {/* sem câmbio a taxa cai para 1,0: os montantes ficam a ser euros
              com outro símbolo à frente — dizê-lo é a diferença entre um
              número desatualizado e um número errado sem sintoma */}
          {!rateLive && (
            <p className="notice warn" role="status">
              Câmbio de EUR para {baseCurrency} indisponível de momento. Os valores mostrados
              são euros — só o símbolo mudou. Volta a tentar mais tarde ou escolhe EUR.
            </p>
          )}
          <div className="currency-grid">
            {currencies.map((c) => (
              <button key={c.code} type="button"
                      className={`currency-opt ${baseCurrency === c.code ? 'active' : ''}`}
                      aria-pressed={baseCurrency === c.code}
                      onClick={() => changeCurrency(c.code)}>
                <span className="mono cs">{c.symbol}</span>
                <strong>{c.code}</strong>
                <small>{c.name}</small>
              </button>
            ))}
          </div>
        </section>

        <section className="card">
          <div className="card-header"><div><h3>Preferências</h3></div></div>

          <div className="section-label first">Aspeto</div>
          <div className="theme-picker" role="radiogroup" aria-label="Tema">
            {THEME_OPTIONS.map((t) => (
              <button key={t.id} type="button" role="radio" aria-checked={pref === t.id}
                      className={`theme-opt ${pref === t.id ? 'active' : ''}`}
                      onClick={() => setPref(t.id)}>
                <span className={`theme-thumb ${t.id}`} aria-hidden="true"><span /></span>
                <span>{t.label}</span>
              </button>
            ))}
          </div>

          <div className="section-label">Privacidade</div>
          <div className="row-item flat">
            <span className="row-icon accent"><IconEyeOff size={17} /></span>
            <div className="row-main">
              <strong>Ocultar saldos</strong>
              <small>Todos os montantes aparecem como •••• até desligares</small>
            </div>
            <button type="button" className={`switch ${privacy ? 'on' : ''}`} onClick={togglePrivacy}
                    role="switch" aria-checked={privacy} aria-label="Ocultar saldos">
              <span />
            </button>
          </div>

          <div className="section-label">Dados e sessão</div>
          <button type="button" className="row-item flat link" onClick={() => onGo('accounts')}>
            <span className="row-icon"><IconBank size={17} /></span>
            <div className="row-main">
              <strong>Contas e importação</strong>
              <small>Contas correntes, extratos e regras de categoria</small>
            </div>
            <IconChevronRight size={16} />
          </button>
          <button type="button" className="row-item flat link danger" onClick={onLogout}>
            <span className="row-icon"><IconLogout size={17} /></span>
            <div className="row-main"><strong>Terminar sessão</strong></div>
            <IconChevronRight size={16} />
          </button>
        </section>
      </div>
    </div>
  )
}
