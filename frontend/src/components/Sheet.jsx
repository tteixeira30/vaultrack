import { useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useFocusTrap } from './useFocusTrap'
import { useScrollLock } from './useScrollLock'
import { useSheetDrag } from './useSheetDrag'

/**
 * Bottom sheet: o padrão de sobreposição em mobile.
 *
 * Vai para um portal no body — dentro da árvore da página ficaria sujeito a
 * qualquer `transform` de um antepassado (ex.: a animação de entrada da página),
 * que transforma `position: fixed` em posicionamento relativo a esse elemento.
 *
 * O arrasto está só na pega e no cabeçalho; o corpo fica livre para fazer
 * scroll. `draggable={false}` para confirmações destrutivas, que não devem ter
 * uma saída acidental.
 */
export default function Sheet({ open, title, onClose, children, draggable = true, className = '' }) {
  const titleId = useId()
  const panelRef = useRef(null)
  const drag = useSheetDrag(onClose, { enabled: draggable })

  useScrollLock(open)
  useFocusTrap(panelRef, open)

  if (!open) return null

  const onKeyDown = (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); onClose() }
  }

  return createPortal(
    <div className="sheet-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`sheet ${className}`} role="dialog" aria-modal="true" aria-labelledby={titleId}
           ref={panelRef} tabIndex={-1} onKeyDown={onKeyDown} style={drag.style}>
        <div className="sheet-head" {...drag.handlers}>
          {draggable && <span className="sheet-grabber" aria-hidden="true" />}
          <h2 className="sheet-title" id={titleId}>{title}</h2>
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </div>,
    document.body,
  )
}
