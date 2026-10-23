import type { ZodType } from 'zod'
import {
  AuthResultSchema, CartSchema, FavoritesSchema, NftListSchema, NftSchema, OrderSchema, QuoteSchema, SessionSchema, UserSchema,
  WalletConnectionSchema, WalletSchema, WalletsSchema, type WalletProvider, type EditionId, type Network, type NftListParams, type OrderCreateBody, type ProfileUpdate, type WalletInput,
} from '@/contracts'
import { http } from './http'

/** Toda resposta é validada contra o contrato: divergência vira erro explícito, não bug silencioso na UI. */
async function get<T>(schema: ZodType<T>, url: string, opts?: { signal?: AbortSignal; params?: object }): Promise<T> {
  const { data } = await http.get<unknown>(url, opts)
  return schema.parse(data)
}
async function send<T>(schema: ZodType<T>, method: 'post' | 'put' | 'patch' | 'delete', url: string, body?: unknown, headers?: Record<string, string>): Promise<T> {
  const { data } = await http.request<unknown>({ method, url, data: body, headers })
  return schema.parse(data)
}
const none = async (method: 'post' | 'delete', url: string, body?: unknown) => { await http.request({ method, url, data: body }) }

export const api = {
  auth: {
    register: (b: { username: string; email: string; password: string; confirmPassword: string }) => send(AuthResultSchema, 'post', '/auth/register', b),
    login: (b: { email: string; password: string }) => send(AuthResultSchema, 'post', '/auth/login', b),
    session: (signal?: AbortSignal) => get(SessionSchema, '/auth/session', { signal }),
    logout: () => none('post', '/auth/logout'),
  },
  nfts: {
    list: (params: NftListParams, signal?: AbortSignal) => get(NftListSchema, '/nfts', { params, signal }),
    detail: (id: string, signal?: AbortSignal) => get(NftSchema, `/nfts/${encodeURIComponent(id)}`, { signal }),
  },
  favorites: {
    list: (signal?: AbortSignal) => get(FavoritesSchema, '/favorites', { signal }),
    add: (id: string) => send(FavoritesSchema, 'put', `/favorites/${encodeURIComponent(id)}`),
    remove: (id: string) => send(FavoritesSchema, 'delete', `/favorites/${encodeURIComponent(id)}`),
  },
  cart: {
    get: (signal?: AbortSignal) => get(CartSchema, '/cart', { signal }),
    add: (b: { nftId: string; editionId: EditionId; quantity: number }) => send(CartSchema, 'post', '/cart/items', b),
    update: (key: string, quantity: number) => send(CartSchema, 'patch', `/cart/items/${encodeURIComponent(key)}`, { quantity }),
    remove: (key: string) => send(CartSchema, 'delete', `/cart/items/${encodeURIComponent(key)}`),
    applyCoupon: (code: string) => send(CartSchema, 'put', '/cart/coupon', { code }),
    removeCoupon: () => send(CartSchema, 'delete', '/cart/coupon'),
    acknowledge: () => send(CartSchema, 'post', '/cart/acknowledge'),
  },
  quote: (b: { network: Network; couponCode?: string | null }, signal?: AbortSignal) => http.post<unknown>('/quote', b, { signal }).then((r) => QuoteSchema.parse(r.data)),
  orders: {
    create: (body: OrderCreateBody, idempotencyKey: string) => send(OrderSchema, 'post', '/orders', body, { 'Idempotency-Key': idempotencyKey }),
    get: (id: string, signal?: AbortSignal) => get(OrderSchema, `/orders/${encodeURIComponent(id)}`, { signal }),
  },
  profile: {
    get: (signal?: AbortSignal) => get(UserSchema, '/profile', { signal }),
    update: (b: ProfileUpdate) => send(UserSchema, 'patch', '/profile', b),
    changePassword: (b: { currentPassword: string; newPassword: string; confirmPassword: string }) => none('post', '/profile/password', b),
  },
  walletConnection: {
    get: (signal?: AbortSignal) => get(WalletConnectionSchema, '/wallet/connection', { signal }),
    connect: (b: { provider: WalletProvider; walletId: string }) => send(WalletConnectionSchema, 'put', '/wallet/connection', b),
    disconnect: () => send(WalletConnectionSchema, 'delete', '/wallet/connection'),
  },
  wallets: {
    get: (signal?: AbortSignal) => get(WalletsSchema, '/wallets', { signal }),
    save: (kind: 'primary' | 'secondary', b: WalletInput) => send(WalletSchema, 'put', `/wallets/${kind}`, b),
    removeSecondary: () => none('delete', '/wallets/secondary'),
  },
}
export const itemKey = (nftId: string, editionId: EditionId) => `${nftId}~${editionId}`

