import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import DashboardPage from '../pages/DashboardPage'
import { api } from '../api'

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, api: { getDashboard: vi.fn() } }
})
vi.mock('../components/AuthContext', () => ({ useAuth: () => ({ user: { name: 'Ana Silva' } }) }))
vi.mock('../components/ThemeContext', () => ({ useChartColors: () => ({ grid: '#000', axis: '#111' }) }))

const data = {
  netWorth: 1500, incomeMonth: '2025-06', monthlyIncome: 2000, unallocated: 300,
  totalInvested: 1000, investmentGain: 100, investmentGainPercent: 10,
  totalSaved: 500, totalGoalsTarget: 5000, goalsProgressPercent: 10,
  goalsCount: 2, goalsCompleted: 1,
  evolution: [{ date: '2025-01-01', value: 1000 }, { date: '2025-06-01', value: 1500 }],
  recentActivity: [], insights: [],
}

describe('DashboardPage', () => {
  beforeEach(() => vi.clearAllMocks())

  it('mostra o esqueleto enquanto carrega', () => {
    api.getDashboard.mockReturnValue(new Promise(() => {}))
    const { container } = render(<DashboardPage />)
    expect(container.querySelector('.skeleton')).toBeInTheDocument()
  })

  it('mostra o património, saudação e KPIs', async () => {
    api.getDashboard.mockResolvedValue(data)
    render(<DashboardPage />)

    await waitFor(() => expect(document.querySelector('.hero-value')).toBeInTheDocument())
    expect(document.querySelector('.hero-value')).toHaveTextContent(/1500,00/)
    // KPIs
    expect(document.querySelectorAll('.kpi')).toHaveLength(4)
    expect(screen.getByText('Rendimento do mês')).toBeInTheDocument()
    expect(screen.getByText('Valor investido')).toBeInTheDocument()
    expect(screen.getByText('Poupado em objetivos')).toBeInTheDocument()
    expect(screen.getByText('1/2')).toBeInTheDocument() // objetivos concluídos/total
  })

  it('mostra os destaques (insights) e a atividade recente', async () => {
    api.getDashboard.mockResolvedValue({
      ...data,
      insights: [
        { kind: 'positive', icon: 'trending', title: 'Portefólio a valorizar', detail: 'Está +10% acima.' },
        { kind: 'info', icon: 'wallet', title: 'Rendimento por alocar', detail: 'Ainda 300 €.' },
      ],
      recentActivity: [
        { type: 'investment', title: 'PPR Manual', subtitle: 'Investimento adicionado', at: '2025-06-01T10:00:00Z' },
        { type: 'goal', title: 'Fundo', subtitle: 'Objetivo criado', at: '2025-06-02T10:00:00Z' },
      ],
    })
    render(<DashboardPage />)

    await waitFor(() => expect(screen.getByText('Portefólio a valorizar')).toBeInTheDocument())
    expect(screen.getByText('Rendimento por alocar')).toBeInTheDocument()
    expect(screen.getByText('PPR Manual')).toBeInTheDocument()
    expect(screen.getByText('Investimento adicionado')).toBeInTheDocument()
    expect(screen.getByText('Objetivo criado')).toBeInTheDocument()
  })

  it('converte o token {eur:...} dos insights para a moeda formatada', async () => {
    api.getDashboard.mockResolvedValue({
      ...data,
      insights: [
        { kind: 'positive', icon: 'trending', title: 'Rendimento a subir',
          detail: 'Este mês ganhaste mais {eur:12.50} que em junho de 2026.' },
      ],
    })
    render(<DashboardPage />)

    // o token é substituído pelo valor formatado (fmtEur) — nunca aparece cru
    await waitFor(() => expect(screen.getByText(/Este mês ganhaste mais/)).toBeInTheDocument())
    expect(screen.queryByText(/\{eur:/)).not.toBeInTheDocument()
    expect(screen.getByText(/12,50/)).toBeInTheDocument()
  })

  it('mostra estados vazios de destaques e atividade', async () => {
    api.getDashboard.mockResolvedValue({ ...data, insights: [], recentActivity: [] })
    render(<DashboardPage />)

    await waitFor(() => expect(screen.getByText(/Sem destaques por agora/)).toBeInTheDocument())
    expect(screen.getByText('Ainda sem atividade registada.')).toBeInTheDocument()
  })

  it('mostra estado de erro quando a API falha', async () => {
    api.getDashboard.mockRejectedValue(new Error('boom'))
    render(<DashboardPage />)

    await waitFor(() => expect(screen.getByText('Não foi possível carregar o painel')).toBeInTheDocument())
  })
})
