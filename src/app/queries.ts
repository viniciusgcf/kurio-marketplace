import { keepPreviousData, queryOptions, QueryClient, useQuery } from '@tanstack/react-query'
import { api } from '@/api'
import { isApiError } from '@/api/http'
import type { NftListParams } from '@/contracts'
import { tokenStore } from '@/lib/session-store'

/**
 * Política de cache (documentada em ARCHITECTURE.md):
 *  - staleTime 30 s para catálogo/detalhe; dados privados e sessão seguem regras próprias abaixo.
 *  - gcTime 5 min: voltar ao catálogo pelo histórico é instantâneo.
 *  - retry: só falhas transitórias (rede/timeout/5xx), no máximo 2 vezes, backoff exponencial (1 s, 2 s). 4xx nunca repete.
 *  - mutations não repetem sozinhas; o pedido é a exceção e repete manualmente com a MESMA chave de idempotência.
 *  - Dados privados ficam sob ['user', userId, ...] / ['cart', scope]: logout e troca de usuário os removem.
 */
export const makeQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        retry: (count, err) => (isApiError(err) ? err.retryable && count < 2 : count < 2),
        retryDelay: (i) => Math.min(1000 * 2 ** i, 4000),
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
      },
      mutations: { retry: false },
    },
  })

export const qk = {
  session: ['session'] as const,
  nfts: ['nfts'] as const,
  nftList: (p: NftListParams) => ['nfts', 'list', p] as const,
  nft: (id: string) => ['nfts', 'detail', id] as const,
  favorites: (uid: string) => ['user', uid, 'favorites'] as const,
  wallets: (uid: string) => ['user', uid, 'wallets'] as const,
  order: (uid: string, id: string) => ['user', uid, 'order', id] as const,
  cart: (scope: string) => ['cart', scope] as const,
  quote: (scope: string, network: string, coupon: string | null) => ['cart', scope, 'quote', network, coupon] as const,
}

/** Sessão: null = visitante. Fica "fresca" até logout/expiração (staleTime infinito). */
export const sessionQuery = queryOptions({
  queryKey: qk.session,
  staleTime: Infinity,
  retry: false,
  queryFn: async ({ signal }) => {
    if (!tokenStore.get()) return null
    try {
      return await api.auth.session(signal)
    } catch (e) {
      if (isApiError(e) && (e.status === 401 || e.status === 403)) {
        tokenStore.clear()
        return null
      }
      throw e
    }
  },
})

export const nftListQuery = (params: NftListParams) =>
  queryOptions({ queryKey: qk.nftList(params), queryFn: ({ signal }) => api.nfts.list(params, signal), placeholderData: keepPreviousData })

export const nftQuery = (id: string) =>
  queryOptions({ queryKey: qk.nft(id), queryFn: ({ signal }) => api.nfts.detail(id, signal) })

export const cartQuery = (scope: string) =>
  queryOptions({ queryKey: qk.cart(scope), queryFn: ({ signal }) => api.cart.get(signal), staleTime: 10_000 })

export const favoritesQuery = (uid: string) =>
  queryOptions({ queryKey: qk.favorites(uid), queryFn: ({ signal }) => api.favorites.list(signal) })

export const walletsQuery = (uid: string) =>
  queryOptions({ queryKey: qk.wallets(uid), queryFn: ({ signal }) => api.wallets.get(signal) })

export const orderQuery = (uid: string, id: string) =>
  queryOptions({
    queryKey: qk.order(uid, id),
    queryFn: ({ signal }) => api.orders.get(id, signal),
    // Rede de segurança do tempo real: enquanto pendente, reconcilia por REST a cada 4 s.
    refetchInterval: (q) => (q.state.data?.status === 'pending' ? 4000 : false),
    staleTime: 0,
  })

export const useSession = () => {
  const q = useQuery(sessionQuery)
  return { ...q, user: q.data?.user ?? null, scope: q.data?.user.id ?? 'guest' }
}

/** Remove todo dado privado do cache (logout, troca de usuário, sessão expirada). */
export function purgePrivateCache(qc: QueryClient): void {
  qc.removeQueries({ predicate: (q) => q.queryKey[0] === 'user' || q.queryKey[0] === 'cart' })
  void qc.cancelQueries({ predicate: (q) => q.queryKey[0] === 'user' || q.queryKey[0] === 'cart' })
}
