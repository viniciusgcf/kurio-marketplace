import type { QueryClient } from '@tanstack/react-query'
import { io, type Socket } from 'socket.io-client'
import {
  NftUpdatedEventSchema, OrderUpdatedEventSchema, SOCKET_EVENTS, type Cart, type Nft, type NftList, type NftUpdatedEvent, type Order,
} from '@/contracts'
import { qk } from '@/app/queries'
import { formatEth } from '@/lib/money'
import { toast } from '@/lib/toast'
import { socketOrigin, SOCKET_PATH } from './config'
import { setRealtimeStatus } from './status'

/** Aplica um evento de NFT nos caches. Só avança: versão <= à atual é descartada. Retorna true se mudou algo. */
export function applyNftEvent(qc: QueryClient, ev: NftUpdatedEvent): boolean {
  let changed = false
  const merge = (n: Nft): Nft => {
    if (n.id !== ev.resource.id || ev.version <= n.version) return n
    changed = true
    return { ...n, price: ev.data.price, previousPrice: ev.data.previousPrice, version: ev.version, editions: n.editions.map((e) => ({ ...e, available: ev.data.editions.find((x) => x.id === e.id)?.available ?? e.available })) }
  }
  qc.setQueryData<Nft>(qk.nft(ev.resource.id), (old) => (old ? merge(old) : old))
  qc.setQueriesData<NftList>({ queryKey: ['nfts', 'list'] }, (old) => (old ? { ...old, items: old.items.map(merge), featured: old.featured ? merge(old.featured) : old.featured } : old))
  return changed
}

/**
 * Liga o socket.io-client para a sessão atual. Devolve a função de limpeza (remove listeners e desconecta),
 * chamada ao trocar de usuário, fazer logout ou desmontar o app.
 */
export function connectRealtime(qc: QueryClient, userId: string | null, getToken: () => string | null): () => void {
  const socket: Socket = io(socketOrigin(), {
    path: SOCKET_PATH,
    transports: ['websocket'], // o servidor simulado (MSW) só intercepta WebSocket
    reconnectionDelay: 400,
    reconnectionDelayMax: 3000,
  })
  setRealtimeStatus('connecting')
  const seen = new Set<string>() // reentregas do mesmo evento são ignoradas pelo id
  const remember = (id: string) => { if (seen.has(id)) return false; seen.add(id); if (seen.size > 500) seen.delete(seen.values().next().value as string); return true }
  let everConnected = false

  socket.on('connect', () => {
    setRealtimeStatus('online')
    socket.emit(SOCKET_EVENTS.subscribe, { token: getToken() })
    // Depois de uma queda, eventos podem ter sido perdidos: reconcilia o que está na tela com a API REST.
    if (everConnected) {
      void qc.invalidateQueries({ queryKey: qk.nfts, refetchType: 'active' })
      void qc.invalidateQueries({ queryKey: ['cart'], refetchType: 'active' })
      void qc.invalidateQueries({ queryKey: ['user'], refetchType: 'active' })
    }
    everConnected = true
  })
  socket.on('disconnect', () => setRealtimeStatus(socket.active ? 'reconnecting' : 'idle'))
  socket.on('connect_error', () => setRealtimeStatus('reconnecting'))

  socket.on(SOCKET_EVENTS.nftUpdated, (raw: unknown) => {
    const parsed = NftUpdatedEventSchema.safeParse(raw)
    if (!parsed.success || !remember(parsed.data.id)) return
    const ev = parsed.data
    // O item está no carrinho aberto? Captura o preço anterior antes de aplicar.
    const cartCache = qc.getQueryData<Cart>(qk.cart(userId ?? 'guest'))
    const inCart = cartCache?.items.find((i) => i.nftId === ev.resource.id)
    const nftName = qc.getQueryData<Nft>(qk.nft(ev.resource.id))?.name ?? inCart?.name ?? 'Um NFT'
    const applied = applyNftEvent(qc, ev)
    if (!inCart) return
    // A cotação da API é a referência: o carrinho é rebuscado, não recalculado no cliente.
    void qc.invalidateQueries({ queryKey: ['cart'] })
    if (applied) {
      if (inCart.unitPrice !== ev.data.price) toast(`${nftName} mudou de ${formatEth(inCart.unitPrice)} para ${formatEth(ev.data.price)}. O resumo foi atualizado.`, 'info', 9000)
      else toast(`A disponibilidade de ${nftName} mudou. O resumo foi atualizado.`, 'info', 9000)
    }
  })

  socket.on(SOCKET_EVENTS.orderUpdated, (raw: unknown) => {
    const parsed = OrderUpdatedEventSchema.safeParse(raw)
    if (!parsed.success) return
    const ev = parsed.data
    if (ev.userId !== userId) return // evento de outra sessão/usuário: descarta
    if (!remember(ev.id)) return
    const key = qk.order(ev.userId, ev.resource.id)
    const current = qc.getQueryData<Order>(key)
    if (current && ev.version > current.version && current.status === 'pending') {
      // Estados terminais não regridem. O recibo completo (txId, link) vem da API logo em seguida.
      qc.setQueryData<Order>(key, { ...current, status: ev.data.status, version: ev.version, txId: ev.data.txId, declineReason: ev.data.declineReason })
    }
    if (ev.data.status !== 'pending') {
      void qc.invalidateQueries({ queryKey: key })
      void qc.invalidateQueries({ queryKey: ['cart'] })
      toast(ev.data.status === 'confirmed' ? 'Pedido confirmado.' : 'Pagamento recusado. Seus itens continuam no carrinho.', ev.data.status === 'confirmed' ? 'success' : 'error')
    }
  })

  return () => {
    socket.removeAllListeners()
    socket.disconnect()
    setRealtimeStatus('idle')
  }
}
