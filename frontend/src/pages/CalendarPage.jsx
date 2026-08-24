import { useEffect, useMemo, useState } from 'react'
import { api, fmtEur, fmtSigned, fmtMoneyShort, toEur, fromEur, getCurrencySymbol, parseAmount } from '../api'
import Modal, { ConfirmDialog } from '../components/Modal'
import DatePicker from '../components/DatePicker'
import Dropdown from '../components/Dropdown'
import { useToast } from '../components/Toast'
import { useMonth, fmtMonthShort as fmtMonth, fmtDayMonth, monthAbbr } from '../components/MonthContext'
import { useIntent } from '../components/IntentContext'
import { useIsMobile } from '../components/useMediaQuery'
import { codeOf } from '../components/code'
import {
  IconWallet, IconHome, IconRepeat, IconBell, IconCoins, IconInfo, IconPlus,
  IconArrowUp, IconArrowDown, IconPencil, IconTrash, IconPause, IconPlay,
} from '../components/Icons'

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

const EMPTY_FORM = { name: '', category: 'OTHER', inflow: false, amount: '', frequency: 'MONTHLY', dayOfMonth: '1', eventDate: '', active: true }

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
  const { month, step } = useMonth()
  const isMobile = useIsMobile()
  const [data, setData] = useState(null)
  const [forecast, setForecast] = useState(null)
  const [addModal, setAddModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [toDelete, setToDelete] = useState(null)
  const [dayModal, setDayModal] = useState(null) // { day, occ } enquanto está aberto
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
    setDayModal(null)
    setEditing(null)
    setForm({ ...EMPTY_FORM, dayOfMonth: String(day), eventDate: iso })
    setAddModal(true)
  }
  const openEdit = (e) => {
    setDayModal(null)
    setEditing(e)
    setForm({
      name: e.name, category: e.category, inflow: e.inflow, amount: String(fromEur(e.amount)),
      frequency: e.frequency, dayOfMonth: String(e.dayOfMonth || 1), eventDate: e.eventDate || '',
      active: e.active !== false,
    })
    setAddModal(true)
  }

  /**
   * Uma ocorrência do calendário (ou da agenda) é a projeção de algo: de um
   * evento manual — e esse edita-se aqui — ou de um reforço de investimento /
   * depósito de objetivo, que se muda no ecrã respetivo.
   */
  const eventOf = (occ) =>
    (occ.source === 'MANUAL' || occ.source == null)
      ? data.events.find((e) => e.id === occ.eventId) ?? null
      : null

  /**
   * Tocar num dia: se já lá houver movimentos, abre a lista desse dia (é de lá
   * que se editam); se estiver vazio, vai direto ao formulário — era o que o
   * dia vazio já fazia e continua a ser o gesto mais rápido.
   */
  const openDay = (day) => {
    const occ = (data.occurrences || []).filter((o) => Number(o.date.slice(8, 10)) === day)
    if (occ.length === 0) openAddForDay(day)
    else setDayModal({ day, occ })
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
      active: form.active,
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

  /**
   * Pausa ou retoma um evento sem abrir o formulário.
   *
   * O `PUT` do backend substitui o evento inteiro, por isso reenvia-se tudo com
   * o `active` trocado. Pausado, o evento continua guardado mas o backend
   * deixa de gerar ocorrências — sai do calendário e da previsão de saldo.
   */
  const toggleActive = async (e) => {
    const next = e.active === false
    setBusy(true)
    try {
      await api.updateCalendarEvent(e.id, {
        name: e.name, category: e.category, inflow: e.inflow, amount: e.amount,
        frequency: e.frequency, dayOfMonth: e.dayOfMonth, eventDate: e.eventDate,
        active: next,
      })
      await reloadAll()
      toast.success(next ? 'Evento retomado' : 'Evento pausado',
        next ? `"${e.name}" volta a contar no calendário.`
          : `"${e.name}" fica guardado, mas fora do calendário e da previsão.`)
    } catch (err) { toast.error('Erro ao guardar', err.message) }
    finally { setBusy(false) }
  }

  const remove = async () => {
    setBusy(true)
    try {
      await api.deleteCalendarEvent(toDelete.id)
      setToDelete(null)
      setDayModal(null)
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

  // Os modais servem as duas vistas: declarados uma vez, injetados em ambas.
  const modals = (
    <>
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
        {/* só ao editar: criar um evento já pausado não é gesto nenhum */}
        {editing && (
          <div className="field full">
            <label className="check-row">
              <input type="checkbox" checked={form.active}
                     onChange={(e) => setForm({ ...form, active: e.target.checked })} />
              <span>Evento ativo</span>
            </label>
            <span className="hint">
              Um evento pausado fica guardado mas deixa de contar no calendário e na previsão de
              saldo — é o que fazer a uma subscrição que se cancelou este mês e se pode retomar.
            </span>
          </div>
        )}
      </div>
    </Modal>

    {/* A lista de um dia: é daqui que se editam os movimentos que já lá estão —
        antes tocar num dia só sabia criar mais um. */}
    <Modal open={!!dayModal} onClose={() => setDayModal(null)} width={480}
           title={dayModal ? `${dayModal.day} de ${fmtMonth(month)}` : ''}
           subtitle="Movimentos previstos neste dia."
           footer={
             <>
               <button className="btn ghost" onClick={() => setDayModal(null)}>Fechar</button>
               <button className="btn" onClick={() => openAddForDay(dayModal.day)}>
                 <IconPlus size={14} /> Novo evento
               </button>
             </>
           }>
      <ul className="event-list">
        {(dayModal?.occ || []).map((o, i) => {
          const ev = eventOf(o)
          const meta = CATEGORY_META[o.category] || CATEGORY_META.OTHER
          return (
            <li key={i} className="event-row" data-testid="day-occurrence">
              <span className={`code-chip ${o.inflow ? 'green' : 'red'}`}>{occCode(o)}</span>
              <div className="event-main">
                <strong>{o.name}</strong>
                <span>
                  {o.source === 'INVESTMENT' ? 'Reforço automático · muda-se na Carteira'
                    : o.source === 'GOAL' ? 'Depósito automático · muda-se nos Objetivos'
                      : `${meta.label} · ${ev?.frequency === 'MONTHLY' ? `todo dia ${ev.dayOfMonth}`
                        : ev?.frequency === 'YEARLY' ? 'anual' : 'única'}`}
                </span>
              </div>
              <span className={`mono ${o.inflow ? 'pos' : 'neg'}`}>{o.inflow ? '+' : '−'}{fmtEur(o.amount)}</span>
              <div className="event-actions">
                {ev ? (
                  <>
                    <button className="icon-btn" onClick={() => openEdit(ev)}
                            aria-label={`Editar ${o.name}`}><IconPencil size={14} /></button>
                    <button className="icon-btn danger" onClick={() => setToDelete(ev)}
                            aria-label={`Eliminar ${o.name}`}><IconTrash size={14} /></button>
                  </>
                ) : <span className="badge">auto</span>}
              </div>
            </li>
          )
        })}
      </ul>
    </Modal>

    <ConfirmDialog open={!!toDelete} busy={busy}
                   title="Eliminar evento?"
                   message={`"${toDelete?.name}" vai ser eliminado do calendário.`}
                   onConfirm={remove} onCancel={() => setToDelete(null)} />
    </>
  )

  if (isMobile) {
    const horizon = (forecast?.points || []).reduce(
      (t, pt) => t + (pt.inflow ? 1 : -1) * Number(pt.amount), 0)

    return (
      <div className="cal">
        {/* ---------- grelha compacta ---------- */}
        <section className="card m-cal">
          <div className="m-cal-head">
            <span>{fmtMonth(month)}</span>
            <div className="m-cal-nav">
              <button type="button" onClick={() => step(-1)} aria-label="Mês anterior">‹</button>
              <button type="button" onClick={() => step(1)} aria-label="Mês seguinte">›</button>
            </div>
          </div>
          <div className="m-cal-grid mono">
            {WEEKDAYS.map((w) => <span key={w} className="m-cal-wd">{w[0]}</span>)}
            {grid.map((cell, i) => {
              if (!cell) return <span key={i} />
              // a célula toma a cor do que domina o dia: entrada, saída ou nada
              const inflow = cell.occ.some((o) => o.inflow)
              const outflow = cell.occ.some((o) => !o.inflow)
              const tone = cell.occ.length === 0 ? '' : cell.net >= 0 ? 'in' : outflow ? 'out' : 'in'
              return (
                <button key={i} type="button"
                        className={`m-cal-day ${tone} ${isToday(cell.day) ? 'today' : ''}`}
                        aria-label={cell.occ.length
                          ? `Dia ${cell.day}: ${cell.occ.length} evento(s)`
                          : `Adicionar evento no dia ${cell.day}`}
                        onClick={() => openDay(cell.day)}>
                  {cell.day}
                  {inflow && outflow && <span className="m-cal-both" aria-hidden="true" />}
                </button>
              )
            })}
          </div>
        </section>

        {/* ---------- próximos 60 dias ---------- */}
        <div className="m-cal-forecast">
          <div className="m-cal-forecast-top">
            <span>Próximos 60 dias</span>
            <span className="mono">{horizon >= 0 ? '+' : '−'}{fmtEur(Math.abs(horizon))}</span>
          </div>
          <div className="m-cal-forecast-sub">
            {forecast?.hasBalance
              ? <>Saldo previsto a 60 dias <strong className="mono">{fmtEur(forecast.endBalance)}</strong></>
              : 'Define o saldo das contas para veres a previsão'}
          </div>
        </div>

        {(!forecast || forecast.points.length === 0) ? (
          <div className="card">
            <p className="dim" style={{ padding: '4px 2px' }}>Sem movimentos previstos nos próximos 60 dias.</p>
          </div>
        ) : (
          <div className="card flush">
            {forecast.points.map((pt, i) => {
              // os pontos que vêm de um evento manual abrem o formulário; os
              // automáticos não têm nada para editar aqui
              const ev = eventOf(pt)
              const Row = ev ? 'button' : 'div'
              return (
                <Row key={i} className="m-cal-row" type={ev ? 'button' : undefined}
                     onClick={ev ? () => openEdit(ev) : undefined}
                     aria-label={ev ? `Editar ${pt.name}` : undefined}>
                  <div className="m-cal-date">
                    <div className="mono">{new Date(pt.date).toLocaleDateString('pt-PT', { day: '2-digit' })}</div>
                    <div>{monthAbbr(new Date(pt.date))}</div>
                  </div>
                  <div className="row-main">
                    <strong>{pt.name}</strong>
                    <small>
                      {pt.source === 'INVESTMENT' ? 'Investimento automático'
                        : pt.source === 'GOAL' ? 'Objetivo · transferência'
                          : (CATEGORY_META[pt.category] || CATEGORY_META.OTHER).label}
                    </small>
                  </div>
                  <span className={`mono ${pt.inflow ? 'pos' : 'neg'}`}>
                    {pt.inflow ? '+' : '−'}{fmtEur(pt.amount)}
                  </span>
                </Row>
              )
            })}
          </div>
        )}

        {/* ---------- eventos ---------- */}
        <div className="m-listhead">
          <span>{data.events.length} evento(s)</span>
          <button type="button" className="m-link" onClick={openAdd}>Novo</button>
        </div>
        {data.events.length > 0 && (
          <div className="card flush">
            {data.events.map((e) => (
              <button key={e.id} type="button" className={`m-cal-row${e.active === false ? ' paused' : ''}`}
                      onClick={() => openEdit(e)}>
                <span className={`cat-icon ${e.inflow ? 'green' : 'red'}`}>{occCode(e)}</span>
                <div className="row-main">
                  <strong>{e.name}</strong>
                  <small>
                    {e.frequency === 'MONTHLY' ? `todo dia ${e.dayOfMonth}` : e.frequency === 'YEARLY' ? `anual · ${e.eventDate}` : e.eventDate}
                    {e.active === false && ' · pausado'}
                  </small>
                </div>
                <span className={`mono ${e.inflow ? 'pos' : 'neg'}`}>{e.inflow ? '+' : '−'}{fmtEur(e.amount)}</span>
              </button>
            ))}
          </div>
        )}

        {modals}
      </div>
    )
  }

  return (
    <div className="cal">
      {reminders.length > 0 && (
        <div className="reminders">
          <span className="reminders-title">Lembretes · 7 dias</span>
          <div className="reminders-list">
            {reminders.map((p, i) => (
              <span key={i} className={`mono reminder-chip ${p.inflow ? 'in' : 'out'}`}>
                {fmtDayMonth(p.date)} · {p.name} · {p.inflow ? '+' : '−'}{fmtEur(p.amount)}
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
              <span className={Number(data.net) >= 0 ? 'pos' : 'neg'}>= {fmtSigned(data.net)}</span>
            </div>
          </div>

          <div className="cal-grid">
            {WEEKDAYS.map((w) => <div key={w} className="cal-weekday">{w}</div>)}
            {grid.map((cell, i) => (
              <div key={i}
                   className={`cal-cell ${cell ? '' : 'empty'} ${cell && isToday(cell.day) ? 'today' : ''}`}
                   role={cell ? 'button' : undefined}
                   tabIndex={cell ? 0 : undefined}
                   aria-label={cell
                     ? (cell.occ.length
                       ? `Dia ${cell.day}: ${cell.occ.length} evento(s)`
                       : `Adicionar evento no dia ${cell.day}`)
                     : undefined}
                   onClick={cell ? () => openDay(cell.day) : undefined}
                   onKeyDown={cell ? (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); openDay(cell.day) } } : undefined}>
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
                {forecast.points.map((p, i) => {
                  // o que vem de um evento manual edita-se aqui mesmo; o que é
                  // automático muda-se na Carteira ou nos Objetivos
                  const ev = eventOf(p)
                  return (
                    <li key={i} className={ev ? 'editable' : undefined}
                        role={ev ? 'button' : undefined} tabIndex={ev ? 0 : undefined}
                        aria-label={ev ? `Editar ${p.name}` : undefined}
                        onClick={ev ? () => openEdit(ev) : undefined}
                        onKeyDown={ev ? (k) => { if (k.key === 'Enter' || k.key === ' ') { k.preventDefault(); openEdit(ev) } } : undefined}>
                      <div className="mono agenda-date">
                        <strong>{new Date(p.date).toLocaleDateString('pt-PT', { day: '2-digit' })}</strong>
                        <span>{monthAbbr(new Date(p.date))}</span>
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
                  )
                })}
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
                    <li key={e.id} className={`event-row${e.active === false ? ' paused' : ''}`}>
                      <span className={`code-chip ${e.inflow ? 'green' : 'red'}`}>{occCode(e)}</span>
                      <div className="event-main">
                        <strong>{e.name}</strong>
                        <span>
                          {meta.label} · {e.frequency === 'MONTHLY' ? `todo dia ${e.dayOfMonth}` : e.frequency === 'YEARLY' ? `anual · ${e.eventDate}` : e.eventDate}
                          {e.active === false && <> · <span className="badge warn">pausado</span></>}
                        </span>
                      </div>
                      <span className={`mono ${e.inflow ? 'pos' : 'neg'}`}>{e.inflow ? '+' : '−'}{fmtEur(e.amount)}</span>
                      <div className="event-actions">
                        <button className="icon-btn" onClick={() => toggleActive(e)}
                                aria-label={`${e.active === false ? 'Retomar' : 'Pausar'} ${e.name}`}
                                title={e.active === false ? 'Retomar' : 'Pausar'}>
                          {e.active === false ? <IconPlay size={13} /> : <IconPause size={13} />}
                        </button>
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

      {modals}
    </div>
  )
}
