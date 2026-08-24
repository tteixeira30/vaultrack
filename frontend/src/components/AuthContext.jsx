import { createContext, useContext, useEffect, useState } from 'react'
import { api, getToken, setToken, clearToken, setOnUnauthorized, setDisplayCurrency, CURRENCIES } from '../api'
import { setCustomCategories } from '../categories'

const AuthContext = createContext(null)

export function useAuth() {
  return useContext(AuthContext)
}

/**
 * Aplica a moeda base do utilizador à camada de apresentação.
 *
 * Devolve `{ base, rateLive, supported }`. O `rateLive` importa: quando o câmbio não se
 * consegue obter, o backend devolve a taxa 1,0 — os montantes continuam a ser
 * euros, só que com outro símbolo à frente. Sem este sinal a app mostrava
 * "1 234,56 $" a quem tem euros, sem sintoma nenhum. Em EUR vem sempre `true`
 * (a taxa é 1 por definição, não por falha).
 */
async function applyCurrency(fallback = 'EUR') {
  try {
    const info = await api.getCurrency()
    setDisplayCurrency(info.base, info.rate)
    return { base: info.base, rateLive: info.rateLive !== false, supported: info.supported }
  } catch {
    setDisplayCurrency(fallback, 1)
    return { base: fallback, rateLive: fallback === 'EUR', supported: null }
  }
}

/** Carrega as categorias personalizadas do utilizador para o registo global. */
async function applyCategories() {
  try {
    setCustomCategories(await api.getExpenseCategories())
  } catch {
    setCustomCategories([])
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [baseCurrency, setBaseCurrency] = useState('EUR')
  // false = o câmbio falhou e os valores estão em EUR com o símbolo da base
  const [rateLive, setRateLive] = useState(true)
  // quem manda na lista é o backend (CurrencyService.SUPPORTED); o CURRENCIES
  // do api.js só acrescenta símbolo e nome. Antes eram duas listas escritas à
  // mão sem nada a garantir que coincidiam.
  const [supported, setSupported] = useState(null)

  // não é hook nenhum apesar do "use": adota o resultado de applyCurrency
  const adoptCurrency = (info) => {
    setBaseCurrency(info.base)
    setRateLive(info.rateLive)
    if (info.supported?.length) setSupported(info.supported)
    return info.base
  }

  useEffect(() => {
    setOnUnauthorized(() => setUser(null))
    if (!getToken()) {
      setLoading(false)
      return
    }
    api.me()
      .then(async (u) => {
        setUser(u)
        adoptCurrency(await applyCurrency(u.baseCurrency))
        await applyCategories()
      })
      // Só o servidor a dizer que o token não presta é que termina a sessão.
      // Um 502 com o backend a reiniciar — ou o telemóvel sem rede ao abrir a
      // app — deitava a sessão fora e obrigava a entrar outra vez por nada.
      // Sem 401, o token fica: a recarga seguinte recupera a sessão sozinha.
      .catch((e) => { if (e?.status === 401) clearToken() })
      .finally(() => setLoading(false))
  }, [])

  const finishAuth = async (res) => {
    setToken(res.token)
    setUser(res.user)
    adoptCurrency(await applyCurrency(res.user.baseCurrency))
    await applyCategories()
    return res.user
  }

  const login = async (email, password) => finishAuth(await api.login({ email, password }))

  const register = async (name, email, password, inviteCode) =>
    finishAuth(await api.register({ name, email, password, inviteCode: inviteCode || null }))

  const logout = () => {
    clearToken()
    setUser(null)
    setDisplayCurrency('EUR', 1)
    setBaseCurrency('EUR')
    setRateLive(true)
    setSupported(null)
    setCustomCategories([])
  }

  const changeCurrency = async (currency) => {
    const updated = await api.setCurrency(currency)
    setUser((u) => (u ? { ...u, baseCurrency: updated.baseCurrency } : u))
    return adoptCurrency(await applyCurrency(updated.baseCurrency))
  }

  // As moedas que o backend aceita, já com símbolo e nome. Mapeia a lista dele
  // (não filtra a local), por isso uma moeda que ele passe a aceitar aparece à
  // mesma, com o código a fazer de nome até alguém lho dar no CURRENCIES.
  // Sem resposta dele fica a lista local inteira, que é o que a app sempre deu.
  const currencies = supported
    ? supported.map((code) => CURRENCIES.find((c) => c.code === code) ?? { code, symbol: code, name: code })
    : CURRENCIES

  return (
    <AuthContext.Provider value={{ user, loading, baseCurrency, rateLive, currencies, login, register, logout, changeCurrency }}>
      {children}
    </AuthContext.Provider>
  )
}
