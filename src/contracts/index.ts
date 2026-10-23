/**
 * Contratos REST + eventos Socket.IO. Única fonte de verdade de tipos: o cliente valida
 * as respostas com estes schemas e os handlers MSW constroem respostas com os mesmos tipos.
 * Valores monetários: string decimal em ETH. Quantidades: inteiros.
 */
import { z } from 'zod'

export const EthSchema = z.string().regex(/^\d+(\.\d{1,18})?$/, 'Valor em ETH inválido')
export const NetworkSchema = z.enum(['ethereum', 'polygon', 'solana'])
export type Network = z.infer<typeof NetworkSchema>
export const NETWORK_LABEL: Record<Network, string> = { ethereum: 'Ethereum', polygon: 'Polygon', solana: 'Solana' }

export const WalletProviderSchema = z.enum(['metamask', 'walletconnect', 'coinbase'])
export type WalletProvider = z.infer<typeof WalletProviderSchema>
export const PROVIDER_LABEL: Record<WalletProvider, string> = {
  metamask: 'MetaMask',
  walletconnect: 'WalletConnect',
  coinbase: 'Coinbase Wallet',
}

/* ───────────── Erros ───────────── */
export const ErrorCodeSchema = z.enum([
  'VALIDATION_ERROR',
  'UNAUTHENTICATED',
  'SESSION_EXPIRED',
  'FORBIDDEN',
  'NOT_FOUND',
  'EMAIL_TAKEN',
  'USERNAME_TAKEN',
  'INVALID_CREDENTIALS',
  'AVAILABILITY_CONFLICT',
  'QUOTE_CHANGED',
  'IDEMPOTENCY_CONFLICT',
  'COUPON_INVALID',
  'COUPON_EXPIRED',
  'WALLET_REJECTED',
  'WALLET_NOT_CONNECTED',
  'TRANSIENT',
])
export type ErrorCode = z.infer<typeof ErrorCodeSchema>
export const ApiErrorBodySchema = z.object({
  code: ErrorCodeSchema,
  message: z.string(),
  fieldErrors: z.record(z.string(), z.string()).optional(),
  details: z.unknown().optional(),
})
export type ApiErrorBody = z.infer<typeof ApiErrorBodySchema>

/* ───────────── NFTs ───────────── */
export const EditionIdSchema = z.enum(['1-1', '1-10', '1-50', 'open'])
export type EditionId = z.infer<typeof EditionIdSchema>
export const EditionSchema = z.object({
  id: EditionIdSchema,
  label: z.string(),
  supply: z.number().int().nullable(),
  available: z.number().int().nonnegative(),
})
export type Edition = z.infer<typeof EditionSchema>

export const NftSchema = z.object({
  id: z.string(),
  name: z.string(),
  tokenId: z.string(),
  /** Categoria usada no filtro lateral ("Arte digital"). */
  categoryId: z.string(),
  categoryName: z.string(),
  /** Coleção exibida no detalhe ("Kurio Apes"). */
  collectionName: z.string(),
  network: NetworkSchema,
  image: z.string(),
  gallery: z.array(z.string()),
  price: EthSchema,
  previousPrice: EthSchema.nullable(),
  rare: z.boolean(),
  trending: z.boolean(),
  rating: z.number(),
  ratingCount: z.number().int(),
  listedAt: z.string(),
  description: z.string(),
  attributes: z.array(z.string()),
  contract: z.string(),
  royaltyPercent: z.number(),
  editions: z.array(EditionSchema),
  /** Incrementa a cada alteração de preço/disponibilidade. Base da reconciliação com eventos. */
  version: z.number().int().nonnegative(),
})
export type Nft = z.infer<typeof NftSchema>

export const SortSchema = z.enum(['recent', 'price-asc', 'price-desc', 'popular'])
export type Sort = z.infer<typeof SortSchema>
export const TabSchema = z.enum(['all', 'new', 'trending'])
export type Tab = z.infer<typeof TabSchema>

export const NftListParamsSchema = z.object({
  q: z.string().optional(),
  category: z.string().optional(), // ids separados por vírgula
  network: z.string().optional(), // idem
  minPrice: EthSchema.optional(),
  maxPrice: EthSchema.optional(),
  tab: TabSchema.optional(),
  sort: SortSchema.optional(),
  page: z.number().int().min(1).optional(),
  pageSize: z.number().int().min(1).max(48).optional(),
})
export type NftListParams = z.infer<typeof NftListParamsSchema>

const FacetSchema = z.array(z.object({ id: z.string(), label: z.string(), count: z.number().int() }))
export const NftListSchema = z.object({
  items: z.array(NftSchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  totalItems: z.number().int(),
  totalPages: z.number().int(),
  facets: z.object({ categories: FacetSchema, networks: FacetSchema, priceRange: z.object({ min: EthSchema, max: EthSchema }) }),
  featured: NftSchema.nullable(),
})
export type NftList = z.infer<typeof NftListSchema>

/* ───────────── Conta ───────────── */
export const UserSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  username: z.string(),
  email: z.string(),
  ensName: z.string().nullable(),
  walletNickname: z.string(),
  avatarUrl: z.string().nullable(),
})
export type User = z.infer<typeof UserSchema>
export const SessionSchema = z.object({ user: UserSchema, expiresAt: z.string() })
export type Session = z.infer<typeof SessionSchema>
export const AuthResultSchema = z.object({ token: z.string(), session: SessionSchema })
export type AuthResult = z.infer<typeof AuthResultSchema>

export const LoginBodySchema = z.object({ email: z.string(), password: z.string() })
export const RegisterBodySchema = z.object({
  username: z.string(),
  email: z.string(),
  password: z.string(),
  confirmPassword: z.string(),
})
export const ProfileUpdateSchema = z.object({
  displayName: z.string(),
  username: z.string(),
  email: z.string(),
  ensName: z.string().nullable(),
  walletNickname: z.string(),
  avatarUrl: z.string().nullable(),
})
export type ProfileUpdate = z.infer<typeof ProfileUpdateSchema>
export const PasswordChangeSchema = z.object({
  currentPassword: z.string(),
  newPassword: z.string(),
  confirmPassword: z.string(),
})

/* ───────────── Favoritos ───────────── */
export const FavoritesSchema = z.object({ nftIds: z.array(z.string()), version: z.number().int() })
export type Favorites = z.infer<typeof FavoritesSchema>

/* ───────────── Carrinho e cotação ───────────── */
export const CartItemStatusSchema = z.enum(['ok', 'price_changed', 'reduced', 'unavailable'])
export const CartItemSchema = z.object({
  nftId: z.string(),
  editionId: EditionIdSchema,
  quantity: z.number().int().min(1),
  name: z.string(),
  tokenId: z.string(),
  image: z.string(),
  editionLabel: z.string(),
  unitPrice: EthSchema,
  /** Preço no momento em que o item foi adicionado: base do aviso de alteração. */
  addedPrice: EthSchema,
  lineTotal: EthSchema,
  maxQuantity: z.number().int().nonnegative(),
  status: CartItemStatusSchema,
})
export type CartItem = z.infer<typeof CartItemSchema>

export const QuoteSchema = z.object({
  quoteId: z.string(),
  network: NetworkSchema,
  subtotal: EthSchema,
  discount: EthSchema,
  networkFee: EthSchema,
  total: EthSchema,
  coupon: z.object({ code: z.string(), description: z.string() }).nullable(),
})
export type Quote = z.infer<typeof QuoteSchema>

export const CartSchema = z.object({
  id: z.string(),
  version: z.number().int(),
  items: z.array(CartItemSchema),
  couponCode: z.string().nullable(),
  quote: QuoteSchema,
})
export type Cart = z.infer<typeof CartSchema>

export const CartAddBodySchema = z.object({ nftId: z.string(), editionId: EditionIdSchema, quantity: z.number().int().min(1) })
export const CartUpdateBodySchema = z.object({ quantity: z.number().int().min(1) })
export const CouponBodySchema = z.object({ code: z.string() })
export const QuoteBodySchema = z.object({ network: NetworkSchema.optional(), couponCode: z.string().nullable().optional() })

/* ───────────── Carteiras ───────────── */
export const WalletSchema = z.object({
  id: z.string(),
  kind: z.enum(['primary', 'secondary']),
  displayName: z.string(),
  nickname: z.string(),
  network: NetworkSchema,
  address: z.string(),
  provider: WalletProviderSchema,
  profileName: z.string(),
  referralCode: z.string(),
  email: z.string(),
  ensName: z.string().nullable(),
  linkedWallet: z.string().nullable(),
})
export type Wallet = z.infer<typeof WalletSchema>
export const WalletInputSchema = WalletSchema.omit({ id: true, kind: true })
export type WalletInput = z.infer<typeof WalletInputSchema>
export const WalletsSchema = z.object({ primary: WalletSchema.nullable(), secondary: WalletSchema.nullable() })
export type Wallets = z.infer<typeof WalletsSchema>

export const WalletConnectionSchema = z.object({ connected: z.boolean(), provider: WalletProviderSchema.nullable(), walletId: z.string().nullable() })
export type WalletConnection = z.infer<typeof WalletConnectionSchema>
export const WalletConnectBodySchema = z.object({ provider: WalletProviderSchema, walletId: z.string() })

/* ───────────── Pedidos ───────────── */
export const OrderStatusSchema = z.enum(['pending', 'confirmed', 'declined'])
export type OrderStatus = z.infer<typeof OrderStatusSchema>
export const OrderItemSnapshotSchema = z.object({
  nftId: z.string(),
  name: z.string(),
  tokenId: z.string(),
  image: z.string(),
  editionId: EditionIdSchema,
  editionLabel: z.string(),
  quantity: z.number().int(),
  unitPrice: EthSchema,
  subtotal: EthSchema,
})
export const OrderSnapshotSchema = z.object({
  items: z.array(OrderItemSnapshotSchema),
  subtotal: EthSchema,
  discount: EthSchema,
  networkFee: EthSchema,
  total: EthSchema,
  couponCode: z.string().nullable(),
  network: NetworkSchema,
  walletLabel: z.string(),
  provider: WalletProviderSchema,
})
export type OrderSnapshot = z.infer<typeof OrderSnapshotSchema>
export const OrderSchema = z.object({
  id: z.string(),
  status: OrderStatusSchema,
  version: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
  snapshot: OrderSnapshotSchema,
  /** Só existe para pedido confirmado. */
  txId: z.string().nullable(),
  explorerUrl: z.string().nullable(),
  declineReason: z.string().nullable(),
})
export type Order = z.infer<typeof OrderSchema>
export const OrderCreateBodySchema = z.object({
  items: z.array(z.object({ nftId: z.string(), editionId: EditionIdSchema, quantity: z.number().int().min(1) })).min(1),
  couponCode: z.string().nullable(),
  network: NetworkSchema,
  walletId: z.string(),
  provider: WalletProviderSchema,
  quoteId: z.string(),
  collectorNote: z.string().max(280).optional(),
})
export type OrderCreateBody = z.infer<typeof OrderCreateBodySchema>

/* ───────────── Eventos em tempo real ───────────── */
const EventBase = z.object({
  /** Identidade estável: reentregas têm o mesmo id. */
  id: z.string(),
  version: z.number().int(),
  occurredAt: z.string(),
})
export const NftUpdatedEventSchema = EventBase.extend({
  type: z.literal('nft.updated'),
  resource: z.object({ type: z.literal('nft'), id: z.string() }),
  data: z.object({
    price: EthSchema,
    previousPrice: EthSchema.nullable(),
    editions: z.array(z.object({ id: EditionIdSchema, available: z.number().int() })),
  }),
})
export const OrderUpdatedEventSchema = EventBase.extend({
  type: z.literal('order.updated'),
  resource: z.object({ type: z.literal('order'), id: z.string() }),
  userId: z.string(),
  data: z.object({ status: OrderStatusSchema, txId: z.string().nullable(), declineReason: z.string().nullable() }),
})
export type NftUpdatedEvent = z.infer<typeof NftUpdatedEventSchema>
export type OrderUpdatedEvent = z.infer<typeof OrderUpdatedEventSchema>
export const SOCKET_EVENTS = { nftUpdated: 'nft.updated', orderUpdated: 'order.updated', subscribe: 'session.subscribe' } as const
