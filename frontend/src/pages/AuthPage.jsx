import { useId, useState } from 'react'
import { useAuth } from '../components/AuthContext'
import { useToast } from '../components/Toast'
import { useIsMobile } from '../components/useMediaQuery'
import { IconLogo } from '../components/Icons'

export default function AuthPage() {
  const ids = { name: useId(), email: useId(), password: useId(), invite: useId() }
  // no telemóvel o autoFocus abre logo o teclado e tapa o cartão inteiro
  const isMobile = useIsMobile()
  const { login, register } = useAuth()
  const toast = useToast()
  const [mode, setMode] = useState('login')
  const [form, setForm] = useState({ name: '', email: '', password: '', inviteCode: '' })
  const [busy, setBusy] = useState(false)

  const isLogin = mode === 'login'

  const submit = async (e) => {
    e.preventDefault()
    if (!form.email.trim() || !form.password || (!isLogin && !form.name.trim())) {
      toast.error('Campos em falta', 'Preenche todos os campos para continuar.')
      return
    }
    setBusy(true)
    try {
      if (isLogin) {
        const user = await login(form.email.trim(), form.password)
        toast.success(`Olá, ${user.name.split(' ')[0]}!`, 'Sessão iniciada com sucesso.')
      } else {
        const user = await register(form.name.trim(), form.email.trim(), form.password, form.inviteCode.trim())
        toast.success(`Bem-vindo, ${user.name.split(' ')[0]}!`, 'Conta criada com sucesso.')
      }
    } catch (err) {
      toast.error(isLogin ? 'Erro ao iniciar sessão' : 'Erro ao criar conta', err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="auth-brand">
          <IconLogo size={52} />
          <h1>O teu património,<br />num só número.</h1>
          <p>Contas, investimentos e objetivos no mesmo sítio — atualizados ao minuto.</p>
        </div>

        <div className="auth-tabs">
          <button className={isLogin ? 'active' : ''} onClick={() => setMode('login')} type="button">
            Iniciar sessão
          </button>
          <button className={!isLogin ? 'active' : ''} onClick={() => setMode('register')} type="button">
            Criar conta
          </button>
        </div>

        <form onSubmit={submit} className="auth-form">
          {!isLogin && (
            <div className="field">
              <label htmlFor={ids.name}>Nome</label>
              <input id={ids.name} placeholder="O teu nome" autoFocus={!isMobile}
                     autoComplete="name" enterKeyHint="next" value={form.name}
                     onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
          )}
          <div className="field">
            <label htmlFor={ids.email}>Email</label>
            <input id={ids.email} type="email" inputMode="email" placeholder="exemplo@email.com"
                   autoFocus={isLogin && !isMobile}
                   autoComplete={isLogin ? 'username' : 'email'}
                   autoCapitalize="none" autoCorrect="off" spellCheck={false} enterKeyHint="next"
                   value={form.email}
                   onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor={ids.password}>Palavra-passe</label>
            <input id={ids.password} type="password"
                   placeholder={isLogin ? 'A tua palavra-passe' : 'Mínimo 6 caracteres'}
                   autoComplete={isLogin ? 'current-password' : 'new-password'}
                   enterKeyHint={isLogin ? 'go' : 'next'}
                   value={form.password}
                   onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </div>
          {!isLogin && (
            <div className="field">
              <label htmlFor={ids.invite}>Código de convite <span className="dim">(se aplicável)</span></label>
              <input id={ids.invite} placeholder="Deixa vazio se não tiveres"
                     autoComplete="off" autoCapitalize="characters" enterKeyHint="go"
                     value={form.inviteCode}
                     onChange={(e) => setForm({ ...form, inviteCode: e.target.value })} />
            </div>
          )}
          <button className="btn auth-submit" type="submit" disabled={busy}>
            {busy ? 'Aguarda…' : isLogin ? 'Entrar' : 'Criar conta'}
          </button>
        </form>

        <p className="auth-switch">
          {isLogin ? 'Ainda não tens conta?' : 'Já tens conta?'}{' '}
          <button type="button" onClick={() => setMode(isLogin ? 'register' : 'login')}>
            {isLogin ? 'Regista-te' : 'Inicia sessão'}
          </button>
        </p>
      </div>
    </div>
  )
}
