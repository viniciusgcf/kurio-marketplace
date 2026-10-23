import type { Edition, EditionId, Network, Nft, User, Wallet } from '@/contracts'
import { prng } from './scenarios'

export const CATEGORIES = [
  { id: 'arte-digital', label: 'Arte digital' },
  { id: 'fotografia', label: 'Fotografia' },
  { id: 'musica', label: 'Música' },
  { id: 'arte-3d', label: 'Arte 3D' },
  { id: 'colecionaveis', label: 'Colecionáveis' },
  { id: 'generativa', label: 'Generativa' },
  { id: 'jogos', label: 'Jogos' },
  { id: 'assinaturas', label: 'Assinaturas' },
  { id: 'utilidade', label: 'Utilidade' },
] as const

export const NETWORK_FEE: Record<Network, string> = { ethereum: '0.016', polygon: '0.002', solana: '0.001' }
export const COUPONS: Record<string, { kind: 'percent'; value: number; description: string } | { kind: 'expired' }> = {
  LANCAMENTO10: { kind: 'percent', value: 10, description: 'Desconto do lançamento (10%)' },
  KURIO5: { kind: 'percent', value: 5, description: 'Desconto de boas-vindas (5%)' },
  EXPIRADO: { kind: 'expired' },
}

const ART = ['emerald', 'violet', 'ivory', 'golden'] as const
const imageOf = (art: (typeof ART)[number]) => `/images/${art}.webp`

const EDITION_LABEL: Record<EditionId, string> = { '1-1': '1/1', '1-10': '1/10', '1-50': '1/50', open: 'ABERTA' }
const editions = (avail: Record<EditionId, number>): Edition[] =>
  (['1-1', '1-10', '1-50', 'open'] as const).map((id) => ({
    id,
    label: EDITION_LABEL[id],
    supply: id === 'open' ? null : Number(id.split('-')[1]),
    available: avail[id],
  }))

interface Seed {
  name: string
  token: number
  art: (typeof ART)[number]
  price: string
  prev?: string
  category: string
  network: Network
  rare?: boolean
  trending?: boolean
  rating?: number
  count?: number
  attrs?: string[]
}

// Os 9 primeiros reproduzem os cards do Figma.
const FIGMA: Seed[] = [
  { name: 'Emerald Ape', token: 42, art: 'emerald', price: '1.19', category: 'arte-digital', network: 'ethereum', rare: true, trending: true, rating: 4.8, count: 19, attrs: ['Óculos', 'Esmeralda', 'Raro'] },
  { name: 'Sage Nomad', token: 9, art: 'violet', price: '1.69', category: 'fotografia', network: 'polygon', trending: true },
  { name: 'Neon Vessel', token: 552, art: 'ivory', price: '1.99', prev: '2.29', category: 'arte-3d', network: 'solana', rare: true, trending: true },
  { name: 'Cosmic Bloom', token: 118, art: 'violet', price: '1.29', category: 'musica', network: 'ethereum' },
  { name: 'Violet Nomad', token: 314, art: 'violet', price: '1.39', category: 'arte-digital', network: 'ethereum' },
  { name: 'Ivory Baron', token: 88, art: 'ivory', price: '1.79', category: 'colecionaveis', network: 'polygon' },
  { name: 'Golden Beat', token: 207, art: 'golden', price: '0.99', category: 'musica', network: 'ethereum' },
  { name: 'Golden Frequency', token: 71, art: 'golden', price: '0.59', category: 'generativa', network: 'solana' },
  { name: 'Golden Signal', token: 160, art: 'golden', price: '0.39', category: 'jogos', network: 'polygon' },
]

const ADJ = ['Amber', 'Onyx', 'Coral', 'Lunar', 'Solar', 'Mossy', 'Copper', 'Jade', 'Opal', 'Dusk', 'Rustic', 'Velvet']
const NOUN = ['Ape', 'Nomad', 'Vessel', 'Bloom', 'Baron', 'Beat', 'Relic', 'Ember', 'Drift', 'Oracle', 'Echo', 'Totem']
const ATTRS = ['Óculos', 'Esmeralda', 'Chapéu', 'Fones', 'Jaqueta', 'Capuz', 'Corrente', 'Brinco', 'Fundo claro', 'Aura']

function build(seed: Seed, i: number, rand: () => number): Nft {
  const id = `${seed.name.toLowerCase().replace(/\s+/g, '-')}-${String(seed.token).padStart(3, '0')}`
  const cat = CATEGORIES.find((c) => c.id === seed.category)!
  const tokenId = `#${String(seed.token).padStart(4, '0')}`
  const avail = {
    '1-1': rand() < 0.15 ? 0 : 1,
    '1-10': 3 + Math.floor(rand() * 7),
    '1-50': 10 + Math.floor(rand() * 40),
    open: 99,
  }
  return {
    id,
    name: `${seed.name} #${String(seed.token).padStart(3, '0')}`,
    tokenId,
    categoryId: cat.id,
    categoryName: cat.label,
    collectionName: 'Kurio Apes',
    network: seed.network,
    image: imageOf(seed.art),
    gallery: [imageOf(seed.art), imageOf(seed.art), imageOf(seed.art), imageOf(seed.art)],
    price: seed.price,
    previousPrice: seed.prev ?? null,
    rare: !!seed.rare,
    trending: !!seed.trending,
    rating: seed.rating ?? Number((4 + rand()).toFixed(1)),
    ratingCount: seed.count ?? 3 + Math.floor(rand() * 40),
    // Quanto menor o índice, mais recente.
    listedAt: new Date(Date.UTC(2026, 6, 28, 12) - i * 36e5 * 7).toISOString(),
    description: `${seed.name} #${String(seed.token).padStart(3, '0')} é uma obra digital finalizada à mão da coleção Kurio Editions. Cada atributo fica armazenado nos metadados do token e verificado na ${seed.network === 'ethereum' ? 'Ethereum' : seed.network === 'polygon' ? 'Polygon' : 'Solana'}.`,
    attributes: seed.attrs ?? [ATTRS[i % ATTRS.length]!, ATTRS[(i * 3 + 1) % ATTRS.length]!, ...(seed.rare ? ['Raro'] : [])],
    contract: '0x7A42…19E8',
    royaltyPercent: 5,
    editions: editions(avail),
    version: 1,
  }
}

export function buildNfts(): Nft[] {
  const rand = prng(20260729)
  const seeds: Seed[] = [...FIGMA]
  const used = new Set(FIGMA.map((s) => `${s.name}#${s.token}`))
  let n = 0
  while (seeds.length < 54) {
    const name = `${ADJ[Math.floor(rand() * ADJ.length)]} ${NOUN[Math.floor(rand() * NOUN.length)]}`
    const token = 1 + Math.floor(rand() * 899)
    if (used.has(`${name}#${token}`)) continue
    used.add(`${name}#${token}`)
    const price = n === 0 ? '12.30' : n === 1 ? '0.02' : (0.1 + rand() * 4.4).toFixed(2)
    seeds.push({
      name,
      token,
      art: ART[Math.floor(rand() * ART.length)]!,
      price,
      prev: rand() < 0.12 ? (Number(price) + 0.3).toFixed(2) : undefined,
      category: CATEGORIES[Math.floor(rand() * CATEGORIES.length)]!.id,
      network: (['ethereum', 'polygon', 'solana'] as const)[Math.floor(rand() * 3)]!,
      rare: rand() < 0.15,
      trending: rand() < 0.3,
    })
    n++
  }
  return seeds.map((s, i) => build(s, i, rand))
}

export interface StoredUser extends User {
  passwordHash: string
  salt: string
}

/** Senha fictícia de ambos: Kurio#2026 (guardada como SHA-256 com sal, nunca em claro). */
export const FIXTURE_USERS: StoredUser[] = [
  {
    id: 'u_ana', displayName: 'Ana Duarte', username: 'anaduarte', email: 'ana@kurio.test', ensName: 'ana.eth',
    walletNickname: 'Ana principal', avatarUrl: null, salt: 'salt-ana-01',
    passwordHash: '79b5bd84ff0b823c7c3fe80be9df19e278b76683984a751cac4f1dce08bdd487',
  },
  {
    id: 'u_bruno', displayName: 'Bruno Lima', username: 'brunolima', email: 'bruno@kurio.test', ensName: null,
    walletNickname: 'Bruno cofre', avatarUrl: null, salt: 'salt-bruno-01',
    passwordHash: 'ecbebb2032f5b663e9412fbb8023dc9d67d4c2dbd762e9990fe77b89362f876e',
  },
]

export function fixtureWallets(): Record<string, Wallet[]> {
  return {
    u_ana: [
      { id: 'w_ana_1', kind: 'primary', displayName: 'Ana Duarte', nickname: 'Principal', network: 'ethereum', address: '0xA91F3c5B7d2E4f60189aB3C4d5E6f708192aE82C', provider: 'metamask', profileName: 'anaduarte', referralCode: 'KURIO-ANA', email: 'ana@kurio.test', ensName: 'ana.eth', linkedWallet: null },
      { id: 'w_ana_2', kind: 'secondary', displayName: 'Ana Duarte', nickname: 'Reserva', network: 'polygon', address: '0x5Cb2E81d90aF47c3d6B1a0e9F2c48D7b36a1F0e4', provider: 'coinbase', profileName: 'anaduarte', referralCode: 'KURIO-ANA', email: 'ana@kurio.test', ensName: 'nova.kurio.eth', linkedWallet: null },
    ],
    u_bruno: [
      { id: 'w_bruno_1', kind: 'primary', displayName: 'Bruno Lima', nickname: 'Cofre', network: 'ethereum', address: '0x1De4B7a93C60f58e2A4d9B1c7E30aF5862d1C0b9', provider: 'walletconnect', profileName: 'brunolima', referralCode: 'KURIO-BRU', email: 'bruno@kurio.test', ensName: null, linkedWallet: null },
    ],
  }
}
