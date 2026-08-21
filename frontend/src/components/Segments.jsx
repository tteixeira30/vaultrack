/**
 * Barra de segmentos sob o cabeçalho mobile.
 *
 * É o que substitui a sheet "Mais": cada separador da barra inferior que agrupa
 * mais do que um ecrã abre com estes segmentos à vista, para se perceber logo o
 * que lá está.
 */
export default function Segments({ items, active, onSelect, label = 'Secções' }) {
  if (items.length < 2) return null

  return (
    <div className="segments" role="tablist" aria-label={label}>
      {items.map((it) => {
        const on = it.id === active
        return (
          <button key={it.id} type="button" role="tab" aria-selected={on}
                  className={on ? 'active' : ''}
                  onClick={() => onSelect(it.id)}>
            {it.label}
          </button>
        )
      })}
    </div>
  )
}
