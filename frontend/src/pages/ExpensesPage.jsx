import { useEffect, useMemo, useState } from 'react'
import { api, fmtEur, fromEur, toEur, parseAmount, getCurrencySymbol } from '../api'
import { DEFAULT_CATEGORIES, catLabel, catColor, catTint, setCustomCategories } from '../categories'
import { useToast } from '../components/Toast'
import Modal, { ConfirmDialog } from '../components/Modal'
import Dropdown from '../components/Dropdown'
import DatePicker from '../components/DatePicker'
import StatementImport, { AccountModal, validateAccount } from '../components/StatementImport'
import { useMonth, fmtMonth } from '../components/MonthContext'
import { useIntent } from '../components/IntentContext'
import { codeOf } from '../components/code'
import {
  IconPlus, IconPencil, IconTrash, IconUpload, IconBank, IconArrowUp, IconArrowDown,
  IconSearch, IconReceipt,
} from '../components/Icons'

const CATEGORY_COLORS = [
  '#f59e0b', '#fb7185', '#a78bfa', '#818cf8', '#f472b6', '#34d399',
  '#fbbf24', '#22d3ee', '#60a5fa', '#4ade80', '#f87171', '#c084fc',
]

const EMPTY_TX = { accountId: '', date: '', description: '', amount: '', inflow: false, category: 'OTHER' }

const todayIso = () => new Date().toISOString().slice(0, 10)
const fmtDay = (iso) => new Date(iso).toLocaleDateString('pt-PT', { weekday: 'short', day: '2-digit', month: 'short' })
const fmtShortDate = (iso) => new Date(iso).toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit' })

/** Ignora acentos e maiúsculas na pesquisa por descrição. */
const fold = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

const SORTS = {
  date: (a, b) => a.date.localeCompare(b.date),
  desc: (a, b) => a.description.localeCompare(b.description, 'pt'),
  amount: (a, b) => Number(a.amount) - Number(b.amount),
}

export default function ExpensesPage() {
  const toast = useToast()
  const cur = getCurrencySymbol()
  const { month } = useMonth()
  const [accountFilter, setAccountFilter] = useState('')
  const [data, setData] = useState(null)
  const [busy, setBusy] = useState(false)
  const [categories, setCategories] = useState([]) // categorias personalizadas do utilizador

  // filtros e ordenação (tudo do lado do cliente — o mês já vem filtrado do backend)
  const [q, setQ] = useState('')
  const [catFilter, setCatFilter] = useState('')
  const [sort, setSort] = useState('date')
  const [dir, setDir] = useState(-1)
  const [selected, setSelected] = useState(() => new Set())

  // gestão de categorias
  const [catModal, setCatModal] = useState(false)
  const [catForm, setCatForm] = useState({ id: null, label: '', color: CATEGORY_COLORS[0] })
  const [catToDelete, setCatToDelete] = useState(null)

  // modais
  const [accountModal, setAccountModal] = useState(false)
  const [editingAccount, setEditingAccount] = useState(null)
  const [accountToDelete, setAccountToDelete] = useState(null)
  const [txModal, setTxModal] = useState(false)
  const [editingTx, setEditingTx] = useState(null)
  const [txForm, setTxForm] = useState(EMPTY_TX)
  const [txApplyAll, setTxApplyAll] = useState(true)
  const [txToDelete, setTxToDelete] = useState(null)
  const [importModal, setImportModal] = useState(false)
  const [bulkCat, setBulkCat] = useState(null) // { category, applyRule } enquanto o modal está aberto

  const load = () => api.getExpenses(month, accountFilter || null).then(setData)

  // categorias personalizadas: estado local (seletores) + registo global (catLabel/catColor)
  const loadCategories = () =>
    api.getExpenseCategories().then((list) => { setCategories(list); setCustomCategories(list) })

  useEffect(() => {
    setSelected(new Set())
    load().catch(() => toast.error('Erro', 'Não foi possível carregar os movimentos.'))
  }, [month, accountFilter])

  useEffect(() => { loadCategories().catch(() => {}) }, [])

  // opções de categoria para os seletores: por omissão + personalizadas
  const catOptions = useMemo(() => [
    ...DEFAULT_CATEGORIES.map((c) => ({ value: c, label: catLabel(c) })),
    ...categories.map((c) => ({ value: c.key, label: c.label })),
  ], [categories])

  // ---------- contas ----------

  const openAccountAdd = () => { setEditingAccount(null); setAccountModal(true) }
  const openAccountEdit = (a) => {
    setEditingAccount({ ...a, balanceInput: a.currentBalance != null ? String(fromEur(a.currentBalance)) : '' })
    setAccountModal(true)
  }

  const saveAccount = async (form) => {
    const problem = validateAccount(form)
    if (problem) { toast.error('Campos em falta', problem); return }
    const payload = {
      name: form.name,
      currentBalance: form.balance === '' ? null : toEur(parseAmount(form.balance)),
    }
    setBusy(true)
    try {
      if (editingAccount) await api.updateExpenseAccount(editingAccount.id, payload)
      else await api.addExpenseAccount(payload)
      setAccountModal(false)
      await load()
      toast.success(editingAccount ? 'Conta atualizada' : 'Conta criada', `"${form.name}" guardada.`)
    } catch (e) { toast.error('Erro ao guardar', e.message) }
    finally { setBusy(false) }
  }

  const removeAccount = async () => {
    setBusy(true)
    try {
      await api.deleteExpenseAccount(accountToDelete.id)
      if (String(accountToDelete.id) === accountFilter) setAccountFilter('')
      setAccountToDelete(null)
      await load()
      toast.info('Conta removida', `"${accountToDelete.name}" e os seus movimentos foram eliminados.`)
    } catch (e) { toast.error('Erro ao remover', e.message) }
    finally { setBusy(false) }
  }

  // ---------- categorias personalizadas ----------

  const openCatEdit = (c) => { setCatForm({ id: c.id, label: c.label, color: c.color }); setCatModal(true) }

  const saveCat = async () => {
    if (!catForm.label.trim()) { toast.error('Nome em falta', 'Indica o nome da categoria.'); return }
    const payload = { label: catForm.label.trim(), color: catForm.color }
    setBusy(true)
    try {
      if (catForm.id) await api.updateExpenseCategory(catForm.id, payload)
      else await api.addExpenseCategory(payload)
      setCatModal(false)
      await loadCategories()
      await load()
      toast.success(catForm.id ? 'Categoria atualizada' : 'Categoria criada', `"${payload.label}" guardada.`)
    } catch (e) { toast.error('Erro ao guardar', e.message) }
    finally { setBusy(false) }
  }

  const removeCat = async () => {
    setBusy(true)
    try {
      await api.deleteExpenseCategory(catToDelete.id)
      setCatToDelete(null)
      await loadCategories()
      await load()
      toast.info('Categoria removida', `"${catToDelete.label}" foi eliminada. Os movimentos passaram para "Outros".`)
    } catch (e) { toast.error('Erro ao remover', e.message) }
    finally { setBusy(false) }
  }

  // ---------- movimentos manuais ----------

  const openTxAdd = () => {
    setEditingTx(null)
    setTxForm({ ...EMPTY_TX, accountId: accountFilter || String(data?.accounts[0]?.id || ''), date: todayIso() })
    setTxModal(true)
  }
  useIntent('newTransaction', openTxAdd)

  const openTxEdit = (t) => {
    setEditingTx(t)
    setTxApplyAll(true)
    setTxForm({
      accountId: String(t.accountId), date: t.date, description: t.description,
      amount: String(fromEur(t.amount)), inflow: t.inflow, category: t.category,
    })
    setTxModal(true)
  }

  const saveTx = async () => {
    if (!txForm.accountId) { toast.error('Conta em falta', 'Cria primeiro uma conta corrente.'); return }
    if (!txForm.description.trim() || !txForm.amount || !txForm.date) {
      toast.error('Campos em falta', 'Indica a data, a descrição e o valor.'); return
    }
    const applySimilar = !!editingTx && txApplyAll && txForm.category !== editingTx.category
    const payload = {
      accountId: Number(txForm.accountId),
      date: txForm.date,
      description: txForm.description.trim(),
      amount: toEur(parseAmount(txForm.amount)),
      inflow: txForm.inflow,
      category: txForm.category,
      applyToSimilar: applySimilar,
    }
    setBusy(true)
    try {
      if (editingTx) await api.updateTransaction(editingTx.id, payload)
      else await api.addTransaction(payload)
      setTxModal(false)
      await load()
      toast.success(editingTx ? 'Movimento atualizado' : 'Movimento adicionado',
        applySimilar
          ? `Categoria "${catLabel(txForm.category)}" aplicada a todos os movimentos iguais e memorizada para futuras importações.`
          : `"${payload.description}" guardado.`)
    } catch (e) { toast.error('Erro ao guardar', e.message) }
    finally { setBusy(false) }
  }

  const removeTx = async () => {
    setBusy(true)
    try {
      await api.deleteTransaction(txToDelete.id)
      setTxToDelete(null)
      await load()
      toast.info('Movimento removido', `"${txToDelete.description}" foi eliminado.`)
    } catch (e) { toast.error('Erro ao remover', e.message) }
    finally { setBusy(false) }
  }

  // ---------- seleção múltipla ----------

  const toggleSel = (id) => setSelected((s) => {
    const next = new Set(s)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })

  /**
   * Categoria em massa. Não há endpoint de lote: percorre-se a seleção com
   * `updateTransaction`. Com `applyRule`, o primeiro pedido leva
   * `applyToSimilar` e o backend memoriza a regra para futuras importações.
   */
  const applyBulkCategory = async () => {
    const rows = (data?.transactions || []).filter((t) => selected.has(t.id))
    if (rows.length === 0) return
    setBusy(true)
    try {
      for (const [i, t] of rows.entries()) {
        await api.updateTransaction(t.id, {
          accountId: t.accountId, date: t.date, description: t.description,
          amount: t.amount, inflow: t.inflow, category: bulkCat.category,
          applyToSimilar: bulkCat.applyRule && i === 0,
        })
      }
      setBulkCat(null)
      setSelected(new Set())
      await load()
      toast.success('Categoria aplicada',
        `${rows.length} movimento(s) passaram para "${catLabel(bulkCat.category)}"`
        + (bulkCat.applyRule ? ' e a regra ficou memorizada.' : '.'))
    } catch (e) { toast.error('Erro ao aplicar', e.message) }
    finally { setBusy(false) }
  }

  // ---------- render ----------

  if (!data) return <div className="skeleton" style={{ height: 460, borderRadius: 20 }} />

  const hasAccounts = data.accounts.length > 0
  const totalOut = Number(data.outflows) || 0

  // saldo atual: da conta filtrada, ou a soma das contas com saldo definido
  const selectedAccount = accountFilter ? data.accounts.find((a) => String(a.id) === accountFilter) : null
  const balancesDefined = data.accounts.filter((a) => a.currentBalance != null)
  const balanceValue = selectedAccount
    ? selectedAccount.currentBalance
    : (balancesDefined.length > 0 ? balancesDefined.reduce((s, a) => s + Number(a.currentBalance), 0) : null)

  // categorias presentes no mês, para os chips de filtro
  const monthCats = data.byCategory.map((c) => c.category)

  const rows = data.transactions
    .filter((t) => (!catFilter || t.category === catFilter)
      && (!q.trim() || fold(t.description).includes(fold(q.trim()))))
    .slice()
    .sort((a, b) => SORTS[sort](a, b) * dir)

  const allSelected = rows.length > 0 && rows.every((t) => selected.has(t.id))
  const selectedRows = rows.filter((t) => selected.has(t.id))
  const selectedTotal = selectedRows.reduce((s, t) => s + (t.inflow ? 1 : -1) * Number(t.amount), 0)

  const setSortKey = (key) => {
    if (key === sort) setDir((d) => -d)
    else { setSort(key); setDir(key === 'desc' ? 1 : -1) }
  }
  const arrow = (key) => (sort === key ? (dir === 1 ? ' ↑' : ' ↓') : '')

  // agrupar movimentos por dia (a vista mobile é uma lista de cartões por dia)
  const byDay = []
  for (const t of rows) {
    const last = byDay[byDay.length - 1]
    if (last && last.date === t.date) last.txs.push(t)
    else byDay.push({ date: t.date, txs: [t] })
  }

  return (
    <div className="mov">
      {/* ---------- contas + importar ---------- */}
      <div className="chip-row">
        <button className={`account-chip ${accountFilter === '' ? 'active' : ''}`} onClick={() => setAccountFilter('')}>
          Todas as contas
        </button>
        {data.accounts.map((a) => (
          <button key={a.id} data-testid="account-chip"
                  className={`account-chip ${accountFilter === String(a.id) ? 'active' : ''}`}
                  onClick={() => setAccountFilter(String(a.id))}>
            {a.name}
            {a.currentBalance != null && <span className="mono account-chip-balance">{fmtEur(a.currentBalance)}</span>}
            <span className="account-chip-actions">
              <span role="button" tabIndex={0} onClick={(e) => { e.stopPropagation(); openAccountEdit(a) }} aria-label={`Editar ${a.name}`}><IconPencil size={12} /></span>
              <span role="button" tabIndex={0} onClick={(e) => { e.stopPropagation(); setAccountToDelete(a) }} aria-label={`Eliminar ${a.name}`}><IconTrash size={12} /></span>
            </span>
          </button>
        ))}
        <button data-testid="account-chip-add" className="account-chip add" onClick={openAccountAdd} aria-label="Nova conta">
          <IconPlus size={13} />
        </button>

        <div className="chip-row-end">
          <button className="btn ghost" onClick={() => setImportModal(true)} disabled={!hasAccounts}
                  title={hasAccounts ? '' : 'Cria primeiro uma conta'}>
            <IconUpload size={14} /> Importar extrato
          </button>
          <button className="btn" onClick={openTxAdd} disabled={!hasAccounts}
                  title={hasAccounts ? '' : 'Cria primeiro uma conta'}>
            <IconPlus size={14} /> Novo movimento
          </button>
        </div>
      </div>

      {/* ---------- KPIs do mês ---------- */}
      <div className="mini-kpis">
        <div className="card mini-kpi">
          <span className="eyebrow">Entradas</span>
          <div className="mono pos">{fmtEur(data.inflows)}</div>
        </div>
        <div className="card mini-kpi">
          <span className="eyebrow">Saídas</span>
          <div className="mono neg">{fmtEur(data.outflows)}</div>
        </div>
        <div className="card mini-kpi">
          <span className="eyebrow">Saldo do mês</span>
          <div className={`mono ${Number(data.net) >= 0 ? 'pos' : 'neg'}`}>{fmtEur(data.net)}</div>
        </div>
        <div className="card mini-kpi">
          <span className="eyebrow">{selectedAccount ? 'Saldo da conta' : 'Saldo em contas'}</span>
          <div className="mono">{balanceValue != null ? fmtEur(balanceValue) : '—'}</div>
          <small>
            {balanceValue != null
              ? (selectedAccount ? 'Registado por ti' : `${balancesDefined.length} de ${data.accounts.length} conta(s)`)
              : 'Define o saldo ao editar a conta'}
          </small>
        </div>
      </div>

      <div className="mov-body">
        <div className="mov-main">
          {/* ---------- filtros ---------- */}
          {hasAccounts && data.transactions.length > 0 && (
            <div className="filter-row">
              <div className="search-box">
                <IconSearch size={14} />
                <input value={q} onChange={(e) => setQ(e.target.value)}
                       placeholder="Filtrar descrição…" aria-label="Filtrar descrição" />
              </div>
              <div className="filter-chips">
                {monthCats.map((c) => (
                  <button key={c} className={`filter-chip ${catFilter === c ? 'active' : ''}`}
                          aria-pressed={catFilter === c}
                          onClick={() => setCatFilter((f) => (f === c ? '' : c))}>
                    <span className="tx-cat-dot" style={{ background: catColor(c) }} />
                    {catLabel(c)}
                  </button>
                ))}
              </div>
              <button className="btn ghost small filter-manage" onClick={() => setCatModal(true)}>
                Gerir categorias
              </button>
            </div>
          )}

          {/* ---------- barra de seleção ---------- */}
          {rows.length > 0 && (
            <div className={`sel-bar ${selected.size > 0 ? 'on' : ''}`}>
              <label className="sel-all">
                <input type="checkbox" checked={allSelected}
                       onChange={() => setSelected(allSelected ? new Set() : new Set(rows.map((t) => t.id)))} />
                <span className="mono">
                  {selected.size > 0
                    ? `${selected.size} selecionado(s) · ${fmtEur(Math.abs(selectedTotal))}`
                    : `${rows.length} movimento(s)`}
                </span>
              </label>
              {selected.size > 0 && (
                <>
                  <button className="btn ghost small" onClick={() => setBulkCat({ category: 'OTHER', applyRule: false })}>
                    Definir categoria
                  </button>
                  <button className="btn ghost small" onClick={() => setSelected(new Set())}>Limpar</button>
                </>
              )}
            </div>
          )}

          {/* ---------- lista ---------- */}
          {!hasAccounts ? (
            <div className="card">
              <div className="empty-state">
                <div className="empty-icon"><IconBank size={22} /></div>
                <h4>Começa por criar as tuas contas</h4>
                <p>Adiciona as tuas contas correntes (ex.: Santander, Trade Republic, Revolut) e depois importa o extrato de cada uma.</p>
                <button className="btn" onClick={openAccountAdd}><IconPlus size={14} /> Criar conta</button>
              </div>
            </div>
          ) : data.transactions.length === 0 ? (
            <div className="card">
              <div className="empty-state">
                <div className="empty-icon"><IconReceipt size={22} /></div>
                <h4>Sem movimentos em {fmtMonth(month)}</h4>
                <p>Importa o extrato bancário do mês ou adiciona movimentos manualmente.</p>
                <button className="btn" onClick={() => setImportModal(true)}><IconUpload size={14} /> Importar extrato</button>
              </div>
            </div>
          ) : rows.length === 0 ? (
            <div className="card">
              <p className="dim" style={{ padding: '8px 2px' }}>Nenhum movimento corresponde ao filtro.</p>
            </div>
          ) : (
            <>
              {/* desktop: tabela com colunas ordenáveis */}
              <div className="tx-table desktop-only">
                <div className="tx-head">
                  <span />
                  <button onClick={() => setSortKey('desc')}>Descrição{arrow('desc')}</button>
                  <span>Categoria</span>
                  <span>Conta</span>
                  <button onClick={() => setSortKey('date')}>Data{arrow('date')}</button>
                  <button className="right" onClick={() => setSortKey('amount')}>Valor{arrow('amount')}</button>
                  <span />
                </div>
                {rows.map((t) => (
                  <div key={t.id} data-testid="movement-row"
                       className={`tx-row ${selected.has(t.id) ? 'sel' : ''}`}>
                    <input type="checkbox" checked={selected.has(t.id)} onChange={() => toggleSel(t.id)}
                           aria-label={`Selecionar ${t.description}`} />
                    <div className="tx-desc">
                      <span className="code-chip cat" style={{ background: catTint(t.category) }}>
                        {codeOf(catLabel(t.category))}
                      </span>
                      <button className="tx-open" onClick={() => openTxEdit(t)}>{t.description}</button>
                    </div>
                    <span className="tx-cat">
                      <span className="tx-cat-dot" style={{ background: catColor(t.category) }} />
                      {catLabel(t.category)}
                    </span>
                    <span className="tx-acc">{t.accountName}</span>
                    <span className="mono tx-date">{fmtShortDate(t.date)}</span>
                    <span className={`mono tx-amt ${t.inflow ? 'pos' : 'neg'}`}>
                      {t.inflow ? '+' : '−'}{fmtEur(t.amount)}
                    </span>
                    <span className="event-actions">
                      <button className="icon-btn" onClick={() => openTxEdit(t)} aria-label={`Editar ${t.description}`}><IconPencil size={14} /></button>
                      <button className="icon-btn danger" onClick={() => setTxToDelete(t)} aria-label={`Eliminar ${t.description}`}><IconTrash size={14} /></button>
                    </span>
                  </div>
                ))}
              </div>

              {/* mobile: cartões agrupados por dia */}
              <div className="tx-days mobile-only">
                {byDay.map((g) => (
                  <div key={g.date} className="tx-day-group">
                    <div className="tx-day">{fmtDay(g.date)}</div>
                    <div className="card flush">
                      {g.txs.map((t) => (
                        <div key={t.id} data-testid="movement-row" className="tx-card-row" onClick={() => openTxEdit(t)}>
                          <span className="code-chip cat" style={{ background: catTint(t.category) }}>
                            {codeOf(catLabel(t.category))}
                          </span>
                          <div className="row-main">
                            <strong>{t.description}</strong>
                            <small>{catLabel(t.category)}{t.accountName ? ` · ${t.accountName}` : ''}</small>
                          </div>
                          <span className={`mono ${t.inflow ? 'pos' : 'neg'}`}>
                            {t.inflow ? '+' : '−'}{fmtEur(t.amount)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* ---------- coluna lateral ---------- */}
        <aside className="mov-side">
          <section className="card">
            <div className="card-header"><div><h3>Despesas por categoria</h3><div className="sub">{fmtMonth(month)}</div></div></div>
            {data.byCategory.length === 0 ? (
              <p className="dim" style={{ padding: '4px 2px' }}>Ainda sem despesas neste mês.</p>
            ) : (
              <ul className="cat-bars">
                {data.byCategory.map((c) => {
                  const pct = totalOut > 0 ? (Number(c.total) / totalOut) * 100 : 0
                  return (
                    <li key={c.category}>
                      <div className="cat-bar-head">
                        <span><span className="tx-cat-dot" style={{ background: catColor(c.category) }} />{catLabel(c.category)}</span>
                        <span className="mono">{fmtEur(c.total)}</span>
                      </div>
                      <div className="cat-bar-track">
                        <div className="cat-bar-fill" style={{ width: `${pct}%`, background: catColor(c.category) }} />
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>

          <section className="card">
            <div className="card-header"><div><h3>Regras aprendidas</h3></div></div>
            <p className="dim" style={{ margin: 0, lineHeight: 1.5 }}>
              Ao mudares a categoria de um movimento, a Vaultrack aplica-a a todos com a mesma
              descrição e memoriza-a para as próximas importações.
            </p>
          </section>
        </aside>
      </div>

      {/* ---------- modal categorias ---------- */}
      <Modal open={catModal} width={520}
             onClose={() => { setCatModal(false); setCatForm({ id: null, label: '', color: CATEGORY_COLORS[0] }) }}
             title="Gerir categorias"
             subtitle="As categorias por omissão são fixas. Cria as tuas próprias para organizares as despesas à tua maneira.">
        <div className="form-grid">
          <div className="field full">
            <label>{catForm.id ? 'Editar categoria' : 'Nova categoria'}</label>
            <input placeholder="Ex: Educação" maxLength={60} value={catForm.label}
                   onChange={(e) => setCatForm({ ...catForm, label: e.target.value })} />
          </div>
          <div className="field full">
            <label>Cor</label>
            <div className="color-picker">
              {CATEGORY_COLORS.map((col) => (
                <button key={col} type="button"
                        className={`color-swatch ${catForm.color?.toLowerCase() === col ? 'selected' : ''}`}
                        style={{ background: col }} title={col}
                        onClick={() => setCatForm({ ...catForm, color: col })} />
              ))}
              <label className="color-custom" style={{ background: catForm.color }} title="Cor personalizada (RGB)">
                <input type="color" value={catForm.color || CATEGORY_COLORS[0]}
                       onChange={(e) => setCatForm({ ...catForm, color: e.target.value })} />
                <IconPlus size={13} />
              </label>
            </div>
          </div>
          <div className="field full cat-form-actions">
            {catForm.id && (
              <button className="btn ghost" onClick={() => setCatForm({ id: null, label: '', color: CATEGORY_COLORS[0] })}>
                Cancelar edição
              </button>
            )}
            <button className="btn" onClick={saveCat} disabled={busy}>
              {busy ? 'A guardar…' : (catForm.id ? 'Guardar alterações' : 'Adicionar categoria')}
            </button>
          </div>
        </div>

        <div className="cat-manage-list">
          <div className="cat-manage-title">As tuas categorias</div>
          {categories.length === 0 ? (
            <p className="dim" style={{ padding: '2px' }}>Ainda não tens categorias personalizadas.</p>
          ) : (
            <ul className="event-list">
              {categories.map((c) => (
                <li key={c.id} className="event-row">
                  <span className="tx-cat-dot" style={{ background: c.color }} />
                  <div className="event-main"><strong>{c.label}</strong></div>
                  <div className="event-actions">
                    <button className="icon-btn" onClick={() => openCatEdit(c)} aria-label={`Editar ${c.label}`}><IconPencil size={14} /></button>
                    <button className="icon-btn danger" onClick={() => setCatToDelete(c)} aria-label={`Eliminar ${c.label}`}><IconTrash size={14} /></button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="cat-manage-list">
          <div className="cat-manage-title">Por omissão</div>
          <div className="cat-default-chips">
            {DEFAULT_CATEGORIES.map((c) => (
              <span key={c} className="cat-default-chip">
                <span className="tx-cat-dot" style={{ background: catColor(c) }} /> {catLabel(c)}
              </span>
            ))}
          </div>
        </div>
      </Modal>

      {/* ---------- modal movimento ---------- */}
      <Modal open={txModal} onClose={() => setTxModal(false)} onSubmit={saveTx} busy={busy}
             title={editingTx ? 'Editar movimento' : 'Novo movimento'}
             subtitle="Uma despesa ou receita de uma das tuas contas."
             footer={
               <>
                 <button className="btn ghost" onClick={() => setTxModal(false)}>Cancelar</button>
                 <button className="btn" onClick={saveTx} disabled={busy}>{busy ? 'A guardar…' : 'Guardar'}</button>
               </>
             }>
        <div className="form-grid">
          <div className="field full">
            <label>Descrição</label>
            <input placeholder="Ex: Supermercado Continente" autoFocus value={txForm.description}
                   onChange={(e) => setTxForm({ ...txForm, description: e.target.value })} />
          </div>
          <div className="field">
            <label>Conta</label>
            <Dropdown label="Conta" value={txForm.accountId} onChange={(accountId) => setTxForm({ ...txForm, accountId })}
                      options={data.accounts.map((a) => ({ value: String(a.id), label: a.name }))} />
          </div>
          <div className="field">
            <label>Categoria</label>
            <Dropdown label="Categoria" value={txForm.category} onChange={(category) => {
              setTxForm({ ...txForm, category, inflow: category === 'INCOME' ? true : txForm.inflow })
            }} options={catOptions} />
          </div>
          <div className="field">
            <label>Tipo</label>
            <div className="seg">
              <button type="button" className={txForm.inflow ? 'active' : ''} onClick={() => setTxForm({ ...txForm, inflow: true })}><IconArrowUp size={13} /> Entrada</button>
              <button type="button" className={!txForm.inflow ? 'active' : ''} onClick={() => setTxForm({ ...txForm, inflow: false })}><IconArrowDown size={13} /> Saída</button>
            </div>
          </div>
          <div className="field">
            <label>Valor</label>
            <div className="input-affix">
              <input type="text" inputMode="decimal" placeholder="0" aria-label="Valor" value={txForm.amount}
                     onChange={(e) => setTxForm({ ...txForm, amount: e.target.value })} />
              <span className="affix">{cur}</span>
            </div>
          </div>
          <div className="field full">
            <label>Data</label>
            <DatePicker value={txForm.date} onChange={(iso) => setTxForm({ ...txForm, date: iso })} />
          </div>
          {editingTx && (
            <label className="field full check-row">
              <input type="checkbox" checked={txApplyAll} onChange={(e) => setTxApplyAll(e.target.checked)} />
              <span>Ao mudar a categoria, aplicar a <strong>todos os movimentos com esta descrição</strong> e memorizar para futuras importações</span>
            </label>
          )}
        </div>
      </Modal>

      {/* ---------- modal categoria em massa ---------- */}
      <Modal open={!!bulkCat} onClose={() => setBulkCat(null)} onSubmit={applyBulkCategory} busy={busy}
             title="Definir categoria"
             subtitle={`${selected.size} movimento(s) selecionados.`}
             footer={
               <>
                 <button className="btn ghost" onClick={() => setBulkCat(null)}>Cancelar</button>
                 <button className="btn" onClick={applyBulkCategory} disabled={busy}>{busy ? 'A aplicar…' : 'Aplicar'}</button>
               </>
             }>
        {bulkCat && (
          <div className="form-grid">
            <div className="field full">
              <label>Categoria</label>
              <Dropdown label="Categoria" value={bulkCat.category}
                        onChange={(category) => setBulkCat({ ...bulkCat, category })} options={catOptions} />
            </div>
            <label className="field full check-row">
              <input type="checkbox" checked={bulkCat.applyRule}
                     onChange={(e) => setBulkCat({ ...bulkCat, applyRule: e.target.checked })} />
              <span>Memorizar a <strong>regra da descrição</strong> para futuras importações</span>
            </label>
          </div>
        )}
      </Modal>

      <AccountModal open={accountModal} account={editingAccount} busy={busy} currencySymbol={cur}
                    onClose={() => setAccountModal(false)} onSave={saveAccount} />
      <StatementImport open={importModal} onClose={() => setImportModal(false)}
                       accounts={data.accounts} defaultAccountId={accountFilter} onImported={load} />

      <ConfirmDialog open={!!txToDelete} busy={busy}
                     title="Eliminar movimento?"
                     message={`"${txToDelete?.description}" vai ser eliminado.`}
                     onConfirm={removeTx} onCancel={() => setTxToDelete(null)} />
      <ConfirmDialog open={!!accountToDelete} busy={busy}
                     title="Eliminar conta?"
                     message={`"${accountToDelete?.name}" e todos os seus movimentos (${accountToDelete?.transactionCount || 0}) vão ser eliminados.`}
                     onConfirm={removeAccount} onCancel={() => setAccountToDelete(null)} />
      <ConfirmDialog open={!!catToDelete} busy={busy}
                     title="Eliminar categoria?"
                     message={`"${catToDelete?.label}" vai ser eliminada. Os movimentos que a usavam passam para "Outros".`}
                     onConfirm={removeCat} onCancel={() => setCatToDelete(null)} />
    </div>
  )
}
