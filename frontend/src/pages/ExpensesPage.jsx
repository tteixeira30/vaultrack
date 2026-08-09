import { useEffect, useMemo, useRef, useState } from 'react'
import { api, fmtEur, toEur, fromEur, getCurrencySymbol, parseAmount } from '../api'
import Modal, { ConfirmDialog } from '../components/Modal'
import DatePicker from '../components/DatePicker'
import Dropdown from '../components/Dropdown'
import { useToast } from '../components/Toast'
import { analyzeStatement, analyzeRows, buildTransactions, categoryKey } from '../statementParser'
import { DEFAULT_CATEGORIES, catLabel, catColor, setCustomCategories } from '../categories'
import {
  IconBank, IconReceipt, IconUpload, IconPlus, IconPencil, IconWallet,
  IconChevronLeft, IconChevronRight, IconArrowUp, IconArrowDown, IconCoins, IconPie, IconTrash,
} from '../components/Icons'

// Paleta para as categorias personalizadas (swatches do seletor de cor).
const CATEGORY_COLORS = [
  '#f59e0b', '#fb7185', '#a78bfa', '#818cf8', '#f472b6', '#34d399',
  '#fbbf24', '#22d3ee', '#60a5fa', '#4ade80', '#f87171', '#c084fc',
]

const EMPTY_TX = { accountId: '', date: '', description: '', amount: '', inflow: false, category: 'OTHER' }

function fmtMonth(m) {
  const [y, mo] = m.split('-').map(Number)
  const s = new Date(y, mo - 1, 1).toLocaleDateString('pt-PT', { month: 'long', year: 'numeric' })
  return s.charAt(0).toUpperCase() + s.slice(1)
}
const todayIso = () => new Date().toISOString().slice(0, 10)
const shiftMonth = (m, delta) => {
  const [y, mo] = m.split('-').map(Number)
  const d = new Date(y, mo - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
const fmtDay = (iso) => new Date(iso).toLocaleDateString('pt-PT', { weekday: 'short', day: '2-digit', month: 'short' })

export default function ExpensesPage() {
  const toast = useToast()
  const cur = getCurrencySymbol()
  const [month, setMonth] = useState(() => todayIso().slice(0, 7))
  const [accountFilter, setAccountFilter] = useState('')
  const [data, setData] = useState(null)
  const [busy, setBusy] = useState(false)
  const [categories, setCategories] = useState([]) // categorias personalizadas do utilizador

  // gestão de categorias
  const [catModal, setCatModal] = useState(false)
  const [catForm, setCatForm] = useState({ id: null, label: '', color: CATEGORY_COLORS[0] })
  const [catToDelete, setCatToDelete] = useState(null)

  // modais
  const [accountModal, setAccountModal] = useState(false)
  const [editingAccount, setEditingAccount] = useState(null)
  const [accountName, setAccountName] = useState('')
  const [accountBalance, setAccountBalance] = useState('')
  const [accountToDelete, setAccountToDelete] = useState(null)
  const [txModal, setTxModal] = useState(false)
  const [editingTx, setEditingTx] = useState(null)
  const [txForm, setTxForm] = useState(EMPTY_TX)
  const [txApplyAll, setTxApplyAll] = useState(true)
  const [txToDelete, setTxToDelete] = useState(null)

  // importação de extrato
  const fileRef = useRef(null)
  const [importModal, setImportModal] = useState(false)
  const [importAccountId, setImportAccountId] = useState('')
  const [importFile, setImportFile] = useState(null) // { name, analysis }
  const [mapping, setMapping] = useState(null)
  const [categoryRules, setCategoryRules] = useState(null) // { matchKey: category }

  const load = () =>
    api.getExpenses(month, accountFilter || null).then(setData)

  // categorias personalizadas: guarda no estado local (seletores) e no registo global
  // (catLabel/catColor usados também no painel)
  const loadCategories = () =>
    api.getExpenseCategories().then((list) => { setCategories(list); setCustomCategories(list) })

  useEffect(() => {
    load().catch(() => toast.error('Erro', 'Não foi possível carregar as despesas.'))
  }, [month, accountFilter])

  useEffect(() => {
    loadCategories().catch(() => {})
  }, [])

  // opções de categoria para os seletores: por omissão + personalizadas
  const catOptions = useMemo(() => [
    ...DEFAULT_CATEGORIES.map((c) => ({ value: c, label: catLabel(c) })),
    ...categories.map((c) => ({ value: c.key, label: c.label })),
  ], [categories])

  // ---------- contas ----------

  const openAccountAdd = () => { setEditingAccount(null); setAccountName(''); setAccountBalance(''); setAccountModal(true) }
  const openAccountEdit = (a) => {
    setEditingAccount(a)
    setAccountName(a.name)
    setAccountBalance(a.currentBalance != null ? String(fromEur(a.currentBalance)) : '')
    setAccountModal(true)
  }

  const saveAccount = async () => {
    if (!accountName.trim()) { toast.error('Nome em falta', 'Indica o nome da conta.'); return }
    if (accountBalance !== '' && !Number.isFinite(parseAmount(accountBalance))) {
      toast.error('Saldo inválido', 'Indica um número válido (ou deixa em branco).'); return
    }
    const payload = {
      name: accountName.trim(),
      currentBalance: accountBalance === '' ? null : toEur(parseAmount(accountBalance)),
    }
    setBusy(true)
    try {
      if (editingAccount) await api.updateExpenseAccount(editingAccount.id, payload)
      else await api.addExpenseAccount(payload)
      setAccountModal(false)
      await load()
      toast.success(editingAccount ? 'Conta atualizada' : 'Conta criada', `"${accountName.trim()}" guardada.`)
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

  // ---------- importação ----------

  const openImport = () => {
    setImportAccountId(accountFilter || String(data?.accounts[0]?.id || ''))
    setImportFile(null)
    setMapping(null)
    setImportModal(true)
    // regras aprendidas, para a pré-visualização mostrar as categorias finais
    api.getCategoryRules()
      .then((list) => setCategoryRules(Object.fromEntries(list.map((r) => [r.matchKey, r.category]))))
      .catch(() => setCategoryRules(null))
  }

  const onFile = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      let analysis
      if (/\.pdf$/i.test(file.name) || file.type === 'application/pdf') {
        const { extractPdfRows } = await import('../pdfStatement')
        const { rows, hasText } = await extractPdfRows(await file.arrayBuffer())
        if (!hasText) {
          toast.error('PDF digitalizado', 'Este PDF não tem texto (é uma imagem). Usa o PDF original do banco ou exporta em CSV.')
          return
        }
        analysis = analyzeRows(rows)
      } else {
        analysis = analyzeStatement(await file.text())
      }
      if (!analysis || analysis.dataRows.length === 0) {
        toast.error('Ficheiro vazio', 'Não foram encontradas linhas de movimentos no ficheiro.')
        return
      }
      setImportFile({ name: file.name, analysis })
      setMapping(analysis.mapping)
    } catch {
      toast.error('Erro ao ler', 'Não foi possível ler o ficheiro. Usa o extrato em CSV ou PDF do banco.')
    }
  }

  const preview = useMemo(() => {
    if (!importFile || !mapping) return null
    if (mapping.date === -1 || mapping.description === -1 || (mapping.amount === -1 && mapping.debit === -1)) return null
    const result = buildTransactions(importFile.analysis.dataRows, mapping, importFile.analysis.dateHint, importFile.analysis.openingBalance)
    if (categoryRules) {
      for (const r of result.rows) {
        const ruled = categoryRules[categoryKey(r.description)]
        if (ruled) r.category = ruled
      }
    }
    return result
  }, [importFile, mapping, categoryRules])

  // período coberto pelo extrato (usado no resumo e no aviso de sobreposição)
  const previewRange = useMemo(() => {
    if (!preview || preview.rows.length === 0) return null
    let min = preview.rows[0].date, max = preview.rows[0].date
    for (const r of preview.rows) {
      if (r.date < min) min = r.date
      if (r.date > max) max = r.date
    }
    return { min, max }
  }, [preview])

  // Movimentos que a conta escolhida já tem neste período. A deduplicação da
  // importação exige data, valor, sentido e descrição iguais, por isso o mesmo
  // extrato noutro formato pode passar-lhe ao lado e duplicar movimentos — mais
  // vale avisar antes de importar do que deixar descobrir depois.
  // A contagem guarda a conta e o período a que pertence: assim não é preciso
  // limpá-la ao mudar de conta (bastam a chave e o render deixarem de bater
  // certo) e nunca se mostra o número de uma consulta anterior.
  const usageKey = importModal && importAccountId && previewRange
    ? `${importAccountId}|${previewRange.min}|${previewRange.max}`
    : null
  const [periodUsage, setPeriodUsage] = useState(null) // { key, count }
  useEffect(() => {
    if (!usageKey) return undefined
    let cancelled = false
    api.getPeriodUsage(Number(importAccountId), previewRange.min, previewRange.max)
      .then((r) => { if (!cancelled) setPeriodUsage({ key: usageKey, count: r.transactionCount }) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [usageKey, importAccountId, previewRange])

  const doImport = async () => {
    if (!importAccountId) { toast.error('Conta em falta', 'Escolhe a conta a que pertence o extrato.'); return }
    if (!preview || preview.rows.length === 0) { toast.error('Sem movimentos', 'Não há movimentos válidos para importar.'); return }
    setBusy(true)
    try {
      const res = await api.importTransactions({
        accountId: Number(importAccountId), rows: preview.rows, closingBalance: preview.closingBalance,
      })
      setImportModal(false)
      await load()
      toast.success('Extrato importado',
        `${res.imported} movimento(s) adicionados${res.skipped ? ` · ${res.skipped} duplicado(s) ignorados` : ''}.`
        + (preview.closingBalance != null ? ` Saldo da conta atualizado para ${fmtEur(res.balance)}.` : ''))
    } catch (e) { toast.error('Erro ao importar', e.message) }
    finally { setBusy(false) }
  }

  const mappingOptions = (headers) => [
    { value: '-1', label: '— nenhuma —' },
    ...headers.map((h, i) => ({ value: String(i), label: h || `Coluna ${i + 1}` })),
  ]
  const setMap = (key, v) => setMapping((m) => ({ ...m, [key]: Number(v) }))

  const FORMAT_LABEL = { revolut: 'Revolut', santander: 'Santander', traderepublic: 'Trade Republic', generic: 'genérico', unknown: 'não reconhecido' }

  // ---------- render ----------

  if (!data) {
    return <div className="skeleton" style={{ height: 460, borderRadius: 16 }} />
  }

  const hasAccounts = data.accounts.length > 0
  const totalOut = Number(data.outflows) || 0

  // saldo atual: da conta filtrada, ou a soma das contas com saldo definido
  const selectedAccount = accountFilter ? data.accounts.find((a) => String(a.id) === accountFilter) : null
  const balancesDefined = data.accounts.filter((a) => a.currentBalance != null)
  const balanceValue = selectedAccount
    ? selectedAccount.currentBalance
    : (balancesDefined.length > 0 ? balancesDefined.reduce((s, a) => s + Number(a.currentBalance), 0) : null)

  // agrupar movimentos por dia
  const byDay = []
  for (const t of data.transactions) {
    const last = byDay[byDay.length - 1]
    if (last && last.date === t.date) last.txs.push(t)
    else byDay.push({ date: t.date, txs: [t] })
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h2>Despesas</h2>
          <p>Movimentos das tuas contas correntes — manuais ou importados do extrato bancário.</p>
        </div>
        <div className="page-actions">
          <button className="btn ghost" onClick={openImport} disabled={!hasAccounts} title={hasAccounts ? '' : 'Cria primeiro uma conta'}>
            <IconUpload size={15} /> Importar extrato
          </button>
          <button className="btn" onClick={openTxAdd} disabled={!hasAccounts} title={hasAccounts ? '' : 'Cria primeiro uma conta'}>
            <IconPlus size={15} /> Novo movimento
          </button>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="cal-head">
          <div className="month-nav">
            <button className="icon-btn" onClick={() => setMonth((m) => shiftMonth(m, -1))} aria-label="Mês anterior"><IconChevronLeft size={18} /></button>
            <span className="month-label">{fmtMonth(month)}</span>
            <button className="icon-btn" onClick={() => setMonth((m) => shiftMonth(m, 1))} aria-label="Mês seguinte"><IconChevronRight size={18} /></button>
          </div>
          <div className="account-chips">
            <button className={`account-chip ${accountFilter === '' ? 'active' : ''}`} onClick={() => setAccountFilter('')}>
              Todas as contas
            </button>
            {data.accounts.map((a) => (
              <button key={a.id} data-testid="account-chip"
                      className={`account-chip ${accountFilter === String(a.id) ? 'active' : ''}`}
                      onClick={() => setAccountFilter(String(a.id))}>
                <IconBank size={13} /> {a.name}
                {a.currentBalance != null && <span className="account-chip-balance">{fmtEur(a.currentBalance)}</span>}
                <span className="account-chip-actions">
                  <span role="button" tabIndex={0} onClick={(e) => { e.stopPropagation(); openAccountEdit(a) }} aria-label={`Editar ${a.name}`}><IconPencil size={12} /></span>
                  <span role="button" tabIndex={0} onClick={(e) => { e.stopPropagation(); setAccountToDelete(a) }} aria-label={`Eliminar ${a.name}`}><IconTrash size={12} /></span>
                </span>
              </button>
            ))}
            <button data-testid="account-chip-add" className="account-chip add" onClick={openAccountAdd}><IconPlus size={13} /> Conta</button>
          </div>
        </div>

        <div className="kpi-grid" style={{ marginTop: 14 }}>
          <div className="card kpi-card">
            <div className="kpi-top">
              <span className="kpi-icon"><IconArrowUp size={17} /></span>
              <span className="kpi-label">Entradas</span>
            </div>
            <div className="kpi-value pos">{fmtEur(data.inflows)}</div>
          </div>
          <div className="card kpi-card">
            <div className="kpi-top">
              <span className="kpi-icon"><IconArrowDown size={17} /></span>
              <span className="kpi-label">Saídas</span>
            </div>
            <div className="kpi-value neg">{fmtEur(data.outflows)}</div>
          </div>
          <div className="card kpi-card">
            <div className="kpi-top">
              <span className="kpi-icon"><IconWallet size={17} /></span>
              <span className="kpi-label">Saldo do mês</span>
            </div>
            <div className={`kpi-value ${Number(data.net) >= 0 ? 'pos' : 'neg'}`}>{fmtEur(data.net)}</div>
          </div>
          <div className="card kpi-card">
            <div className="kpi-top">
              <span className="kpi-icon"><IconBank size={17} /></span>
              <span className="kpi-label">{selectedAccount ? 'Saldo da conta' : 'Saldo em contas'}</span>
            </div>
            <div className="kpi-value">{balanceValue != null ? fmtEur(balanceValue) : '—'}</div>
            <div className="kpi-sub">
              {balanceValue != null
                ? (selectedAccount ? 'Registado por ti' : `${balancesDefined.length} de ${data.accounts.length} conta(s) com saldo`)
                : 'Define o saldo ao editar a conta'}
              {' '}· {data.transactions.length} movimento(s)
            </div>
          </div>
        </div>
      </div>

      <div className="dash-grid">
        <div className="card">
          <div className="card-header">
            <div>
              <h3><IconReceipt size={16} /> Movimentos</h3>
              <div className="sub">{accountFilter ? data.accounts.find((a) => String(a.id) === accountFilter)?.name : 'Todas as contas'} · {fmtMonth(month)}</div>
            </div>
          </div>
          {!hasAccounts ? (
            <div className="empty-state">
              <div className="empty-icon"><IconBank size={22} /></div>
              <h4>Começa por criar as tuas contas</h4>
              <p>Adiciona as tuas contas correntes (ex.: Santander, Trade Republic, Revolut) e depois importa o extrato de cada uma.</p>
              <button className="btn" onClick={openAccountAdd}><IconPlus size={14} /> Criar conta</button>
            </div>
          ) : data.transactions.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon"><IconReceipt size={22} /></div>
              <h4>Sem movimentos em {fmtMonth(month)}</h4>
              <p>Importa o extrato bancário do mês ou adiciona movimentos manualmente.</p>
              <button className="btn" onClick={openImport}><IconUpload size={14} /> Importar extrato</button>
            </div>
          ) : (
            <div className="tx-list">
              {byDay.map((g) => (
                <div key={g.date}>
                  <div className="tx-day">{fmtDay(g.date)}</div>
                  <ul className="event-list">
                    {g.txs.map((t) => (
                      <li key={t.id} data-testid="movement-row" className="event-row">
                        <span className={`tl-icon ${t.inflow ? 'in' : 'out'}`}>
                          {t.inflow ? <IconArrowUp size={14} /> : <IconArrowDown size={14} />}
                        </span>
                        <div className="event-main">
                          <strong>{t.description}</strong>
                          <span>
                            <span className="tx-cat-dot" style={{ background: catColor(t.category) }} />
                            {catLabel(t.category)}{!accountFilter && t.accountName ? ` · ${t.accountName}` : ''}
                          </span>
                        </div>
                        <span className={t.inflow ? 'pos' : 'neg'}>{t.inflow ? '+' : '−'}{fmtEur(t.amount)}</span>
                        <div className="event-actions">
                          <button className="icon-btn" onClick={() => openTxEdit(t)} aria-label="Editar"><IconPencil size={14} /></button>
                          <button className="icon-btn danger" onClick={() => setTxToDelete(t)} aria-label="Eliminar"><IconTrash size={15} /></button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-header">
            <div>
              <h3><IconCoins size={16} /> Despesas por categoria</h3>
              <div className="sub">{fmtMonth(month)}</div>
            </div>
            <button className="btn ghost small" onClick={() => setCatModal(true)}>
              <IconPie size={14} /> Gerir categorias
            </button>
          </div>
          {data.byCategory.length === 0 ? (
            <p className="dim" style={{ padding: '4px 2px' }}>Ainda sem despesas neste mês.</p>
          ) : (
            <ul className="cat-bars">
              {data.byCategory.map((c) => {
                const pct = totalOut > 0 ? (Number(c.total) / totalOut) * 100 : 0
                return (
                  <li key={c.category}>
                    <div className="cat-bar-head">
                      <span><span className="tx-cat-dot" style={{ background: catColor(c.category) }} /> {catLabel(c.category)}</span>
                      <span>{fmtEur(c.total)} · {pct.toFixed(0)}%</span>
                    </div>
                    <div className="cat-bar-track">
                      <div className="cat-bar-fill" style={{ width: `${pct}%`, background: catColor(c.category) }} />
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
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

      {/* ---------- modal conta ---------- */}
      <Modal open={accountModal} onClose={() => setAccountModal(false)} onSubmit={saveAccount} busy={busy}
             title={editingAccount ? 'Editar conta' : 'Nova conta corrente'}
             subtitle="Ex.: Santander, Trade Republic, Revolut."
             footer={
               <>
                 <button className="btn ghost" onClick={() => setAccountModal(false)}>Cancelar</button>
                 <button className="btn" onClick={saveAccount} disabled={busy}>{busy ? 'A guardar…' : 'Guardar'}</button>
               </>
             }>
        <div className="form-grid">
          <div className="field full">
            <label>Nome da conta</label>
            <input placeholder="Ex: Santander" autoFocus value={accountName}
                   onChange={(e) => setAccountName(e.target.value)} />
          </div>
          <div className="field full">
            <label>Saldo atual (opcional)</label>
            <div className="input-affix">
              <input type="text" inputMode="decimal" placeholder="Deixa em branco se não quiseres registar" value={accountBalance}
                     onChange={(e) => setAccountBalance(e.target.value)} />
              <span className="affix">{cur}</span>
            </div>
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

      {/* ---------- modal importação ---------- */}
      <Modal open={importModal} onClose={() => setImportModal(false)}
             title="Importar extrato bancário"
             subtitle="Exporta o extrato do teu banco em CSV ou PDF e carrega-o aqui. Movimentos duplicados são ignorados automaticamente."
             footer={
               <>
                 <button className="btn ghost" onClick={() => setImportModal(false)}>Cancelar</button>
                 <button className="btn" onClick={doImport} disabled={busy || !preview || preview.rows.length === 0}>
                   {busy ? 'A importar…' : `Importar${preview ? ` ${preview.rows.length} movimento(s)` : ''}`}
                 </button>
               </>
             }>
        <div className="form-grid">
          <div className="field">
            <label>Conta do extrato</label>
            <Dropdown value={importAccountId} onChange={setImportAccountId}
                      options={data.accounts.map((a) => ({ value: String(a.id), label: a.name }))} />
          </div>
          <div className="field">
            <label>Ficheiro (CSV ou PDF)</label>
            <input ref={fileRef} type="file" accept=".csv,.txt,.pdf,text/csv,application/pdf" style={{ display: 'none' }} onChange={onFile} />
            <button className="btn ghost" style={{ width: '100%' }} onClick={() => fileRef.current?.click()}>
              <IconUpload size={14} /> {importFile ? importFile.name : 'Escolher ficheiro…'}
            </button>
          </div>
        </div>

        {importFile && (
          <>
            <p className="dim" style={{ margin: '10px 2px 6px' }}>
              Formato detetado: <strong>{FORMAT_LABEL[importFile.analysis.format]}</strong>
              {importFile.analysis.format === 'unknown' && ' — indica abaixo a que corresponde cada coluna.'}
              {' '}Valores assumidos em EUR (linhas noutra moeda são ignoradas).
            </p>

            {(importFile.analysis.format === 'unknown' || !preview) && (
              <div className="form-grid">
                <div className="field">
                  <label>Coluna da data</label>
                  <Dropdown value={String(mapping.date)} onChange={(v) => setMap('date', v)} options={mappingOptions(importFile.analysis.headers)} />
                </div>
                <div className="field">
                  <label>Coluna da descrição</label>
                  <Dropdown value={String(mapping.description)} onChange={(v) => setMap('description', v)} options={mappingOptions(importFile.analysis.headers)} />
                </div>
                <div className="field">
                  <label>Coluna do montante (com sinal)</label>
                  <Dropdown value={String(mapping.amount)} onChange={(v) => setMap('amount', v)} options={mappingOptions(importFile.analysis.headers)} />
                </div>
                <div className="field">
                  <label>…ou Débito / Crédito</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Dropdown value={String(mapping.debit)} onChange={(v) => setMap('debit', v)} options={mappingOptions(importFile.analysis.headers)} />
                    <Dropdown value={String(mapping.credit)} onChange={(v) => setMap('credit', v)} options={mappingOptions(importFile.analysis.headers)} />
                  </div>
                </div>
              </div>
            )}

            {preview && preview.rows.length > 0 && previewRange && (() => {
              const { min: minDate, max: maxDate } = previewRange
              const months = (Number(maxDate.slice(0, 4)) - Number(minDate.slice(0, 4))) * 12
                + Number(maxDate.slice(5, 7)) - Number(minDate.slice(5, 7)) + 1
              const fmtD = (iso) => new Date(iso).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short', year: 'numeric' })
              return (
              <div className="import-preview">
                <div className="import-summary">
                  <span>{preview.rows.length} movimento(s) prontos a importar</span>
                  {preview.ignored > 0 && <span className="dim">{preview.ignored} linha(s) ignoradas</span>}
                </div>
                <p className="dim import-range">
                  Período: {fmtD(minDate)} a {fmtD(maxDate)}{months > 1 ? ` · ${months} meses` : ''}
                  {preview.closingBalance != null
                    ? ` · saldo da conta passa a ${fmtEur(preview.closingBalance)}`
                    : ' · sem saldo no extrato, o saldo da conta fica como está'}
                </p>
                {periodUsage?.key === usageKey && periodUsage.count > 0 && (
                  <p className="import-overlap" role="status">
                    Esta conta já tem {periodUsage.count} movimento(s) neste período. Os que forem
                    exatamente iguais (data, valor, sentido e descrição) são ignorados, mas o
                    mesmo extrato noutro formato pode trazer datas ou descrições ligeiramente
                    diferentes e entrar duas vezes.
                  </p>
                )}
                <ul className="event-list">
                  {preview.rows.slice(0, 8).map((r, i) => (
                    <li key={i} className="event-row">
                      <span className={`tl-icon ${r.inflow ? 'in' : 'out'}`}>
                        {r.inflow ? <IconArrowUp size={14} /> : <IconArrowDown size={14} />}
                      </span>
                      <div className="event-main">
                        <strong>{r.description}</strong>
                        <span>{r.date} · {catLabel(r.category)}</span>
                      </div>
                      <span className={r.inflow ? 'pos' : 'neg'}>{r.inflow ? '+' : '−'}{fmtEur(r.amount)}</span>
                    </li>
                  ))}
                </ul>
                {preview.rows.length > 8 && <p className="dim" style={{ margin: '6px 2px 0' }}>… e mais {preview.rows.length - 8} movimento(s).</p>}
              </div>
              )
            })()}
            {preview && preview.rows.length === 0 && (
              <p className="dim" style={{ margin: '10px 2px' }}>Nenhum movimento válido encontrado — verifica o mapeamento das colunas.</p>
            )}
          </>
        )}
      </Modal>

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
