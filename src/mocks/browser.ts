import { setupWorker } from 'msw/browser'
import { controls } from './control'
import { createHandlers } from './handlers'
import { createSocketHandlers } from './socket'
import { setScenario } from './scenarios'
import { resetDb } from './db'

declare global {
  interface Window {
    __kurio?: typeof controls
  }
}

/** Liga a camada de mocks (REST + Socket.IO). Lê ?scenario=... e ?reset=1 da URL. */
export async function startMocks(): Promise<void> {
  const params = new URLSearchParams(location.search)
  if (params.has('reset')) resetDb()
  const names = params.get('scenario')
  if (names !== null) setScenario(names.split(',').filter(Boolean))
  if (params.has('reset') || names !== null) {
    params.delete('reset')
    params.delete('scenario')
    const qs = params.toString()
    history.replaceState(null, '', `${location.pathname}${qs ? `?${qs}` : ''}${location.hash}`)
  }
  window.__kurio = controls
  const worker = setupWorker(...createHandlers('/api'), ...createSocketHandlers())
  await worker.start({ onUnhandledRequest: 'bypass', serviceWorker: { url: '/mockServiceWorker.js' }, quiet: true })
}
