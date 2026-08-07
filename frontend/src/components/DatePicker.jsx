import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { IconCalendar, IconChevronLeft, IconChevronRight } from './Icons'
import Sheet from './Sheet'
import { useIsMobile } from './useMediaQuery'

const WEEKDAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']

const pad = (n) => String(n).padStart(2, '0')
const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`
const todayIso = () => {
  const t = new Date()
  return iso(t.getFullYear(), t.getMonth() + 1, t.getDate())
}
const fmtDisplay = (v) => {
  if (!v) return ''
  const [y, m, d] = v.split('-')
  return `${d}/${m}/${y}`
}
const fmtMonth = (view) => {
  const [y, m] = view.split('-').map(Number)
  const s = new Date(y, m - 1, 1).toLocaleDateString('pt-PT', { month: 'long', year: 'numeric' })
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** Seletor de data com o visual da app (substitui o <input type="date"> nativo). */
export default function DatePicker({ value, onChange, placeholder = 'Seleciona a data' }) {
  const [open, setOpen] = useState(false)
  const [view, setView] = useState(() => (value || todayIso()).slice(0, 7))
  const [pos, setPos] = useState(null)
  const ref = useRef(null)
  const popRef = useRef(null)
  // a grelha de 7 colunas é o pior caso num telemóvel: em popover dá células de
  // ~34px. Em sheet há largura para as pôr nos 44px.
  const isMobile = useIsMobile()

  // Posiciona o popover em coordenadas fixas (via portal) para não ser cortado
  // pelo overflow do modal — flutua por cima em vez de empurrar o conteúdo.
  useLayoutEffect(() => {
    if (!open || isMobile) return
    const place = () => {
      const el = ref.current
      if (!el) return
      const r = el.getBoundingClientRect()
      const POP_W = popRef.current?.offsetWidth || 260
      const POP_H = popRef.current?.offsetHeight || 330
      const GAP = 6
      const left = Math.max(8, Math.min(r.left, window.innerWidth - POP_W - 8))
      let top = r.bottom + GAP
      if (top + POP_H > window.innerHeight - 8 && r.top - GAP - POP_H > 8) top = r.top - GAP - POP_H
      setPos({ top, left })
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open, isMobile])

  useEffect(() => {
    if (!open || isMobile) return
    const onDown = (e) => {
      if (ref.current?.contains(e.target)) return
      if (popRef.current?.contains(e.target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open, isMobile])

  const toggle = () => {
    if (!open) { setView((value || todayIso()).slice(0, 7)); setPos(null) }
    setOpen((o) => !o)
  }
  const shift = (delta) => {
    const [y, m] = view.split('-').map(Number)
    const d = new Date(y, m - 1 + delta, 1)
    setView(`${d.getFullYear()}-${pad(d.getMonth() + 1)}`)
  }
  const pick = (day) => {
    const [y, m] = view.split('-').map(Number)
    onChange(iso(y, m, day))
    setOpen(false)
  }

  const [y, m] = view.split('-').map(Number)
  const lead = (new Date(y, m - 1, 1).getDay() + 6) % 7
  const days = new Date(y, m, 0).getDate()
  const cells = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)]
  const today = todayIso()

  const calendar = (
    <>
      <div className="dp-head">
        <button type="button" className="icon-btn" onClick={() => shift(-1)} aria-label="Mês anterior"><IconChevronLeft size={17} /></button>
        <span className="dp-month">{fmtMonth(view)}</span>
        <button type="button" className="icon-btn" onClick={() => shift(1)} aria-label="Mês seguinte"><IconChevronRight size={17} /></button>
      </div>
      <div className="dp-grid">
        {WEEKDAYS.map((w) => <span key={w} className="dp-wd">{w}</span>)}
        {cells.map((day, i) => {
          if (!day) return <span key={i} className="dp-day empty" />
          const cellIso = iso(y, m, day)
          return (
            <button key={i} type="button"
                    className={`dp-day ${cellIso === value ? 'selected' : ''} ${cellIso === today ? 'today' : ''}`}
                    onClick={() => pick(day)}>
              {day}
            </button>
          )
        })}
      </div>
      <div className="dp-foot">
        <button type="button" onClick={() => { onChange(''); setOpen(false) }}>Limpar</button>
        <button type="button" onClick={() => { const t = todayIso(); onChange(t); setView(t.slice(0, 7)); setOpen(false) }}>Hoje</button>
      </div>
    </>
  )

  return (
    <div className={`datepicker ${open ? 'open' : ''}`} ref={ref}>
      <button type="button" className="dp-trigger" onClick={toggle}>
        <span className={value ? '' : 'dp-placeholder'}>{value ? fmtDisplay(value) : placeholder}</span>
        <IconCalendar size={16} />
      </button>

      {isMobile ? (
        <Sheet open={open} title={placeholder} onClose={() => setOpen(false)} className="dp-sheet">
          <div className="dp-pop dp-pop-sheet" ref={popRef}>{calendar}</div>
        </Sheet>
      ) : (
        open && createPortal(
          <div className="dp-pop" ref={popRef}
               style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999, visibility: pos ? 'visible' : 'hidden' }}>
            {calendar}
          </div>,
          document.body
        )
      )}
    </div>
  )
}
