import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import AchievementsPage from '../pages/AchievementsPage'
import { api } from '../api'

// mantém os formatadores reais (fmtEur etc.), substitui só o objeto `api`
vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, api: { getAchievements: vi.fn() } }
})

const payload = {
  level: 3,
  levelName: 'Poupador',
  points: 120,
  pointsIntoLevel: 20,
  pointsForNextLevel: 50,
  unlocked: 4,
  total: 10,
  percentUnlocked: 40,
  achievements: [
    { id: 'a1', category: 'Investimento', icon: 'trending', title: 'Primeiro investimento',
      description: 'Cria um investimento', points: 10, unlocked: true, unit: 'bool' },
    { id: 'a2', category: 'Poupança', icon: 'coins', title: 'Poupar 1000€',
      description: 'Junta 1000€', points: 20, unlocked: false, unit: 'eur',
      progress: 50, current: 500, target: 1000 },
  ],
}

describe('AchievementsPage', () => {
  beforeEach(() => vi.clearAllMocks())

  it('mostra o esqueleto enquanto carrega', () => {
    api.getAchievements.mockReturnValue(new Promise(() => {})) // nunca resolve
    const { container } = render(<AchievementsPage />)
    expect(container.querySelector('.skeleton')).toBeInTheDocument()
  })

  it('mostra nível, pontos e conquistas por categoria', async () => {
    api.getAchievements.mockResolvedValue(payload)
    render(<AchievementsPage />)

    await waitFor(() => expect(screen.getByText('Nível 3 · Poupador')).toBeInTheDocument())
    expect(screen.getByText('120 pontos')).toBeInTheDocument()
    expect(screen.getByText('4/10 desbloqueadas · 40%')).toBeInTheDocument()
    // conquista desbloqueada e bloqueada com progresso
    expect(screen.getByText('Primeiro investimento')).toBeInTheDocument()
    expect(screen.getByText('Desbloqueada')).toBeInTheDocument()
    expect(screen.getByText('Poupar 1000€')).toBeInTheDocument()
    // categorias como secções
    // as categorias são rótulos de secção, não cabeçalhos
    const labels = [...document.querySelectorAll('.section-label')].map((e) => e.textContent)
    expect(labels).toContain('Investimento')
    expect(labels).toContain('Poupança')
  })

  it('mostra estado de erro quando a API falha', async () => {
    api.getAchievements.mockRejectedValue(new Error('boom'))
    render(<AchievementsPage />)

    await waitFor(() =>
      expect(screen.getByText('Não foi possível carregar as conquistas')).toBeInTheDocument())
  })
})
