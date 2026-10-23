/**
 * Verificação de contrato dos mocks em Node (sem navegador): roda os MESMOS handlers MSW usados no app.
 * Uso: npm run test:mocks
 */
import { createMockServer } from '../src/mocks/node'
import { resetDb } from '../src/mocks/db'
import { setScenario } from '../src/mocks/scenarios'
import { controls } from '../src/mocks/control'
import { addEth } from '../src/lib/money'

const BASE = 'http://mock.local/api'
const server = createMockServer(BASE)
server.listen({ onUnhandledRequest: 'bypass' })

let failed = 0
const ok = (cond: unknown, name: string, extra = '') => {
  if (!cond) failed++
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${!cond && extra ? `  -> ${extra}` : ''}`)
}
type J = Record<string, any>
async function call(method: string, path: string, opts: { body?: unknown; token?: string; headers?: Record<string, string> } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}), ...opts.headers },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  })
  const text = await res.text()
  return { status: res.status, body: (text ? JSON.parse(text) : null) as J, headers: res.headers }
}
const fresh = (...names: string[]) => { resetDb(); setScenario(['fast', ...names]) }
const login = async (email = 'ana@kurio.test') => {
  const r = (await call('POST', '/auth/login', { body: { email, password: 'Kurio#2026' } })).body as J
  const walletId = email.startsWith('ana') ? 'w_ana_1' : 'w_bruno_1'
  await call('PUT', '/wallet/connection', { body: { provider: 'metamask', walletId }, token: r.token })
  return r
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function checkoutBody(token: string, network = 'ethereum', walletId = 'w_ana_1') {
  const cart = (await call('GET', `/cart?network=${network}`, { token })).body
  return {
    items: cart.items.map((i: J) => ({ nftId: i.nftId, editionId: i.editionId, quantity: i.quantity })),
    couponCode: cart.couponCode, network, walletId, provider: 'metamask', quoteId: cart.quote.quoteId,
  }
}

async function main() {
  // IMPORTANTE: socket.io-client captura globalThis.WebSocket ao ser importado. Precisa vir DEPOIS de server.listen().
  // Em Node o padrão seria o pacote `ws`; usamos o transporte nativo, o mesmo código do navegador.
  const { io } = await import('socket.io-client')
  const { WebSocket: NativeWebSocket } = await import('engine.io-client')
  // Precisão decimal
  ok(addEth('0.10', '0.20') === '0.30', 'ETH: 0.1 + 0.2 === 0.30 (sem erro de ponto flutuante)')

  // Catálogo
  fresh()
  let r = await call('GET', '/nfts')
  ok(r.status === 200 && r.body.items.length === 9 && r.body.totalItems === 54 && r.body.totalPages === 6, 'catálogo: 54 NFTs, 9 por página, 6 páginas', JSON.stringify([r.body.totalItems, r.body.totalPages]))
  r = await call('GET', '/nfts?category=musica&network=ethereum')
  ok(r.body.items.every((n: J) => n.categoryId === 'musica' && n.network === 'ethereum') && r.body.totalItems >= 1, 'filtros combinados (categoria + rede)')
  r = await call('GET', '/nfts?q=golden&sort=price-asc')
  const prices = r.body.items.map((n: J) => Number(n.price))
  ok(r.body.items.length >= 3 && prices.every((p: number, i: number) => i === 0 || prices[i - 1] <= p), 'busca por texto + ordenação por preço crescente')
  r = await call('GET', '/nfts?minPrice=1.00&maxPrice=1.50')
  ok(r.body.items.every((n: J) => Number(n.price) >= 1 && Number(n.price) <= 1.5), 'faixa de preço')
  r = await call('GET', '/nfts?page=99')
  ok(r.body.page === r.body.totalPages, 'página fora do intervalo é limitada à última')
  r = await call('GET', '/nfts/inexistente')
  ok(r.status === 404 && r.body.code === 'NOT_FOUND', 'detalhe inexistente -> 404 NOT_FOUND')
  setScenario(['fast', 'empty'])
  r = await call('GET', '/nfts?q=x')
  ok(r.body.items.length === 0 && r.body.totalItems === 0, 'cenário empty -> lista vazia')
  setScenario(['fast', 'error500'])
  r = await call('GET', '/nfts')
  ok(r.status === 500 && r.body.code === 'TRANSIENT', 'cenário error500 -> HTTP 500')
  setScenario(['fast', 'flaky'])
  const a = await call('GET', '/nfts/emerald-ape-042'); const b = await call('GET', '/nfts/emerald-ape-042')
  ok(a.status === 503 && b.status === 200, 'cenário flaky: 1ª tentativa 503, repetição 200')

  // Conta
  fresh()
  r = await call('POST', '/auth/register', { body: { username: 'novo_user', email: 'ana@kurio.test', password: 'Senha123', confirmPassword: 'Senha123' } })
  ok(r.status === 409 && r.body.code === 'EMAIL_TAKEN' && r.body.fieldErrors?.email, 'cadastro: e-mail duplicado -> 409 com fieldErrors')
  r = await call('POST', '/auth/register', { body: { username: 'ab', email: 'x', password: '1', confirmPassword: '2' } })
  ok(r.status === 422 && Object.keys(r.body.fieldErrors).length === 4, 'cadastro: validação -> 422 com 4 campos', JSON.stringify(r.body.fieldErrors))
  r = await call('POST', '/auth/login', { body: { email: 'ana@kurio.test', password: 'errada123' } })
  ok(r.status === 401 && r.body.code === 'INVALID_CREDENTIALS', 'login com senha errada -> 401')
  r = await call('GET', '/favorites')
  ok(r.status === 401 && r.body.code === 'UNAUTHENTICATED', 'rota privada sem token -> 401 UNAUTHENTICATED')

  // Carrinho de visitante preservado ao autenticar
  const guest = { 'X-Cart-Token': 'guest-1' }
  await call('POST', '/cart/items', { body: { nftId: 'emerald-ape-042', editionId: '1-50', quantity: 2 }, headers: guest })
  const ana = await login().then(async () => (await call('POST', '/auth/login', { body: { email: 'ana@kurio.test', password: 'Kurio#2026' }, headers: guest })).body)
  const token = ana.token as string
  let cart = (await call('GET', '/cart', { token })).body
  ok(cart.items.length === 1 && cart.items[0].quantity === 2, 'carrinho do visitante é mesclado no login')
  const guestAfter = (await call('GET', '/cart', { headers: guest })).body
  ok(guestAfter.items.length === 0, 'carrinho do visitante é esvaziado após mesclar')

  // Limite de quantidade e cotação
  r = await call('POST', '/cart/items', { body: { nftId: 'emerald-ape-042', editionId: '1-1', quantity: 5 }, token })
  ok(r.status === 409 && r.body.code === 'AVAILABILITY_CONFLICT', 'limite de quantidade -> 409 AVAILABILITY_CONFLICT')
  await call('POST', '/cart/items', { body: { nftId: 'violet-nomad-314', editionId: '1-50', quantity: 6 }, token })
  cart = (await call('GET', '/cart', { token })).body
  ok(cart.quote.subtotal === '10.72' && cart.quote.networkFee === '0.016' && cart.quote.total === '10.736', 'cotação: 2×1.19 + 6×1.39 = 10.72 + taxa 0.016 = 10.736', JSON.stringify(cart.quote))
  r = await call('PUT', '/cart/coupon', { body: { code: 'NADA' }, token })
  ok(r.status === 422 && r.body.code === 'COUPON_INVALID', 'cupom inválido -> 422')
  r = await call('PUT', '/cart/coupon', { body: { code: 'EXPIRADO' }, token })
  ok(r.status === 422 && r.body.code === 'COUPON_EXPIRED', 'cupom expirado -> 422')
  r = await call('PUT', '/cart/coupon', { body: { code: 'lancamento10' }, token })
  ok(r.status === 200 && r.body.quote.discount === '1.072' && r.body.quote.total === '9.664', 'cupom válido: 10% de 10.72 = 1.072; total 9.664', JSON.stringify(r.body.quote))

  // Carteira: recusa e exigência de conexão
  const t0 = (await call('POST', '/auth/login', { body: { email: 'bruno@kurio.test', password: 'Kurio#2026' } })).body.token as string
  await call('POST', '/cart/items', { body: { nftId: 'golden-signal-160', editionId: 'open', quantity: 1 }, token: t0 })
  r = await call('POST', '/orders', { body: { ...(await checkoutBody(t0, 'ethereum', 'w_bruno_1')) }, token: t0, headers: { 'Idempotency-Key': 'nc' } })
  ok(r.status === 409 && r.body.code === 'WALLET_NOT_CONNECTED', 'pedido sem carteira conectada -> 409 WALLET_NOT_CONNECTED')
  setScenario(['fast', 'walletRejected'])
  r = await call('PUT', '/wallet/connection', { body: { provider: 'metamask', walletId: 'w_bruno_1' }, token: t0 })
  ok(r.status === 409 && r.body.code === 'WALLET_REJECTED', 'cenário walletRejected: conexão recusada -> 409 WALLET_REJECTED')
  setScenario(['fast'])
  await call('PUT', '/wallet/connection', { body: { provider: 'metamask', walletId: 'w_bruno_1' }, token: t0 })
  r = await call('DELETE', '/wallet/connection', { token: t0 })
  ok(r.body.connected === false, 'desconexão de carteira')
  await call('DELETE', '/cart/items/golden-signal-160~open', { token: t0 })

  // Pedido idempotente
  const body = await checkoutBody(token)
  await call('PUT', '/wallet/connection', { body: { provider: 'metamask', walletId: 'w_ana_1' }, token })
  const key = 'idem-1'
  const o1 = await call('POST', '/orders', { body, token, headers: { 'Idempotency-Key': key } })
  const o2 = await call('POST', '/orders', { body, token, headers: { 'Idempotency-Key': key } })
  ok(o1.status === 201 && o1.body.status === 'pending' && o2.body.id === o1.body.id && o2.headers.get('Idempotent-Replay') === 'true', 'pedido: mesma chave recupera o mesmo pedido', `${o1.status} ${o2.body.id}`)
  const o3 = await call('POST', '/orders', { body: { ...body, couponCode: null }, token, headers: { 'Idempotency-Key': key } })
  ok(o3.status === 409 && o3.body.code === 'IDEMPOTENCY_CONFLICT', 'pedido: mesma chave com conteúdo diferente -> 409')
  ok(o1.body.txId === null && o1.body.explorerUrl === null, 'pedido pendente não expõe transação')
  const stockAfter = (await call('GET', '/nfts/emerald-ape-042')).body.editions.find((e: J) => e.id === '1-50')
  ok(stockAfter.available < 50, 'estoque reservado ao criar o pedido')
  await sleep(700)
  r = await call('GET', `/orders/${o1.body.id}`, { token })
  ok(r.body.status === 'confirmed' && /^0x[0-9a-f]{64}$/.test(r.body.txId), 'pedido confirma após o atraso da simulação e ganha txId')
  ok(r.body.snapshot.total === '9.664' && r.body.snapshot.items.length === 2, 'recibo reproduz o snapshot do pedido')
  cart = (await call('GET', '/cart', { token })).body
  ok(cart.items.length === 0, 'itens comprados são removidos do carrinho após confirmação')
  const bruno = await login('bruno@kurio.test')
  r = await call('GET', `/orders/${o1.body.id}`, { token: bruno.token })
  ok(r.status === 404, 'isolamento: outro usuário não acessa o pedido (404)')

  // Mudança de preço durante a compra
  fresh('priceChanged')
  const t2 = (await login()).token as string
  await call('POST', '/cart/items', { body: { nftId: 'ivory-baron-088', editionId: 'open', quantity: 1 }, token: t2 })
  const b2 = await checkoutBody(t2)
  r = await call('POST', '/orders', { body: b2, token: t2, headers: { 'Idempotency-Key': 'k2' } })
  ok(r.status === 409 && r.body.code === 'QUOTE_CHANGED' && r.body.details.quote.quoteId !== b2.quoteId, 'preço alterado: 409 QUOTE_CHANGED com nova cotação')
  r = await call('POST', '/orders', { body: { ...b2, quoteId: r.body.details.quote.quoteId }, token: t2, headers: { 'Idempotency-Key': 'k2b' } })
  ok(r.status === 201, 'após reconfirmar com a nova cotação o pedido é criado')

  // Esgotado durante a compra
  fresh('soldOut')
  const t3 = (await login()).token as string
  await call('POST', '/cart/items', { body: { nftId: 'golden-beat-207', editionId: '1-10', quantity: 1 }, token: t3 })
  r = await call('POST', '/orders', { body: await checkoutBody(t3), token: t3, headers: { 'Idempotency-Key': 'k3' } })
  ok(r.status === 409 && r.body.code === 'AVAILABILITY_CONFLICT', 'edição esgotada durante a compra: 409 AVAILABILITY_CONFLICT')
  cart = (await call('GET', '/cart', { token: t3 })).body
  ok(cart.items.length === 1 && cart.items[0].status === 'unavailable', 'itens preservados na falha, marcados como indisponíveis')

  // Timeout após criação
  fresh('orderTimeout')
  const t4 = (await login()).token as string
  await call('POST', '/cart/items', { body: { nftId: 'golden-signal-160', editionId: 'open', quantity: 1 }, token: t4 })
  const b4 = await checkoutBody(t4)
  let netErr = false
  try { await call('POST', '/orders', { body: b4, token: t4, headers: { 'Idempotency-Key': 'k4' } }) } catch { netErr = true }
  ok(netErr, 'timeout: a resposta do 1º envio se perde (erro de rede)')
  r = await call('POST', '/orders', { body: b4, token: t4, headers: { 'Idempotency-Key': 'k4' } })
  ok(r.body.id && r.headers.get('Idempotent-Replay') === 'true', 'timeout: repetir com a mesma chave recupera o pedido já criado')
  r = await call('GET', '/orders', { token: t4 })
  ok(r.body.items.length === 1, 'timeout: nenhum pedido duplicado')

  // Pagamento recusado
  fresh('paymentDeclined')
  const t5 = (await login()).token as string
  await call('POST', '/cart/items', { body: { nftId: 'golden-signal-160', editionId: '1-10', quantity: 2 }, token: t5 })
  const before = (await call('GET', '/nfts/golden-signal-160')).body.editions.find((e: J) => e.id === '1-10').available
  const o5 = await call('POST', '/orders', { body: await checkoutBody(t5), token: t5, headers: { 'Idempotency-Key': 'k5' } })
  await sleep(700)
  r = await call('GET', `/orders/${o5.body.id}`, { token: t5 })
  const after = (await call('GET', '/nfts/golden-signal-160')).body.editions.find((e: J) => e.id === '1-10').available
  ok(r.body.status === 'declined' && r.body.txId === null, 'pagamento recusado: estado terminal sem transação')
  ok(after === before, 'pagamento recusado: estoque devolvido')
  cart = (await call('GET', '/cart', { token: t5 })).body
  ok(cart.items.length === 1, 'pagamento recusado: itens preservados no carrinho')

  // Sessão expirada
  fresh('sessionExpired')
  const t6 = (await call('POST', '/auth/login', { body: { email: 'ana@kurio.test', password: 'Kurio#2026' } })).body.token as string
  r = await call('GET', '/favorites', { token: t6 })
  ok(r.status === 401 && r.body.code === 'SESSION_EXPIRED', 'cenário sessionExpired: 401 SESSION_EXPIRED')
  r = await call('GET', '/favorites', { token: t6 })
  ok(r.status === 401 && r.body.code === 'UNAUTHENTICATED', 'sessão invalidada permanece inválida')

  // Perfil e carteiras
  fresh()
  const t7 = (await login()).token as string
  r = await call('POST', '/profile/password', { body: { currentPassword: 'errada1', newPassword: 'Nova#2026', confirmPassword: 'Nova#2026' }, token: t7 })
  ok(r.status === 422 && r.body.fieldErrors.currentPassword, 'senha: senha atual incorreta -> 422')
  r = await call('POST', '/profile/password', { body: { currentPassword: 'Kurio#2026', newPassword: 'Nova#2026', confirmPassword: 'Nova#2026' }, token: t7 })
  ok(r.status === 204 && (await call('POST', '/auth/login', { body: { email: 'ana@kurio.test', password: 'Nova#2026' } })).status === 200, 'senha alterada: nova senha autentica')
  r = await call('PUT', '/wallets/secondary', { body: { displayName: 'Ana', nickname: 'X', network: 'ethereum', address: '0x123', provider: 'metamask', profileName: 'a', referralCode: 'c', email: 'a@a.com', ensName: null, linkedWallet: null }, token: t7 })
  ok(r.status === 422 && r.body.fieldErrors.address, 'carteira: endereço inválido -> 422')

  // Favoritos com falha (rollback otimista)
  fresh('favoriteFailure')
  const t8 = (await login()).token as string
  r = await call('PUT', '/favorites/golden-beat-207', { token: t8 })
  ok(r.status === 500, 'cenário favoriteFailure: PUT /favorites -> 500')

  // Socket.IO via socket.io-client real sobre o binding do MSW
  fresh()
  const t9 = (await login()).token as string
  const received: J[] = []
  const sock = io('http://localhost:4173', { path: '/socket.io', transports: [NativeWebSocket], reconnection: false })
  const connected = await new Promise<boolean>((res) => { sock.on('connect', () => res(true)); setTimeout(() => res(false), 3000) })
  ok(connected, 'socket.io-client conecta ao servidor simulado (MSW + binding)')
  if (connected) {
    sock.emit('session.subscribe', { token: t9 })
    sock.on('nft.updated', (e: J) => received.push(e))
    sock.on('order.updated', (e: J) => received.push(e))
    await sleep(100)
    controls.realtime.updateNft('golden-beat-207', { price: '1.10' })
    await sleep(100)
    ok(received.some((e) => e.type === 'nft.updated' && e.resource.id === 'golden-beat-207' && e.data.price === '1.10' && e.version === 2), 'evento nft.updated chega pelo socket com versão e identidade')
    await call('POST', '/cart/items', { body: { nftId: 'golden-signal-160', editionId: 'open', quantity: 1 }, token: t9 })
    const o9 = await call('POST', '/orders', { body: await checkoutBody(t9), token: t9, headers: { 'Idempotency-Key': 'k9' } })
    await sleep(700)
    ok(received.some((e) => e.type === 'order.updated' && e.resource.id === o9.body.id && e.data.status === 'confirmed'), 'evento order.updated (confirmed) chega ao dono do pedido')
    sock.close()
    // outro usuário não recebe eventos privados
    const bt = (await login('bruno@kurio.test')).token as string
    const other: J[] = []
    const s2 = io('http://localhost:4173', { path: '/socket.io', transports: [NativeWebSocket], reconnection: false })
    await new Promise((res) => s2.on('connect', () => res(null)))
    s2.emit('session.subscribe', { token: bt })
    s2.on('order.updated', (e: J) => other.push(e))
    await sleep(100)
    await call('POST', '/cart/items', { body: { nftId: 'golden-signal-160', editionId: 'open', quantity: 1 }, token: t9 })
    await call('POST', '/orders', { body: await checkoutBody(t9), token: t9, headers: { 'Idempotency-Key': 'k9b' } })
    await sleep(700)
    ok(other.length === 0, 'isolamento: evento order.updated de Ana não chega ao socket de Bruno')
    s2.close()
  }

  server.close()
  console.log(failed ? `\n${failed} verificação(ões) falharam` : '\nTodas as verificações passaram')
  process.exit(failed ? 1 : 0)
}
main().catch((e) => { console.error(e); process.exit(1) })
