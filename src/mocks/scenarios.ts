/**
 * Cenários configuráveis e reproduzíveis. Nada é aleatório: latência variável usa PRNG com semente
 * e "falhas transitórias" são decididas por contador, então a mesma sequência de ações produz o
 * mesmo resultado em dev, demonstração e testes.
 *
 * Seleção: `?scenario=slow,paymentDeclined` na URL (persiste em localStorage),
 * `?scenario=default` volta ao padrão, `?reset=1` restaura o banco de fixtures.
 */
import { storage } from './storage'

export interface Scenario {
  names: string[]
  seed: number
  latency: { min: number; max: number }
  /** Respostas de listagem chegam fora de ordem (1ª requisição lenta, 2ª rápida...). */
  outOfOrder: boolean
  /** Toda requisição REST falha com erro de rede (sem resposta). */
  offline: boolean
  /** Toda requisição ao endpoint dado responde com este status HTTP. Ex.: { 'GET /nfts': 500 } */
  failEndpoints: Record<string, number>
  /** A 1ª tentativa de cada GET distinto responde 503; a repetição funciona. */
  failFirstAttempt: boolean
  catalog: 'default' | 'empty'
  /** Próxima requisição autenticada responde 401 SESSION_EXPIRED e invalida a sessão. */
  sessionExpiredNext: boolean
  /** Endpoints privados respondem 403. */
  forbidden: boolean
  /** Ao criar pedido o preço do 1º item muda (e o evento nft.updated é emitido). */
  priceChangeOnSubmit: boolean
  /** Ao criar pedido a edição do 1º item esgota. */
  soldOutOnSubmit: boolean
  /** O pedido é criado, mas a resposta nunca chega (erro de rede). A repetição com a mesma chave recupera o pedido. */
  orderTimeout: boolean
  payment: 'confirmed' | 'declined'
  settleDelayMs: number
  /** Favoritar falha com 500 (testa rollback da atualização otimista). */
  favoriteFailure: boolean
  /** Cada evento é entregue duas vezes. */
  duplicateEvents: boolean
  /** A conexão da carteira é recusada pelo usuário. */
  walletRejected: boolean
}

export const DEFAULT_SCENARIO: Scenario = {
  names: ['default'],
  seed: 1337,
  latency: { min: 120, max: 320 },
  outOfOrder: false,
  offline: false,
  failEndpoints: {},
  failFirstAttempt: false,
  catalog: 'default',
  sessionExpiredNext: false,
  forbidden: false,
  priceChangeOnSubmit: false,
  soldOutOnSubmit: false,
  orderTimeout: false,
  payment: 'confirmed',
  settleDelayMs: 2500,
  favoriteFailure: false,
  duplicateEvents: false,
  walletRejected: false,
}

export const PRESETS: Record<string, Partial<Scenario>> = {
  default: {},
  success: {},
  empty: { catalog: 'empty' },
  slow: { latency: { min: 2500, max: 3500 } },
  jitter: { latency: { min: 80, max: 2200 } },
  outOfOrder: { outOfOrder: true },
  offline: { offline: true },
  error500: { failEndpoints: { 'GET /nfts': 500 } },
  error404: { failEndpoints: { 'GET /nfts': 404 } },
  flaky: { failFirstAttempt: true },
  sessionExpired: { sessionExpiredNext: true },
  forbidden: { forbidden: true },
  priceChanged: { priceChangeOnSubmit: true },
  soldOut: { soldOutOnSubmit: true },
  orderTimeout: { orderTimeout: true },
  paymentDeclined: { payment: 'declined' },
  paymentConfirmed: { payment: 'confirmed' },
  favoriteFailure: { favoriteFailure: true },
  duplicateEvents: { duplicateEvents: true },
  walletRejected: { walletRejected: true },
  fast: { latency: { min: 0, max: 0 }, settleDelayMs: 400 },
}

const KEY = 'kurio:mock:scenario'
let current: Scenario = resolve(readNames())

function readNames(): string[] {
  try {
    const raw = storage.get(KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : ['default']
    return Array.isArray(parsed) ? parsed.filter((n): n is string => typeof n === 'string') : ['default']
  } catch {
    return ['default']
  }
}

export function resolve(names: string[]): Scenario {
  const known = names.filter((n) => n in PRESETS)
  const merged = known.reduce<Scenario>((acc, n) => ({ ...acc, ...PRESETS[n] }), { ...DEFAULT_SCENARIO })
  return { ...merged, names: known.length ? known : ['default'] }
}

export const getScenario = (): Scenario => current

export function setScenario(names: string[]): Scenario {
  current = resolve(names)
  storage.set(KEY, JSON.stringify(current.names))
  return current
}

/** Ajuste pontual sem alterar o preset (ex.: sessionExpiredNext volta a false depois de usado). */
export function patchScenario(patch: Partial<Scenario>): void {
  current = { ...current, ...patch }
}

/** PRNG determinístico (mulberry32). */
export function prng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
