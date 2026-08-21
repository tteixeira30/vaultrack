import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { SCREENS, NAV_GROUPS } from './nav'
import { IconSearch } from './Icons'

/** Ignora acentos e maiúsculas ao procurar — "calendario" encontra "Calendário". */
const fold = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

/**
 * Paleta de comandos (⌘K / Ctrl+K).
 *
 * Só navegação e ações de criação — deliberadamente curta. As ações delegam no
 * mesmo mecanismo do menu "Adicionar" (ver `IntentContext`).
 */
export default function CommandPalette({ open, onClose, onGo, actions }) {
  const [q, setQ] = useState('')
  const [i, setI] = useState(0)
  const inputRef = useRef(null)

  const items = useMemo(() => {
    const nav = NAV_GROUPS.flatMap((g) =>
      g.ids.map((id) => ({ key: `go:${id}`, group: g.name, label: SCREENS[id].label, hint: SCREENS[id].subtitle, run: () => onGo(id) })))
    const acts = actions.map((a) => ({ key: `do:${a.id}`, group: 'Adicionar', label: a.label, hint: a.note, run: a.run }))
    const all = [...nav, ...acts]
    if (!q.trim()) return all
    const needle = fold(q.trim())
    return all.filter((it) => fold(`${it.label} ${it.hint ?? ''}`).includes(needle))
  }, [q, actions, onGo])

  useEffect(() => { setI(0) }, [q])
  useEffect(() => {
    if (!open) return
    setQ('')
    // o autoFocus do React não chega: o elemento só existe depois do portal
    const t = setTimeout(() => inputRef.current?.focus(), 0)
    return () => clearTimeout(t)
  }, [open])

  if (!open) return null

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setI((n) => Math.min(n + 1, items.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setI((n) => Math.max(n - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); items[i]?.run(); onClose() }
    else if (e.key === 'Escape') { e.preventDefault(); onClose() }
  }

  let lastGroup = null

  return createPortal(
    <div className="palette-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="palette" role="dialog" aria-modal="true" aria-label="Ir para">
        <div className="palette-search">
          <IconSearch size={16} />
          <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKeyDown}
                 placeholder="Ir para…" aria-label="Procurar ecrã ou ação" />
          <kbd>esc</kbd>
        </div>
        <div className="palette-list">
          {items.length === 0 && <p className="palette-empty">Sem resultados para “{q}”.</p>}
          {items.map((it, n) => {
            const head = it.group !== lastGroup ? it.group : null
            lastGroup = it.group
            return (
              <div key={it.key}>
                {head && <div className="palette-group">{head}</div>}
                <button type="button" className={`palette-item ${n === i ? 'sel' : ''}`}
                        onMouseEnter={() => setI(n)}
                        onClick={() => { it.run(); onClose() }}>
                  <span className="pi-label">{it.label}</span>
                  {it.hint && <span className="pi-hint">{it.hint}</span>}
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </div>,
    document.body,
  )
}
