/**
 * Superfície de controle dos mocks, exposta em `window.__kurio` quando os mocks estão ativos.
 * Serve ao desenvolvimento manual e ao Playwright. IMPORTANTE: todo evento daqui passa pelo servidor
 * Socket.IO simulado e chega à UI através do socket.io-client — nunca escreve direto no cache ou no estado.
 */
import { SOCKET_EVENTS, type EditionId, type NftUpdatedEvent, type OrderUpdatedEvent } from '@/contracts'
import { getDb, resetDb, saveDb } from './db'
import { getNft, mutateNft, nftEvent, orderEvent, settleOrder } from './domain'
import { hub } from './hub'
import { getScenario, PRESETS, setScenario } from './scenarios'

export const controls = {
  presets: Object.keys(PRESETS),
  scenario: { get: () => getScenario(), set: (names: string[]) => setScenario(names) },
  /** Restaura integralmente as fixtures e o cenário padrão. */
  reset: () => {
    resetDb()
    setScenario(['default'])
  },
  session: {
    /** Expira todas as sessões (a próxima requisição autenticada recebe 401 SESSION_EXPIRED). */
    expireAll: () => {
      for (const s of Object.values(getDb().sessions)) s.expiresAt = 0
      saveDb()
    },
  },
  realtime: {
    connections: () => hub.size(),
    dropConnections: () => hub.dropAll(),
    setOffline: (offline: boolean) => hub.setOffline(offline),
    /** Muda preço e/ou disponibilidade e publica nft.updated (versão incrementada). */
    updateNft: (id: string, change: { price?: string; availability?: Partial<Record<EditionId, number>> }) => mutateNft(id, change),
    /** Reentrega o último estado do NFT com o MESMO id de evento: o cliente deve ignorar a duplicata. */
    duplicateNftEvent: (id: string) => hub.publish(nftEvent(getNft(id), `evt_dup_${id}_${getNft(id).version}`)),
    /** Publica um evento antigo (versão anterior): o cliente não pode regredir o estado. */
    staleNftEvent: (id: string, price = '9.99') => {
      const nft = getNft(id)
      const ev: NftUpdatedEvent = { ...nftEvent(nft, `evt_stale_${id}_${Date.now()}`), version: Math.max(0, nft.version - 1), data: { price, previousPrice: null, editions: nft.editions.map((e) => ({ id: e.id, available: e.available })) } }
      hub.publish(ev)
    },
    /** Resolve imediatamente um pedido pendente (confirmado/recusado conforme o cenário) e emite order.updated. */
    settleOrder: (id: string) => {
      const o = getDb().orders[id]
      if (o) settleOrder(o)
    },
    /** Reentrega o estado atual do pedido com o mesmo id de evento. */
    duplicateOrderEvent: (id: string) => {
      const o = getDb().orders[id]
      if (o) hub.publish({ ...orderEvent(o), id: `evt_dup_${id}_${o.version}` } satisfies OrderUpdatedEvent)
    },
  },
  events: SOCKET_EVENTS,
}
export type KurioControls = typeof controls
