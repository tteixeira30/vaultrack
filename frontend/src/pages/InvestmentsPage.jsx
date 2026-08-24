import { useCallback, useEffect, useState } from 'react'
import { AreaChart, Area, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import {
  api, fmtEur, fmtSigned, fmtPct, fmtMoneyShort, toEur, fromEur, getCurrencySymbol, parseAmount,
  getPrivacyMode,
} from '../api'
import Modal, { ConfirmDialog } from '../components/Modal'
import Dropdown from '../components/Dropdown'
import { useChartColors } from '../components/ThemeContext'
import { useToast } from '../components/Toast'
import { useIntent } from '../components/IntentContext'
import { useIsMobile } from '../components/useMediaQuery'
import { codeOf } from '../components/code'
import { IconCoins, IconPencil, IconPlus, IconRefresh, IconTrendingUp, IconWallet, IconSparkle, IconTrash } from '../components/Icons'

const RANGES = [
  { id: '1mo', label: '1M' },
  { id: '3mo', label: '3M' },
  { id: '6mo', label: '6M' },
  { id: '1y', label: '1A' },
]

const TYPES = [
  { id: 'STOCK', label: 'Ação' },
  { id: 'ETF', label: 'ETF' },
  { id: 'CRYPTO', label: 'Cripto' },
  { id: 'PPR', label: 'PPR' },
  { id: 'OTHER', label: 'Outro' },
]

const typeLabel = (t) => TYPES.find((x) => x.id === t)?.label ?? t

/**
 * Unidades detidas de um ativo com cotação.
 *
 * O backend calcula-as (valor ÷ preço do momento) e é com elas que segue a
 * carteira em tempo real; o formulário já prometia "calculamos ... as unidades"
 * e depois não as mostrava em lado nenhum.
 *
 * Vão até seis casas porque 0,00123456 BTC é uma posição normal. E entram no
 * modo privacidade: com o preço à vista de qualquer um, as unidades dizem o
 * valor da posição tão bem como o próprio valor.
 */
const fmtUnits = (q) => {
  if (q == null) return null
  const n = Number(q)
  if (!Number.isFinite(n) || n <= 0) return null
  if (getPrivacyMode()) return '•••• un'
  return `${new Intl.NumberFormat('pt-PT', { maximumFractionDigits: 6 }).format(n)} un`
}
// tipos sem cotação pública — símbolo não aplicável, valor sempre manual
const isManualType = (t) => t === 'PPR' || t === 'OTHER'

const EMPTY_FORM = { name: '', symbol: '', type: 'ETF', currentValue: '', gainPercent: '', monthlyContribution: '', contributionDay: '1' }

// rampa sequencial (cenários ordenados) validada para o fundo escuro;
// o pessimista é o mais saliente de propósito — a projeção é conservadora.
// o cenário personalizado (escolhido pelo utilizador) usa o ciano para se distinguir da rampa
const SCENARIO_META = {
  moderado: { label: 'Moderado', color: '#e0e7ff' },
  conservador: { label: 'Conservador', color: '#a5b4fc' },
  investido: { label: 'Total investido', color: '#5c6478', dashed: true },
  pessimista: { label: 'Pessimista', color: '#6366f1' },
  custom: { label: 'Personalizado', color: '#22d3ee' },
}

const scenarioMeta = (id) => SCENARIO_META[id] ?? { label: id, color: '#8b93a7' }

const fmtRate = (r) => `${r > 0 ? '+' : ''}${Number(r) % 1 === 0 ? Number(r) : Number(r).toFixed(1)}%/ano`

/**
 * Traça uma série como caminho SVG (o mesmo desenho do herói do Painel).
 * O design mobile mostra a evolução como sparkline sem eixos.
 */
function sparkPath(values, w, h, close) {
  if (values.length < 2) return ''
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = (max - min) || 1
  let d = ''
  values.forEach((v, i) => {
    const x = (i / (values.length - 1)) * w
    const y = h - 6 - ((v - min) / span) * (h - 14)
    d += `${i ? ' L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`
  })
  return close ? `${d} L${w} ${h} L0 ${h} Z` : d
}

/** Código curto do ativo: o ticker sem sufixo de bolsa, ou as iniciais do nome. */
function assetCode(inv) {
  if (inv.symbol) return inv.symbol.split('.')[0].slice(0, 5)
  return codeOf(inv.name)
}

function projectionDate(monthOffset) {
  const d = new Date()
  d.setMonth(d.getMonth() + monthOffset)
  return d
}

function ProjectionTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const d = projectionDate(label)
  const rows = [...payload].sort((a, b) => b.value - a.value)
  return (
    <div className="chart-tooltip">
      <div className="tt-label">{d.toLocaleDateString('pt-PT', { month: 'long', year: 'numeric' })}</div>
      {rows.map((entry) => {
        const meta = scenarioMeta(entry.dataKey)
        return (
          <div key={entry.dataKey} className="tt-row">
            <span className="alloc-color" style={{ background: meta.color, marginRight: 6 }} />
            <span className="tt-name">{meta.label}</span>
            <strong>{fmtEur(entry.value)}</strong>
          </div>
        )
      })}
    </div>
  )
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="chart-tooltip">
      <div className="tt-label">{new Date(label).toLocaleDateString('pt-PT', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
      <div className="tt-value">{fmtEur(payload[0].value)}</div>
    </div>
  )
}

export default function InvestmentsPage() {
  const toast = useToast()
  const chart = useChartColors()
  const cur = getCurrencySymbol()
  const isMobile = useIsMobile()
  const [portfolio, setPortfolio] = useState(null)
  const [history, setHistory] = useState(null)
  const [range, setRange] = useState('3mo')
  const [addModal, setAddModal] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [editing, setEditing] = useState(null)
  const [editForm, setEditForm] = useState(EMPTY_FORM)
  const [toDelete, setToDelete] = useState(null)
  const [busy, setBusy] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [projUnit, setProjUnit] = useState('anos')
  const [projHorizon, setProjHorizon] = useState(5)
  const [projMonthly, setProjMonthly] = useState('')
  const [projRate, setProjRate] = useState('')
  const [projType, setProjType] = useState('all')
  const [projParams, setProjParams] = useState({ months: 60, monthly: 0, rate: null })
  const [projection, setProjection] = useState(null)

  const load = useCallback(() => api.getInvestments().then(setPortfolio), [])


  useEffect(() => {
    load().catch(() => toast.error('Erro', 'Não foi possível carregar os investimentos.'))
    const t = setInterval(() => load().catch(() => {}), 60_000)
    return () => clearInterval(t)
  }, [load])

  // O guarda não é decorativo: no primeiro render `portfolio` é null e a
  // dependência vale `undefined`; quando o load() resolve passa ao número de
  // ativos e o efeito voltava a correr. Eram dois pedidos por visita ao ecrã —
  // e o histórico não é barato, faz uma chamada HTTP ao Yahoo/CoinGecko por
  // cada ativo. O primeiro ia sempre para o lixo.
  useEffect(() => {
    if (!portfolio) return
    setHistory(null)
    api.getPortfolioHistory(range).then(setHistory).catch(() => setHistory([]))
  }, [range, portfolio?.investments?.length])

  useEffect(() => {
    if (!portfolio) return
    api.getProjection(projParams.months, projParams.monthly, projType, projParams.rate)
      .then(setProjection)
      .catch(() => setProjection(null))
  }, [projParams, projType, portfolio?.summary?.totalCurrent])

  const applyProjection = () => {
    const h = Number(projHorizon)
    if (!h || h <= 0) {
      toast.error('Horizonte inválido', 'Indica um número de meses ou anos maior que zero.')
      return
    }
    setProjParams({
      months: Math.min(projUnit === 'anos' ? h * 12 : h, 600),
      monthly: toEur(parseAmount(projMonthly) || 0),
      rate: projRate === '' ? null : parseAmount(projRate),
    })
  }

  const refresh = async () => {
    setRefreshing(true)
    try {
      // força novas cotações no servidor (ignora a cache) em vez de reutilizar preços recentes
      setPortfolio(await api.refreshInvestments())
      setHistory(null)
      api.getPortfolioHistory(range).then(setHistory).catch(() => setHistory([]))
      toast.info('Cotações atualizadas', 'Preços obtidos em tempo real.')
    } catch { toast.error('Erro', 'Não foi possível atualizar as cotações.') }
    finally { setRefreshing(false) }
  }

  useIntent('newInvestment', () => setAddModal(true))
  // "Atualizar cotações" da paleta de comandos chega aqui
  useIntent('refreshQuotes', () => { refresh() })

  const add = async () => {
    if (!form.name.trim() || !form.currentValue) {
      toast.error('Campos em falta', 'Indica pelo menos o nome e o valor atual.')
      return
    }
    setBusy(true)
    try {
      const created = await api.addInvestment({
        name: form.name.trim(),
        symbol: form.symbol.trim() || null,
        type: form.type,
        currentValue: toEur(parseAmount(form.currentValue)),
        gainPercent: parseAmount(form.gainPercent) || 0,
        monthlyContribution: parseAmount(form.monthlyContribution) ? toEur(parseAmount(form.monthlyContribution)) : null,
        contributionDay: parseAmount(form.monthlyContribution) ? (Number(form.contributionDay) || 1) : null,
      })
      setAddModal(false)
      setForm(EMPTY_FORM)
      await load()
      if (created.live) {
        toast.success('Investimento adicionado', `${created.name} a seguir cotação em tempo real.`)
      } else if (form.symbol.trim()) {
        toast.info('Adicionado sem cotação live', `Não encontrámos "${form.symbol.trim().toUpperCase()}" — fica com valor manual.`)
      } else {
        toast.success('Investimento adicionado', `${created.name} registado com valor manual.`)
      }
    } catch (e) { toast.error('Erro ao adicionar', e.message) }
    finally { setBusy(false) }
  }

  const openEdit = (inv) => {
    setEditing(inv)
    setEditForm({
      name: inv.name,
      symbol: inv.symbol || '',
      type: inv.type,
      currentValue: inv.currentValue != null ? String(fromEur(inv.currentValue)) : '',
      gainPercent: String(inv.gainPercent ?? 0),
      monthlyContribution: inv.monthlyContribution != null ? String(fromEur(inv.monthlyContribution)) : '',
      contributionDay: String(inv.contributionDay ?? 1),
    })
  }

  const saveEdit = async () => {
    if (!editForm.name.trim() || !editForm.currentValue) {
      toast.error('Campos em falta', 'Indica pelo menos o nome e o valor atual.')
      return
    }
    setBusy(true)
    try {
      await api.updateInvestment(editing.id, {
        name: editForm.name.trim(),
        symbol: isManualType(editForm.type) ? null : (editForm.symbol.trim() || null),
        type: editForm.type,
        currentValue: toEur(parseAmount(editForm.currentValue)),
        gainPercent: parseAmount(editForm.gainPercent) || 0,
        monthlyContribution: parseAmount(editForm.monthlyContribution) ? toEur(parseAmount(editForm.monthlyContribution)) : null,
        contributionDay: parseAmount(editForm.monthlyContribution) ? (Number(editForm.contributionDay) || 1) : null,
      })
      setEditing(null)
      await load()
      toast.success('Investimento atualizado', `"${editForm.name.trim()}" foi atualizado.`)
    } catch (e) { toast.error('Erro ao atualizar', e.message) }
    finally { setBusy(false) }
  }

  const remove = async () => {
    setBusy(true)
    try {
      await api.deleteInvestment(toDelete.id)
      await load()
      toast.info('Investimento removido', `"${toDelete.name}" eliminado do portefólio.`)
      setToDelete(null)
    } catch (e) { toast.error('Erro ao remover', e.message) }
    finally { setBusy(false) }
  }

  const simulateDeposits = async () => {
    try {
      const result = await api.applyDeposits('investments')
      if (result.applied.length === 0) {
        toast.info('Sem reforços automáticos', 'Nenhum investimento tem reforço mensal definido.')
        return
      }
      await load()
      const names = result.applied.map((a) => a.name).join(', ')
      toast.success('Reforços aplicados', `${fmtEur(result.totalAmount)} em: ${names}.`)
    } catch (e) { toast.error('Erro ao aplicar reforços', e.message) }
  }

  if (!portfolio) {
    return (
      <div>
        <div className="mini-kpis" style={{ marginBottom: 11 }}>
          {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 66, borderRadius: 14 }} />)}
        </div>
        <div className="skeleton" style={{ height: 340, marginBottom: 16, borderRadius: 20 }} />
        <div className="skeleton" style={{ height: 220, borderRadius: 20 }} />
      </div>
    )
  }

  const { summary, investments } = portfolio
  const gainPos = Number(summary.totalGain) >= 0
  const gainCls = gainPos ? 'pos' : 'neg'
  const liveCount = investments.filter((i) => i.live).length

  // Os modais servem as duas vistas: declarados uma vez, injetados em ambas.
  const modals = (
    <>
      <Modal open={addModal} onClose={() => setAddModal(false)} onSubmit={add} busy={busy}
           title="Novo investimento"
           subtitle="Indica quanto vale agora e a % de ganho — calculamos o valor inicial, o lucro e as unidades."
           footer={
             <>
               <button className="btn ghost" onClick={() => setAddModal(false)}>Cancelar</button>
               <button className="btn" onClick={add} disabled={busy}>{busy ? 'A adicionar…' : 'Adicionar'}</button>
             </>
           }>
      <div className="form-grid">
        <div className="field full">
          <label>Nome</label>
          <input placeholder="Ex: MSCI World" autoFocus value={form.name}
                 onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div className="field">
          <label>Tipo</label>
          <Dropdown label="Tipo" value={form.type} onChange={(type) => setForm({ ...form, type })}
                    options={TYPES.map((t) => ({ value: t.id, label: t.label }))} />
        </div>
        <div className="field">
          <label>Símbolo {isManualType(form.type) && <span className="dim">(não aplicável)</span>}</label>
          <input placeholder={form.type === 'CRYPTO' ? 'Ex: BTC, ETH' : 'Ex: VWCE.DE, AAPL'}
                 disabled={isManualType(form.type)}
                 value={isManualType(form.type) ? '' : form.symbol}
                 onChange={(e) => setForm({ ...form, symbol: e.target.value })} />
          <span className="hint">
            {form.type === 'CRYPTO'
              ? 'Símbolo da moeda no CoinGecko.'
              : form.type === 'PPR'
                ? 'Os PPR não têm cotação pública — o valor é atualizado manualmente.'
                : form.type === 'OTHER'
                  ? 'Investimentos sem cotação pública (depósitos, PPR…).'
                  : 'Ticker do Yahoo Finance — inclui o sufixo da bolsa se aplicável.'}
          </span>
        </div>
        <div className="field">
          <label>Valor atual</label>
          <div className="input-affix">
            <input type="text" inputMode="decimal" placeholder="Ex: 1500" value={form.currentValue}
                   onChange={(e) => setForm({ ...form, currentValue: e.target.value })} />
            <span className="affix">{cur}</span>
          </div>
        </div>
        <div className="field">
          <label>Ganho até agora</label>
          <div className="input-affix">
            <input type="text" inputMode="decimal" placeholder="Ex: 12.5 ou -8" value={form.gainPercent}
                   onChange={(e) => setForm({ ...form, gainPercent: e.target.value })} />
            <span className="affix">%</span>
          </div>
          {form.currentValue && form.gainPercent && parseAmount(form.gainPercent) > -100 && (
            <span className="hint">
              Investimento inicial ≈ {fmtEur(toEur(parseAmount(form.currentValue)) / (1 + parseAmount(form.gainPercent) / 100))}
            </span>
          )}
        </div>
        <div className="field full">
          <label>Reforço mensal automático <span className="dim">(opcional)</span></label>
          <div className="input-affix">
            <input type="text" inputMode="decimal" placeholder="Ex: 100" value={form.monthlyContribution}
                   onChange={(e) => setForm({ ...form, monthlyContribution: e.target.value })} />
            <span className="affix">{cur}/mês</span>
          </div>
          <span className="hint">
            Adicionado ao investimento no dia escolhido de cada mês (ou com o botão "Simular reforço mensal").
            Em ativos com cotação, compra unidades ao preço do momento.
          </span>
        </div>
        {parseAmount(form.monthlyContribution) > 0 && (
          <div className="field full">
            <label>Dia do mês do reforço</label>
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
           title="Editar investimento"
           subtitle={editing?.live
             ? `Ativo com cotação em tempo real${fmtUnits(editing.quantity) ? ` (${fmtUnits(editing.quantity)})` : ''}`
               + ' — o valor atual ajusta a tua posição ao preço do momento.'
             : 'Atualiza o valor atual e a percentagem de ganho.'}
           footer={
             <>
               <button className="btn ghost" onClick={() => setEditing(null)}>Cancelar</button>
               <button className="btn" onClick={saveEdit} disabled={busy}>{busy ? 'A guardar…' : 'Guardar'}</button>
             </>
           }>
      <div className="form-grid">
        <div className="field full">
          <label>Nome</label>
          <input autoFocus aria-label="Nome" value={editForm.name}
                 onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
        </div>
        <div className="field">
          <label>Tipo</label>
          <Dropdown label="Tipo" value={editForm.type} onChange={(type) => setEditForm({ ...editForm, type })}
                    options={TYPES.map((t) => ({ value: t.id, label: t.label }))} />
        </div>
        <div className="field">
          <label>Símbolo {isManualType(editForm.type) && <span className="dim">(não aplicável)</span>}</label>
          <input placeholder={editForm.type === 'CRYPTO' ? 'Ex: BTC, ETH' : 'Ex: VWCE.DE, AAPL'}
                 disabled={isManualType(editForm.type)}
                 value={isManualType(editForm.type) ? '' : editForm.symbol}
                 onChange={(e) => setEditForm({ ...editForm, symbol: e.target.value })} />
          <span className="hint">
            {editForm.type === 'CRYPTO'
              ? 'Símbolo da moeda no CoinGecko.'
              : editForm.type === 'PPR'
                ? 'Os PPR não têm cotação pública — o valor é atualizado manualmente.'
                : editForm.type === 'OTHER'
                  ? 'Investimentos sem cotação pública (depósitos, PPR…).'
                  : 'Ticker do Yahoo Finance — inclui o sufixo da bolsa se aplicável.'}
          </span>
        </div>
        <div className="field">
          <label>Valor atual</label>
          <div className="input-affix">
            <input type="text" inputMode="decimal" aria-label="Valor atual" value={editForm.currentValue}
                   onChange={(e) => setEditForm({ ...editForm, currentValue: e.target.value })} />
            <span className="affix">{cur}</span>
          </div>
        </div>
        <div className="field">
          <label>Ganho até agora</label>
          <div className="input-affix">
            <input type="text" inputMode="decimal" aria-label="Ganho até agora" value={editForm.gainPercent}
                   onChange={(e) => setEditForm({ ...editForm, gainPercent: e.target.value })} />
            <span className="affix">%</span>
          </div>
          {editForm.currentValue && editForm.gainPercent && parseAmount(editForm.gainPercent) > -100 && (
            <span className="hint">
              Investimento inicial ≈ {fmtEur(toEur(parseAmount(editForm.currentValue)) / (1 + parseAmount(editForm.gainPercent) / 100))}
            </span>
          )}
        </div>
        <div className="field full">
          <label>Reforço mensal automático <span className="dim">(opcional)</span></label>
          <div className="input-affix">
            <input type="text" inputMode="decimal" placeholder="Sem reforço" value={editForm.monthlyContribution}
                   onChange={(e) => setEditForm({ ...editForm, monthlyContribution: e.target.value })} />
            <span className="affix">{cur}/mês</span>
          </div>
          <span className="hint">Deixa vazio ou 0 para desativar o reforço mensal.</span>
        </div>
        {parseAmount(editForm.monthlyContribution) > 0 && (
          <div className="field full">
            <label>Dia do mês do reforço</label>
            <div className="input-affix field-narrow">
              <input type="number" min="1" max="31" step="1" value={editForm.contributionDay}
                     onChange={(e) => setEditForm({ ...editForm, contributionDay: e.target.value })} />
              <span className="affix">do mês</span>
            </div>
            <span className="hint">
              Entre 1 e 31 — em meses mais curtos é aplicado no último dia.
              Mudar o dia só afeta os próximos reforços; os já aplicados não se repetem.
            </span>
          </div>
        )}
      </div>
    </Modal>

    <ConfirmDialog open={!!toDelete} busy={busy}
                   title="Eliminar investimento?"
                   message={`"${toDelete?.name}" vai ser removido do portefólio. Esta ação não pode ser anulada.`}
                   onConfirm={remove} onCancel={() => setToDelete(null)} />
    </>
  )

  if (isMobile) {
    const total = Number(summary.totalCurrent) || 0
    const spark = (history || []).map((h) => Number(h.value))

    return (
      <div className="port">
        {/* ---------- valor atual ---------- */}
        <section className="card m-hero">
          <div className="m-hero-top">
            <span className="eyebrow">Valor atual</span>
            {liveCount > 0 && (
              <span className="live-pill"><span className="dot" />ao minuto</span>
            )}
          </div>
          <div className="mono m-hero-value">{fmtEur(summary.totalCurrent)}</div>
          <div className="m-hero-pills">
            <span className={`mono pill ${gainPos ? 'pos' : 'neg'}`}>
              {gainPos ? '+' : '−'}{fmtEur(Math.abs(Number(summary.totalGain)))}
            </span>
            <span className={`mono pill ${gainPos ? 'pos' : 'neg'}`}>{fmtPct(summary.totalGainPercent)}</span>
          </div>
          {spark.length >= 2 && (
            <svg className="m-spark" viewBox="0 0 300 80" preserveAspectRatio="none" role="img"
                 aria-label="Evolução do portefólio">
              <defs>
                <linearGradient id="m-pf" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="var(--accent)" stopOpacity="0.18" />
                  <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path d={sparkPath(spark, 300, 80, true)} fill="url(#m-pf)" />
              <path d={sparkPath(spark, 300, 80, false)} fill="none" stroke="var(--accent)"
                    strokeWidth="2.4" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            </svg>
          )}
        </section>

        {/* ---------- ativos ---------- */}
        <div className="m-listhead">
          <span>{investments.length} {investments.length === 1 ? 'ativo' : 'ativos'}</span>
          <button type="button" className="m-link" onClick={simulateDeposits}>Simular reforço</button>
        </div>

        {investments.length === 0 ? (
          <div className="card">
            <div className="empty-state">
              <div className="empty-icon"><IconCoins size={22} /></div>
              <h4>Portefólio vazio</h4>
              <p>Regista os investimentos que já tens com o “+” do cabeçalho.</p>
            </div>
          </div>
        ) : (
          <div className="card flush">
            {investments.map((inv) => {
              const weight = total > 0 ? (Number(inv.currentValue) / total) * 100 : 0
              const up = Number(inv.gain) >= 0
              return (
                <button key={inv.id} type="button" className="m-asset" data-testid="asset-row"
                        onClick={() => openEdit(inv)}>
                  <span className="m-asset-code">{assetCode(inv)}</span>
                  <span className="m-asset-main">
                    <strong>{inv.name}</strong>
                    <small className="mono">
                      {inv.currentPrice != null ? `${fmtEur(inv.currentPrice)} · ` : ''}{weight.toFixed(0)}%
                    </small>
                  </span>
                  <span className="m-asset-num">
                    <strong className="mono">{fmtEur(inv.currentValue)}</strong>
                    <small className={`mono ${up ? 'pos' : 'neg'}`}>{fmtPct(inv.gainPercent)}</small>
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
    <div className="port">
      {/* ---------- resumo + ações ---------- */}
      <div className="port-top">
        <div className="mini-kpis">
          <div className="card mini-kpi">
            <span className="eyebrow">Investido</span>
            <div className="mono">{fmtEur(summary.totalInvested)}</div>
          </div>
          <div className="card mini-kpi">
            <span className="eyebrow">Valor atual</span>
            <div className="mono">{fmtEur(summary.totalCurrent)}</div>
          </div>
          <div className="card mini-kpi">
            <span className="eyebrow">Ganho</span>
            <div className={`mono ${gainCls}`}>{fmtSigned(summary.totalGain)}</div>
          </div>
          <div className="card mini-kpi">
            <span className="eyebrow">Rentabilidade</span>
            <div className={`mono ${gainCls}`}>{fmtPct(summary.totalGainPercent)}</div>
          </div>
        </div>
        <div className="port-actions">
          <button className={`icon-btn ${refreshing ? 'spin' : ''}`} onClick={refresh}
                  aria-label="Atualizar cotações" title="Atualizar cotações">
            <IconRefresh size={16} />
          </button>
          <button className="btn ghost" onClick={simulateDeposits}
                  title="Aplica já os reforços mensais definidos nos investimentos">
            Simular reforço mensal
          </button>
        </div>
      </div>

      <div className="port-charts">
        {/* ---------- evolução ---------- */}
        <section className="card">
          <div className="card-header">
            <div>
              <h3>Evolução do portefólio</h3>
              <div className="sub">Ativos com cotação pública · {liveCount} de {investments.length} com cotação</div>
            </div>
            <div className="seg-pills" role="group" aria-label="Janela do gráfico">
              {RANGES.map((r) => (
                <button key={r.id} className={range === r.id ? 'active' : ''}
                        aria-pressed={range === r.id} onClick={() => setRange(r.id)}>
                  {r.label}
                </button>
              ))}
            </div>
          </div>
          {history === null ? (
            <div className="skeleton" style={{ height: 190 }} />
          ) : history.length === 0 ? (
            <div className="empty-state compact">
              <div className="empty-icon"><IconTrendingUp size={22} /></div>
              <h4>Sem histórico</h4>
              <p>Adiciona investimentos com símbolo (ex: VWCE.DE, AAPL, BTC) para veres a evolução.</p>
            </div>
          ) : (
            <div className="port-chart-fill">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={history.map((p) => ({ ...p, value: Number(p.value) }))}
                         margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="pf-grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.34} />
                    <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" stroke={chart.axis} fontSize={10} tickMargin={8} axisLine={false} tickLine={false}
                       minTickGap={40}
                       tickFormatter={(d) => new Date(d).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short' })} />
                <YAxis stroke={chart.axis} fontSize={10} axisLine={false} tickLine={false} width={62}
                       tickFormatter={fmtMoneyShort} domain={['auto', 'auto']} />
                <Tooltip content={<ChartTooltip />} />
                <Area type="monotone" dataKey="value" stroke="var(--accent)" strokeWidth={2.2} fill="url(#pf-grad)"
                      activeDot={{ r: 4, strokeWidth: 0 }} />
              </AreaChart>
            </ResponsiveContainer>
            </div>
          )}
        </section>

        {/* ---------- projeção ---------- */}
        <section className="card">
          <div className="card-header">
            <div>
              <h3>Projeção do portefólio</h3>
              <div className="sub">Cenários deliberadamente conservadores</div>
            </div>
            <div className="seg-pills wrap" role="group" aria-label="Tipo de ativo">
              {[{ id: 'all', label: 'Tudo' }, ...TYPES].map((t) => (
                <button key={t.id} className={`sans ${projType === t.id ? 'active' : ''}`}
                        aria-pressed={projType === t.id}
                        onClick={() => setProjType(t.id)} title={t.id === 'all' ? 'Todos os ativos' : `Só ${t.label}`}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="proj-panel">
            <div className="proj-field">
              <span className="eyebrow">Horizonte</span>
              <div className="proj-row">
                <input className="mono proj-num" type="number" min="1" max={projUnit === 'anos' ? 50 : 600}
                       value={projHorizon} onChange={(e) => setProjHorizon(e.target.value)}
                       onKeyDown={(e) => e.key === 'Enter' && applyProjection()} aria-label="Horizonte" />
                <div className="seg-pills">
                  <button type="button" className={`sans ${projUnit === 'meses' ? 'active' : ''}`} onClick={() => setProjUnit('meses')}>Meses</button>
                  <button type="button" className={`sans ${projUnit === 'anos' ? 'active' : ''}`} onClick={() => setProjUnit('anos')}>Anos</button>
                </div>
              </div>
            </div>
            <div className="proj-field">
              <span className="eyebrow">Reforço mensal</span>
              <div className="proj-input">
                <input className="mono" type="text" inputMode="decimal" enterKeyHint="done" placeholder="0"
                       value={projMonthly} onChange={(e) => setProjMonthly(e.target.value)}
                       onKeyDown={(e) => e.key === 'Enter' && applyProjection()} aria-label="Reforço mensal" />
                <span>{cur}/mês</span>
              </div>
            </div>
            <div className="proj-field">
              <span className="eyebrow">Taxa própria</span>
              <div className="proj-input">
                <input className="mono" type="text" inputMode="decimal" enterKeyHint="done" placeholder="ex: 7"
                       value={projRate} onChange={(e) => setProjRate(e.target.value)}
                       onKeyDown={(e) => e.key === 'Enter' && applyProjection()} aria-label="Taxa personalizada" />
                <span>%/ano</span>
              </div>
            </div>
            <button className="icon-btn on" onClick={applyProjection}
                    aria-label="Atualizar projeção" title="Atualizar projeção">
              <IconRefresh size={16} />
            </button>
          </div>

          {!projection || Number(projection.totalContributed) === 0 ? (
            <div className="empty-state compact">
              <div className="empty-icon"><IconSparkle size={22} /></div>
              <h4>Nada para projetar</h4>
              <p>{projType === 'all'
                ? 'Adiciona investimentos ou define um reforço mensal para veres a projeção.'
                : `Não tens investimentos do tipo "${typeLabel(projType)}" — muda o filtro ou adiciona um.`}</p>
            </div>
          ) : (() => {
            const chartData = projection.scenarios[0].points.map((p, i) => {
              const row = { month: p.month }
              projection.scenarios.forEach((s) => { row[s.id] = Number(s.points[i].value) })
              return row
            })
            const longHorizon = projection.months > 24
            // em horizontes longos, um tick por ano (janeiro) evita anos repetidos no eixo
            const yearTicks = longHorizon
              ? chartData.filter((r) => projectionDate(r.month).getMonth() === 0).map((r) => r.month)
              : undefined
            // chips ordenados do cenário mais otimista para o mais pessimista
            const sortedScenarios = [...projection.scenarios]
              .sort((a, b) => b.annualRatePercent - a.annualRatePercent)
            return (
              <>
                <ResponsiveContainer width="100%" height={172}>
                  <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <XAxis dataKey="month" stroke={chart.axis} fontSize={10} tickMargin={8}
                           axisLine={false} tickLine={false} minTickGap={48} ticks={yearTicks}
                           tickFormatter={(m) => longHorizon
                             ? projectionDate(m).getFullYear()
                             : projectionDate(m).toLocaleDateString('pt-PT', { month: 'short', year: '2-digit' })} />
                    <YAxis stroke={chart.axis} fontSize={10} axisLine={false} tickLine={false} width={66}
                           tickFormatter={fmtMoneyShort} domain={['auto', 'auto']} />
                    <Tooltip content={<ProjectionTooltip />} />
                    {projection.scenarios.map((s) => {
                      const meta = scenarioMeta(s.id)
                      return (
                        <Line key={s.id} type="monotone" dataKey={s.id} stroke={meta.color} strokeWidth={2}
                              dot={false} strokeDasharray={meta.dashed ? '5 4' : undefined}
                              activeDot={{ r: 3.5, strokeWidth: 0 }} />
                      )
                    })}
                  </LineChart>
                </ResponsiveContainer>

                <div className="proj-legend">
                  {sortedScenarios.map((s) => {
                    const meta = scenarioMeta(s.id)
                    const diff = Number(s.finalValue) - Number(projection.totalContributed)
                    return (
                      <div key={s.id} className="proj-chip">
                        <span className="proj-dot" style={{ background: meta.color }} />
                        <div>
                          <small>{meta.label} ({fmtRate(s.annualRatePercent)})</small>
                          <strong className="mono">
                            {fmtEur(s.finalValue)}
                            {s.id !== 'investido' && (
                              <span className={diff >= 0 ? 'pos' : 'neg'}>
                                {' '}{diff >= 0 ? '+' : '−'}{fmtEur(Math.abs(diff))}
                              </span>
                            )}
                          </strong>
                        </div>
                      </div>
                    )
                  })}
                </div>
                <p className="hint" style={{ marginTop: 12 }}>
                  Projeção simulada com juros compostos mensais a partir de {fmtEur(projection.startValue)} atuais
                  {projType !== 'all' && <> em {typeLabel(projType)}</>}
                  {Number(projection.monthlyContribution) > 0 && <> e reforços de {fmtEur(projection.monthlyContribution)}/mês</>}.
                  Cenários base propositadamente pessimistas; retornos reais podem ser melhores ou piores. Não é aconselhamento financeiro.
                </p>
              </>
            )
          })()}
        </section>
      </div>

      {/* ---------- os meus ativos ---------- */}
      <section className="card">
        <div className="card-header">
          <div>
            <h3>Os meus ativos</h3>
            <div className="sub">Cotações convertidas para a moeda base</div>
          </div>
          <button className="btn small" onClick={() => setAddModal(true)}>
            <IconPlus size={14} /> Novo investimento
          </button>
        </div>

        {investments.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon"><IconCoins size={24} /></div>
            <h4>Portefólio vazio</h4>
            <p>Regista os investimentos que já tens — indica o valor atual e a percentagem de ganho, e nós calculamos o resto.</p>
            <button className="btn" onClick={() => setAddModal(true)}><IconPlus size={15} /> Adicionar o primeiro</button>
          </div>
        ) : (
          <div className="asset-table">
            <div className="asset-head desktop-only">
              <span>Ativo</span><span>Tipo</span>
              <span className="right">Preço</span><span className="right">Investido</span>
              <span className="right">Valor atual</span><span className="right">Ganho</span>
              <span className="right">%</span><span />
            </div>
            {investments.map((inv) => {
              const cls = Number(inv.gain) >= 0 ? 'pos' : 'neg'
              return (
                <div key={inv.id} className="asset-row" data-testid="asset-row">
                  <div className="asset-name">
                    <div className="asset-title">
                      <strong>{inv.name}</strong>
                      <span className={`badge ${inv.live ? 'live' : ''}`}>{inv.live ? '● live' : 'manual'}</span>
                    </div>
                    <div className="mono asset-sub">
                      {[
                        inv.symbol || 'sem cotação pública',
                        fmtUnits(inv.quantity),
                        inv.monthlyContribution
                          ? `+${fmtEur(inv.monthlyContribution)}/mês · dia ${inv.contributionDay ?? 1}`
                          : null,
                      ].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                  <span className="type-chip">{typeLabel(inv.type)}</span>
                  <span className="mono right dim" data-label="Preço">{fmtEur(inv.currentPrice)}</span>
                  <span className="mono right dim" data-label="Investido">{fmtEur(inv.initialValue)}</span>
                  <span className="mono right strong" data-label="Valor atual">{fmtEur(inv.currentValue)}</span>
                  <span className={`mono right ${cls}`} data-label="Ganho">{fmtSigned(inv.gain)}</span>
                  <span className={`mono right ${cls}`} data-label="Rentabilidade">{fmtPct(inv.gainPercent)}</span>
                  <span className="event-actions">
                    <button className="icon-btn" onClick={() => openEdit(inv)} aria-label={`Editar ${inv.name}`}><IconPencil size={14} /></button>
                    <button className="icon-btn danger" onClick={() => setToDelete(inv)} aria-label={`Eliminar ${inv.name}`}><IconTrash size={14} /></button>
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {modals}
    </div>
  )
}
