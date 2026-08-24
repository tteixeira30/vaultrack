import { useEffect, useState } from 'react'
import { api, fmtEur, fmtMoneyShort, fmtPercent, toEur, fromEur, getCurrencySymbol, parseAmount } from '../api'
import Modal, { ConfirmDialog } from '../components/Modal'
import { useToast } from '../components/Toast'
import { useIntent } from '../components/IntentContext'
import { codeOf } from '../components/code'
import { useIsMobile } from '../components/useMediaQuery'
import { IconCalendar, IconCheck, IconPencil, IconPlus, IconRefresh, IconTarget, IconTrash } from '../components/Icons'

const EMPTY_FORM = { name: '', targetAmount: '', monthlyAllocation: '', savedAmount: '', autoDeposit: false, contributionDay: '1' }

/**
 * Anel de progresso do cartão mobile.
 *
 * O design troca a barra horizontal do desktop por um anel de 78px à esquerda
 * do nome — é o que dá ao cartão de objetivo a sua silhueta.
 */
function GoalRing({ percent, done }) {
  const r = 32
  const circumference = 2 * Math.PI * r
  const offset = circumference * (1 - Math.min(100, Math.max(0, percent)) / 100)

  if (done) {
    return (
      <span className="goal-ring done" aria-hidden="true">
        <IconCheck size={32} />
      </span>
    )
  }
  return (
    <span className="goal-ring" aria-hidden="true">
      <svg width="78" height="78" viewBox="0 0 78 78">
        <circle cx="39" cy="39" r={r} stroke="var(--track)" strokeWidth="9" fill="none" />
        <circle cx="39" cy="39" r={r} stroke="var(--accent)" strokeWidth="9" fill="none"
                strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset}
                transform="rotate(-90 39 39)" />
      </svg>
      <span className="mono">{fmtPercent(percent, 0)}</span>
    </span>
  )
}

export default function GoalsPage() {
  const toast = useToast()
  const cur = getCurrencySymbol()
  const isMobile = useIsMobile()
  const [goals, setGoals] = useState(null)
  const [addModal, setAddModal] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [editing, setEditing] = useState(null)
  const [editForm, setEditForm] = useState(EMPTY_FORM)
  const [contrib, setContrib] = useState({})
  const [toDelete, setToDelete] = useState(null)
  const [busy, setBusy] = useState(false)

  const load = () => api.getGoals().then(setGoals)

  useIntent('newGoal', () => setAddModal(true))

  useEffect(() => {
    load().catch(() => toast.error('Erro', 'Não foi possível carregar os objetivos.'))
  }, [])

  const add = async () => {
    if (!form.name.trim() || !form.targetAmount || !form.monthlyAllocation) {
      toast.error('Campos em falta', 'Indica o nome, o valor do objetivo e a alocação mensal.')
      return
    }
    setBusy(true)
    try {
      await api.addGoal({
        name: form.name.trim(),
        targetAmount: toEur(parseAmount(form.targetAmount)),
        monthlyAllocation: toEur(parseAmount(form.monthlyAllocation)),
        savedAmount: toEur(parseAmount(form.savedAmount) || 0),
        autoDeposit: form.autoDeposit,
        contributionDay: form.autoDeposit ? (Number(form.contributionDay) || 1) : null,
      })
      setAddModal(false)
      setForm(EMPTY_FORM)
      await load()
      toast.success('Objetivo criado', `"${form.name.trim()}" adicionado aos teus objetivos.`)
    } catch (e) { toast.error('Erro ao criar', e.message) }
    finally { setBusy(false) }
  }

  const openEdit = (g) => {
    setEditing(g)
    setEditForm({
      name: g.name,
      targetAmount: String(fromEur(g.targetAmount)),
      monthlyAllocation: String(fromEur(g.monthlyAllocation)),
      savedAmount: String(fromEur(g.savedAmount)),
      autoDeposit: g.autoDeposit,
      contributionDay: String(g.contributionDay ?? 1),
    })
  }

  const saveEdit = async () => {
    if (!editForm.name.trim() || !editForm.targetAmount || !editForm.monthlyAllocation) {
      toast.error('Campos em falta', 'Indica o nome, o valor do objetivo e a alocação mensal.')
      return
    }
    setBusy(true)
    try {
      await api.updateGoal(editing.id, {
        name: editForm.name.trim(),
        targetAmount: toEur(parseAmount(editForm.targetAmount)),
        monthlyAllocation: toEur(parseAmount(editForm.monthlyAllocation)),
        savedAmount: toEur(parseAmount(editForm.savedAmount) || 0),
        autoDeposit: editForm.autoDeposit,
        contributionDay: editForm.autoDeposit ? (Number(editForm.contributionDay) || 1) : null,
      })
      setEditing(null)
      await load()
      toast.success('Objetivo atualizado', `"${editForm.name.trim()}" foi atualizado.`)
    } catch (e) { toast.error('Erro ao atualizar', e.message) }
    finally { setBusy(false) }
  }

  const contribute = async (goal) => {
    const amount = parseAmount(contrib[goal.id])
    if (!amount) {
      toast.error('Valor em falta', 'Indica o valor da contribuição.')
      return
    }
    const eur = toEur(amount)
    try {
      const updated = await api.contributeGoal(goal.id, eur)
      setContrib({ ...contrib, [goal.id]: '' })
      await load()
      if (Number(updated.progressPercent) >= 100) {
        toast.success('Objetivo atingido! 🎉', `Parabéns — completaste "${goal.name}".`)
      } else {
        toast.success('Contribuição registada', `${fmtEur(eur)} adicionados a "${goal.name}".`)
      }
    } catch (e) { toast.error('Erro ao contribuir', e.message) }
  }

  const remove = async () => {
    setBusy(true)
    try {
      await api.deleteGoal(toDelete.id)
      await load()
      toast.info('Objetivo removido', `"${toDelete.name}" foi eliminado.`)
      setToDelete(null)
    } catch (e) { toast.error('Erro ao remover', e.message) }
    finally { setBusy(false) }
  }

  const simulateDeposits = async () => {
    try {
      const result = await api.applyDeposits('goals')
      if (result.applied.length === 0) {
        toast.info('Sem depósitos automáticos', 'Nenhum objetivo tem o depósito mensal automático ativo.')
        return
      }
      await load()
      const names = result.applied.map((a) => a.name).join(', ')
      toast.success('Depósitos aplicados', `${fmtEur(result.totalAmount)} em: ${names}.`)
    } catch (e) { toast.error('Erro ao aplicar depósitos', e.message) }
  }

  if (!goals) {
    return (
      <div className="goals-grid">
        {[0, 1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 210, borderRadius: 20 }} />)}
      </div>
    )
  }

  const estimateMonths = () => {
    const target = parseAmount(form.targetAmount) || 0
    const monthly = parseAmount(form.monthlyAllocation) || 0
    const saved = parseAmount(form.savedAmount) || 0
    if (target <= saved) return 'Objetivo já atingido com o valor poupado.'
    if (monthly <= 0) return null
    const months = Math.ceil((target - saved) / monthly)
    const date = new Date()
    date.setMonth(date.getMonth() + months)
    return `≈ ${months} ${months === 1 ? 'mês' : 'meses'} — ${date.toLocaleDateString('pt-PT', { month: 'long', year: 'numeric' })}`
  }

  // Os modais servem as duas vistas: declarados uma vez, injetados em ambas.
  const modals = (
    <>
      <Modal open={addModal} onClose={() => setAddModal(false)} onSubmit={add} busy={busy}
           title="Novo objetivo" subtitle="Define a meta e quanto consegues alocar por mês."
           footer={
             <>
               <button className="btn ghost" onClick={() => setAddModal(false)}>Cancelar</button>
               <button className="btn" onClick={add} disabled={busy}>{busy ? 'A criar…' : 'Criar objetivo'}</button>
             </>
           }>
      <div className="form-grid">
        <div className="field full">
          <label>Nome</label>
          <input placeholder="Ex: Fundo de emergência" autoFocus value={form.name}
                 onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div className="field">
          <label>Valor do objetivo</label>
          <div className="input-affix">
            <input type="text" inputMode="decimal" placeholder="Ex: 10000" value={form.targetAmount}
                   onChange={(e) => setForm({ ...form, targetAmount: e.target.value })} />
            <span className="affix">{cur}</span>
          </div>
        </div>
        <div className="field">
          <label>Alocação mensal</label>
          <div className="input-affix">
            <input type="text" inputMode="decimal" placeholder="Ex: 300" value={form.monthlyAllocation}
                   onChange={(e) => setForm({ ...form, monthlyAllocation: e.target.value })} />
            <span className="affix">{cur}</span>
          </div>
        </div>
        <div className="field full">
          <label>Já poupado <span className="dim">(opcional)</span></label>
          <div className="input-affix">
            <input type="text" inputMode="decimal" placeholder="0" value={form.savedAmount}
                   onChange={(e) => setForm({ ...form, savedAmount: e.target.value })} />
            <span className="affix">{cur}</span>
          </div>
          {estimateMonths() && <span className="hint">{estimateMonths()}</span>}
        </div>
        <div className="field full">
          <label className="check-row">
            <input type="checkbox" checked={form.autoDeposit}
                   onChange={(e) => setForm({ ...form, autoDeposit: e.target.checked })} />
            <span>Depósito automático mensal</span>
          </label>
          <span className="hint">
            A alocação mensal é adicionada automaticamente no dia escolhido de cada mês (com a app ligada, ou no arranque seguinte).
            Também podes usar o botão "Simular depósito mensal".
          </span>
        </div>
        {form.autoDeposit && parseAmount(form.monthlyAllocation) > 0 && (
          <div className="field full">
            <label>Dia do mês do depósito</label>
            <div className="input-affix field-narrow">
              <input type="number" min="1" max="31" step="1" value={form.contributionDay}
                     onChange={(e) => setForm({ ...form, contributionDay: e.target.value })} />
              <span className="affix">do mês</span>
            </div>
            <span className="hint">Entre 1 e 31 — em meses mais curtos é aplicado no último dia.</span>
          </div>
        )}
      </div>
    </Modal>

    <Modal open={!!editing} onClose={() => setEditing(null)} onSubmit={saveEdit} busy={busy}
           title="Editar objetivo" subtitle="Ajusta a meta, a alocação mensal e o depósito automático."
           footer={
             <>
               <button className="btn ghost" onClick={() => setEditing(null)}>Cancelar</button>
               <button className="btn" onClick={saveEdit} disabled={busy}>{busy ? 'A guardar…' : 'Guardar'}</button>
             </>
           }>
      <div className="form-grid">
        <div className="field full">
          <label>Nome</label>
          <input autoFocus value={editForm.name}
                 onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
        </div>
        <div className="field">
          <label>Valor do objetivo</label>
          <div className="input-affix">
            <input type="text" inputMode="decimal" value={editForm.targetAmount}
                   onChange={(e) => setEditForm({ ...editForm, targetAmount: e.target.value })} />
            <span className="affix">{cur}</span>
          </div>
        </div>
        <div className="field">
          <label>Alocação mensal</label>
          <div className="input-affix">
            <input type="text" inputMode="decimal" value={editForm.monthlyAllocation}
                   onChange={(e) => setEditForm({ ...editForm, monthlyAllocation: e.target.value })} />
            <span className="affix">{cur}</span>
          </div>
        </div>
        <div className="field full">
          <label>Já poupado</label>
          <div className="input-affix">
            <input type="text" inputMode="decimal" value={editForm.savedAmount}
                   onChange={(e) => setEditForm({ ...editForm, savedAmount: e.target.value })} />
            <span className="affix">{cur}</span>
          </div>
        </div>
        <div className="field full">
          <label className="check-row">
            <input type="checkbox" checked={editForm.autoDeposit}
                   onChange={(e) => setEditForm({ ...editForm, autoDeposit: e.target.checked })} />
            <span>Depósito automático mensal</span>
          </label>
        </div>
        {editForm.autoDeposit && parseAmount(editForm.monthlyAllocation) > 0 && (
          <div className="field full">
            <label>Dia do mês do depósito</label>
            <div className="input-affix field-narrow">
              <input type="number" min="1" max="31" step="1" value={editForm.contributionDay}
                     onChange={(e) => setEditForm({ ...editForm, contributionDay: e.target.value })} />
              <span className="affix">do mês</span>
            </div>
            <span className="hint">
              Entre 1 e 31 — em meses mais curtos é aplicado no último dia.
              Mudar o dia só afeta os próximos depósitos; os já aplicados não se repetem.
            </span>
          </div>
        )}
      </div>
    </Modal>

    <ConfirmDialog open={!!toDelete} busy={busy}
                   title="Eliminar objetivo?"
                   message={`"${toDelete?.name}" e o progresso registado vão ser eliminados. Esta ação não pode ser anulada.`}
                   onConfirm={remove} onCancel={() => setToDelete(null)} />
    </>
  )

  if (isMobile) {
    return (
      <div className="goals">
        {goals.length === 0 ? (
          <div className="card">
            <div className="empty-state">
              <div className="empty-icon"><IconTarget size={22} /></div>
              <h4>Ainda sem objetivos</h4>
              <p>Cria o teu primeiro objetivo com o “+” do cabeçalho — um fundo de emergência, uma viagem, a entrada para casa.</p>
            </div>
          </div>
        ) : goals.map((g) => {
          const done = Number(g.progressPercent) >= 100
          return (
            <section key={g.id} className={`card m-goal ${done ? 'done' : ''}`} data-testid="goal-card">
              <div className="m-goal-top">
                <GoalRing percent={Number(g.progressPercent)} done={done} />
                <div className="m-goal-main">
                  <div className="goal-name">{g.name}</div>
                  {/* sem cêntimos: no cartão compacto o par poupado/meta tem de
                      caber numa linha ao lado do anel — o valor exato está no
                      formulário de edição */}
                  <div className="mono m-goal-amount">
                    {fmtMoneyShort(g.savedAmount)}
                    {!done && <span> / {fmtMoneyShort(g.targetAmount)}</span>}
                  </div>
                  <div className={`m-goal-note ${done ? 'pos' : ''}`}>
                    {done
                      ? 'Objetivo atingido'
                      : `${fmtMoneyShort(g.monthlyAllocation)}/mês${g.estimatedDate
                        ? ` · ${new Date(g.estimatedDate).toLocaleDateString('pt-PT', { month: 'short', year: 'numeric' }).replace('.', '')}`
                        : ''}`}
                  </div>
                </div>
                <div className="m-goal-edit">
                  <button className="icon-btn" onClick={() => openEdit(g)} aria-label={`Editar ${g.name}`}><IconPencil size={15} /></button>
                  <button className="icon-btn danger" onClick={() => setToDelete(g)} aria-label={`Eliminar ${g.name}`}><IconTrash size={15} /></button>
                </div>
              </div>

              {!done && (
                <div className="m-goal-actions">
                  <div className="proj-input">
                    <input className="mono" type="text" inputMode="decimal" enterKeyHint="done" placeholder="Valor"
                           aria-label={`Contribuir para ${g.name}`}
                           value={contrib[g.id] ?? ''}
                           onChange={(e) => setContrib({ ...contrib, [g.id]: e.target.value })}
                           onKeyDown={(e) => e.key === 'Enter' && contribute(g)} />
                    <span>{cur}</span>
                  </div>
                  <button className="btn ink" onClick={() => contribute(g)}>Contribuir</button>
                </div>
              )}

            </section>
          )
        })}

        {modals}
      </div>
    )
  }

  return (
    <div className="goals">
      <div className="goals-head">
        <p className="dim">
          Metas de poupança · o depósito automático corre no dia escolhido de cada mês
        </p>
        <div className="page-actions">
          <button className="btn ghost" onClick={simulateDeposits}
                  title="Aplica já a alocação mensal dos objetivos com depósito automático">
            <IconRefresh size={14} /> Simular depósito mensal
          </button>
          <button className="btn" onClick={() => setAddModal(true)}><IconPlus size={14} /> Novo objetivo</button>
        </div>
      </div>

      {goals.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-icon"><IconTarget size={24} /></div>
            <h4>Ainda sem objetivos</h4>
            <p>Cria o teu primeiro objetivo — um fundo de emergência, uma viagem, a entrada para casa — e acompanha quanto falta.</p>
            <button className="btn" onClick={() => setAddModal(true)}><IconPlus size={15} /> Criar objetivo</button>
          </div>
        </div>
      ) : (
        <div className="goals-grid">
          {goals.map((g) => {
            const done = Number(g.progressPercent) >= 100
            return (
              <div className="card goal-card" key={g.id} data-testid="goal-card">
                <div className="goal-top">
                  <span className={`code-chip ${done ? 'green' : 'accent'}`}>{codeOf(g.name)}</span>
                  <span className="goal-name">{g.name}</span>
                  <span className="event-actions">
                    <button className="icon-btn" onClick={() => openEdit(g)} aria-label={`Editar ${g.name}`}><IconPencil size={14} /></button>
                    <button className="icon-btn danger" onClick={() => setToDelete(g)} aria-label={`Eliminar ${g.name}`}><IconTrash size={14} /></button>
                  </span>
                </div>

                <div>
                  <div className="goal-amounts">
                    <span className="mono big">{fmtEur(g.savedAmount)}</span>
                    <span className="of">de {fmtEur(g.targetAmount)} · {fmtPercent(g.progressPercent, 1)}</span>
                  </div>
                  <div className="progress-track">
                    <div className={`progress-fill ${done ? 'done' : ''}`}
                         style={{ width: `${Math.min(100, g.progressPercent)}%` }} />
                  </div>
                </div>

                <div className="goal-meta">
                  <span className="badge accent">{fmtEur(g.monthlyAllocation)}/mês</span>
                  {g.autoDeposit && <span className="badge live">Auto · dia {g.contributionDay ?? 1}</span>}
                  {done ? (
                    <span className="badge live"><IconCheck size={12} /> Atingido</span>
                  ) : (
                    <>
                      {g.monthsRemaining != null && (
                        <span className="badge">{g.monthsRemaining} {g.monthsRemaining === 1 ? 'mês' : 'meses'}</span>
                      )}
                      {g.estimatedDate && (
                        <span className="badge"><IconCalendar size={12} /> {new Date(g.estimatedDate).toLocaleDateString('pt-PT', { month: 'short', year: 'numeric' })}</span>
                      )}
                    </>
                  )}
                </div>

                {!done && (
                  <div className="goal-contribute">
                    <div className="proj-input">
                      <input className="mono" type="text" inputMode="decimal" enterKeyHint="done" placeholder="Valor"
                             aria-label={`Contribuir para ${g.name}`}
                             value={contrib[g.id] ?? ''}
                             onChange={(e) => setContrib({ ...contrib, [g.id]: e.target.value })}
                             onKeyDown={(e) => e.key === 'Enter' && contribute(g)} />
                      <span>{cur}</span>
                    </div>
                    <button className="btn ghost small" onClick={() => contribute(g)}>Contribuir</button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {modals}
    </div>
  )
}
