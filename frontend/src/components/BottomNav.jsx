/**
 * Navegação principal em mobile (escondida por CSS acima dos 900px).
 *
 * Três separadores largos — Início · Dinheiro · Crescer — em vez de quatro
 * apertados mais um "Mais". Os destinos que antes viviam na sheet passaram para
 * os segmentos no topo de cada separador (ver `Segments`).
 *
 * O indicador é um único elemento deslocado por transform — daí o `--i` com o
 * índice do separador ativo. O bloco `prefers-reduced-motion` do styles.css já
 * neutraliza a animação.
 */
export default function BottomNav({ tabs, activeTab, onSelect }) {
  const activeIndex = tabs.findIndex((t) => t.id === activeTab)

  return (
    <nav className="bottom-nav" aria-label="Navegação principal">
      {activeIndex >= 0 && (
        <span className="bn-indicator" aria-hidden="true"
              style={{ '--i': activeIndex, '--n': tabs.length }} />
      )}

      {tabs.map((t) => {
        const active = t.id === activeTab
        return (
          <button key={t.id} type="button"
                  className={active ? 'active' : ''}
                  aria-current={active ? 'page' : undefined}
                  onClick={() => onSelect(t)}>
            <t.icon size={20} />
            <span>{t.label}</span>
          </button>
        )
      })}
    </nav>
  )
}
