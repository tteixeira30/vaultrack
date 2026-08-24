import React from 'react'
import ReactDOM from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import './styles.css'

// Service worker com atualização automática. O registo tem de ser este (e não o
// script que o vite-plugin-pwa injeta sozinho): só esta versão recarrega a
// página quando o service worker novo assume o controlo. Sem isso, uma página
// aberta antes de um deploy continuava a pedir os ficheiros da versão anterior
// — que já não existem no servidor — e o import() do parser de PDF rebentava.
// O `update()` de hora a hora serve as páginas que ficam abertas o dia todo.
registerSW({
  immediate: true,
  onRegisteredSW(_url, registration) {
    if (registration) setInterval(() => registration.update(), 60 * 60 * 1000)
  },
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
