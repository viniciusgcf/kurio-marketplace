import type { NftUpdatedEvent, OrderUpdatedEvent } from '@/contracts'
import { getScenario } from './scenarios'

/**
 * Hub de conexões Socket.IO simuladas. Cada conexão real (socket.io-client -> MSW) se registra aqui.
 * Eventos privados (order.updated) só chegam à conexão cujo usuário foi autenticado via session.subscribe.
 */
export interface HubConnection {
  id: number
  userId: string | null
  emit(event: string, payload: unknown): void
  close(code?: number, reason?: string): void
}

const connections = new Set<HubConnection>()
let offline = false
let seq = 0

export const hub = {
  nextId: () => ++seq,
  add: (c: HubConnection) => void connections.add(c),
  remove: (c: HubConnection) => void connections.delete(c),
  size: () => connections.size,
  isOffline: () => offline,
  /** Simula queda do serviço de tempo real: derruba conexões e recusa novas até setOffline(false). */
  setOffline(value: boolean) {
    offline = value
    if (value) hub.dropAll()
  },
  dropAll(code = 4000) {
    for (const c of [...connections]) c.close(code, 'mock: connection dropped')
  },
  publish(event: NftUpdatedEvent | OrderUpdatedEvent) {
    const copies = getScenario().duplicateEvents ? 2 : 1
    for (const c of connections) {
      if (event.type === 'order.updated' && c.userId !== event.userId) continue
      for (let i = 0; i < copies; i++) c.emit(event.type, event)
    }
  },
}
