import Sheet from './Sheet'
import { IconChevronRight } from './Icons'

/**
 * Sheet com os destinos que não cabem na barra inferior.
 *
 * As definições de conta (moeda, tema, privacidade, terminar sessão) continuam
 * no menu de perfil, atrás do avatar — é onde já estavam e onde se esperam.
 * Aqui ficam só destinos de navegação.
 */
export default function MoreSheet({ open, tabs, tab, onSelect, onClose }) {
  return (
    <Sheet open={open} title="Mais" onClose={onClose} className="more-sheet">
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
    </Sheet>
  )
}
