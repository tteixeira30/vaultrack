import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { IconChevronRight } from './Icons'

/**
 * Sheet com os destinos que não cabem na barra inferior.
 *
 * As definições de conta (moeda, tema, privacidade, terminar sessão) continuam
 * no menu de perfil, atrás do avatar — é onde já estavam e onde se esperam.
 * Aqui ficam só destinos de navegação.
 */
export default function MoreSheet({ open, tabs, tab, onSelect, onClose }) {
  const titleId = useId()
  const panelRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    // o foco entra na sheet para quem navega por teclado / leitor de ecrã
    panelRef.current?.querySelector('button')?.focus()
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div className="sheet-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet more-sheet" role="dialog" aria-modal="true" aria-labelledby={titleId}
           ref={panelRef}>
        <span className="sheet-grabber" aria-hidden="true" />
        <h2 className="sheet-title" id={titleId}>Mais</h2>
        <div className="sheet-body">
          {tabs.map((t) => (
            <button key={t.id} type="button"
                    className={`profile-item ${tab === t.id ? 'active' : ''}`}
                    aria-current={tab === t.id ? 'page' : undefined}
                    onClick={() => onSelect(t.id)}>
              <t.icon size={18} />
              <span>{t.label}</span>
              <IconChevronRight size={15} className="profile-item-caret" />
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  )
}
