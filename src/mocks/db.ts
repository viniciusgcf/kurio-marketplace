import type { EditionId, Network, Nft, OrderSnapshot, OrderStatus, User, Wallet, WalletProvider } from '@/contracts'
import { buildNfts, fixtureWallets, FIXTURE_USERS, type StoredUser } from './fixtures'
import { storage } from './storage'

export interface StoredCartItem { nftId: string; editionId: EditionId; quantity: number; addedPrice: string }
export interface StoredCart { id: string; version: number; items: StoredCartItem[]; couponCode: string | null }
export interface StoredOrder {
  id: string
  userId: string
  status: OrderStatus
  version: number
  createdAt: string
  updatedAt: string
  snapshot: OrderSnapshot
  txId: string | null
  declineReason: string | null
  settleAt: number
  /** Itens e quantidades comprados, para remover do carrinho só o que foi comprado. */
  purchased: StoredCartItem[]
  stockReleased: boolean
}
export interface IdempotencyRecord { bodyHash: string; orderId: string; timeoutServed: boolean }
export interface Session { token: string; userId: string; expiresAt: number }

export interface MockDb {
  schema: number
  users: StoredUser[]
  sessions: Record<string, Session>
  nfts: Nft[]
  favorites: Record<string, { ids: string[]; version: number }>
  carts: Record<string, StoredCart>
  wallets: Record<string, Wallet[]>
  orders: Record<string, StoredOrder>
  connections: Record<string, { provider: WalletProvider; walletId: string }>
  idempotency: Record<string, IdempotencyRecord>
  counters: { event: number; order: number; user: number; cart: number; token: number }
}

const KEY = 'kurio:mock:db'
const SCHEMA = 2

export function freshDb(): MockDb {
  return {
    schema: SCHEMA,
    users: structuredClone(FIXTURE_USERS),
    sessions: {},
    nfts: buildNfts(),
    favorites: { u_ana: { ids: ['emerald-ape-042'], version: 1 }, u_bruno: { ids: [], version: 0 } },
    carts: {},
    wallets: fixtureWallets(),
    orders: {},
    connections: {},
    idempotency: {},
    counters: { event: 0, order: 0, user: 0, cart: 0, token: 0 },
  }
}

let db: MockDb = load()

function load(): MockDb {
  try {
    const raw = storage.get(KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as MockDb
      if (parsed.schema === SCHEMA) return parsed
    }
  } catch {
    /* banco corrompido: recomeça das fixtures */
  }
  return freshDb()
}

export const getDb = (): MockDb => db
export const saveDb = (): void => storage.set(KEY, JSON.stringify(db))
/** Restaura integralmente o cenário conhecido (fixtures) e descarta qualquer estado. */
export function resetDb(): void {
  db = freshDb()
  saveDb()
}

export const toPublicUser = (u: StoredUser): User => {
  const { passwordHash: _h, salt: _s, ...pub } = u
  return pub
}
export type { Network }
