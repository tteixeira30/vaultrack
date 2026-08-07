import { useEffect, useState } from 'react'
import {
  AreaChart, Area, BarChart, Bar, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import { api, fmtEur, fmtPct, fmtMoneyShort } from '../api'
import { catLabel, catColor } from '../categories'
import { useAuth } from '../components/AuthContext'
import { useChartColors } from '../components/ThemeContext'
import {
  IconWallet, IconTrendingUp, IconTarget, IconCheck, IconInfo,
  IconSparkle, IconCoins, IconActivity, IconArrowUp, IconArrowDown, IconCalendar, IconReceipt,
} from '../components/Icons'

const INSIGHT_ICONS = {
  trending: IconTrendingUp,
  target: IconTarget,
  check: IconCheck,
  wallet: IconWallet,
}

const ACTIVITY_ICONS = {
  investment: IconTrendingUp,
  goal: IconTarget,
}

/** Substitui os tokens {eur:VALOR} (valor em EUR) do backend pela moeda base formatada. */
const renderInsight = (text) =>
  (text || '').replace(/\{eur:(-?\d+(?:\.\d+)?)\}/g, (_, n) => fmtEur(Number(n)))

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="chart-tooltip">
      <div className="tt-label">{new Date(label).toLocaleDateString('pt-PT', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
      <div className="tt-value">{fmtEur(payload[0].value)}</div>
    </div>
  )
}

function fmtMonth(m) {
  if (!m) return ''
  const [y, mo] = m.split('-').map(Number)
  const label = new Date(y, mo - 1, 1).toLocaleDateString('pt-PT', { month: 'long', year: 'numeric' })
  return label.charAt(0).toUpperCase() + label.slice(1)
}

// "2026-07" -> "jul" (rótulo curto para o eixo do gráfico de barras)
function shortMonth(m) {
  const [y, mo] = m.split('-').map(Number)
  return new Date(y, mo - 1, 1).toLocaleDateString('pt-PT', { month: 'short' }).replace('.', '')
}

// Barras de categoria (partilhadas entre a vista de 12 meses e o detalhe de um mês).
function CatBars({ items, total }) {
  return items.map((c) => {
    const pct = total > 0 ? (Number(c.total) / total) * 100 : 0
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
  })
}

function ExpensesTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  return (
    <div className="chart-tooltip">
      <div className="tt-label">{fmtMonth(p.month)}</div>
      <div className="tt-value">{fmtEur(p.outflows)}</div>
      {Number(p.inflows) > 0 && <div className="tt-sub">Entradas: {fmtEur(p.inflows)}</div>}
    </div>
  )
}

function timeAgo(iso) {
  const then = new Date(iso).getTime()
  const days = Math.floor((Date.now() - then) / 86400000)
  if (days <= 0) return 'hoje'
  if (days === 1) return 'ontem'
  if (days < 30) return `há ${days} dias`
  const months = Math.floor(days / 30)
  if (months === 1) return 'há 1 mês'
  if (months < 12) return `há ${months} meses`
  const years = Math.floor(months / 12)
  return years === 1 ? 'há 1 ano' : `há ${years} anos`
}

export default function DashboardPage() {
  const { user } = useAuth()
  const chart = useChartColors()
  const [data, setData] = useState(null)
  const [error, setError] = useState(false)
  const [selectedMonth, setSelectedMonth] = useState(null) // mês em foco no gráfico de despesas

  useEffect(() => {
    api.getDashboard().then(setData).catch(() => setError(true))
  }, [])

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
        <div className="skeleton" style={{ height: 236, borderRadius: 16, marginBottom: 20 }} />
        <div className="kpi-grid">
          {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 118 }} />)}
        </div>
        <div className="skeleton" style={{ height: 240, marginTop: 20, borderRadius: 16 }} />
      </div>
    )
  }

  const firstName = user?.name?.split(' ')[0] || ''
  const gainPositive = Number(data.investmentGainPercent) >= 0
  const evolution = (data.evolution || []).map((p) => ({ ...p, value: Number(p.value) }))

  // variação do património ao longo da janela (primeiro → último ponto do histórico)
  const hasEvo = evolution.length >= 2
  const evoFirst = hasEvo ? evolution[0].value : 0
  const evoLast = hasEvo ? evolution[evolution.length - 1].value : 0
  const deltaAbs = evoLast - evoFirst
  const deltaPct = evoFirst > 0 ? (deltaAbs / evoFirst) * 100 : null
  const deltaUp = deltaAbs >= 0

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
  const spent = Number(exp?.currentMonthOutflows) || 0
  const prevSpent = Number(exp?.prevMonthOutflows) || 0
  const spentDeltaPct = prevSpent > 0 ? ((spent - prevSpent) / prevSpent) * 100 : null
  const spentUp = spent >= prevSpent
  const expTotalOut = Number(exp?.yearOutflows) || 0
  const topCats = exp?.topCategories || []

  // mês em foco (drill-down do gráfico); highlight segue a seleção, senão o mês atual
  const selMonth = selectedMonth ? expMonths.find((m) => m.month === selectedMonth) : null
  const highlightKey = selectedMonth || currentKey

  return (
    <div>
      <div className="page-head">
        <div>
          <h2>Olá{firstName ? `, ${firstName}` : ''}</h2>
          <p>Aqui está o resumo das tuas finanças.</p>
        </div>
        {data.incomeMonth && (
          <span className="month-chip"><IconCalendar size={14} /> {fmtMonth(data.incomeMonth)}</span>
        )}
      </div>

      <div className="card dash-hero">
        <div className="hero-main">
          <span className="hero-eyebrow"><IconCoins size={15} /> Património líquido</span>
          <div className="hero-value">{fmtEur(data.netWorth)}</div>
          {hasEvo && (
            <span className={`delta-chip ${deltaAbs === 0 ? 'flat' : deltaUp ? 'up' : 'down'}`}>
              {deltaUp ? <IconArrowUp size={13} /> : <IconArrowDown size={13} />}
              {deltaPct != null && `${deltaUp ? '+' : ''}${deltaPct.toFixed(1)}%`}
              <span className="delta-abs">{deltaUp ? '+' : '−'}{fmtEur(Math.abs(deltaAbs))} · 6 meses</span>
            </span>
          )}

          {compTotal > 0 ? (
            <div className="composition">
              <div className="comp-bar">
                {investPct > 0 && <span className="comp-seg" style={{ width: `${investPct}%`, background: 'var(--accent)' }} />}
                {savedPct > 0 && <span className="comp-seg" style={{ width: `${savedPct}%`, background: 'var(--cyan)' }} />}
              </div>
              <div className="comp-legend">
                <span className="comp-item">
                  <span className="comp-dot" style={{ background: 'var(--accent)' }} />
                  Investimentos <strong>{fmtEur(invested)}</strong> <span className="dim">{investPct.toFixed(0)}%</span>
                </span>
                <span className="comp-item">
                  <span className="comp-dot" style={{ background: 'var(--cyan)' }} />
                  Poupança <strong>{fmtEur(saved)}</strong> <span className="dim">{savedPct.toFixed(0)}%</span>
                </span>
              </div>
            </div>
          ) : (
            <p className="hint" style={{ marginTop: 14 }}>Adiciona investimentos ou objetivos para veres a composição do teu património.</p>
          )}
        </div>

        <div className="hero-chart">
          <div className="hero-chart-head">
            <span>Evolução do património</span>
            <span className="dim">6 meses</span>
          </div>
          {evolution.length === 0 ? (
            <div className="empty-state compact">
              <div className="empty-icon"><IconTrendingUp size={22} /></div>
              <h4>Sem histórico ainda</h4>
              <p>Adiciona investimentos com símbolo (ex: VWCE.DE, BTC) para veres a evolução.</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={evolution} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="dash-grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.32} />
                    <stop offset="100%" stopColor="#22d3ee" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={chart.grid} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" stroke={chart.axis} fontSize={11.5} tickMargin={10} axisLine={false} tickLine={false}
                       tickFormatter={(d) => new Date(d).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short' })} />
                <YAxis stroke={chart.axis} fontSize={11.5} axisLine={false} tickLine={false} width={72}
                       tickFormatter={fmtMoneyShort} domain={['auto', 'auto']} />
                <Tooltip content={<ChartTooltip />} />
                <Area type="monotone" dataKey="value" stroke="#22d3ee" strokeWidth={2.2} fill="url(#dash-grad)"
                      activeDot={{ r: 4, strokeWidth: 0 }} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="kpi-grid">
        <div className="card kpi-card">
          <div className="kpi-top">
            <span className="kpi-icon"><IconWallet size={17} /></span>
            <span className="kpi-label">Rendimento do mês</span>
          </div>
          <div className="kpi-value">{fmtEur(data.monthlyIncome)}</div>
          <div className="kpi-sub">
            {Number(data.unallocated) > 0 ? `${fmtEur(data.unallocated)} por alocar` : 'Totalmente distribuído'}
          </div>
        </div>

        <div className="card kpi-card">
          <div className="kpi-top">
            <span className="kpi-icon"><IconTrendingUp size={17} /></span>
            <span className="kpi-label">Valor investido</span>
          </div>
          <div className="kpi-value">{fmtEur(data.totalInvested)}</div>
          <div className="kpi-sub">
            <span className={gainPositive ? 'pos' : 'neg'}>{fmtPct(data.investmentGainPercent)} · {fmtEur(data.investmentGain)}</span>
          </div>
        </div>

        <div className="card kpi-card">
          <div className="kpi-top">
            <span className="kpi-icon"><IconCoins size={17} /></span>
            <span className="kpi-label">Poupado em objetivos</span>
          </div>
          <div className="kpi-value">{fmtEur(data.totalSaved)}</div>
          <div className="kpi-sub">
            {Number(data.totalGoalsTarget) > 0 ? `de ${fmtEur(data.totalGoalsTarget)} em metas` : 'Sem metas definidas'}
          </div>
        </div>

        <div className="card kpi-card">
          <div className="kpi-top">
            <span className="kpi-icon"><IconTarget size={17} /></span>
            <span className="kpi-label">Objetivos</span>
          </div>
          <div className="kpi-ring-row">
            <div className="kpi-ring" style={{ background: `conic-gradient(var(--accent) ${goalsPct * 3.6}deg, var(--surface-3) 0)` }}>
              <span>{Math.round(goalsPct)}%</span>
            </div>
            <div className="kpi-ring-meta">
              <strong>{data.goalsCompleted}/{data.goalsCount}</strong>
              <span className="dim">concluídos</span>
            </div>
          </div>
        </div>
      </div>

      {exp && (
        <div className="card exp-card">
          <div className="card-header">
            <div>
              <h3><IconReceipt size={16} /> Despesas ao longo do ano</h3>
              <div className="sub">Últimos 12 meses{exp.hasData ? ' · toca num mês para ver o detalhe' : ''}</div>
            </div>
            <div className="exp-stats">
              <div className="exp-stat">
                <span className="exp-stat-label">Este mês</span>
                <strong className="neg">{fmtEur(spent)}</strong>
                {spentDeltaPct != null && (
                  <span className={`delta-chip mini ${spent === prevSpent ? 'flat' : spentUp ? 'down' : 'up'}`}>
                    {spentUp ? <IconArrowUp size={11} /> : <IconArrowDown size={11} />}
                    {`${spentUp ? '+' : '−'}${Math.abs(spentDeltaPct).toFixed(0)}%`}
                  </span>
                )}
              </div>
              <div className="exp-stat">
                <span className="exp-stat-label">Média mensal</span>
                <strong>{fmtEur(exp.avgMonthlyOutflows)}</strong>
              </div>
              <div className="exp-stat">
                <span className="exp-stat-label">Total 12 meses</span>
                <strong>{fmtEur(exp.yearOutflows)}</strong>
              </div>
            </div>
          </div>

          {!exp.hasData ? (
            <div className="empty-state compact">
              <div className="empty-icon"><IconReceipt size={22} /></div>
              <h4>Sem despesas registadas</h4>
              <p>Adiciona movimentos ou importa extratos na página <strong>Despesas</strong> para veres as estatísticas.</p>
            </div>
          ) : (
            <div className="exp-body">
              <div className="exp-chart">
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={expMonths} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke={chart.grid} strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="month" stroke={chart.axis} fontSize={11.5} tickMargin={8} axisLine={false} tickLine={false}
                           tickFormatter={shortMonth} interval="preserveStartEnd" />
                    <YAxis stroke={chart.axis} fontSize={11.5} axisLine={false} tickLine={false} width={64}
                           tickFormatter={fmtMoneyShort} />
                    <Tooltip cursor={{ fill: 'var(--surface-2)' }} content={<ExpensesTooltip />} />
                    <Bar dataKey="outflows" radius={[4, 4, 0, 0]} maxBarSize={40} isAnimationActive={false}
                         cursor="pointer"
                         onClick={(d) => d?.month && setSelectedMonth((cur) => (cur === d.month ? null : d.month))}>
                      {expMonths.map((m) => (
                        <Cell key={m.month} fill={m.month === highlightKey ? 'var(--accent)' : 'var(--surface-3)'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="exp-cats">
                {selMonth ? (
                  <>
                    <div className="exp-cats-head spread">
                      <span>{fmtMonth(selMonth.month)}</span>
                      <button type="button" className="exp-back" onClick={() => setSelectedMonth(null)}>‹ 12 meses</button>
                    </div>
                    <div className="exp-month-totals">
                      <span><span className="exp-stat-label">Saídas</span><strong className="neg">{fmtEur(selMonth.outflows)}</strong></span>
                      <span><span className="exp-stat-label">Entradas</span><strong className="pos">{fmtEur(selMonth.inflows)}</strong></span>
                    </div>
                    {selMonth.byCategory.length === 0 ? (
                      <p className="dim" style={{ padding: '4px 2px' }}>Sem despesas neste mês.</p>
                    ) : (
                      <ul className="cat-bars"><CatBars items={selMonth.byCategory} total={Number(selMonth.outflows)} /></ul>
                    )}
                  </>
                ) : (
                  <>
                    <div className="exp-cats-head">Principais categorias <span className="dim">· 12 meses</span></div>
                    {topCats.length === 0 ? (
                      <p className="dim" style={{ padding: '4px 2px' }}>Sem saídas por categoria.</p>
                    ) : (
                      <ul className="cat-bars"><CatBars items={topCats} total={expTotalOut} /></ul>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="dash-grid">
        <div className="card dash-side">
          <div className="card-header">
            <div><h3><IconSparkle size={16} /> Insights</h3></div>
          </div>
          {data.insights.length === 0 ? (
            <p className="dim" style={{ padding: '4px 2px' }}>Sem destaques por agora — continua a registar os teus dados.</p>
          ) : (
            <ul className="insight-list">
              {data.insights.map((ins, i) => {
                const Icon = INSIGHT_ICONS[ins.icon] || IconInfo
                return (
                  <li key={i} className={`insight ${ins.kind}`}>
                    <span className="insight-icon"><Icon size={15} /></span>
                    <div>
                      <strong>{ins.title}</strong>
                      <span>{renderInsight(ins.detail)}</span>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <div className="card dash-activity">
          <div className="card-header">
            <div><h3><IconActivity size={16} /> Atividade recente</h3></div>
          </div>
          {data.recentActivity.length === 0 ? (
            <p className="dim" style={{ padding: '4px 2px' }}>Ainda sem atividade registada.</p>
          ) : (
            <ul className="activity-list">
              {data.recentActivity.map((a, i) => {
                const Icon = ACTIVITY_ICONS[a.type] || IconInfo
                return (
                  <li key={i} className="activity">
                    <span className={`activity-icon ${a.type}`}><Icon size={15} /></span>
                    <div className="activity-main">
                      <strong>{a.title}</strong>
                      <span>{a.subtitle}</span>
                    </div>
                    <span className="activity-time">{timeAgo(a.at)}</span>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
