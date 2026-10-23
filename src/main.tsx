import './index.css'

/**
 * ORDEM IMPORTA: o socket.io-client captura `globalThis.WebSocket` quando é importado. Para o MSW interceptar
 * o socket, os mocks sobem ANTES de qualquer módulo do app (que importa o socket.io-client) ser avaliado.
 */
async function bootstrap() {
  if (import.meta.env.VITE_ENABLE_MOCKS !== 'false') {
    const { startMocks } = await import('./mocks/browser')
    await startMocks()
  }
  const { mountApp } = await import('./app/mount')
  mountApp(document.getElementById('root')!)
}
void bootstrap()
