import { useEffect, useState } from 'react'
import { api, fmtEur } from '../api'
import { IconLock, IconInfo } from '../components/Icons'
import { codeOf } from '../components/code'

const CATEGORY_ORDER = ['Investimento', 'Poupança', 'Consistência', 'Objetivos', 'Rentabilidade', 'Planeamento']

function fmtValue(v, unit) {
  if (v == null) return ''
  if (unit === 'eur') return fmtEur(v)
  if (unit === 'pct') return `${Math.round(v)}%`
  return String(Math.round(v))
}

export default function AchievementsPage() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    api.getAchievements().then(setData).catch(() => setError(true))
  }, [])

  if (error) {
    return (
      <div className="card">
        <div className="empty-state">
          <div className="empty-icon"><IconInfo size={24} /></div>
          <h4>Não foi possível carregar as conquistas</h4>
          <p>Tenta recarregar a página.</p>
        </div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="ach">
        <div className="skeleton" style={{ height: 108, borderRadius: 20 }} />
        <div className="ach-grid">
          {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 140, borderRadius: 16 }} />)}
        </div>
      </div>
    )
  }

  const byCategory = CATEGORY_ORDER
    .map((cat) => ({ cat, items: data.achievements.filter((a) => a.category === cat) }))
    .filter((g) => g.items.length > 0)

  return (
    <div className="ach">
      {/* ---------- nível ---------- */}
      <section className="card level-card">
        <div className="mono level-badge">{data.level}</div>
        <div className="level-info">
          <div className="level-top">
            <h3>Nível {data.level} · {data.levelName}</h3>
            <span className="mono level-points">{data.points} pontos</span>
          </div>
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${Math.round(data.pointsIntoLevel / data.pointsForNextLevel * 100)}%` }} />
          </div>
          <div className="level-foot">
            <span>{data.level >= 8 ? 'Nível máximo atingido!' : `${data.pointsForNextLevel - data.pointsIntoLevel} pontos para o nível ${data.level + 1}`}</span>
            <span>{data.unlocked}/{data.total} desbloqueadas · {data.percentUnlocked}%</span>
          </div>
        </div>
      </section>

      {/* ---------- medalhas por categoria ---------- */}
      {byCategory.map((group) => (
        <div key={group.cat} className="ach-section">
          <div className="section-label">{group.cat}</div>
          <div className="ach-grid">
            {group.items.map((a) => (
              <div key={a.id} className={`card ach-card ${a.unlocked ? 'unlocked' : 'locked'}`}>
                <div className="ach-top">
                  <span className={`code-chip ${a.unlocked ? 'accent' : ''}`}>
                    {a.unlocked ? codeOf(a.title) : <IconLock size={14} />}
                  </span>
                  <span className="mono ach-points">{a.points} pt</span>
                </div>
                <div className="ach-body">
                  <strong>{a.title}</strong>
                  <span>{a.description}</span>
                </div>
                <div className="ach-progress">
                  <div className="progress-track">
                    <div className={`progress-fill ${a.unlocked ? 'done' : ''}`}
                         style={{ width: `${a.unlocked ? 100 : a.progress}%` }} />
                  </div>
                  <span className={`mono ${a.unlocked ? 'pos' : ''}`}>
                    {a.unlocked
                      ? 'Desbloqueada'
                      : a.unit !== 'bool'
                        ? `${fmtValue(a.current, a.unit)} / ${fmtValue(a.target, a.unit)}`
                        : 'Por desbloquear'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
