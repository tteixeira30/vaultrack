import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { IconChevronRight } from './Icons'
import Sheet from './Sheet'
import { useIsMobile } from './useMediaQuery'

const POP_MAX = 300   // altura máxima do menu
const POP_MIN_W = 140 // largura mínima (triggers estreitos, ex.: seletor de moeda)

/**
 * Dropdown com o visual da app (substitui o <select> nativo).
 * O menu é renderizado num portal com posição fixa, para nunca ficar cortado
 * por contentores com overflow (ex.: corpo de modais com scroll).
 *
 * `label` dá nome acessível ao trigger. Os <label> dos formulários são apenas
 * visuais (não envolvem o controlo nem usam htmlFor), por isso sem isto o botão
 * anuncia só o valor selecionado e fica indistinguível dos outros da mesma janela.
 */
export default function Dropdown({ value, onChange, options = [], placeholder = 'Seleciona…', label }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState(null)
  const ref = useRef(null)
  const popRef = useRef(null)
  // no telemóvel um popover ancorado fica apertado e o teclado tapa-o; a sheet
  // dá opções de 44px e não depende de haver espaço por baixo do campo
  const isMobile = useIsMobile()

  const place = () => {
    if (!ref.current) return
    const rect = ref.current.getBoundingClientRect()
    const below = window.innerHeight - rect.bottom - 8
    const above = rect.top - 8
    const up = below < Math.min(POP_MAX, above)
    const width = Math.max(rect.width, POP_MIN_W)
    setPos({
      left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
      width,
      maxHeight: Math.max(140, Math.min(POP_MAX, up ? above : below)),
      top: up ? undefined : rect.bottom + 6,
      bottom: up ? window.innerHeight - rect.top + 6 : undefined,
    })
  }

  useEffect(() => {
    if (!open || isMobile) return
    const onDown = (e) => {
      if (ref.current?.contains(e.target) || popRef.current?.contains(e.target)) return
      setOpen(false)
    }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    // reposiciona se algo fizer scroll (ex.: corpo do modal) ou a janela mudar de tamanho
    const onMove = () => place()
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onMove, true)
    window.addEventListener('resize', onMove)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onMove, true)
      window.removeEventListener('resize', onMove)
    }
  }, [open, isMobile])

  const selected = options.find((o) => o.value === value)

  const toggle = () => {
    setOpen((wasOpen) => {
      if (!wasOpen && !isMobile) place()
      return !wasOpen
    })
  }

  const pick = (val) => {
    onChange(val)
    setOpen(false)
  }

  return (
    <div className={`dropdown ${open ? 'open' : ''}`} ref={ref}>
      <button type="button" className="dd-trigger" onClick={toggle} aria-expanded={open} aria-haspopup="listbox"
              aria-label={label}>
        <span className={selected ? '' : 'dd-placeholder'}>{selected ? selected.label : placeholder}</span>
        <IconChevronRight size={16} className="dd-chevron" />
      </button>

      {/* A classe .dd-pop mantém-se nas duas variantes: o menu de perfil
          (App.jsx) usa-a para ignorar cliques-fora que caem num dropdown. */}
      {isMobile ? (
        <Sheet open={open} title={label || placeholder} onClose={() => setOpen(false)} className="dd-sheet">
          <div className="dd-pop dd-pop-sheet" role="listbox" aria-label={label} ref={popRef}>
            {options.map((o) => (
              <button key={o.value} type="button" role="option" aria-selected={o.value === value}
                      className={`dd-option ${o.value === value ? 'selected' : ''}`}
                      onClick={() => pick(o.value)}>
                {o.label}
              </button>
            ))}
          </div>
        </Sheet>
      ) : (
        open && pos && createPortal(
          <div className="dd-pop" role="listbox" aria-label={label} ref={popRef}
               style={{ position: 'fixed', left: pos.left, top: pos.top, bottom: pos.bottom, width: pos.width, maxHeight: pos.maxHeight }}>
            {options.map((o) => (
              <button key={o.value} type="button" role="option" aria-selected={o.value === value}
                      className={`dd-option ${o.value === value ? 'selected' : ''}`}
                      onClick={() => pick(o.value)}>
                {o.label}
              </button>
            ))}
          </div>,
          document.body,
        )
      )}
    </div>
  )
}
