import { IconMore } from './Icons'

/**
 * Navegação principal em mobile (escondida por CSS acima dos 900px).
 *
 * Só os separadores primários cabem com folga num ecrã de telemóvel: com seis
 * botões cada um ficava com ~60px de largura. Os restantes vivem na sheet
 * "Mais", que é também o único sítio onde as Conquistas aparecem na navegação
 * (no desktop continuam a chegar-se pelo menu de perfil).
 *
 * O indicador é um único elemento deslocado por transform — daí o `--i` com o
 * índice do botão ativo. O bloco `prefers-reduced-motion` do styles.css já
 * neutraliza a animação.
 */
export default function BottomNav({ tabs, tab, onSelect, moreActive, onOpenMore }) {
  // com "Mais" no fim, o indicador percorre tabs.length + 1 posições
  const slots = tabs.length + 1
  const activeIndex = moreActive ? tabs.length : tabs.findIndex((t) => t.id === tab)

  return (
    <nav className="bottom-nav" aria-label="Navegação principal">
      {activeIndex >= 0 && (
        <span className="bn-indicator" aria-hidden="true"
              style={{ '--i': activeIndex, '--n': slots }} />
      )}

      {tabs.map((t) => {
        const active = !moreActive && tab === t.id
        return (
          <button key={t.id} type="button"
                  className={active ? 'active' : ''}
                  aria-current={active ? 'page' : undefined}
                  onClick={() => onSelect(t.id)}>
            <t.icon size={21} />
            <span>{t.label}</span>
          </button>
        )
      })}

      <button type="button"
              className={moreActive ? 'active' : ''}
              aria-haspopup="dialog" aria-expanded={moreActive}
              onClick={onOpenMore}>
        <IconMore size={21} />
        <span>Mais</span>
      </button>
    </nav>
  )
}
