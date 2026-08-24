import { useEffect, useState } from 'react'
import { api, fmtEur, fromEur, toEur, parseAmount, getCurrencySymbol } from '../api'
import { catLabel, catColor } from '../categories'
import { useToast } from '../components/Toast'
import { ConfirmDialog } from '../components/Modal'
import StatementImport, { AccountModal, validateAccount } from '../components/StatementImport'
import { useIntent } from '../components/IntentContext'
import { codeOf } from '../components/code'
import { IconPlus, IconPencil, IconTrash, IconUpload, IconBank } from '../components/Icons'

/**
 * Ecrã "Contas" do design: as contas correntes de um lado, a importação de
 * extrato do outro.
 *
 * Em mobile chega-se aqui pelo Perfil; em desktop é um item do grupo "Sistema"
 * da sidebar.
 */
export default function AccountsPage() {
  const toast = useToast()
  const cur = getCurrencySymbol()
  const [data, setData] = useState(null)
  const [rules, setRules] = useState([])
  const [busy, setBusy] = useState(false)
  const [accountModal, setAccountModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [toDelete, setToDelete] = useState(null)
  const [importOpen, setImportOpen] = useState(false)

  const load = () => api.getExpenses().then(setData)

  useEffect(() => {
    load().catch(() => toast.error('Erro', 'Não foi possível carregar as contas.'))
    api.getCategoryRules().then(setRules).catch(() => {})
  }, [])

  /**
   * Esquece uma regra aprendida. Sem confirmação de propósito: nada se perde —
   * os movimentos já categorizados ficam como estão e a regra volta a
   * aprender-se ao mudar outra vez a categoria de um movimento.
   */
  const removeRule = async (rule) => {
    try {
      await api.deleteCategoryRule(rule.id)
      setRules((rs) => rs.filter((r) => r.id !== rule.id))
      toast.info('Regra esquecida', `"${rule.matchKey}" deixa de ser categorizada automaticamente.`)
    } catch (e) {
      toast.error('Erro ao esquecer a regra', e.message)
    }
  }

  const openAdd = () => { setEditing(null); setAccountModal(true) }
  const openEdit = (a) => {
    setEditing({ ...a, balanceInput: a.currentBalance != null ? String(fromEur(a.currentBalance)) : '' })
    setAccountModal(true)
  }

  useIntent('newAccount', openAdd)

  const save = async (form) => {
    const problem = validateAccount(form)
    if (problem) { toast.error('Campos em falta', problem); return }
    const payload = {
      name: form.name,
      currentBalance: form.balance === '' ? null : toEur(parseAmount(form.balance)),
    }
    setBusy(true)
    try {
      if (editing) await api.updateExpenseAccount(editing.id, payload)
      else await api.addExpenseAccount(payload)
      setAccountModal(false)
      await load()
      toast.success(editing ? 'Conta atualizada' : 'Conta criada', `"${form.name}" guardada.`)
    } catch (e) { toast.error('Erro ao guardar', e.message) }
    finally { setBusy(false) }
  }

  const remove = async () => {
    setBusy(true)
    try {
      await api.deleteExpenseAccount(toDelete.id)
      setToDelete(null)
      await load()
      toast.info('Conta removida', `"${toDelete.name}" e os seus movimentos foram eliminados.`)
    } catch (e) { toast.error('Erro ao remover', e.message) }
    finally { setBusy(false) }
  }

  if (!data) return <div className="skeleton" style={{ height: 420, borderRadius: 20 }} />

  const total = data.accounts.reduce((s, a) => s + (Number(a.currentBalance) || 0), 0)
  const withBalance = data.accounts.filter((a) => a.currentBalance != null).length

  return (
    <div className="split-2">
      <section className="card">
        <div className="card-header">
          <div>
            <h3>Contas correntes</h3>
            <div className="sub">O saldo é teu — atualiza-se com o saldo final de cada extrato</div>
          </div>
          <button className="btn small" onClick={openAdd}><IconPlus size={14} /> Nova conta</button>
        </div>

        {data.accounts.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon"><IconBank size={22} /></div>
            <h4>Ainda sem contas</h4>
            <p>Adiciona as tuas contas correntes (ex.: Santander, Revolut, Trade Republic) e depois importa o extrato de cada uma.</p>
            <button className="btn" onClick={openAdd}><IconPlus size={14} /> Criar conta</button>
          </div>
        ) : (
          <ul className="account-list">
            {data.accounts.map((a) => (
              <li key={a.id} data-testid="account-row">
                <span className="code-chip">{codeOf(a.name)}</span>
                <div className="al-main">
                  <strong>{a.name}</strong>
                  <small>{a.transactionCount || 0} movimento(s)</small>
                </div>
                {a.currentBalance == null && <span className="badge amber">Sem saldo</span>}
                <span className="mono al-balance">{a.currentBalance != null ? fmtEur(a.currentBalance) : '—'}</span>
                <div className="event-actions">
                  <button className="icon-btn" onClick={() => openEdit(a)} aria-label={`Editar ${a.name}`}><IconPencil size={14} /></button>
                  <button className="icon-btn danger" onClick={() => setToDelete(a)} aria-label={`Eliminar ${a.name}`}><IconTrash size={14} /></button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {data.accounts.length > 0 && (
          <div className="account-total">
            <span>Saldo em contas</span>
            <strong className="mono">{withBalance > 0 ? fmtEur(total) : '—'}</strong>
          </div>
        )}
      </section>

      <section className="card">
        <div className="card-header">
          <div><h3>Importar extrato</h3></div>
        </div>

        <button className="dropzone" onClick={() => setImportOpen(true)} disabled={data.accounts.length === 0}
                title={data.accounts.length === 0 ? 'Cria primeiro uma conta' : ''}>
          <IconUpload size={26} />
          <strong>Escolhe o CSV ou PDF do banco</strong>
          <small>Revolut · Santander · Trade Republic · genérico</small>
        </button>

        <ul className="check-list">
          <li><span className="ok">✓</span>Movimentos exatamente iguais (data, valor, sentido, descrição) são ignorados.</li>
          <li><span className="ok">✓</span>Colunas por reconhecer? Mapeias data, descrição e montante (ou débito/crédito) à mão.</li>
          <li><span className="ok">✓</span>As regras de categoria já aprendidas são aplicadas na pré-visualização.</li>
          <li><span className="warn">!</span>PDF digitalizado (imagem) não tem texto — usa o PDF original ou o CSV.</li>
        </ul>

        <div className="section-label">Regras aprendidas</div>
        {rules.length === 0 ? (
          <p className="dim" style={{ padding: '2px' }}>
            Ainda nenhuma. Ao mudares a categoria de um movimento, a Vaultrack aplica-a a todos
            com a mesma descrição e memoriza-a para as próximas importações.
          </p>
        ) : (
          <ul className="rule-list scroll">
            {rules.map((r) => (
              <li key={r.id}>
                <span className="mono rule-key">{r.matchKey}</span>
                <span className="rule-cat">
                  <span className="tx-cat-dot" style={{ background: catColor(r.category) }} />
                  {catLabel(r.category)}
                </span>
                <button type="button" className="icon-btn danger" onClick={() => removeRule(r)}
                        aria-label={`Esquecer a regra ${r.matchKey}`} title="Esquecer esta regra">
                  <IconTrash size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <AccountModal open={accountModal} account={editing} busy={busy} currencySymbol={cur}
                    onClose={() => setAccountModal(false)} onSave={save} />
      <StatementImport open={importOpen} onClose={() => setImportOpen(false)}
                       accounts={data.accounts} onImported={load} />
      <ConfirmDialog open={!!toDelete} busy={busy}
                     title="Eliminar conta?"
                     message={`"${toDelete?.name}" e todos os seus movimentos (${toDelete?.transactionCount || 0}) vão ser eliminados.`}
                     onConfirm={remove} onCancel={() => setToDelete(null)} />
    </div>
  )
}
