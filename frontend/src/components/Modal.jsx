import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { IconAlert, IconX } from './Icons'
import { useFocusTrap } from './useFocusTrap'
import { useIsMobile } from './useMediaQuery'
import { useScrollLock } from './useScrollLock'
import { useSheetDrag } from './useSheetDrag'

export default function Modal({
  open, title, subtitle, onClose, children, footer, width = 540, dirty = false,
  onSubmit, busy = false,
}) {
  // quando o form tem alterações por guardar, pedir confirmação antes de descartar
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const titleId = useId()
  const panelRef = useRef(null)
  const isMobile = useIsMobile()

  // tentativa de fechar "acidental" (clique fora, Escape, X, arrasto): se estiver
  // sujo, confirmar
  const requestClose = () => {
    if (dirty) setConfirmDiscard(true)
    else onClose()
  }

  // em mobile o modal é um bottom sheet e arrasta-se para fechar, sempre pelo
  // requestClose para a proteção de alterações por guardar continuar a valer
  const drag = useSheetDrag(requestClose, { enabled: open && isMobile && !confirmDiscard })

  useScrollLock(open)
  // com a confirmação aberta é ela que prende o foco
  useFocusTrap(panelRef, open && !confirmDiscard)

  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key !== 'Escape') return
      // com a confirmação aberta, Escape cancela apenas a confirmação
      if (confirmDiscard) setConfirmDiscard(false)
      else requestClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose, dirty, confirmDiscard])

  // ao fechar (ou reabrir) o modal, limpar o estado da confirmação
  useEffect(() => { if (!open) setConfirmDiscard(false) }, [open])

  if (!open) return null

  return createPortal(
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && requestClose()}>
      <div className="modal" style={{ maxWidth: width, ...drag.style }}
           role="dialog" aria-modal="true" aria-labelledby={titleId}
           ref={panelRef} tabIndex={-1}>
        {/* zona de arrasto: a pega fica fora da linha flex do cabeçalho, senão
            um flex-basis de 100% esmagava o título contra o botão de fechar */}
        <div className="modal-top" {...drag.handlers}>
          {isMobile && <span className="sheet-grabber" aria-hidden="true" />}
          <div className="modal-head">
            <div className="modal-head-text">
              <h3 id={titleId}>{title}</h3>
              {subtitle && <p className="modal-subtitle">{subtitle}</p>}
            </div>
            <button className="icon-btn" onClick={requestClose} aria-label="Fechar">
              <IconX size={18} />
            </button>
          </div>
        </div>
        <div className="modal-body">
          {onSubmit ? (
            <form onSubmit={(e) => { e.preventDefault(); onSubmit() }}>
              {children}
              {/* O botão real vive no rodapé, que é irmão do corpo e por isso
                  nunca pode ser o submit deste form. Este botão-fantasma é o
                  que dá ao Enter o significado de "submeter" num formulário
                  com vários campos; fica desativado durante o gravar para não
                  haver duplo envio. */}
              <button type="submit" hidden disabled={busy} aria-hidden="true" tabIndex={-1} />
            </form>
          ) : children}
        </div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>

      {confirmDiscard && (
        <ConfirmDialog
          open
          title="Descartar alterações?"
          message="Tens dados por guardar neste formulário. Se saíres agora, perdes o que escreveste."
          confirmLabel="Descartar"
          cancelLabel="Continuar a editar"
          onCancel={() => setConfirmDiscard(false)}
          onConfirm={() => { setConfirmDiscard(false); onClose() }}
        />
      )}
    </div>,
    document.body,
  )
}

export function ConfirmDialog({
  open, title, message, confirmLabel = 'Eliminar', cancelLabel = 'Cancelar',
  onConfirm, onCancel, busy,
}) {
  const titleId = useId()
  const panelRef = useRef(null)

  // Ao contrário das outras sobreposições, esta não se arrasta para fechar: uma
  // confirmação destrutiva não deve ter uma saída acidental.
  useScrollLock(open)
  useFocusTrap(panelRef, open)

  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && onCancel()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onCancel])

  if (!open) return null

  return createPortal(
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="modal modal-confirm" role="alertdialog" aria-modal="true" aria-labelledby={titleId}
           ref={panelRef} tabIndex={-1}>
        <div className="confirm-icon"><IconAlert size={26} /></div>
        <h3 id={titleId}>{title}</h3>
        <p>{message}</p>
        <div className="confirm-actions">
          <button className="btn ghost" onClick={onCancel} disabled={busy}>{cancelLabel}</button>
          <button className="btn danger" onClick={onConfirm} disabled={busy}>
            {busy ? 'A eliminar…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
