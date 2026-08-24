import { useEffect, useMemo, useState } from 'react'
import { BarChart, Bar, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { api, fmtEur, fmtSigned, fmtMoneyShort, fmtPct } from '../api'
import { catLabel, catColor } from '../categories'
import { useChartColors } from '../components/ThemeContext'
import { fmtMonthShort } from '../components/MonthContext'
import { IconInfo, IconReceipt, IconTrendingUp } from '../components/Icons'

/** Código mono de duas letras para os cartões de insight e atividade. */
const INSIGHT_CODE = { trending: ['RE', 'green'], target: ['OB', 'accent'], check: ['OK', 'green'], wallet: ['RD', 'amber'] }
const ACTIVITY_CODE = { investment: ['AT', 'cyan'], goal: ['OB', 'accent'] }

/** Substitui os tokens {eur:VALOR} (valor em EUR) do backend pela moeda base formatada. */
const renderInsight = (text) =>
  (text || '').replace(/\{eur:(-?\d+(?:\.\d+)?)\}/g, (_, n) => fmtEur(Number(n)))

// "2026-07" -> "jul" (rótulo curto para o eixo do gráfico de barras)
const shortMonth = (m) => {
  const [y, mo] = m.split('-').map(Number)
  return new Date(y, mo - 1, 1).toLocaleDateString('pt-PT', { month: 'short' }).replace('.', '')
}

function ExpensesTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  return (
    <div className="chart-tooltip">
      <div className="tt-label">{fmtMonthShort(p.month)}</div>
      <div className="tt-value">{fmtEur(p.outflows)}</div>
      {Number(p.inflows) > 0 && <div className="tt-sub">Entradas: {fmtEur(p.inflows)}</div>}
    </div>
  )
}

function timeAgo(iso) {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  if (days <= 0) return 'hoje'
  if (days === 1) return 'ontem'
  if (days < 30) return `há ${days} dias`
  const months = Math.floor(days / 30)
  if (months === 1) return 'há 1 mês'
  if (months < 12) return `há ${months} meses`
  const years = Math.floor(months / 12)
  return years === 1 ? 'há 1 ano' : `há ${years} anos`
}

/**
 * Traça uma série de valores como um caminho SVG em coordenadas 0..w / 0..h.
 *
 * O design desenha o património num SVG simples, sem eixos nem grelha — a
 * escala é dada pela régua de valores por baixo. Um gráfico Recharts aqui
 * traria eixos e margens que o desenho não tem.
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

/** Janelas da evolução do património. A série do backend cobre 1 ano diário. */
const RANGES = [
  { id: '1M', label: '1M', days: 30, note: '1 mês' },
  { id: '3M', label: '3M', days: 90, note: '3 meses' },
  { id: '6M', label: '6M', days: 182, note: '6 meses' },
  { id: '1A', label: '1A', days: null, note: '12 meses' },
]

export default function DashboardPage({ onGo }) {
  const chart = useChartColors()
  const [data, setData] = useState(null)
  const [error, setError] = useState(false)
  const [range, setRange] = useState('6M')
  const [selectedMonth, setSelectedMonth] = useState(null) // mês em foco no gráfico de despesas

  useEffect(() => {
    api.getDashboard().then(setData).catch(() => setError(true))
  }, [])

  const evolution = useMemo(
    () => (data?.evolution || []).map((p) => ({ ...p, value: Number(p.value) })),
    [data],
  )

  const series = useMemo(() => {
    const r = RANGES.find((x) => x.id === range) ?? RANGES[2]
    return r.days ? evolution.slice(-r.days) : evolution
  }, [evolution, range])

  // Só se oferece a janela que a série cobre: com três meses de histórico, um
  // botão "1A" que devolve exatamente o mesmo desenho é uma promessa falsa.
  const ranges = useMemo(
    () => RANGES.filter((r, i) => i === 0 || evolution.length > (RANGES[i - 1].days ?? 0)),
    [evolution],
  )

  if (error) {
    return (
      <div className="card">
        <div className="empty-state">
          <div className="empty-icon"><IconInfo size={24} /></div>
          <h4>Não foi possível carregar o painel</h4>
          <p>Tenta recarregar a página.</p>
        </div>
      </div>
    )
  }

  if (!data) {
    return (
      <div>
        <div className="dash-top">
          <div className="skeleton" style={{ height: 320, borderRadius: 20 }} />
          <div className="kpi-grid">
            {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 148, borderRadius: 18 }} />)}
          </div>
        </div>
        <div className="skeleton" style={{ height: 240, marginTop: 16, borderRadius: 20 }} />
      </div>
    )
  }

  const gainPositive = Number(data.investmentGainPercent) >= 0

  // variação do património ao longo da janela escolhida
  const hasSeries = series.length >= 2
  const first = hasSeries ? series[0].value : 0
  const last = hasSeries ? series[series.length - 1].value : 0
  const deltaAbs = last - first
  const deltaPct = first > 0 ? (deltaAbs / first) * 100 : null
  const deltaUp = deltaAbs >= 0
  const rangeNote = (RANGES.find((r) => r.id === range) ?? RANGES[2]).note

  const values = series.map((p) => p.value)
  const ticks = hasSeries
    ? [0, 0.25, 0.5, 0.75, 1].map((f) => values[Math.round(f * (values.length - 1))])
    : []

  // composição do património: investimentos vs poupança em objetivos
  const invested = Number(data.totalInvested) || 0
  const saved = Number(data.totalSaved) || 0
  const compTotal = invested + saved
  const investPct = compTotal > 0 ? (invested / compTotal) * 100 : 0
  const savedPct = compTotal > 0 ? (saved / compTotal) * 100 : 0

  const goalsPct = Math.max(0, Math.min(100, Number(data.goalsProgressPercent) || 0))

  // estatísticas de despesas (últimos 12 meses)
  const exp = data.expenses
  const expMonths = (exp?.months || []).map((m) => ({ ...m, outflows: Number(m.outflows), inflows: Number(m.inflows) }))
  const currentKey = expMonths.length ? expMonths[expMonths.length - 1].month : null
  const thisMonth = expMonths.length ? expMonths[expMonths.length - 1] : null
  const spent = Number(exp?.currentMonthOutflows) || 0
  const prevSpent = Number(exp?.prevMonthOutflows) || 0
  const spentDeltaPct = prevSpent > 0 ? ((spent - prevSpent) / prevSpent) * 100 : null
  const spentUp = spent >= prevSpent
  const expTotalOut = Number(exp?.yearOutflows) || 0
  const topCats = exp?.topCategories || []

  // mês em foco (drill-down do gráfico); o destaque segue a seleção, senão o mês atual
  const selMonth = selectedMonth ? expMonths.find((m) => m.month === selectedMonth) : null
  const highlightKey = selectedMonth || currentKey
  const catItems = selMonth ? selMonth.byCategory : topCats
  const catTotal = selMonth ? Number(selMonth.outflows) : expTotalOut

  return (
    <div className="dash">
      <div className="dash-top">
        {/* ---------- Herói: património líquido ---------- */}
        <section className="card hero">
          <div className="hero-head">
            <div>
              <span className="eyebrow">Património líquido</span>
              <div className="mono hero-value">{fmtEur(data.netWorth)}</div>
              {hasSeries && (
                <div className="hero-delta">
                  <span className={`delta-chip mono ${deltaAbs === 0 ? 'flat' : deltaUp ? 'up' : 'down'}`}>
                    {deltaUp ? '▲' : '▼'} {deltaPct != null ? `${Math.abs(deltaPct).toFixed(1)}%` : '—'}
                  </span>
                  <span className="mono dim">
                    {deltaUp ? '+' : '−'}{fmtEur(Math.abs(deltaAbs))} · {rangeNote}
                  </span>
                </div>
              )}
            </div>
            {evolution.length > 0 && (
              <div className="seg-pills" role="group" aria-label="Janela do gráfico">
                {ranges.map((r) => (
                  <button key={r.id} type="button" className={`mono ${range === r.id ? 'active' : ''}`}
                          aria-pressed={range === r.id} onClick={() => setRange(r.id)}>
                    {r.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {evolution.length === 0 ? (
            <div className="empty-state compact">
              <div className="empty-icon"><IconTrendingUp size={22} /></div>
              <h4>Sem histórico ainda</h4>
              <p>Adiciona investimentos com símbolo (ex: VWCE.DE, BTC) para veres a evolução.</p>
            </div>
          ) : (
            <>
              <div className="hero-chart">
                <svg viewBox="0 0 600 132" preserveAspectRatio="none" role="img"
                     aria-label={`Evolução do património nos últimos ${rangeNote}`}>
                  <defs>
                    <linearGradient id="nw-grad" x1="0" y1="0" x2="0" y2="1">
                      <stop stopColor="var(--cyan)" stopOpacity="0.32" />
                      <stop offset="1" stopColor="var(--cyan)" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <path d={sparkPath(values, 600, 132, true)} fill="url(#nw-grad)" />
                  <path d={sparkPath(values, 600, 132, false)} fill="none" stroke="var(--cyan)"
                        strokeWidth="2.2" vectorEffect="non-scaling-stroke" />
                </svg>
              </div>
              <div className="hero-ticks mono">
                {ticks.map((v, i) => <span key={i}>{fmtMoneyShort(v)}</span>)}
              </div>
            </>
          )}

          {compTotal === 0 && (
            <p className="hint" style={{ marginTop: 12 }}>
              Adiciona investimentos ou objetivos para veres a composição do teu património.
            </p>
          )}

          {compTotal > 0 && (
            <div className="composition">
              <div className="comp-bar">
                {investPct > 0 && <span style={{ width: `${investPct}%`, background: 'var(--accent)' }} />}
                {savedPct > 0 && <span style={{ width: `${savedPct}%`, background: 'var(--cyan)' }} />}
              </div>
              <div className="comp-legend">
                <span>
                  <span className="comp-dot" style={{ background: 'var(--accent)' }} />
                  Investimentos <strong className="mono">{fmtEur(invested)}</strong>
                  <span className="dim">{investPct.toFixed(0)}%</span>
                </span>
                <span>
                  <span className="comp-dot" style={{ background: 'var(--cyan)' }} />
                  Poupança <strong className="mono">{fmtEur(saved)}</strong>
                  <span className="dim">{savedPct.toFixed(0)}%</span>
                </span>
              </div>
            </div>
          )}
        </section>

        {/* ---------- KPIs ---------- */}
        <div className="kpi-grid">
          <div className="card kpi">
            <span className="eyebrow">Rendimento do mês</span>
            <div>
              <div className="mono kpi-value">{fmtEur(data.monthlyIncome)}</div>
              <div className="kpi-sub">
                {Number(data.unallocated) > 0
                  ? `${fmtEur(data.unallocated)} por alocar`
                  : Number(data.unallocated) < 0
                    ? `${fmtEur(Math.abs(Number(data.unallocated)))} acima do rendimento`
                    : 'Totalmente distribuído'}
              </div>
            </div>
          </div>

          <div className="card kpi">
            <span className="eyebrow">Valor investido</span>
            <div>
              <div className="mono kpi-value">{fmtEur(data.totalInvested)}</div>
              {/* percentagem primeiro, valor depois — a ordem do design */}
              <div className={`mono kpi-sub ${gainPositive ? 'pos' : 'neg'}`}>
                {fmtPct(data.investmentGainPercent)} · {fmtEur(data.investmentGain)}
              </div>
              {/* o valor grande é quanto a carteira vale hoje; sem o custo de
                  aquisição ao lado, a percentagem de ganho não tem sobre o quê */}
              {data.totalInvestedCost != null && (
                <div className="mono kpi-foot">de {fmtEur(data.totalInvestedCost)} investidos</div>
              )}
            </div>
          </div>

          <div className="card kpi">
            <span className="eyebrow">Poupado em objetivos</span>
            <div>
              <div className="mono kpi-value">{fmtEur(data.totalSaved)}</div>
              <div className="kpi-sub">
                {Number(data.totalGoalsTarget) > 0 ? `de ${fmtEur(data.totalGoalsTarget)} em metas` : 'Sem metas definidas'}
              </div>
            </div>
          </div>

          <div className="card kpi ring">
            <div className="kpi-ring" style={{ background: `conic-gradient(var(--accent) ${goalsPct * 3.6}deg, var(--track) 0)` }}>
              <span className="mono">{Math.round(goalsPct)}%</span>
            </div>
            <div>
              <span className="eyebrow">Objetivos</span>
              <div className="mono kpi-value sm">{data.goalsCompleted}/{data.goalsCount}</div>
              <div className="kpi-sub">concluídos</div>
            </div>
          </div>
        </div>
      </div>

      {/* ---------- Este mês (resumo curto — o cartão do ecrã 01 do design) ---------- */}
      {thisMonth && (
        <section className="card flush month-summary mobile-only">
          <div className="section-head">Este mês</div>
          <div className="ms-row">
            <span className="row-icon green">↑</span>
            <div className="row-main"><strong>Entrou</strong><small>{fmtMonthShort(thisMonth.month)}</small></div>
            <span className="mono">{fmtEur(thisMonth.inflows)}</span>
          </div>
          <div className="ms-row">
            <span className="row-icon red">↓</span>
            <div className="row-main"><strong>Saiu</strong><small>{thisMonth.byCategory.length} categoria(s)</small></div>
            <span className="mono">{fmtEur(thisMonth.outflows)}</span>
          </div>
          <div className="ms-row">
            <span className="row-icon accent">=</span>
            <div className="row-main"><strong>Sobra</strong><small>entradas menos saídas</small></div>
            <span className={`mono strong ${Number(thisMonth.net) >= 0 ? 'pos' : 'neg'}`}>{fmtSigned(thisMonth.net)}</span>
          </div>
        </section>
      )}

      {/* ---------- Despesas ao longo do ano ---------- */}
      {exp && (
        <section className="card exp-card desktop-only">
          <div className="card-header">
            <div>
              <h3>Despesas ao longo do ano</h3>
              <div className="sub">Últimos 12 meses{exp.hasData ? ' · clica num mês para ver o detalhe' : ''}</div>
            </div>
            <div className="exp-stats">
              <div className="exp-stat">
                <span className="eyebrow">Este mês</span>
                <strong className="mono neg">
                  {fmtEur(spent)}
                  {spentDeltaPct != null && (
                    <span className={spentUp ? 'neg' : 'pos'}> {spentUp ? '+' : '−'}{Math.abs(spentDeltaPct).toFixed(0)}%</span>
                  )}
                </strong>
              </div>
              <div className="exp-stat">
                <span className="eyebrow">Média mensal</span>
                <strong className="mono">{fmtEur(exp.avgMonthlyOutflows)}</strong>
              </div>
              <div className="exp-stat">
                <span className="eyebrow">Total 12 meses</span>
                <strong className="mono">{fmtEur(exp.yearOutflows)}</strong>
              </div>
            </div>
          </div>

          {!exp.hasData ? (
            <div className="empty-state compact">
              <div className="empty-icon"><IconReceipt size={22} /></div>
              <h4>Sem despesas registadas</h4>
              <p>Adiciona movimentos ou importa extratos em <strong>Movimentos</strong> para veres as estatísticas.</p>
              <button className="btn" onClick={() => onGo?.('expenses')}>Ir para Movimentos</button>
            </div>
          ) : (
            <div className="exp-body">
              <div className="exp-chart">
                <ResponsiveContainer width="100%" height={190}>
                  <BarChart data={expMonths} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
                    <XAxis dataKey="month" stroke={chart.axis} fontSize={10} tickMargin={8} axisLine={false} tickLine={false}
                           tickFormatter={shortMonth} interval={0} />
                    <YAxis stroke={chart.axis} fontSize={10} axisLine={false} tickLine={false} width={58}
                           tickFormatter={fmtMoneyShort} />
                    <Tooltip cursor={{ fill: 'var(--surface-2)' }} content={<ExpensesTooltip />} />
                    <Bar dataKey="outflows" radius={[5, 5, 0, 0]} maxBarSize={34} isAnimationActive={false}
                         cursor="pointer"
                         onClick={(d) => d?.month && setSelectedMonth((cur) => (cur === d.month ? null : d.month))}>
                      {expMonths.map((m) => (
                        <Cell key={m.month} fill={m.month === highlightKey ? 'var(--accent)' : 'var(--track)'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="exp-cats">
                <div className="exp-cats-head">
                  <span>{selMonth ? fmtMonthShort(selMonth.month) : 'Principais categorias'}</span>
                  {selMonth
                    ? <button type="button" className="exp-back" onClick={() => setSelectedMonth(null)}>‹ 12 meses</button>
                    : <span className="dim">12 meses</span>}
                </div>
                {catItems.length === 0 ? (
                  <p className="dim" style={{ padding: '4px 2px' }}>Sem saídas por categoria.</p>
                ) : (
                  <ul className="cat-bars">
                    {catItems.map((c) => {
                      const pct = catTotal > 0 ? (Number(c.total) / catTotal) * 100 : 0
                      return (
                        <li key={c.category}>
                          <div className="cat-bar-head">
                            <span><span className="tx-cat-dot" style={{ background: catColor(c.category) }} />{catLabel(c.category)}</span>
                            <span className="mono">{fmtEur(c.total)} · {pct.toFixed(0)}%</span>
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
          )}
        </section>
      )}

      {/* ---------- Insights e atividade ---------- */}
      <div className="split-2">
        <section className="card">
          <div className="card-header"><div><h3>Insights</h3></div></div>
          {data.insights.length === 0 ? (
            <p className="dim" style={{ padding: '4px 2px' }}>Sem destaques por agora — continua a registar os teus dados.</p>
          ) : (
            <ul className="feed">
              {data.insights.map((ins, i) => {
                const [code, tone] = INSIGHT_CODE[ins.icon] || ['IN', 'accent']
                return (
                  <li key={i}>
                    <span className={`code-chip ${tone}`}>{code}</span>
                    <div className="feed-main">
                      <strong>{ins.title}</strong>
                      <span>{renderInsight(ins.detail)}</span>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <section className="card">
          <div className="card-header"><div><h3>Atividade recente</h3></div></div>
          {data.recentActivity.length === 0 ? (
            <p className="dim" style={{ padding: '4px 2px' }}>Ainda sem atividade registada.</p>
          ) : (
            <ul className="feed">
              {data.recentActivity.map((a, i) => {
                const [code, tone] = ACTIVITY_CODE[a.type] || ['AC', 'accent']
                return (
                  <li key={i}>
                    <span className={`code-chip ${tone}`}>{code}</span>
                    <div className="feed-main">
                      <strong>{a.title}</strong>
                      <span>{a.subtitle}</span>
                    </div>
                    <span className="mono feed-when">{timeAgo(a.at)}</span>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}
