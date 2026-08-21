import { useEffect, useMemo, useState } from 'react'
import { api, fmtEur, fmtMoneyShort, toEur, fromEur, getCurrencySymbol, parseAmount } from '../api'
import Modal, { ConfirmDialog } from '../components/Modal'
import DatePicker from '../components/DatePicker'
import Dropdown from '../components/Dropdown'
import { useToast } from '../components/Toast'
import { useMonth, fmtMonthShort as fmtMonth } from '../components/MonthContext'
import { useIntent } from '../components/IntentContext'
import { codeOf } from '../components/code'
import { IconWallet, IconHome, IconRepeat, IconBell, IconCoins, IconInfo, IconPlus, IconArrowUp, IconArrowDown, IconPencil, IconTrash } from '../components/Icons'

const CATEGORY_META = {
  INCOME: { label: 'Rendimento', icon: IconWallet },
  HOUSING: { label: 'Habitação', icon: IconHome },
  SUBSCRIPTION: { label: 'Subscrição', icon: IconRepeat },
  BILL: { label: 'Conta / Fatura', icon: IconBell },
  TRANSPORT: { label: 'Transporte', icon: IconInfo },
  FOOD: { label: 'Alimentação', icon: IconInfo },
  SAVING: { label: 'Poupança', icon: IconCoins },
  OTHER: { label: 'Outro', icon: IconInfo },
}
const CATEGORIES = Object.keys(CATEGORY_META)
const WEEKDAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']

const EMPTY_FORM = { name: '', category: 'OTHER', inflow: false, amount: '', frequency: 'MONTHLY', dayOfMonth: '1', eventDate: '' }

const todayIso = () => new Date().toISOString().slice(0, 10)

/** Código mono de duas letras para o quadrado de cada evento. */
const occCode = (o) => {
  if (o.source === 'INVESTMENT') return 'IN'
  if (o.source === 'GOAL') return 'OB'
  return codeOf((CATEGORY_META[o.category] || CATEGORY_META.OTHER).label)
}

export default function CalendarPage() {
  const toast = useToast()
  const cur = getCurrencySymbol()
  const { month } = useMonth()
  const [data, setData] = useState(null)
  const [forecast, setForecast] = useState(null)
  const [addModal, setAddModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [toDelete, setToDelete] = useState(null)
  const [busy, setBusy] = useState(false)

  const loadMonth = (m) => api.getCalendar(m).then(setData)
  const loadForecast = () => api.getUpcoming(60).then(setForecast)

  useEffect(() => {
    loadMonth(month).catch(() => toast.error('Erro', 'Não foi possível carregar o calendário.'))
  }, [month])
  useEffect(() => {
    loadForecast().catch(() => {})
  }, [])

  const reloadAll = async () => { await Promise.all([loadMonth(month), loadForecast()]) }

  const openAdd = () => { setEditing(null); setForm(EMPTY_FORM); setAddModal(true) }

  useIntent('newEvent', openAdd)
  const openAddForDay = (day) => {
    const iso = `${month}-${String(day).padStart(2, '0')}`
    setEditing(null)
    setForm({ ...EMPTY_FORM, dayOfMonth: String(day), eventDate: iso })
    setAddModal(true)
  }
  const openEdit = (e) => {
    setEditing(e)
    setForm({
      name: e.name, category: e.category, inflow: e.inflow, amount: String(fromEur(e.amount)),
      frequency: e.frequency, dayOfMonth: String(e.dayOfMonth || 1), eventDate: e.eventDate || '',
    })
    setAddModal(true)
  }

  const save = async () => {
    if (!form.name.trim() || !form.amount) {
      toast.error('Campos em falta', 'Indica o nome e o valor.')
      return
    }
    const payload = {
      name: form.name.trim(),
      category: form.category,
      inflow: form.inflow,
      amount: toEur(parseAmount(form.amount)),
      frequency: form.frequency,
      dayOfMonth: form.frequency === 'MONTHLY' ? Number(form.dayOfMonth) : null,
      eventDate: form.frequency === 'MONTHLY' ? null : (form.eventDate || null),
      active: true,
    }
    if (form.frequency === 'MONTHLY' && (payload.dayOfMonth < 1 || payload.dayOfMonth > 31)) {
      toast.error('Dia inválido', 'Indica um dia do mês entre 1 e 31.'); return
    }
    if (form.frequency !== 'MONTHLY' && !payload.eventDate) {
      toast.error('Data em falta', 'Indica a data do evento.'); return
    }
    setBusy(true)
    try {
      if (editing) await api.updateCalendarEvent(editing.id, payload)
      else await api.addCalendarEvent(payload)
      setAddModal(false)
      await reloadAll()
      toast.success(editing ? 'Evento atualizado' : 'Evento criado', `"${form.name.trim()}" guardado.`)
    } catch (e) { toast.error('Erro ao guardar', e.message) }
    finally { setBusy(false) }
  }

  const remove = async () => {
    setBusy(true)
    try {
      await api.deleteCalendarEvent(toDelete.id)
      setToDelete(null)
      await reloadAll()
      toast.info('Evento removido', `"${toDelete.name}" foi eliminado.`)
    } catch (e) { toast.error('Erro ao remover', e.message) }
    finally { setBusy(false) }
  }

  // grelha do mês
  const grid = useMemo(() => {
    const [y, mo] = month.split('-').map(Number)
    const lead = (new Date(y, mo - 1, 1).getDay() + 6) % 7
    const days = new Date(y, mo, 0).getDate()
    const byDay = {}
    for (const o of (data?.occurrences || [])) {
      const d = Number(o.date.slice(8, 10))
      ;(byDay[d] = byDay[d] || []).push(o)
    }
    const cells = []
    for (let i = 0; i < lead; i++) cells.push(null)
    for (let d = 1; d <= days; d++) {
      const occ = byDay[d] || []
      const net = occ.reduce((t, o) => t + (o.inflow ? 1 : -1) * Number(o.amount), 0)
      cells.push({ day: d, occ, net })
    }
    while (cells.length % 7 !== 0) cells.push(null)
    return cells
  }, [month, data])

  const isToday = (day) => {
    const t = todayIso()
    return month === t.slice(0, 7) && day === Number(t.slice(8, 10))
  }

  if (!data) {
    return <div className="skeleton" style={{ height: 460, borderRadius: 20 }} />
  }

  const reminders = (forecast?.points || []).filter((p) => {
    const days = Math.round((new Date(p.date) - new Date(todayIso())) / 86400000)
    return days >= 0 && days <= 7
  })

  return (
    <div className="cal">
      {reminders.length > 0 && (
        <div className="reminders">
          <span className="reminders-title">Lembretes · 7 dias</span>
          <div className="reminders-list">
            {reminders.map((p, i) => (
              <span key={i} className={`mono reminder-chip ${p.inflow ? 'in' : 'out'}`}>
                {new Date(p.date).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short' })} · {p.name} · {p.inflow ? '+' : '−'}{fmtEur(p.amount)}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="cal-body">
        <section className="card">
          <div className="cal-head">
            <h3>{fmtMonth(month)}</h3>
            <div className="mono cal-summary">
              <span className="pos">↑ {fmtEur(data.inflows)}</span>
              <span className="neg">↓ {fmtEur(data.outflows)}</span>
              <span className={Number(data.net) >= 0 ? 'pos' : 'neg'}>= {fmtEur(data.net)}</span>
            </div>
          </div>

          <div className="cal-grid">
            {WEEKDAYS.map((w) => <div key={w} className="cal-weekday">{w}</div>)}
            {grid.map((cell, i) => (
              <div key={i}
                   className={`cal-cell ${cell ? '' : 'empty'} ${cell && isToday(cell.day) ? 'today' : ''}`}
                   role={cell ? 'button' : undefined}
                   tabIndex={cell ? 0 : undefined}
                   aria-label={cell ? `Adicionar evento no dia ${cell.day}` : undefined}
                   onClick={cell ? () => openAddForDay(cell.day) : undefined}
                   onKeyDown={cell ? (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); openAddForDay(cell.day) } } : undefined}>
                {cell && (
                  <>
                    <span className="mono cal-daynum">{cell.day}</span>
                    <div className="cal-dots">
                      {cell.occ.slice(0, 4).map((o, j) => (
                        <span key={j} className={`cal-dot ${o.inflow ? 'in' : 'out'}`}
                              title={`${o.name} · ${o.inflow ? '+' : '−'}${fmtEur(o.amount)}`} />
                      ))}
                      {cell.occ.length > 4 && <span className="cal-more">+{cell.occ.length - 4}</span>}
                    </div>
                    {cell.occ.length > 0 && (
                      <span className={`mono cal-sum ${cell.net >= 0 ? 'pos' : 'neg'}`}>
                        {cell.net >= 0 ? '+' : '−'}{fmtMoneyShort(Math.abs(cell.net))}
                      </span>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
        </section>

        <div className="cal-side">
          <section className="card">
            <div className="card-header">
              <div>
                <h3>Próximos movimentos</h3>
                <div className="sub">
                  {forecast?.hasBalance
                    ? `Saldo em contas ${fmtEur(forecast.startingBalance)} · previsto a 60 dias ${fmtEur(forecast.endBalance)}`
                    : 'Fluxo acumulado (define o saldo das tuas contas em Contas para veres a previsão do saldo)'}
                </div>
              </div>
            </div>
            {(!forecast || forecast.points.length === 0) ? (
              <p className="dim" style={{ padding: '4px 2px' }}>Sem movimentos previstos nos próximos 60 dias.</p>
            ) : (
              <ul className="agenda">
                {forecast.points.map((p, i) => (
                  <li key={i}>
                    <div className="mono agenda-date">
                      <strong>{new Date(p.date).toLocaleDateString('pt-PT', { day: '2-digit' })}</strong>
                      <span>{new Date(p.date).toLocaleDateString('pt-PT', { month: 'short' })}</span>
                    </div>
                    <span className={`code-chip ${p.inflow ? 'green' : 'red'}`}>{occCode(p)}</span>
                    <div className="agenda-main">
                      <strong>{p.name}</strong>
                      {p.source !== 'MANUAL' && <span className="badge">auto</span>}
                    </div>
                    <div className="agenda-amounts">
                      <span className={`mono ${p.inflow ? 'pos' : 'neg'}`}>{p.inflow ? '+' : '−'}{fmtEur(p.amount)}</span>
                      {forecast.hasBalance && <span className="mono agenda-balance">{fmtEur(p.balanceAfter)}</span>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card">
            <div className="card-header">
              <div><h3>Os teus eventos</h3></div>
              <button className="btn small" onClick={openAdd}><IconPlus size={13} /> Novo evento</button>
            </div>
            {data.events.length === 0 ? (
              <div className="empty-state compact">
                <div className="empty-icon"><IconBell size={22} /></div>
                <h4>Ainda sem eventos</h4>
                <p>Adiciona o teu salário, a renda, subscrições e outras despesas recorrentes.</p>
              </div>
            ) : (
              <ul className="event-list">
                {data.events.map((e) => {
                  const meta = CATEGORY_META[e.category] || CATEGORY_META.OTHER
                  return (
                    <li key={e.id} className="event-row">
                      <span className={`code-chip ${e.inflow ? 'green' : 'red'}`}>{occCode(e)}</span>
                      <div className="event-main">
                        <strong>{e.name}</strong>
                        <span>{meta.label} · {e.frequency === 'MONTHLY' ? `todo dia ${e.dayOfMonth}` : e.frequency === 'YEARLY' ? `anual · ${e.eventDate}` : e.eventDate}</span>
                      </div>
                      <span className={`mono ${e.inflow ? 'pos' : 'neg'}`}>{e.inflow ? '+' : '−'}{fmtEur(e.amount)}</span>
                      <div className="event-actions">
                        <button className="icon-btn" onClick={() => openEdit(e)} aria-label={`Editar ${e.name}`}><IconPencil size={14} /></button>
                        <button className="icon-btn danger" onClick={() => setToDelete(e)} aria-label={`Eliminar ${e.name}`}><IconTrash size={14} /></button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        </div>
      </div>

      <Modal open={addModal} onClose={() => setAddModal(false)} onSubmit={save} busy={busy}
             title={editing ? 'Editar evento' : 'Novo evento'}
             subtitle="Salário, renda, subscrições ou qualquer movimento recorrente."
             footer={
               <>
                 <button className="btn ghost" onClick={() => setAddModal(false)}>Cancelar</button>
                 <button className="btn" onClick={save} disabled={busy}>{busy ? 'A guardar…' : 'Guardar'}</button>
               </>
             }>
        <div className="form-grid">
          <div className="field full">
            <label>Nome</label>
            <input placeholder="Ex: Salário, Renda, Netflix" autoFocus value={form.name}
                   onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="field">
            <label>Categoria</label>
            <Dropdown label="Categoria" value={form.category} onChange={(category) => {
              setForm({ ...form, category, inflow: category === 'INCOME' ? true : form.inflow })
            }} options={CATEGORIES.map((c) => ({ value: c, label: CATEGORY_META[c].label }))} />
          </div>
          <div className="field">
            <label>Tipo</label>
            <div className="seg">
              <button type="button" className={form.inflow ? 'active' : ''} onClick={() => setForm({ ...form, inflow: true })}><IconArrowUp size={13} /> Entrada</button>
              <button type="button" className={!form.inflow ? 'active' : ''} onClick={() => setForm({ ...form, inflow: false })}><IconArrowDown size={13} /> Saída</button>
            </div>
          </div>
          <div className="field">
            <label>Valor</label>
            <div className="input-affix">
              <input type="text" inputMode="decimal" placeholder="0" aria-label="Valor" value={form.amount}
                     onChange={(e) => setForm({ ...form, amount: e.target.value })} />
              <span className="affix">{cur}</span>
            </div>
          </div>
          <div className="field">
            <label>Frequência</label>
            <Dropdown label="Frequência" value={form.frequency} onChange={(frequency) => setForm({ ...form, frequency })}
                      options={[
                        { value: 'MONTHLY', label: 'Mensal' },
                        { value: 'YEARLY', label: 'Anual' },
                        { value: 'ONCE', label: 'Única' },
                      ]} />
          </div>
          {form.frequency === 'MONTHLY' ? (
            <div className="field full">
              <label>Dia do mês</label>
              <input type="number" min="1" max="31" value={form.dayOfMonth}
                     onChange={(e) => setForm({ ...form, dayOfMonth: e.target.value })} />
            </div>
          ) : (
            <div className="field full">
              <label>Data</label>
              <DatePicker value={form.eventDate}
                          onChange={(iso) => setForm({ ...form, eventDate: iso })} />
            </div>
          )}
        </div>
      </Modal>

      <ConfirmDialog open={!!toDelete} busy={busy}
                     title="Eliminar evento?"
                     message={`"${toDelete?.name}" vai ser eliminado do calendário.`}
                     onConfirm={remove} onCancel={() => setToDelete(null)} />
    </div>
  )
}
