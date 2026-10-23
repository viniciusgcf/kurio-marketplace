/**
 * Regras de negócio do "backend" simulado. Funções puras sobre o banco + publicação de eventos.
 * Nada daqui é importado pelo código da aplicação: só os handlers MSW usam.
 */
import {
  NETWORK_LABEL,
  type Cart,
  type CartItem,
  type EditionId,
  type Network,
  type Nft,
  type NftList,
  type NftListParams,
  type NftUpdatedEvent,
  type Order,
  type OrderUpdatedEvent,
  type Quote,
} from '@/contracts'
import { addEth, cmpEth, mulEth, percentOf, subEth, toEth } from '@/lib/money'
import { getDb, saveDb, type StoredCart, type StoredCartItem, type StoredOrder } from './db'
import { CATEGORIES, COUPONS, NETWORK_FEE } from './fixtures'
import { hub } from './hub'
import { getScenario } from './scenarios'

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fieldErrors?: Record<string, string>,
    public details?: unknown,
  ) {
    super(message)
  }
}

export const MAX_PER_ITEM = 10
const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
const csv = (v?: string) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : [])

/* ───────────── Catálogo ───────────── */
export function listNfts(params: NftListParams): NftList {
  const db = getDb()
  const base = getScenario().catalog === 'empty' ? [] : db.nfts
  const cats = csv(params.category)
  const nets = csv(params.network)
  const q = params.q ? norm(params.q) : ''
  const matchNonFacet = (n: Nft) =>
    (!q || norm(`${n.name} ${n.categoryName} ${n.collectionName} ${n.tokenId}`).includes(q)) &&
    (!params.minPrice || cmpEth(n.price, params.minPrice) >= 0) &&
    (!params.maxPrice || cmpEth(n.price, params.maxPrice) <= 0) &&
    (params.tab !== 'trending' || n.trending) &&
    (params.tab !== 'new' || Date.parse(n.listedAt) > Date.UTC(2026, 6, 26))
  const filtered = base.filter((n) => matchNonFacet(n) && (!cats.length || cats.includes(n.categoryId)) && (!nets.length || nets.includes(n.network)))

  const sort = params.sort ?? 'recent'
  filtered.sort((a, b) => {
    if (sort === 'price-asc') return cmpEth(a.price, b.price) || a.id.localeCompare(b.id)
    if (sort === 'price-desc') return cmpEth(b.price, a.price) || a.id.localeCompare(b.id)
    if (sort === 'popular') return b.ratingCount - a.ratingCount || a.id.localeCompare(b.id)
    return Date.parse(b.listedAt) - Date.parse(a.listedAt) || a.id.localeCompare(b.id)
  })

  const pageSize = params.pageSize ?? 9
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const page = Math.min(params.page ?? 1, totalPages)
  // Contagens de cada facet ignoram o próprio facet (padrão de busca facetada).
  const facetBase = (skip: 'cat' | 'net') =>
    base.filter((n) => matchNonFacet(n) && (skip === 'cat' || !cats.length || cats.includes(n.categoryId)) && (skip === 'net' || !nets.length || nets.includes(n.network)))
  const prices = base.map((n) => n.price).sort(cmpEth)
  return {
    items: filtered.slice((page - 1) * pageSize, page * pageSize),
    page,
    pageSize,
    totalItems: filtered.length,
    totalPages,
    facets: {
      categories: CATEGORIES.map((c) => ({ id: c.id, label: c.label, count: facetBase('cat').filter((n) => n.categoryId === c.id).length })),
      networks: (['ethereum', 'polygon', 'solana'] as const).map((id) => ({ id, label: NETWORK_LABEL[id], count: facetBase('net').filter((n) => n.network === id).length })),
      priceRange: { min: prices[0] ?? '0.02', max: prices[prices.length - 1] ?? '12.30' },
    },
    featured: base.find((n) => n.id === 'violet-nomad-314') ?? null,
  }
}

export function getNft(id: string): Nft {
  const nft = getDb().nfts.find((n) => n.id === id)
  if (!nft || getScenario().catalog === 'empty') throw new HttpError(404, 'NOT_FOUND', 'NFT não encontrado.')
  return nft
}

/** Altera preço/disponibilidade, incrementa a versão e publica nft.updated. */
export function mutateNft(id: string, change: { price?: string; availability?: Partial<Record<EditionId, number>> }): Nft {
  const db = getDb()
  const nft = getNft(id)
  const previous = nft.price
  if (change.price && change.price !== nft.price) {
    nft.previousPrice = nft.price
    nft.price = toEth(change.price)
  }
  for (const [ed, qty] of Object.entries(change.availability ?? {})) {
    const e = nft.editions.find((x) => x.id === ed)
    if (e) e.available = Math.max(0, qty as number)
  }
  nft.version += 1
  db.counters.event += 1
  saveDb()
  hub.publish(nftEvent(nft, `evt_${db.counters.event}`, previous))
  return nft
}

export function nftEvent(nft: Nft, id: string, _prev?: string): NftUpdatedEvent {
  return {
    id,
    type: 'nft.updated',
    resource: { type: 'nft', id: nft.id },
    version: nft.version,
    occurredAt: new Date().toISOString(),
    data: { price: nft.price, previousPrice: nft.previousPrice, editions: nft.editions.map((e) => ({ id: e.id, available: e.available })) },
  }
}

/* ───────────── Carrinho e cotação ───────────── */
export function getCart(ownerKey: string): StoredCart {
  const db = getDb()
  let cart = db.carts[ownerKey]
  if (!cart) {
    db.counters.cart += 1
    cart = db.carts[ownerKey] = { id: `cart_${db.counters.cart}`, version: 0, items: [], couponCode: null }
  }
  return cart
}

const fnv = (s: string) => {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193)
  return (h >>> 0).toString(16).padStart(8, '0')
}

export function resolveCoupon(code: string | null): { code: string; percent: number; description: string } | null {
  if (!code) return null
  const c = COUPONS[code.trim().toUpperCase()]
  if (!c) throw new HttpError(422, 'COUPON_INVALID', 'Cupom inválido. Confira o código e tente novamente.')
  if (c.kind === 'expired') throw new HttpError(422, 'COUPON_EXPIRED', 'Este cupom expirou.')
  return { code: code.trim().toUpperCase(), percent: c.value, description: c.description }
}

interface Priced { item: StoredCartItem; nft: Nft; effective: number; max: number; status: CartItem['status'] }

function price(items: StoredCartItem[]): Priced[] {
  return items.map((item) => {
    const nft = getNft(item.nftId)
    const edition = nft.editions.find((e) => e.id === item.editionId)
    const max = Math.min(edition?.available ?? 0, MAX_PER_ITEM)
    const effective = Math.min(item.quantity, max)
    const status: CartItem['status'] = max === 0 ? 'unavailable' : item.quantity > max ? 'reduced' : cmpEth(nft.price, item.addedPrice) !== 0 ? 'price_changed' : 'ok'
    return { item, nft, effective, max, status }
  })
}

export function computeQuote(items: StoredCartItem[], couponCode: string | null, network: Network, lenient = false): Quote {
  const priced = price(items)
  const subtotal = addEth('0.00', ...priced.map((p) => mulEth(p.nft.price, p.effective)))
  let coupon: ReturnType<typeof resolveCoupon> = null
  try {
    coupon = resolveCoupon(couponCode)
  } catch (e) {
    if (!lenient) throw e
  }
  const discount = coupon ? percentOf(subtotal, coupon.percent) : '0.00'
  const networkFee = priced.length ? toEth(NETWORK_FEE[network]) : '0.00'
  const total = addEth(subEth(subtotal, discount), networkFee)
  const signature = JSON.stringify([priced.map((p) => [p.nft.id, p.item.editionId, p.effective, p.nft.price, p.status === 'unavailable']), coupon?.code ?? null, network, networkFee])
  return {
    quoteId: `q_${fnv(signature)}`,
    network,
    subtotal,
    discount,
    networkFee,
    total,
    coupon: coupon ? { code: coupon.code, description: coupon.description } : null,
  }
}

export function toCart(cart: StoredCart, network: Network = 'ethereum'): Cart {
  const priced = price(cart.items)
  let couponCode = cart.couponCode
  try {
    resolveCoupon(couponCode)
  } catch {
    couponCode = null
  }
  return {
    id: cart.id,
    version: cart.version,
    couponCode,
    items: priced.map(({ item, nft, effective, max, status }) => ({
      nftId: nft.id,
      editionId: item.editionId,
      quantity: Math.max(1, effective || item.quantity),
      name: nft.name,
      tokenId: nft.tokenId,
      image: nft.image,
      editionLabel: nft.editions.find((e) => e.id === item.editionId)?.label ?? item.editionId,
      unitPrice: nft.price,
      addedPrice: item.addedPrice,
      lineTotal: mulEth(nft.price, effective),
      maxQuantity: max,
      status,
    })),
    quote: computeQuote(cart.items, couponCode, network, true),
  }
}

export function addToCart(cart: StoredCart, nftId: string, editionId: EditionId, quantity: number): void {
  const nft = getNft(nftId)
  const edition = nft.editions.find((e) => e.id === editionId)
  if (!edition) throw new HttpError(422, 'VALIDATION_ERROR', 'Edição inexistente.', { editionId: 'Edição inexistente.' })
  const max = Math.min(edition.available, MAX_PER_ITEM)
  const existing = cart.items.find((i) => i.nftId === nftId && i.editionId === editionId)
  const wanted = (existing?.quantity ?? 0) + quantity
  if (max === 0) throw new HttpError(409, 'AVAILABILITY_CONFLICT', `${edition.label} esgotada para ${nft.name}.`)
  if (wanted > max) throw new HttpError(409, 'AVAILABILITY_CONFLICT', `Limite de ${max} unidade(s) para esta edição.`, undefined, { maxQuantity: max })
  if (existing) existing.quantity = wanted
  else cart.items.push({ nftId, editionId, quantity, addedPrice: nft.price })
  cart.version += 1
}

export const mergeCarts = (from: StoredCart, into: StoredCart): void => {
  for (const it of from.items) {
    const ex = into.items.find((i) => i.nftId === it.nftId && i.editionId === it.editionId)
    if (ex) ex.quantity = Math.min(MAX_PER_ITEM, ex.quantity + it.quantity)
    else into.items.push({ ...it })
  }
  into.couponCode ??= from.couponCode
  into.version += 1
  from.items = []
  from.couponCode = null
}

/* ───────────── Pedidos ───────────── */
export function toOrder(o: StoredOrder): Order {
  return {
    id: o.id,
    status: o.status,
    version: o.version,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
    snapshot: o.snapshot,
    txId: o.status === 'confirmed' ? o.txId : null,
    explorerUrl: o.status === 'confirmed' && o.txId ? `https://etherscan.io/tx/${o.txId}` : null,
    declineReason: o.declineReason,
  }
}

const hex = (seed: string, len: number) => {
  let out = ''
  let n = 0
  while (out.length < len) out += fnv(`${seed}:${n++}`)
  return out.slice(0, len)
}

export function orderEvent(o: StoredOrder): OrderUpdatedEvent {
  const db = getDb()
  db.counters.event += 1
  return {
    id: `evt_${db.counters.event}`,
    type: 'order.updated',
    resource: { type: 'order', id: o.id },
    userId: o.userId,
    version: o.version,
    occurredAt: new Date().toISOString(),
    data: { status: o.status, txId: o.status === 'confirmed' ? o.txId : null, declineReason: o.declineReason },
  }
}

/** Resolve um pedido pendente (idempotente: pedidos terminais nunca mudam). */
export function settleOrder(o: StoredOrder): boolean {
  if (o.status !== 'pending') return false
  const db = getDb()
  const declined = getScenario().payment === 'declined'
  o.version += 1
  o.updatedAt = new Date().toISOString()
  if (declined) {
    o.status = 'declined'
    o.declineReason = 'Pagamento recusado pela carteira.'
    if (!o.stockReleased) {
      o.stockReleased = true
      for (const p of o.purchased) {
        const nft = db.nfts.find((n) => n.id === p.nftId)
        const ed = nft?.editions.find((e) => e.id === p.editionId)
        if (nft && ed) {
          ed.available += p.quantity
          nft.version += 1
          db.counters.event += 1
          hub.publish(nftEvent(nft, `evt_${db.counters.event}`))
        }
      }
    }
  } else {
    o.status = 'confirmed'
    o.txId = `0x${hex(o.id, 64)}`
    // Remove do carrinho apenas itens e quantidades efetivamente comprados.
    const cart = db.carts[`user:${o.userId}`]
    if (cart) {
      for (const p of o.purchased) {
        const it = cart.items.find((i) => i.nftId === p.nftId && i.editionId === p.editionId)
        if (it) it.quantity -= p.quantity
      }
      cart.items = cart.items.filter((i) => i.quantity > 0)
      cart.version += 1
    }
  }
  saveDb()
  hub.publish(orderEvent(o))
  return true
}

/** Liquidação "preguiçosa": garante que pedidos vencidos sejam resolvidos mesmo após refresh/reconexão. */
export function settleDue(now = Date.now()): void {
  for (const o of Object.values(getDb().orders)) if (o.status === 'pending' && now >= o.settleAt) settleOrder(o)
}

export const bodyHash = (body: unknown) => fnv(JSON.stringify(body))
export { hex, fnv }
