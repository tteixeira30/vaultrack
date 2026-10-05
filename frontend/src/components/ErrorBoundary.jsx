import { Component } from 'react'
import { reportError } from '../clientErrors'
import { IconAlert } from './Icons'

/**
 * Apanha um erro de renderização e mostra "Algo correu mal" em vez de um ecrã em branco.
 * No App fica à volta de cada ecrã (dentro do page-swap, cuja key o reinicia ao mudar de
 * ecrã — a navegação continua a funcionar) e na raiz, para o que falhar fora dos ecrãs.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { failed: false }
  }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error) {
    reportError(error)
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <section className="card" role="alert">
        <div className="empty-state">
          <div className="empty-icon"><IconAlert size={20} /></div>
          <h4>Algo correu mal</h4>
          <p>Este ecrã encontrou um erro inesperado. O erro ficou registado; recarregar costuma resolver.</p>
          <button type="button" className="btn" onClick={() => window.location.reload()}>Recarregar</button>
        </div>
      </section>
    )
  }
}
