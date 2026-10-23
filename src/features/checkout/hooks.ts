import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api'
import { isApiError } from '@/api/http'
import { qk, walletsQuery, useSession } from '@/app/queries'
import type { Network, Order, OrderCreateBody, WalletProvider } from '@/contracts'

export const useWallets = () => {
  const { user } = useSession()
  return useQuery({ ...walletsQuery(user?.id ?? 'none'), enabled: !!user })
}

export const useWalletConnection = () => {
  const { user } = useSession()
  return useQuery({ queryKey: ['user', user?.id ?? 'none', 'wallet-connection'], queryFn: ({ signal }) => api.walletConnection.get(signal), enabled: !!user, staleTime: 60_000 })
}
export function useConnectWallet() {
  const qc = useQueryClient()
  const { user } = useSession()
  return useMutation({
    mutationFn: (v: { provider: WalletProvider; walletId: string }) => api.walletConnection.connect(v),
    onSuccess: (c) => qc.setQueryData(['user', user?.id, 'wallet-connection'], c),
  })
}
export function useDisconnectWallet() {
  const qc = useQueryClient()
  const { user } = useSession()
  return useMutation({ mutationFn: api.walletConnection.disconnect, onSuccess: (c) => qc.setQueryData(['user', user?.id, 'wallet-connection'], c) })
}

/** Cotação revalidada na API. staleTime 0: sempre fresca ao abrir a revisão. */
export function useQuote(network: Network, couponCode: string | null, enabled = true) {
  const { scope } = useSession()
  return useQuery({ queryKey: qk.quote(scope, network, couponCode), queryFn: ({ signal }) => api.quote({ network, couponCode }, signal), enabled, staleTime: 0, gcTime: 0 })
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Envio do pedido. A MESMA chave de idempotência é reutilizada em todas as tentativas do mesmo conteúdo:
 * se a resposta se perder (timeout/rede/5xx), reenviar recupera o pedido já criado em vez de duplicá-lo.
 * Até 3 tentativas automáticas com backoff; depois disso o usuário decide (a chave continua a mesma).
 */
export function useCreateOrder(onAttempt?: (n: number) => void) {
  const qc = useQueryClient()
  const { user } = useSession()
  return useMutation({
    mutationFn: async ({ body, key }: { body: OrderCreateBody; key: string }): Promise<Order> => {
      let attempt = 0
      for (;;) {
        attempt += 1
        onAttempt?.(attempt)
        try {
          return await api.orders.create(body, key)
        } catch (e) {
          if (!isApiError(e) || !e.retryable || attempt >= 3) throw e
          await sleep(800 * attempt)
        }
      }
    },
    onSuccess: (order) => { if (user) qc.setQueryData(qk.order(user.id, order.id), order) },
  })
}

/** Gera (e persiste por conteúdo) a chave de idempotência. Conteúdo diferente => chave nova. */
export function idempotencyKeyFor(body: OrderCreateBody, userId: string): string {
  const slot = `kurio:idem:${userId}`
  const sig = JSON.stringify(body)
  try {
    const saved = JSON.parse(sessionStorage.getItem(slot) ?? 'null') as { sig: string; key: string } | null
    if (saved?.sig === sig) return saved.key
    const key = `idem_${crypto.randomUUID()}`
    sessionStorage.setItem(slot, JSON.stringify({ sig, key }))
    return key
  } catch {
    return `idem_${crypto.randomUUID()}`
  }
}
export const clearIdempotencyKey = (userId: string) => { try { sessionStorage.removeItem(`kurio:idem:${userId}`) } catch { /* noop */ } }
