import { Fragment, useEffect, useRef, useState } from 'react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { api, fmtEur, fmtPercent, toEur, fromEur, getCurrencySymbol, parseAmount } from '../api'
import Modal, { ConfirmDialog } from '../components/Modal'
import { useToast } from '../components/Toast'
import { useMonth, fmtMonthShort as fmtMonth, monthAbbr } from '../components/MonthContext'
import { useIntent } from '../components/IntentContext'
import { useIsMobile } from '../components/useMediaQuery'
import { IconChevronRight, IconPencil, IconPlus, IconPie, IconWallet, IconTrash } from '../components/Icons'

const COLORS = ['#6366f1', '#22d3ee', '#10b981', '#f59e0b', '#ef4444', '#a78bfa', '#fb923c', '#e879f9']

/** "2026-08" → "ago 26" — o formato longo não cabe num chip. */
const chipLabel = (m) => {
  const [y, mo] = m.split('-').map(Number)
  return `${monthAbbr(new Date(y, mo - 1, 1))} ${String(y).slice(2)}`
}

const EMPTY_ALLOC = { name: '', mode: 'percentage', value: '', color: COLORS[0] }

// cor de uma categoria: a escolhida pelo utilizador, ou a cor da paleta pela ordem
const allocColor = (a, i) => a.color || COLORS[i % COLORS.length]
const EMPTY_ITEM = { name: '', value: '' }

function ChartTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  return (
    <div className="chart-tooltip">
      <div className="tt-label">{payload[0].name}</div>
      <div className="tt-value">{fmtEur(payload[0].value)}</div>
    </div>
  )
}

export default function IncomePage() {
  const toast = useToast()
  const cur = getCurrencySymbol()
  const { month, setMonth, step } = useMonth()
  const isMobile = useIsMobile()
  const [data, setData] = useState(null)
  const [incomeModal, setIncomeModal] = useState(false)
  const [incomeInput, setIncomeInput] = useState('')
  const [allocModal, setAllocModal] = useState(false)
  const [allocForm, setAllocForm] = useState(EMPTY_ALLOC)
  const [allocBaseline, setAllocBaseline] = useState(EMPTY_ALLOC)   // estado do form ao abrir (para detetar alterações)
  const [allocEditId, setAllocEditId] = useState(null)   // null = adicionar; id = editar
  const [toDelete, setToDelete] = useState(null)
  const [expanded, setExpanded] = useState(() => new Set())
  const [itemModal, setItemModal] = useState(null)   // { alloc, item } — item null = adicionar
  const [itemForm, setItemForm] = useState(EMPTY_ITEM)
  const [itemToDelete, setItemToDelete] = useState(null)  // { item, allocName }
  const [busy, setBusy] = useState(false)
  const copiedNotified = useRef(false)

  const load = (month) =>
    api.getIncome(month).then((d) => {
      setData(d)
      if (d.copiedFrom && !copiedNotified.current) {
        copiedNotified.current = true
        toast.info('Novo mês iniciado', `Categorias e rendimento copiados de ${fmtMonth(d.copiedFrom)} — ajusta o que for preciso.`)
      }
      return d
    })

  useEffect(() => {
    setData(null)
    load(month).catch(() => toast.error('Erro', 'Não foi possível carregar os dados.'))
  }, [month])


  const saveIncome = async () => {
    setBusy(true)
    try {
      const eur = toEur(parseAmount(incomeInput) || 0)
      setData(await api.setIncome(eur, data.month))
      setIncomeModal(false)
      toast.success('Rendimento atualizado', `${fmtMonth(data.month)}: ${fmtEur(eur)}.`)
    } catch (e) { toast.error('Erro ao guardar', e.message) }
    finally { setBusy(false) }
  }

  const openAddAlloc = () => {
    // por omissão sugere a próxima cor da paleta ainda "livre" pela ordem das categorias
    const nextColor = COLORS[(data?.allocations?.length ?? 0) % COLORS.length]
    const form = { ...EMPTY_ALLOC, color: nextColor }
    setAllocEditId(null)
    setAllocForm(form)
    setAllocBaseline(form)
    setAllocModal(true)
  }

  useIntent('newAllocation', openAddAlloc)

  const openEditAlloc = (a, i) => {
    const form = {
      name: a.name,
      mode: a.fixedAmount != null ? 'fixed' : 'percentage',
      value: String(a.fixedAmount != null ? fromEur(a.fixedAmount) : a.percentage),
      color: allocColor(a, i),
    }
    setAllocEditId(a.id)
    setAllocForm(form)
    setAllocBaseline(form)
    setAllocModal(true)
  }

  const closeAllocModal = () => { setAllocModal(false); setAllocEditId(null); setAllocForm(EMPTY_ALLOC) }
  // form "sujo" = difere do estado com que foi aberto (para avisar antes de descartar)
  const allocDirty = JSON.stringify(allocForm) !== JSON.stringify(allocBaseline)

  const saveAlloc = async () => {
    const value = parseAmount(allocForm.value)
    if (!allocForm.name.trim() || !value || value <= 0) {
      toast.error('Campos em falta', allocForm.mode === 'percentage'
        ? 'Indica o nome da categoria e a percentagem.'
        : 'Indica o nome da categoria e o valor mensal.')
      return
    }
    setBusy(true)
    try {
      const base = allocForm.mode === 'percentage'
        ? { name: allocForm.name.trim(), percentage: value }
        : { name: allocForm.name.trim(), fixedAmount: toEur(value) }
      const payload = { ...base, color: allocForm.color }
      if (allocEditId) {
        setData(await api.updateAllocation(allocEditId, payload))
        toast.success('Categoria atualizada', `"${allocForm.name.trim()}" em ${fmtMonth(data.month)}.`)
      } else {
        setData(await api.addAllocation(payload, data.month))
        toast.success('Categoria adicionada', `"${allocForm.name.trim()}" incluída em ${fmtMonth(data.month)}.`)
      }
      closeAllocModal()
    } catch (e) { toast.error(allocEditId ? 'Erro ao guardar' : 'Erro ao adicionar', e.message) }
    finally { setBusy(false) }
  }

  // muda apenas a cor de uma categoria existente (mantém nome e regra)
  const recolor = async (alloc, color) => {
    try {
      const rule = alloc.fixedAmount != null
        ? { fixedAmount: Number(alloc.fixedAmount) }
        : { percentage: Number(alloc.percentage) }
      setData(await api.updateAllocation(alloc.id, { name: alloc.name, ...rule, color }))
    } catch (e) { toast.error('Erro ao mudar a cor', e.message) }
  }

  const removeAlloc = async () => {
    setBusy(true)
    try {
      setData(await api.deleteAllocation(toDelete.id))
      toast.info('Categoria removida', `"${toDelete.name}" removida de ${fmtMonth(data.month)}.`)
      setToDelete(null)
    } catch (e) { toast.error('Erro ao remover', e.message) }
    finally { setBusy(false) }
  }

  const toggleExpand = (id) => setExpanded((prev) => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  const openAddItem = (alloc) => { setItemForm(EMPTY_ITEM); setItemModal({ alloc, item: null }) }
  const openEditItem = (alloc, item) => {
    setItemForm({ name: item.name, value: String(fromEur(item.amount)) })
    setItemModal({ alloc, item })
  }

  const saveItem = async () => {
    const value = parseAmount(itemForm.value)
    if (!itemForm.name.trim() || itemForm.value === '' || Number.isNaN(value) || value < 0) {
      toast.error('Campos em falta', 'Indica o nome e um valor (0 ou maior) para o item.')
      return
    }
    setBusy(true)
    try {
      const payload = { name: itemForm.name.trim(), amount: toEur(value) }
      const { alloc, item } = itemModal
      setData(item
        ? await api.updateAllocationItem(item.id, payload)
        : await api.addAllocationItem(alloc.id, payload))
      setExpanded((prev) => new Set(prev).add(alloc.id))
      setItemModal(null)
      setItemForm(EMPTY_ITEM)
      toast.success(item ? 'Item atualizado' : 'Item adicionado', `"${payload.name}" em "${alloc.name}".`)
    } catch (e) { toast.error('Erro ao guardar', e.message) }
    finally { setBusy(false) }
  }

  const removeItem = async () => {
    setBusy(true)
    try {
      setData(await api.deleteAllocationItem(itemToDelete.item.id))
      toast.info('Item removido', `"${itemToDelete.item.name}" removido de "${itemToDelete.allocName}".`)
      setItemToDelete(null)
    } catch (e) { toast.error('Erro ao remover', e.message) }
    finally { setBusy(false) }
  }

  if (!data) {
    return (
      <div className="income">
        <div className="skeleton" style={{ height: 84, borderRadius: 20 }} />
        <div className="income-grid">
          <div className="skeleton" style={{ height: 320, borderRadius: 20 }} />
          <div className="skeleton" style={{ height: 320, borderRadius: 20 }} />
        </div>
      </div>
    )
  }

  const income = Number(data.monthlyIncome)
  const totalPct = Number(data.totalPercentage)
  const overAllocated = income > 0 && Number(data.unallocated) < 0
  const pieData = data.allocations.map((a, i) => ({ name: a.name, value: Number(a.amount), color: allocColor(a, i) }))
  if (Number(data.unallocated) > 0.005) pieData.push({ name: 'Não alocado', value: Number(data.unallocated), color: COLORS[pieData.length % COLORS.length] })
  const donutTotal = pieData.reduce((s, d) => s + d.value, 0)

  const isPct = allocForm.mode === 'percentage'
  const formValue = parseAmount(allocForm.value) || 0
  const formHint = !formValue ? null
    : isPct
      ? (income > 0 ? `≈ ${fmtEur(income * formValue / 100)} por mês` : null)
      : (income > 0 ? `≈ ${fmtPercent(formValue / income * 100, 1)} do rendimento` : null)

  /**
   * Meses que já têm rendimento registado, do mais recente para trás.
   *
   * O seletor de mês anda de um em um sem fim à vista: sem isto não havia como
   * saber onde é que os dados começam nem chegar a um mês distante sem clicar
   * doze vezes. A lista vem do `availableMonths` da resposta.
   */
  const known = [...(data.availableMonths || [])].sort().reverse().slice(0, 12)
  const monthChips = known.length > 1 ? (
    <div className="month-chips" role="group" aria-label="Meses com rendimento registado">
      {known.map((m) => (
        // compara com o mês que a resposta traz, não com o do contexto: é esse
        // que está mesmo em ecrã (o backend resolve o pedido sem mês)
        <button key={m} type="button" className={`month-chip mono ${m === data.month ? 'active' : ''}`}
                aria-current={m === data.month ? 'true' : undefined}
                onClick={() => setMonth(m)}>
          {chipLabel(m)}
        </button>
      ))}
    </div>
  ) : null

  // Os modais servem as duas vistas: declarados uma vez, injetados em ambas.
  const modals = (
    <>
      <Modal open={incomeModal} onClose={() => setIncomeModal(false)} onSubmit={saveIncome} busy={busy}
           title={`Rendimento de ${fmtMonth(data.month)}`}
           subtitle="Valor líquido que recebeste (ou vais receber) neste mês." width={420}
           footer={
             <>
               <button className="btn ghost" onClick={() => setIncomeModal(false)}>Cancelar</button>
               <button className="btn" onClick={saveIncome} disabled={busy}>{busy ? 'A guardar…' : 'Guardar'}</button>
             </>
           }>
      <div className="field">
        <label>Rendimento do mês</label>
        <div className="input-affix">
          <input type="text" inputMode="decimal" enterKeyHint="done" autoFocus aria-label="Rendimento do mês" value={incomeInput}
                 onChange={(e) => setIncomeInput(e.target.value)} />
          <span className="affix">{cur}</span>
        </div>
      </div>
    </Modal>

    <Modal open={allocModal} onClose={closeAllocModal} dirty={allocDirty} onSubmit={saveAlloc} busy={busy}
           title={allocEditId ? 'Editar categoria' : 'Nova categoria'}
           subtitle={allocEditId
             ? `Ajusta a categoria de ${fmtMonth(data.month)}.`
             : `Reserva uma parte do rendimento de ${fmtMonth(data.month)}.`} width={440}
           footer={
             <>
               <button className="btn ghost" onClick={closeAllocModal}>Cancelar</button>
               <button className="btn" onClick={saveAlloc} disabled={busy}>
                 {busy ? 'A guardar…' : allocEditId ? 'Guardar' : 'Adicionar'}
               </button>
             </>
           }>
      <div className="form-grid">
        <div className="field full">
          <label>Nome</label>
          <input placeholder="Ex: Poupança, Renda…" autoFocus value={allocForm.name}
                 onChange={(e) => setAllocForm({ ...allocForm, name: e.target.value })} />
        </div>
        <div className="field full">
          <label>Tipo de regra</label>
          <div className="mode-toggle">
            <button type="button" className={isPct ? 'active' : ''}
                    onClick={() => setAllocForm({ ...allocForm, mode: 'percentage' })}>
              Percentagem
            </button>
            <button type="button" className={!isPct ? 'active' : ''}
                    onClick={() => setAllocForm({ ...allocForm, mode: 'fixed' })}>
              Valor fixo
            </button>
          </div>
          <span className="hint">
            {isPct
              ? 'A categoria acompanha o rendimento — se ele mudar, o valor ajusta-se.'
              : 'A categoria fica sempre com o mesmo valor em euros, independentemente do rendimento.'}
          </span>
        </div>
        <div className="field full">
          <label>{isPct ? 'Percentagem do rendimento' : 'Valor mensal'}</label>
          <div className="input-affix">
            <input type="text" inputMode="decimal" enterKeyHint="done"
                   placeholder={isPct ? 'Ex: 30' : 'Ex: 400'} value={allocForm.value}
                   onChange={(e) => setAllocForm({ ...allocForm, value: e.target.value })} />
            <span className="affix">{isPct ? '%' : cur}</span>
          </div>
          {formHint && <span className="hint">{formHint}</span>}
        </div>
        <div className="field full">
          <label>Cor</label>
          <div className="color-picker">
            {COLORS.map((c) => (
              <button type="button" key={c}
                      className={`color-swatch ${allocForm.color?.toLowerCase() === c ? 'selected' : ''}`}
                      style={{ background: c }} title={c}
                      onClick={() => setAllocForm({ ...allocForm, color: c })} />
            ))}
            <label className="color-custom" style={{ background: allocForm.color }}
                   title="Cor personalizada (RGB)">
              <input type="color" value={allocForm.color || COLORS[0]}
                     onChange={(e) => setAllocForm({ ...allocForm, color: e.target.value })} />
              <IconPlus size={13} />
            </label>
          </div>
        </div>
      </div>
    </Modal>

    <Modal open={!!itemModal} onClose={() => setItemModal(null)} onSubmit={saveItem} busy={busy}
           title={itemModal?.item ? 'Editar item' : 'Novo item'}
           subtitle={itemModal ? `Dentro de "${itemModal.alloc.name}".` : ''} width={420}
           footer={
             <>
               <button className="btn ghost" onClick={() => setItemModal(null)}>Cancelar</button>
               <button className="btn" onClick={saveItem} disabled={busy}>
                 {busy ? 'A guardar…' : itemModal?.item ? 'Guardar' : 'Adicionar'}
               </button>
             </>
           }>
      <div className="form-grid">
        <div className="field full">
          <label>Nome</label>
          <input placeholder="Ex: Netflix, Claude, HBO…" autoFocus value={itemForm.name}
                 onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })} />
        </div>
        <div className="field full">
          <label>Valor mensal</label>
          <div className="input-affix">
            <input type="text" inputMode="decimal" enterKeyHint="done" placeholder="Ex: 12" value={itemForm.value}
                   onChange={(e) => setItemForm({ ...itemForm, value: e.target.value })} />
            <span className="affix">{cur}</span>
          </div>
        </div>
      </div>
    </Modal>

    <ConfirmDialog open={!!itemToDelete} busy={busy}
                   title="Remover item?"
                   message={`O item "${itemToDelete?.item?.name}" vai ser removido de "${itemToDelete?.allocName}".`}
                   confirmLabel="Remover"
                   onConfirm={removeItem} onCancel={() => setItemToDelete(null)} />

    <ConfirmDialog open={!!toDelete} busy={busy}
                   title="Remover categoria?"
                   message={`A categoria "${toDelete?.name}" vai ser removida de ${fmtMonth(data.month)}. Esta ação não pode ser anulada.`}
                   confirmLabel="Remover"
                   onConfirm={removeAlloc} onCancel={() => setToDelete(null)} />
    </>
  )

  if (isMobile) {
    const unalloc = Number(data.unallocated)
    const segments = data.allocations
      .map((a, i) => ({ name: a.name, color: allocColor(a, i), amount: Number(a.amount) }))
      .filter((seg) => seg.amount > 0)
    // com o rendimento sobre-alocado a soma das fatias passa dos 100% e a barra
    // transbordava o cartão — a base é o maior dos dois
    const allocated = segments.reduce((t, seg) => t + seg.amount, 0)
    const barTotal = Math.max(income, allocated)

    return (
      <div className="income">
        <div className="m-monthbar">
          <button type="button" onClick={() => step(-1)} aria-label="Mês anterior">‹</button>
          <span>{fmtMonth(month)}</span>
          <button type="button" onClick={() => step(1)} aria-label="Mês seguinte">›</button>
        </div>
        {monthChips}

        <section className="card m-hero">
          <span className="eyebrow">Rendimento mensal</span>
          <div className="mono m-hero-value">{fmtEur(income)}</div>

          <div className="m-income-src">
            <span>Rendimento líquido de {fmtMonth(data.month)}</span>
            {/* o rótulo visível é curto por causa do espaço, mas o nome acessível
                diz o que se edita — há mais do que um "Editar" no ecrã */}
            <button className="btn ghost small" aria-label="Editar rendimento"
                    onClick={() => { setIncomeInput(income ? fromEur(income) : ''); setIncomeModal(true) }}>
              <IconPencil size={13} /> Editar
            </button>
          </div>

          {/* barra empilhada com a percentagem escrita dentro de cada fatia */}
          {barTotal > 0 && (
            <div className="m-alloc-bar">
              {/* flex-grow em vez de width: com larguras em % os 3px de intervalo
                  entre fatias somavam-se aos 100% e a barra saía do cartão */}
              {segments.map((seg) => {
                const pct = (seg.amount / barTotal) * 100
                return (
                  <span key={seg.name} style={{ flex: `${pct} 1 0`, background: seg.color }}
                        title={`${seg.name}: ${fmtEur(seg.amount)}`}>
                    {pct >= 9 && <span className="mono">{fmtPercent(pct, 0)}</span>}
                  </span>
                )
              })}
              {unalloc > 0 && <span className="rest" style={{ flex: `${(unalloc / barTotal) * 100} 1 0` }} />}
            </div>
          )}

          <ul className="m-alloc-list">
            {data.allocations.map((a, i) => (
              <li key={a.id}>
                <span className="leg-swatch" style={{ background: allocColor(a, i) }} />
                <span className="m-alloc-name">{a.name}</span>
                <span className="mono">{fmtEur(a.amount)}</span>
              </li>
            ))}
            <li className="rest">
              <span className="leg-swatch" style={{ background: 'var(--track)' }} />
              <span className="m-alloc-name">Por alocar</span>
              <span className={`mono ${unalloc < 0 ? 'neg' : 'amber'}`}>{fmtEur(unalloc)}</span>
            </li>
          </ul>

          {unalloc > 0.005 && (
            <button className="btn ink m-wide m-alloc-cta" onClick={openAddAlloc}>
              Alocar os {fmtEur(unalloc)} restantes
            </button>
          )}
          {unalloc < -0.005 && (
            <p className="hint" style={{ color: 'var(--amber)', marginTop: 14 }}>
              As categorias ultrapassam o rendimento deste mês em {fmtEur(Math.abs(unalloc))}.
            </p>
          )}
        </section>

        {/* ---------- categorias, para escrutinar e editar ---------- */}
        <div className="m-listhead">
          <span>{data.allocations.length} categoria(s)</span>
          <button type="button" className="m-link" onClick={openAddAlloc}>Nova</button>
        </div>
        {data.allocations.length === 0 ? (
          <div className="card">
            <div className="empty-state">
              <div className="empty-icon"><IconPie size={22} /></div>
              <h4>Sem categorias</h4>
              <p>Divide o rendimento por percentagem (ex: 30% poupança) ou por valor fixo (ex: 400€ renda).</p>
            </div>
          </div>
        ) : (
          <div className="card flush">
            {data.allocations.map((a, i) => {
              const items = a.items ?? []
              const spent = Number(a.itemsTotal ?? 0)
              const budget = Number(a.amount)
              const over = spent > budget + 0.005
              return (
                <button key={a.id} type="button" className="m-alloc-row" onClick={() => openEditAlloc(a, i)}>
                  <span className="leg-swatch" style={{ background: allocColor(a, i) }} />
                  <span className="m-alloc-main">
                    <strong>{a.name}</strong>
                    <small>
                      {a.fixedAmount != null ? 'valor fixo' : `${fmtPercent(a.percentage ?? 0)} do rendimento`}
                      {items.length > 0 && ` · ${items.length} item(s)`}
                    </small>
                  </span>
                  <span className="m-alloc-num">
                    <strong className="mono">{fmtEur(a.amount)}</strong>
                    {items.length > 0 && (
                      <small className={`mono ${over ? 'neg' : ''}`}>{fmtEur(spent)} gasto</small>
                    )}
                  </span>
                </button>
              )
            })}
          </div>
        )}

        {modals}
      </div>
    )
  }

  return (
    <div className="income">
      <div className="card income-hero">
        <span className="hero-icon"><IconWallet size={20} /></span>
        <div className="income-hero-main">
          <div className="mono amount">{fmtEur(income)}</div>
          <div className="caption">
            Rendimento líquido de {fmtMonth(data.month)}
            {data.copiedFrom && <> · copiado de {fmtMonth(data.copiedFrom)}, ajusta o que for preciso</>}
          </div>
        </div>
        <span className={`badge ${overAllocated ? 'warn' : 'accent'}`}>{fmtPercent(totalPct, 0)} alocado</span>
        <button className="btn ghost" onClick={() => { setIncomeInput(income ? fromEur(income) : ''); setIncomeModal(true) }}>
          <IconPencil size={14} /> Editar rendimento
        </button>
      </div>

      {monthChips}

      <div className="income-grid">
        <div className="card income-breakdown">
          <div className="card-header">
            <div>
              <h3>Distribuição</h3>
              <div className="sub">Percentagem do rendimento ou valor fixo · abre para escrutinar os itens</div>
            </div>
            <button className="btn small" onClick={openAddAlloc}>
              <IconPlus size={14} /> Categoria
            </button>
          </div>

          {data.allocations.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon"><IconPie size={24} /></div>
              <h4>Sem categorias</h4>
              <p>Cria a primeira categoria para distribuir o rendimento deste mês — por percentagem (ex: 30% poupança) ou por valor fixo (ex: 400€ renda).</p>
              <button className="btn" onClick={openAddAlloc}><IconPlus size={15} /> Criar categoria</button>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="responsive">
                <thead>
                  <tr><th>Categoria</th><th>%</th><th>Valor</th><th>Itens</th><th></th></tr>
                </thead>
                <tbody>
                  {data.allocations.map((a, i) => {
                    const color = allocColor(a, i)
                    const items = a.items ?? []
                    const spent = Number(a.itemsTotal ?? 0)
                    const budget = Number(a.amount)
                    const isOpen = expanded.has(a.id)
                    const remaining = budget - spent
                    const spentPct = budget > 0 ? Math.min(100, (spent / budget) * 100) : 0
                    const overspent = spent > budget + 0.005
                    return (
                      <Fragment key={a.id}>
                        <tr className={isOpen ? 'alloc-open' : ''}>
                          <td>
                            <button className="alloc-toggle" onClick={() => toggleExpand(a.id)}
                                    aria-expanded={isOpen}
                                    aria-label={isOpen ? 'Fechar detalhe' : 'Ver detalhe'}
                                    title={isOpen ? 'Fechar detalhe' : 'Escrutinar categoria'}>
                              <IconChevronRight size={15}
                                style={{ transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }} />
                            </button>
                            <label className="alloc-color pick" style={{ background: color }}
                                   title="Mudar a cor da categoria">
                              <input type="color" value={color}
                                     onChange={(e) => recolor(a, e.target.value)} />
                            </label>
                            <span className="row-title">{a.name}</span>
                            <span className="rule-chip">
                              {a.fixedAmount != null ? 'fixo' : fmtPercent(a.percentage ?? 0)}
                            </span>
                            {items.length > 0 && <span className="item-count">{items.length}</span>}
                          </td>
                          <td data-label="% do rendimento" className={`mono ${a.fixedAmount != null ? 'dim' : ''}`}>
                            {fmtPercent(a.effectivePercentage, 1)}
                          </td>
                          <td data-label="Valor" className="mono">{fmtEur(a.amount)}</td>
                          {/* Só o que já está escrutinado em itens: o par
                              "gasto / orçamento" repetia o valor da coluna ao
                              lado. A comparação com o orçamento está no medidor
                              da linha aberta — e a cor aqui já avisa se passou. */}
                          <td data-label="Itens" className={`mono ${items.length === 0 ? 'dim' : overspent ? 'neg' : ''}`}
                              title={items.length === 0 ? undefined : `${fmtEur(spent)} de ${fmtEur(budget)}`}>
                            {items.length === 0 ? '—' : fmtEur(spent)}
                          </td>
                          <td className="actions-cell" style={{ textAlign: 'right' }}>
                            <button className="icon-btn" onClick={() => openEditAlloc(a, i)}
                                    aria-label={`Editar ${a.name}`} title="Editar categoria"><IconPencil size={14} /></button>
                            <button className="icon-btn danger" onClick={() => setToDelete(a)}
                                    aria-label={`Remover ${a.name}`} title="Remover categoria"><IconTrash size={14} /></button>
                          </td>
                        </tr>
                        {isOpen && (
                          <>
                            {items.length === 0 ? (
                              <tr className="subrow subrow-empty" style={{ '--alloc-color': color }}>
                                <td colSpan={2}>
                                  <div className="subrow-line">
                                    <span className="subrow-hint">Sem itens — ex: Netflix, Claude, HBO.</span>
                                  </div>
                                </td>
                                <td></td>
                                <td></td>
                                <td></td>
                              </tr>
                            ) : (
                              items.map((it) => (
                                <tr key={it.id} className="subrow" style={{ '--alloc-color': color }}>
                                  <td colSpan={2}>
                                    <div className="subrow-line">
                                      <span className="subrow-name" title={it.name}>{it.name}</span>
                                    </div>
                                  </td>
                                  <td className="mono subrow-amount">{fmtEur(it.amount)}</td>
                                  <td></td>
                                  <td className="subrow-actions">
                                    <button className="icon-btn" onClick={() => openEditItem(a, it)}
                                            aria-label={`Editar ${it.name}`}><IconPencil size={13} /></button>
                                    <button className="icon-btn danger"
                                            onClick={() => setItemToDelete({ item: it, allocName: a.name })}
                                            aria-label={`Remover ${it.name}`}><IconTrash size={13} /></button>
                                  </td>
                                </tr>
                              ))
                            )}
                            <tr className="subrow subrow-foot" style={{ '--alloc-color': color }}>
                              <td colSpan={2}>
                                <div className="subrow-line">
                                  <button className="btn small ghost subrow-add" onClick={() => openAddItem(a)}>
                                    <IconPlus size={12} /> Item
                                  </button>
                                  <span className={`subrow-chip${overspent ? ' over' : ''}`}>
                                    {overspent ? `${fmtEur(spent - budget)} acima` : `${fmtEur(remaining)} livre`}
                                  </span>
                                </div>
                              </td>
                              <td className={`subrow-total ${overspent ? 'neg' : 'dim'}`}>
                                {fmtEur(spent)}<span className="subrow-of"> / {fmtEur(budget)}</span>
                                <div className="subrow-meter" aria-hidden="true"
                                     title={`Gasto ${fmtEur(spent)} de ${fmtEur(budget)}`}>
                                  <div className="subrow-meter-fill"
                                       style={{ width: `${spentPct}%`, background: overspent ? 'var(--red)' : color }} />
                                </div>
                              </td>
                              <td></td>
                              <td></td>
                            </tr>
                          </>
                        )}
                      </Fragment>
                    )
                  })}
                  <tr>
                    <td className="dim">Não alocado</td>
                    <td data-label="% do rendimento" className="mono dim">{income > 0 ? fmtPercent(Math.max(0, 100 - totalPct), 1) : '—'}</td>
                    <td data-label="Valor" className={`mono ${Number(data.unallocated) < 0 ? 'neg' : 'dim'}`}>{fmtEur(data.unallocated)}</td>
                    <td></td>
                    <td></td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
          {overAllocated && (
            <p className="hint" style={{ color: 'var(--amber)' }}>
              Atenção: a soma das categorias ultrapassa o rendimento deste mês em {fmtEur(Math.abs(Number(data.unallocated)))}.
            </p>
          )}
        </div>

        <div className="card income-overview">
          <div className="card-header">
            <div>
              <h3>Visão geral</h3>
              <div className="sub">{fmtMonth(data.month)}</div>
            </div>
          </div>
          {pieData.length === 0 || (income === 0 && Number(data.totalAllocated) === 0) ? (
            <div className="empty-state">
              <div className="empty-icon"><IconPie size={24} /></div>
              <h4>Nada para mostrar</h4>
              <p>Define o rendimento deste mês e cria categorias para veres o gráfico da distribuição.</p>
            </div>
          ) : (
            <>
              <div className="donut-wrap">
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={70} outerRadius={104}
                         paddingAngle={3} strokeWidth={0}>
                      {pieData.map((d, i) => <Cell key={i} fill={d.color} />)}
                    </Pie>
                    <Tooltip content={<ChartTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="donut-center">
                  <span className="mono dc-amount">{fmtEur(donutTotal)}</span>
                  <span className="dc-label">{income > 0 ? 'Rendimento' : 'Alocado'}</span>
                </div>
              </div>
              <ul className="income-legend">
                {pieData.map((d, i) => {
                  const pct = donutTotal > 0 ? (d.value / donutTotal) * 100 : 0
                  return (
                    <li key={i} className="leg-row">
                      <span className="leg-swatch" style={{ background: d.color }} />
                      <span className="leg-name" title={d.name}>{d.name}</span>
                      <span className="mono leg-pct">{fmtPercent(pct, 0)}</span>
                      <span className="mono leg-amount">{fmtEur(d.value)}</span>
                    </li>
                  )
                })}
              </ul>
            </>
          )}
        </div>
      </div>

      {modals}
    </div>
  )
}
