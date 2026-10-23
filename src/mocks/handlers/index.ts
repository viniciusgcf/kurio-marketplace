import { delay, http, HttpResponse, type HttpHandler } from 'msw'
import type { ZodType } from 'zod'
import {
  CartAddBodySchema, CartUpdateBodySchema, CouponBodySchema, LoginBodySchema, NetworkSchema, NftListParamsSchema,
  OrderCreateBodySchema, PasswordChangeSchema, ProfileUpdateSchema, QuoteBodySchema, RegisterBodySchema, WalletConnectBodySchema, WalletInputSchema,
  type Network, type OrderSnapshot,
} from '@/contracts'
import { addEth, mulEth } from '@/lib/money'
import { getDb, saveDb, toPublicUser } from '../db'
import type { StoredUser } from '../fixtures'
import {
  addToCart, bodyHash, computeQuote, getCart, getNft, HttpError, listNfts, MAX_PER_ITEM, mergeCarts, mutateNft,
  orderEvent, settleDue, settleOrder, toCart, toOrder, resolveCoupon,
} from '../domain'
import { hub } from '../hub'
import { getScenario, prng, setScenario } from '../scenarios'

const SESSION_TTL = 8 * 3600e3
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

async function hashPassword(salt: string, password: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}:${password}`))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

const json = (body: unknown, init?: ResponseInit) => HttpResponse.json(body as Record<string, unknown>, init)
const failure = (e: HttpError) => HttpResponse.json({ code: e.code, message: e.message, fieldErrors: e.fieldErrors, details: e.details }, { status: e.status })

/** Presets "de uso único" (ex.: sessionExpired) saem da lista persistida depois de consumidos. */
function consume(name: string) {
  setScenario(getScenario().names.filter((n) => n !== name))
}

function parse<T>(schema: ZodType<T>, data: unknown): T {
  const r = schema.safeParse(data)
  if (r.success) return r.data
  const fieldErrors: Record<string, string> = {}
  for (const issue of r.error.issues) fieldErrors[issue.path.join('.') || '_'] ??= issue.message
  throw new HttpError(422, 'VALIDATION_ERROR', 'Dados inválidos.', fieldErrors)
}

interface Ctx {
  request: Request
  params: Record<string, string>
  url: URL
  user: StoredUser | null
  cartOwner: string
  token: string | null
  body: <T>(schema: ZodType<T>) => Promise<T>
}

let seq = 0
let listSeq = 0
const seenGets = new Set<string>()

function latencyFor(key: string): number {
  const sc = getScenario()
  if (sc.outOfOrder && key === 'GET /nfts') return ++listSeq % 2 === 1 ? 1500 : 100
  const r = prng(sc.seed + seq)()
  return Math.round(sc.latency.min + r * (sc.latency.max - sc.latency.min))
}

function authenticate(request: Request): { user: StoredUser; token: string } {
  const db = getDb()
  const sc = getScenario()
  const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') ?? null
  const session = token ? db.sessions[token] : undefined
  if (!token || !session) throw new HttpError(401, 'UNAUTHENTICATED', 'Entre para continuar.')
  if (sc.sessionExpiredNext || session.expiresAt < Date.now()) {
    if (sc.sessionExpiredNext) consume('sessionExpired')
    delete db.sessions[token]
    saveDb()
    throw new HttpError(401, 'SESSION_EXPIRED', 'Sua sessão expirou. Entre novamente para continuar.')
  }
  if (sc.forbidden) throw new HttpError(403, 'FORBIDDEN', 'Você não tem permissão para acessar este recurso.')
  const user = db.users.find((u) => u.id === session.userId)
  if (!user) throw new HttpError(401, 'UNAUTHENTICATED', 'Entre para continuar.')
  return { user, token }
}

function route(key: string, opts: { auth?: boolean }, fn: (ctx: Ctx) => Promise<Response> | Response) {
  return async ({ request, params }: { request: Request; params: Record<string, unknown> }): Promise<Response> => {
    seq += 1
    const sc = getScenario()
    if (sc.offline) return HttpResponse.error()
    await delay(latencyFor(key))
    const forced = sc.failEndpoints[key]
    if (forced) return failure(new HttpError(forced, forced >= 500 ? 'TRANSIENT' : 'NOT_FOUND', forced >= 500 ? 'Serviço indisponível. Tente novamente.' : 'Recurso não encontrado.'))
    if (sc.failFirstAttempt && request.method === 'GET') {
      const sig = request.url
      if (!seenGets.has(sig)) {
        seenGets.add(sig)
        return failure(new HttpError(503, 'TRANSIENT', 'Falha temporária. Tente novamente.'))
      }
    }
    try {
      settleDue()
      let user: StoredUser | null = null
      let token: string | null = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') ?? null
      if (opts.auth) ({ user, token } = authenticate(request))
      else if (token && getDb().sessions[token]) user = getDb().users.find((u) => u.id === getDb().sessions[token as string]!.userId) ?? null
      const guest = request.headers.get('X-Cart-Token') ?? 'anon'
      const ctx: Ctx = {
        request,
        params: params as Record<string, string>,
        url: new URL(request.url),
        user,
        token,
        cartOwner: user ? `user:${user.id}` : `guest:${guest}`,
        body: async (schema) => {
          let raw: unknown
          try {
            raw = await request.clone().json()
          } catch {
            throw new HttpError(400, 'VALIDATION_ERROR', 'Corpo da requisição inválido.')
          }
          return parse(schema, raw)
        },
      }
      return await fn(ctx)
    } catch (e) {
      if (e instanceof HttpError) return failure(e)
      throw e
    }
  }
}

function startSession(user: StoredUser, guestToken: string | null) {
  const db = getDb()
  db.counters.token += 1
  const token = `tok_${user.id}_${db.counters.token}_${bodyHash([user.id, db.counters.token])}`
  const expiresAt = Date.now() + SESSION_TTL
  db.sessions[token] = { token, userId: user.id, expiresAt }
  if (guestToken) {
    const guest = db.carts[`guest:${guestToken}`]
    if (guest?.items.length) mergeCarts(guest, getCart(`user:${user.id}`))
  }
  saveDb()
  return { token, session: { user: toPublicUser(user), expiresAt: new Date(expiresAt).toISOString() } }
}

function validatePassword(pw: string): string | null {
  if (pw.length < 8) return 'A senha deve ter pelo menos 8 caracteres.'
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return 'Use letras e números na senha.'
  return null
}
const RESERVED = ['admin', 'kurio', 'suporte']
function validateUsername(u: string): string | null {
  if (!/^[a-z0-9_]{3,20}$/.test(u)) return 'Use de 3 a 20 caracteres: letras minúsculas, números ou _.'
  if (RESERVED.includes(u)) return 'Este nome de usuário é reservado.'
  return null
}

const isNetwork = (v: string | null): v is Network => NetworkSchema.safeParse(v).success
const networkOf = (url: URL): Network => (isNetwork(url.searchParams.get('network')) ? (url.searchParams.get('network') as Network) : 'ethereum')
const keyOf = (k: string) => {
  const [nftId = '', editionId = ''] = decodeURIComponent(k).split('~')
  return { nftId, editionId }
}

export function createHandlers(base = '/api'): HttpHandler[] {
  const p = (path: string) => `${base}${path}`
  return [
    /* ───── Sessão e conta ───── */
    http.post(p('/auth/register'), route('POST /auth/register', {}, async (c) => {
      const b = await c.body(RegisterBodySchema)
      const db = getDb()
      const fe: Record<string, string> = {}
      const username = b.username.trim().toLowerCase()
      const uErr = validateUsername(username)
      if (uErr) fe.username = uErr
      if (!EMAIL.test(b.email)) fe.email = 'Informe um e-mail válido.'
      const pErr = validatePassword(b.password)
      if (pErr) fe.password = pErr
      if (b.password !== b.confirmPassword) fe.confirmPassword = 'As senhas não coincidem.'
      if (Object.keys(fe).length) throw new HttpError(422, 'VALIDATION_ERROR', 'Revise os campos destacados.', fe)
      if (db.users.some((u) => u.email.toLowerCase() === b.email.toLowerCase())) throw new HttpError(409, 'EMAIL_TAKEN', 'Já existe uma conta com este e-mail.', { email: 'Já existe uma conta com este e-mail.' })
      if (db.users.some((u) => u.username === username)) throw new HttpError(409, 'USERNAME_TAKEN', 'Este nome de usuário já está em uso.', { username: 'Este nome de usuário já está em uso.' })
      db.counters.user += 1
      const salt = `salt-${db.counters.user}-${bodyHash(b.email)}`
      const user: StoredUser = { id: `u_new_${db.counters.user}`, displayName: username, username, email: b.email.toLowerCase(), ensName: null, walletNickname: '', avatarUrl: null, salt, passwordHash: await hashPassword(salt, b.password) }
      db.users.push(user)
      db.favorites[user.id] = { ids: [], version: 0 }
      db.wallets[user.id] = []
      return json(startSession(user, c.request.headers.get('X-Cart-Token')), { status: 201 })
    })),

    http.post(p('/auth/login'), route('POST /auth/login', {}, async (c) => {
      const b = await c.body(LoginBodySchema)
      const user = getDb().users.find((u) => u.email.toLowerCase() === b.email.trim().toLowerCase())
      if (!EMAIL.test(b.email) || !b.password) throw new HttpError(422, 'VALIDATION_ERROR', 'Informe e-mail e senha.', { ...(EMAIL.test(b.email) ? {} : { email: 'Informe um e-mail válido.' }), ...(b.password ? {} : { password: 'Informe a senha.' }) })
      if (!user || (await hashPassword(user.salt, b.password)) !== user.passwordHash) throw new HttpError(401, 'INVALID_CREDENTIALS', 'E-mail ou senha incorretos.')
      return json(startSession(user, c.request.headers.get('X-Cart-Token')))
    })),

    http.get(p('/auth/session'), route('GET /auth/session', { auth: true }, (c) => {
      const s = getDb().sessions[c.token!]!
      return json({ user: toPublicUser(c.user!), expiresAt: new Date(s.expiresAt).toISOString() })
    })),

    http.post(p('/auth/logout'), route('POST /auth/logout', {}, (c) => {
      if (c.token) delete getDb().sessions[c.token]
      saveDb()
      return new HttpResponse(null, { status: 204 })
    })),

    /* ───── NFTs ───── */
    http.get(p('/nfts'), route('GET /nfts', {}, (c) => {
      const sp = Object.fromEntries(c.url.searchParams)
      const params = parse(NftListParamsSchema, { ...sp, page: sp.page ? Number(sp.page) : undefined, pageSize: sp.pageSize ? Number(sp.pageSize) : undefined })
      return json(listNfts(params))
    })),
    http.get(p('/nfts/:id'), route('GET /nfts/:id', {}, (c) => json(getNft(c.params.id!)))),

    /* ───── Favoritos ───── */
    http.get(p('/favorites'), route('GET /favorites', { auth: true }, (c) => {
      const f = getDb().favorites[c.user!.id] ?? { ids: [], version: 0 }
      return json({ nftIds: f.ids, version: f.version })
    })),
    http.put(p('/favorites/:nftId'), route('PUT /favorites/:nftId', { auth: true }, (c) => {
      if (getScenario().favoriteFailure) throw new HttpError(500, 'TRANSIENT', 'Não foi possível salvar o favorito.')
      getNft(c.params.nftId!)
      const f = (getDb().favorites[c.user!.id] ??= { ids: [], version: 0 })
      if (!f.ids.includes(c.params.nftId!)) { f.ids.push(c.params.nftId!); f.version += 1 }
      saveDb()
      return json({ nftIds: f.ids, version: f.version })
    })),
    http.delete(p('/favorites/:nftId'), route('DELETE /favorites/:nftId', { auth: true }, (c) => {
      if (getScenario().favoriteFailure) throw new HttpError(500, 'TRANSIENT', 'Não foi possível remover o favorito.')
      const f = (getDb().favorites[c.user!.id] ??= { ids: [], version: 0 })
      if (f.ids.includes(c.params.nftId!)) { f.ids = f.ids.filter((i) => i !== c.params.nftId); f.version += 1 }
      saveDb()
      return json({ nftIds: f.ids, version: f.version })
    })),

    /* ───── Carrinho ───── */
    http.get(p('/cart'), route('GET /cart', {}, (c) => json(toCart(getCart(c.cartOwner), networkOf(c.url))))),
    http.post(p('/cart/items'), route('POST /cart/items', {}, async (c) => {
      const b = await c.body(CartAddBodySchema)
      addToCart(getCart(c.cartOwner), b.nftId, b.editionId, b.quantity)
      saveDb()
      return json(toCart(getCart(c.cartOwner)), { status: 201 })
    })),
    http.patch(p('/cart/items/:key'), route('PATCH /cart/items/:key', {}, async (c) => {
      const { nftId, editionId } = keyOf(c.params.key!)
      const { quantity } = await c.body(CartUpdateBodySchema)
      const cart = getCart(c.cartOwner)
      const item = cart.items.find((i) => i.nftId === nftId && i.editionId === editionId)
      if (!item) throw new HttpError(404, 'NOT_FOUND', 'Item não está no carrinho.')
      const nft = getNft(nftId)
      const max = Math.min(nft.editions.find((e) => e.id === editionId)?.available ?? 0, MAX_PER_ITEM)
      if (quantity > max) throw new HttpError(409, 'AVAILABILITY_CONFLICT', `Limite de ${max} unidade(s) para esta edição.`, undefined, { maxQuantity: max })
      item.quantity = quantity
      cart.version += 1
      saveDb()
      return json(toCart(cart))
    })),
    http.delete(p('/cart/items/:key'), route('DELETE /cart/items/:key', {}, (c) => {
      const { nftId, editionId } = keyOf(c.params.key!)
      const cart = getCart(c.cartOwner)
      cart.items = cart.items.filter((i) => !(i.nftId === nftId && i.editionId === editionId))
      cart.version += 1
      saveDb()
      return json(toCart(cart))
    })),
    http.put(p('/cart/coupon'), route('PUT /cart/coupon', {}, async (c) => {
      const { code } = await c.body(CouponBodySchema)
      const cart = getCart(c.cartOwner)
      const coupon = resolveCoupon(code)
      cart.couponCode = coupon!.code
      cart.version += 1
      saveDb()
      return json(toCart(cart))
    })),
    http.delete(p('/cart/coupon'), route('DELETE /cart/coupon', {}, (c) => {
      const cart = getCart(c.cartOwner)
      cart.couponCode = null
      cart.version += 1
      saveDb()
      return json(toCart(cart))
    })),
    /** O usuário viu e aceitou as mudanças de preço: o preço atual passa a ser a referência do aviso. */
    http.post(p('/cart/acknowledge'), route('POST /cart/acknowledge', {}, (c) => {
      const cart = getCart(c.cartOwner)
      for (const it of cart.items) it.addedPrice = getNft(it.nftId).price
      cart.version += 1
      saveDb()
      return json(toCart(cart))
    })),

    /* ───── Cotação ───── */
    http.post(p('/quote'), route('POST /quote', {}, async (c) => {
      const b = await c.body(QuoteBodySchema)
      const cart = getCart(c.cartOwner)
      return json(computeQuote(cart.items, b.couponCode === undefined ? cart.couponCode : b.couponCode, b.network ?? 'ethereum'))
    })),

    /* ───── Pedidos ───── */
    http.post(p('/orders'), route('POST /orders', { auth: true }, async (c) => {
      const db = getDb()
      const sc = getScenario()
      const user = c.user!
      const key = c.request.headers.get('Idempotency-Key')
      if (!key) throw new HttpError(400, 'VALIDATION_ERROR', 'Cabeçalho Idempotency-Key é obrigatório.')
      const body = await c.body(OrderCreateBodySchema)
      const hash = bodyHash(body)
      const idKey = `${user.id}:${key}`
      const existing = db.idempotency[idKey]
      if (existing) {
        if (existing.bodyHash !== hash) throw new HttpError(409, 'IDEMPOTENCY_CONFLICT', 'Esta chave já foi usada com outro conteúdo.')
        const order = db.orders[existing.orderId]!
        return json(toOrder(order), { headers: { 'Idempotent-Replay': 'true' } })
      }
      const wallet = (db.wallets[user.id] ?? []).find((w) => w.id === body.walletId)
      if (!wallet) throw new HttpError(422, 'VALIDATION_ERROR', 'Carteira não encontrada.', { walletId: 'Selecione uma carteira cadastrada.' })

      const conn = db.connections[user.id]
      if (!conn || conn.walletId !== body.walletId || conn.provider !== body.provider) throw new HttpError(409, 'WALLET_NOT_CONNECTED', 'Conecte a carteira selecionada antes de confirmar a compra.')

      const first = body.items[0]!
      if (sc.priceChangeOnSubmit) {
        consume('priceChanged')
        mutateNft(first.nftId, { price: addEth(getNft(first.nftId).price, '0.10') })
      }
      if (sc.soldOutOnSubmit) {
        consume('soldOut')
        mutateNft(first.nftId, { availability: { [first.editionId]: 0 } })
      }

      const lines = body.items.map((i) => {
        const nft = getNft(i.nftId)
        const ed = nft.editions.find((e) => e.id === i.editionId)
        return { i, nft, ed }
      })
      const short = lines.filter((l) => !l.ed || l.ed.available < l.i.quantity || l.i.quantity > MAX_PER_ITEM)
      if (short.length) {
        throw new HttpError(409, 'AVAILABILITY_CONFLICT', `${short[0]!.nft.name} não está mais disponível na quantidade solicitada.`, undefined, {
          unavailable: short.map((l) => ({ nftId: l.nft.id, editionId: l.i.editionId, available: l.ed?.available ?? 0 })),
        })
      }
      const stored = body.items.map((i) => ({ ...i, addedPrice: getNft(i.nftId).price }))
      const quote = computeQuote(stored, body.couponCode, body.network)
      if (quote.quoteId !== body.quoteId) throw new HttpError(409, 'QUOTE_CHANGED', 'Preço, taxa ou desconto mudou. Revise a cotação e confirme novamente.', undefined, { quote })

      // Reserva estoque (devolvido se o pagamento for recusado).
      for (const l of lines) {
        l.ed!.available -= l.i.quantity
        l.nft.version += 1
      }
      db.counters.order += 1
      const id = `ord_${String(db.counters.order).padStart(5, '0')}`
      const snapshot: OrderSnapshot = {
        items: lines.map((l) => ({ nftId: l.nft.id, name: l.nft.name, tokenId: l.nft.tokenId, image: l.nft.image, editionId: l.i.editionId, editionLabel: l.ed!.label, quantity: l.i.quantity, unitPrice: l.nft.price, subtotal: mulEth(l.nft.price, l.i.quantity) })),
        subtotal: quote.subtotal, discount: quote.discount, networkFee: quote.networkFee, total: quote.total,
        couponCode: quote.coupon?.code ?? null, network: body.network, walletLabel: wallet.nickname, provider: body.provider,
      }
      const now = new Date().toISOString()
      const order = (db.orders[id] = {
        id, userId: user.id, status: 'pending' as const, version: 1, createdAt: now, updatedAt: now, snapshot, txId: null, declineReason: null,
        settleAt: Date.now() + sc.settleDelayMs, purchased: body.items.map((i) => ({ ...i, addedPrice: '0.00' })), stockReleased: false,
      })
      db.idempotency[idKey] = { bodyHash: hash, orderId: id, timeoutServed: false }
      saveDb()
      for (const l of lines) {
        db.counters.event += 1
        hub.publish({ id: `evt_${db.counters.event}`, type: 'nft.updated', resource: { type: 'nft', id: l.nft.id }, version: l.nft.version, occurredAt: now, data: { price: l.nft.price, previousPrice: l.nft.previousPrice, editions: l.nft.editions.map((e) => ({ id: e.id, available: e.available })) } })
      }
      hub.publish(orderEvent(order))
      setTimeout(() => { const o = getDb().orders[id]; if (o) settleOrder(o) }, sc.settleDelayMs)

      if (sc.orderTimeout) {
        // O pedido FOI criado, mas a resposta se perde. Repetir com a mesma chave recupera este pedido.
        consume('orderTimeout')
        return HttpResponse.error()
      }
      return json(toOrder(order), { status: 201 })
    })),
    http.get(p('/orders'), route('GET /orders', { auth: true }, (c) =>
      json({ items: Object.values(getDb().orders).filter((o) => o.userId === c.user!.id).map(toOrder).reverse() }))),
    http.get(p('/orders/:id'), route('GET /orders/:id', { auth: true }, (c) => {
      const o = getDb().orders[c.params.id!]
      if (!o || o.userId !== c.user!.id) throw new HttpError(404, 'NOT_FOUND', 'Pedido não encontrado.')
      return json(toOrder(o))
    })),

    /* ───── Perfil ───── */
    http.get(p('/profile'), route('GET /profile', { auth: true }, (c) => json(toPublicUser(c.user!)))),
    http.patch(p('/profile'), route('PATCH /profile', { auth: true }, async (c) => {
      const b = await c.body(ProfileUpdateSchema)
      const db = getDb()
      const fe: Record<string, string> = {}
      if (!b.displayName.trim()) fe.displayName = 'Informe o nome de exibição.'
      const uErr = validateUsername(b.username)
      if (uErr) fe.username = uErr
      if (!EMAIL.test(b.email)) fe.email = 'Informe um e-mail válido.'
      if (!b.walletNickname.trim()) fe.walletNickname = 'Informe o apelido da carteira.'
      if (b.ensName && !/^[a-z0-9-]+(\.[a-z0-9-]+)*\.eth$/.test(b.ensName)) fe.ensName = 'Use um nome ENS válido terminado em .eth.'
      if (b.avatarUrl && b.avatarUrl.length > 200_000) fe.avatarUrl = 'Imagem muito grande. Use até 150 KB.'
      if (Object.keys(fe).length) throw new HttpError(422, 'VALIDATION_ERROR', 'Revise os campos destacados.', fe)
      if (db.users.some((u) => u.id !== c.user!.id && u.email.toLowerCase() === b.email.toLowerCase())) throw new HttpError(409, 'EMAIL_TAKEN', 'Já existe uma conta com este e-mail.', { email: 'Já existe uma conta com este e-mail.' })
      if (db.users.some((u) => u.id !== c.user!.id && u.username === b.username)) throw new HttpError(409, 'USERNAME_TAKEN', 'Este nome de usuário já está em uso.', { username: 'Este nome de usuário já está em uso.' })
      Object.assign(c.user!, { ...b, email: b.email.toLowerCase() })
      saveDb()
      return json(toPublicUser(c.user!))
    })),
    http.post(p('/profile/password'), route('POST /profile/password', { auth: true }, async (c) => {
      const b = await c.body(PasswordChangeSchema)
      const fe: Record<string, string> = {}
      if ((await hashPassword(c.user!.salt, b.currentPassword)) !== c.user!.passwordHash) fe.currentPassword = 'Senha atual incorreta.'
      const pErr = validatePassword(b.newPassword)
      if (pErr) fe.newPassword = pErr
      if (b.newPassword !== b.confirmPassword) fe.confirmPassword = 'As senhas não coincidem.'
      if (Object.keys(fe).length) throw new HttpError(422, 'VALIDATION_ERROR', 'Revise os campos destacados.', fe)
      c.user!.passwordHash = await hashPassword(c.user!.salt, b.newPassword)
      saveDb()
      return new HttpResponse(null, { status: 204 })
    })),

    /* ───── Carteiras ───── */
    http.get(p('/wallets'), route('GET /wallets', { auth: true }, (c) => {
      const all = getDb().wallets[c.user!.id] ?? []
      return json({ primary: all.find((w) => w.kind === 'primary') ?? null, secondary: all.find((w) => w.kind === 'secondary') ?? null })
    })),
    ...(['primary', 'secondary'] as const).map((kind) =>
      http.put(p(`/wallets/${kind}`), route(`PUT /wallets/${kind}`, { auth: true }, async (c) => {
        const b = await c.body(WalletInputSchema)
        const fe: Record<string, string> = {}
        for (const [f, label] of [['displayName', 'o nome de exibição'], ['nickname', 'o apelido da carteira'], ['profileName', 'o nome do perfil'], ['referralCode', 'o código de indicação']] as const) if (!b[f].trim()) fe[f] = `Informe ${label}.`
        if (!EMAIL.test(b.email)) fe.email = 'Informe um e-mail válido.'
        const okAddr = b.network === 'solana' ? /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(b.address) : /^0x[a-fA-F0-9]{40}$/.test(b.address)
        if (!okAddr) fe.address = b.network === 'solana' ? 'Endereço Solana inválido.' : 'Endereço inválido. Use 0x seguido de 40 caracteres hexadecimais.'
        if (b.ensName && !/^[a-z0-9-]+(\.[a-z0-9-]+)*\.eth$/.test(b.ensName)) fe.ensName = 'Use um nome ENS válido terminado em .eth.'
        if (Object.keys(fe).length) throw new HttpError(422, 'VALIDATION_ERROR', 'Revise os campos destacados.', fe)
        const db = getDb()
        const list = (db.wallets[c.user!.id] ??= [])
        const other = list.find((w) => w.kind !== kind)
        if (other && other.address.toLowerCase() === b.address.toLowerCase()) throw new HttpError(409, 'VALIDATION_ERROR', 'Este endereço já está cadastrado.', { address: 'Este endereço já está cadastrado em outra carteira.' })
        const current = list.find((w) => w.kind === kind)
        const next = { ...b, id: current?.id ?? `w_${c.user!.id}_${kind}`, kind }
        db.wallets[c.user!.id] = [...list.filter((w) => w.kind !== kind), next]
        saveDb()
        return json(next)
      }))),
    /* ───── Conexão de carteira (simulada) ───── */
    http.get(p('/wallet/connection'), route('GET /wallet/connection', { auth: true }, (c) => {
      const conn = getDb().connections[c.user!.id]
      return json({ connected: !!conn, provider: conn?.provider ?? null, walletId: conn?.walletId ?? null })
    })),
    http.put(p('/wallet/connection'), route('PUT /wallet/connection', { auth: true }, async (c) => {
      const b = await c.body(WalletConnectBodySchema)
      if (!(getDb().wallets[c.user!.id] ?? []).some((w) => w.id === b.walletId)) throw new HttpError(422, 'VALIDATION_ERROR', 'Carteira não encontrada.', { walletId: 'Selecione uma carteira cadastrada.' })
      if (getScenario().walletRejected) throw new HttpError(409, 'WALLET_REJECTED', 'A conexão foi recusada na carteira. Tente novamente.')
      getDb().connections[c.user!.id] = { provider: b.provider, walletId: b.walletId }
      saveDb()
      return json({ connected: true, provider: b.provider, walletId: b.walletId })
    })),
    http.delete(p('/wallet/connection'), route('DELETE /wallet/connection', { auth: true }, (c) => {
      delete getDb().connections[c.user!.id]
      saveDb()
      return json({ connected: false, provider: null, walletId: null })
    })),

    http.delete(p('/wallets/secondary'), route('DELETE /wallets/secondary', { auth: true }, (c) => {
      const db = getDb()
      db.wallets[c.user!.id] = (db.wallets[c.user!.id] ?? []).filter((w) => w.kind !== 'secondary')
      saveDb()
      return new HttpResponse(null, { status: 204 })
    })),
  ]
}
