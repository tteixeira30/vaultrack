import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../api'
import { actionLabel, device, fmtWhen, isWarning, summary } from '../activityLabels'
import { IconActivity, IconAlert, IconLock, IconRepeat, IconX } from './Icons'

const KINDS = [
  { id: '', label: 'Tudo' },
  { id: 'security', label: 'Segurança' },
  { id: 'data', label: 'Alterações' },
]

function EventIcon({ event }) {
  if (isWarning(event)) return <IconAlert size={17} />
  if (event.actor === 'SYSTEM') return <IconRepeat size={17} />
  if (event.kind === 'SECURITY') return <IconLock size={17} />
  return <IconActivity size={17} />
}

/**
 * "Atividade recente" do Perfil: entradas na conta e alterações aos dados (o trilho de
 * auditoria do backend). Para admins há um interruptor para ver a de todos os
 * utilizadores; aí, tocar no nome de alguém filtra por essa pessoa.
 */
export default function ActivityCard({ isAdmin = false }) {
  const [kind, setKind] = useState('')
  const [everyone, setEveryone] = useState(false)
  const [userFilter, setUserFilter] = useState(null)
  const [events, setEvents] = useState([])
  const [next, setNext] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  // só a resposta do pedido mais recente conta: trocar de filtro a meio não mistura listas
  const latest = useRef(0)

  const adminView = isAdmin && everyone

  const load = useCallback(async (before) => {
    const id = ++latest.current
    setLoading(true)
    setError('')
    try {
      const opts = { kind, before, userId: adminView ? userFilter?.id : undefined }
      const page = adminView ? await api.getAdminActivity(opts) : await api.getActivity(opts)
      if (id !== latest.current) return
      setEvents((prev) => (before ? [...prev, ...page.events] : page.events))
      setNext(page.nextBefore ?? null)
    } catch (e) {
      if (id === latest.current) setError(e.message)
    } finally {
      if (id === latest.current) setLoading(false)
    }
  }, [kind, adminView, userFilter])

  useEffect(() => { load(null) }, [load])

  const showOnly = (v) => {
    setEveryone(v)
    setUserFilter(null)
  }

  return (
    <section className="card activity-card" aria-labelledby="activity-title">
      <div className="card-header">
        <div>
          <h3 id="activity-title">Atividade recente</h3>
          <div className="sub">Entradas na conta e alterações aos teus dados, guardadas durante 12 meses.</div>
        </div>
        {isAdmin && (
          <div className="seg-pills" role="group" aria-label="De quem">
            <button type="button" className={!everyone ? 'active' : ''} aria-pressed={!everyone}
                    onClick={() => showOnly(false)}>Só eu</button>
            <button type="button" className={everyone ? 'active' : ''} aria-pressed={everyone}
                    onClick={() => showOnly(true)}>Todos os utilizadores</button>
          </div>
        )}
      </div>

      <div className="filter-chips activity-filters" role="group" aria-label="Tipo de atividade">
        {KINDS.map((k) => (
          <button key={k.id} type="button" className={`filter-chip ${kind === k.id ? 'active' : ''}`}
                  aria-pressed={kind === k.id} onClick={() => setKind(k.id)}>
            {k.label}
          </button>
        ))}
        {adminView && userFilter && (
          <button type="button" className="filter-chip active" onClick={() => setUserFilter(null)}
                  aria-label={`Mostrar todos os utilizadores (agora: ${userFilter.name})`}>
            {userFilter.name}
            <IconX size={12} />
          </button>
        )}
      </div>

      {error && <p className="notice warn" role="alert">{error}</p>}

      {!loading && !error && events.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon"><IconActivity size={20} /></div>
          <h4>Sem atividade</h4>
          <p>Ainda não há nada registado com este filtro.</p>
        </div>
      ) : (
        <ul className="activity-list" aria-busy={loading}>
          {events.map((e) => {
            const warn = isWarning(e)
            const detail = summary(e)
            const dev = device(e)
            const who = e.userName || e.userEmail || (e.userId ? `#${e.userId}` : 'Desconhecido')
            return (
              <li key={e.id} className="row-item flat">
                <span className={`row-icon ${warn ? 'amber' : e.kind === 'SECURITY' ? 'accent' : ''}`}>
                  <EventIcon event={e} />
                </span>
                <div className="row-main">
                  <strong>
                    {actionLabel(e)}
                    {warn && <span className="badge amber">Atenção</span>}
                  </strong>
                  {detail && <small>{detail}</small>}
                  <small>
                    <span className="mono">{fmtWhen(e.occurredAt)}</span>
                    {dev && ` · ${dev}`}
                    {e.ip && <> · <span className="mono">{e.ip}</span></>}
                  </small>
                </div>
                {adminView && (e.userId ? (
                  <button type="button" className="filter-chip activity-who"
                          aria-label={`Ver só a atividade de ${who}`}
                          onClick={() => setUserFilter({ id: e.userId, name: who })}>
                    {who}
                  </button>
                ) : <span className="activity-who muted">{who}</span>)}
              </li>
            )
          })}
        </ul>
      )}

      {next && (
        <button type="button" className="btn ghost small activity-more" disabled={loading}
                onClick={() => load(next)}>
          Ver mais
        </button>
      )}
    </section>
  )
}
