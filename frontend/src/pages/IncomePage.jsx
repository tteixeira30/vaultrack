import { Fragment, useEffect, useRef, useState } from 'react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { api, fmtEur, toEur, fromEur, getCurrencySymbol, parseAmount } from '../api'
import Modal, { ConfirmDialog } from '../components/Modal'
import { useToast } from '../components/Toast'
import { IconChevronLeft, IconChevronRight, IconPencil, IconPlus, IconPie, IconWallet, IconTrash } from '../components/Icons'

const COLORS = ['#6366f1', '#22d3ee', '#10b981', '#f59e0b', '#ef4444', '#a78bfa', '#fb923c', '#e879f9']

const EMPTY_ALLOC = { name: '', mode: 'percentage', value: '', color: COLORS[0] }

// cor de uma categoria: a escolhida pelo utilizador, ou a cor da paleta pela ordem
const allocColor = (a, i) => a.color || COLORS[i % COLORS.length]
const EMPTY_ITEM = { name: '', value: '' }

const fmtMonth = (m) => {
  if (!m) return ''
  const label = new Date(`${m}-01T00:00:00`).toLocaleDateString('pt-PT', { month: 'long', year: 'numeric' })
  return label.charAt(0).toUpperCase() + label.slice(1)
}

// mês atual (AAAA-MM) e aritmética de meses sobre strings AAAA-MM
const currentMonth = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
const shiftMonth = (m, delta) => {
  const [y, mo] = m.split('-').map(Number)
  const d = new Date(y, mo - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
// quantos meses atrás se pode recuar para introduzir rendimento em falta
const MONTHS_BACK = 3

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
    load().catch(() => toast.error('Erro', 'Não foi possível carregar os dados.'))
  }, [])

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
      <div>
        <div className="skeleton" style={{ height: 96, marginBottom: 18 }} />
        <div className="grid grid-2">
          <div className="skeleton" style={{ height: 320 }} />
          <div className="skeleton" style={{ height: 320 }} />
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

  // navegação por meses: conjunto = meses que já têm dados ∪ janela recente
  // (mês atual e os MONTHS_BACK anteriores, para introduzir rendimento em falta).
  // Movemo-nos por este conjunto ordenado, sem passar por meses vazios distantes.
  const now = currentMonth()
  const backWindow = Array.from({ length: MONTHS_BACK + 1 }, (_, i) => shiftMonth(now, -i))
  const months = [...new Set([...(data.availableMonths ?? []), ...backWindow, data.month])]
    .filter((m) => m <= now)   // nunca avançar para além do mês atual
    .sort()
  const monthIdx = months.indexOf(data.month)
  const prevMonth = monthIdx > 0 ? months[monthIdx - 1] : null
  const nextMonth = monthIdx >= 0 && monthIdx < months.length - 1 ? months[monthIdx + 1] : null

  const goTo = (m) => {
    if (!m) return
    setData(null)
    load(m).catch(() => toast.error('Erro', 'Não foi possível carregar esse mês.'))
  }

  const isPct = allocForm.mode === 'percentage'
  const formValue = parseAmount(allocForm.value) || 0
  const formHint = !formValue ? null
    : isPct
      ? (income > 0 ? `≈ ${fmtEur(income * formValue / 100)} por mês` : null)
      : (income > 0 ? `≈ ${(formValue / income * 100).toFixed(1)}% do rendimento` : null)

  return (
    <div>
      <div className="page-head">
        <div>
          <h2>Rendimento</h2>
          <p>Regista o rendimento de cada mês e distribui-o por categorias.</p>
        </div>
        <div className="page-actions">
          <div className="month-nav">
            <button className="icon-btn" onClick={() => goTo(prevMonth)} disabled={!prevMonth}
                    aria-label="Mês anterior"
                    title={prevMonth ? fmtMonth(prevMonth) : `Só podes recuar até ${MONTHS_BACK} meses atrás`}>
              <IconChevronLeft size={17} />
            </button>
            <div className="month-label">
              <strong>{fmtMonth(data.month)}</strong>
              {data.current && <span className="badge live">atual</span>}
            </div>
            <button className="icon-btn" onClick={() => goTo(nextMonth)} disabled={!nextMonth}
                    aria-label="Mês seguinte" title={nextMonth ? fmtMonth(nextMonth) : 'Já estás no mês mais recente'}>
              <IconChevronRight size={17} />
            </button>
          </div>
        </div>
      </div>

      <div className="card income-hero">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span className="stat-icon" style={{ width: 46, height: 46 }}><IconWallet size={22} /></span>
          <div>
            <div className="amount">{fmtEur(income)}</div>
            <div className="caption">Rendimento líquido de {fmtMonth(data.month)}</div>
          </div>
        </div>
        <button className="btn ghost" onClick={() => { setIncomeInput(income ? fromEur(income) : ''); setIncomeModal(true) }}>
          <IconPencil size={15} /> Editar
        </button>
      </div>

      <div className="grid grid-2 income-grid">
        <div className="card income-breakdown">
          <div className="card-header">
            <div>
              <h3>Distribuição</h3>
              <div className="sub">Como divides o rendimento de {fmtMonth(data.month)}</div>
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <span className={`badge ${overAllocated ? 'warn' : 'accent'}`}>{totalPct.toFixed(0)}% alocado</span>
              <button className="btn small" onClick={openAddAlloc}>
                <IconPlus size={14} /> Categoria
              </button>
            </div>
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
                  <tr><th>Categoria</th><th>%</th><th>Valor</th><th></th></tr>
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
                            {items.length > 0 && <span className="item-count">{items.length}</span>}
                          </td>
                          <td data-label="% do rendimento" className={a.fixedAmount != null ? 'dim' : ''}>
                            {a.effectivePercentage != null ? `${Number(a.effectivePercentage).toFixed(1)}%` : '—'}
                          </td>
                          <td data-label="Valor">{fmtEur(a.amount)}</td>
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
                              </tr>
                            ) : (
                              items.map((it) => (
                                <tr key={it.id} className="subrow" style={{ '--alloc-color': color }}>
                                  <td colSpan={2}>
                                    <div className="subrow-line">
                                      <span className="subrow-name" title={it.name}>{it.name}</span>
                                    </div>
                                  </td>
                                  <td className="subrow-amount">{fmtEur(it.amount)}</td>
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
                            </tr>
                          </>
                        )}
                      </Fragment>
                    )
                  })}
                  <tr>
                    <td className="dim">Não alocado</td>
                    <td data-label="% do rendimento" className="dim">{income > 0 ? `${Math.max(0, 100 - totalPct).toFixed(1)}%` : '—'}</td>
                    <td data-label="Valor" className={Number(data.unallocated) < 0 ? 'neg' : 'dim'}>{fmtEur(data.unallocated)}</td>
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
              <div className="sub">Distribuição de {fmtMonth(data.month)}</div>
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
                  <span className="dc-amount">{fmtEur(donutTotal)}</span>
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
                      <span className="leg-pct">{pct.toFixed(0)}%</span>
                      <span className="leg-amount">{fmtEur(d.value)}</span>
                    </li>
                  )
                })}
              </ul>
            </>
          )}
        </div>
      </div>

      <Modal open={incomeModal} onClose={() => setIncomeModal(false)}
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
                   onChange={(e) => setIncomeInput(e.target.value)}
                   onKeyDown={(e) => e.key === 'Enter' && saveIncome()} />
            <span className="affix">{cur}</span>
          </div>
        </div>
      </Modal>

      <Modal open={allocModal} onClose={closeAllocModal} dirty={allocDirty}
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
                     onChange={(e) => setAllocForm({ ...allocForm, value: e.target.value })}
                     onKeyDown={(e) => e.key === 'Enter' && saveAlloc()} />
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

      <Modal open={!!itemModal} onClose={() => setItemModal(null)}
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
                   onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })}
                   onKeyDown={(e) => e.key === 'Enter' && saveItem()} />
          </div>
          <div className="field full">
            <label>Valor mensal</label>
            <div className="input-affix">
              <input type="text" inputMode="decimal" enterKeyHint="done" placeholder="Ex: 12" value={itemForm.value}
                     onChange={(e) => setItemForm({ ...itemForm, value: e.target.value })}
                     onKeyDown={(e) => e.key === 'Enter' && saveItem()} />
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
    </div>
  )
}
