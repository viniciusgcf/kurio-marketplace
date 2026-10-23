import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useParams, useRouter } from '@tanstack/react-router'
import { ChevronLeft, Heart, Mail, Search, ShoppingCart, Star } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { nftListQuery, nftQuery } from '@/app/queries'
import { isApiError } from '@/api/http'
import { container, soon } from '@/components/layout/app-shell'
import { defaultEdition } from '@/components/nft/nft-card'
import { Price } from '@/components/nft/price'
import { QuantityStepper } from '@/components/nft/quantity-stepper'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { MAX_PER_ITEM } from '@/features/cart/limits'
import { useAddToCart } from '@/features/cart/hooks'
import { useFavorites, useToggleFavorite } from '@/features/favorites/hooks'
import type { Nft } from '@/contracts'
import { cn } from '@/lib/cn'
import { formatEth } from '@/lib/money'
import { toast } from '@/lib/toast'

export default function NftDetailRoute() {
  const { id } = useParams({ from: '/nft/$id' })
  const q = useQuery(nftQuery(id))
  if (q.isPending) return <DetailSkeleton />
  if (q.isError) {
    const notFound = isApiError(q.error) && q.error.status === 404
    return (
      <div role="alert" className={cn(container, 'py-24 text-center')}>
        <h1 className="text-2xl font-bold">{notFound ? 'NFT não encontrado' : 'Não foi possível carregar este NFT'}</h1>
        <p className="mt-3 text-muted">{notFound ? 'Este NFT não existe ou foi removido do catálogo.' : q.error.message}</p>
        <div className="mt-8 flex justify-center gap-3">
          {!notFound && <Button onClick={() => void q.refetch()} disabled={q.isFetching}>Tentar novamente</Button>}
          <Button asChild variant={notFound ? 'primary' : 'outline'}><Link to="/">Voltar ao catálogo</Link></Button>
        </div>
      </div>
    )
  }
  return <Detail nft={q.data} />
}

function DetailSkeleton() {
  return (
    <div className={cn(container, 'py-6')} aria-busy="true" aria-label="Carregando NFT">
      <div className="grid gap-8 md:grid-cols-[100px_444px_1fr]">
        <div className="hidden gap-4 md:grid">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="size-[100px]" />)}</div>
        <Skeleton className="aspect-square w-full md:size-[444px]" />
        <div className="space-y-4"><Skeleton className="h-9 w-2/3" /><Skeleton className="h-7 w-32" /><Skeleton className="h-20 w-full" /><Skeleton className="h-8 w-64" /><Skeleton className="h-12 w-72" /></div>
      </div>
    </div>
  )
}

const Stars = ({ rating }: { rating: number }) => (
  <span role="img" aria-label={`Nota ${rating} de 5`} className="inline-flex text-accent">{Array.from({ length: 5 }, (_, i) => <Star key={i} size={14} aria-hidden="true" className={i < Math.round(rating) ? 'fill-current' : ''} />)}</span>
)

function Detail({ nft }: { nft: Nft }) {
  const router = useRouter()
  const navigate = useNavigate()
  const add = useAddToCart()
  const { ids } = useFavorites()
  const { toggle, pending } = useToggleFavorite()
  const isFav = ids.has(nft.id)
  const [editionId, setEditionId] = useState(() => defaultEdition(nft)?.id ?? nft.editions[0]!.id)
  const [wantedQty, setQty] = useState(1)
  const [shot, setShot] = useState(0)
  const [zoom, setZoom] = useState(false)
  const [tab, setTab] = useState<'details' | 'reviews'>('details')
  const edition = nft.editions.find((e) => e.id === editionId) ?? nft.editions[0]!
  const max = Math.min(edition.available, MAX_PER_ITEM)
  const soldOut = max === 0
  // Disponibilidade pode cair em tempo real: a quantidade exibida/enviada é sempre limitada ao máximo atual (derivada, sem effect).
  const qty = Math.max(1, Math.min(wantedQty, Math.max(max, 1)))
  const related = useQuery(nftListQuery({ sort: 'popular', pageSize: 6 }))
  const tabsId = useId()

  // Aviso de preço/estoque atualizado enquanto a página está aberta.
  const last = useRef({ v: nft.version, price: nft.price })
  useEffect(() => {
    if (nft.version > last.current.v) {
      toast(nft.price !== last.current.price ? `Preço atualizado para ${formatEth(nft.price)}.` : 'A disponibilidade das edições foi atualizada.', 'info')
      last.current = { v: nft.version, price: nft.price }
    }
  }, [nft.version, nft.price])

  const addToCart = (goToCart: boolean) =>
    add.mutate({ nftId: nft.id, editionId: edition.id, quantity: qty }, {
      onSuccess: () => { if (goToCart) void navigate({ to: '/carrinho' }); else toast(`${nft.name} foi adicionado ao carrinho.`, 'success') },
      onError: (e) => toast(isApiError(e) ? e.message : 'Não foi possível adicionar ao carrinho.', 'error'),
    })
  const gallery = nft.gallery

  const editions = (
    <fieldset className="border-0 p-0">
      <legend className="mb-2 text-sm font-bold">Edição:</legend>
      <div className="flex flex-wrap gap-2">
        {nft.editions.map((e) => (
          <label key={e.id} className={cn('cursor-pointer rounded-full border px-3 py-1 text-xs has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent-hi', e.id === editionId ? 'border-accent-hi text-accent-hi' : 'border-line text-muted', e.available === 0 && 'cursor-not-allowed opacity-50')}>
            <input type="radio" name="edicao" value={e.id} checked={e.id === editionId} disabled={e.available === 0} onChange={() => setEditionId(e.id)} className="sr-only" aria-label={`Edição ${e.label}${e.available === 0 ? ', esgotada' : `, ${e.available} disponíveis`}`} />
            <span aria-hidden="true">{e.label}{e.available === 0 && ' · esgotada'}</span>
          </label>
        ))}
      </div>
    </fieldset>
  )
  const meta = (
    <dl className="space-y-2 text-sm text-faint">
      <div><dt className="inline">ID do token: </dt><dd className="inline">{nft.tokenId}</dd></div>
      <div><dt className="inline">Coleção: </dt><dd className="inline">{nft.collectionName}</dd></div>
      <div><dt className="inline">Atributos: </dt><dd className="inline">{nft.attributes.join(', ')}</dd></div>
    </dl>
  )
  const stock = (
    <p role="status" aria-live="polite" className={cn('text-xs', soldOut ? 'text-danger' : 'text-muted')}>
      {soldOut ? '✕ Edição esgotada. Escolha outra edição.' : qty >= max ? `Limite de ${max} unidade(s) para esta edição.` : `${edition.available} disponíveis nesta edição.`}
    </p>
  )

  return (
    <div className="pb-28 md:pb-0">
      {/* Mobile: barra superior sobre a imagem */}
      <div className="flex items-center justify-between px-5 py-3 md:hidden">
        <Button variant="quiet" size="icon" className="size-10" onClick={() => router.history.back()} aria-label="Voltar"><ChevronLeft size={20} aria-hidden="true" /></Button>
        <Button variant="quiet" size="icon" className="size-10" onClick={() => toggle(nft.id, isFav)} disabled={pending} aria-pressed={isFav} aria-label={isFav ? 'Remover dos favoritos' : 'Favoritar'}><Heart size={18} aria-hidden="true" className={cn(isFav && 'fill-accent text-accent')} /></Button>
      </div>

      <div className={cn(container, 'max-md:px-7 md:pt-8')}>
        <nav aria-label="Trilha" className="mb-4 hidden text-sm font-bold md:block"><Link to="/" className="hover:text-accent-hi">Início</Link> / <Link to="/" hash="catalogo" className="hover:text-accent-hi">Mercado</Link></nav>
        <div className="grid gap-0 md:grid-cols-[100px_minmax(0,444px)_1fr] md:gap-7">
          <ul className="hidden gap-4 md:grid md:content-start" aria-label="Galeria">
            {gallery.map((src, i) => (
              <li key={i}><button type="button" onClick={() => setShot(i)} aria-label={`Ver imagem ${i + 1} de ${gallery.length}`} aria-pressed={i === shot} className={cn('block rounded-lg ring-2', i === shot ? 'ring-accent' : 'ring-transparent')}>
                <img src={src.replace('.webp', '-thumb.webp')} alt="" width={100} height={100} className="size-[100px] rounded-lg object-cover" />
              </button></li>
            ))}
          </ul>
          <div className="relative bg-surface p-5 max-md:p-0">
            <img src={gallery[shot] ?? nft.image} alt={`Arte do NFT ${nft.name}`} width={404} height={404} fetchPriority="high" decoding="async" className="aspect-[4/5] w-full rounded-[28px] object-cover md:aspect-square" />
            <button type="button" onClick={() => setZoom(true)} aria-label="Ampliar imagem" className="absolute right-7 top-7 grid size-9 place-items-center rounded-full bg-bg/80 max-md:hidden"><Search size={18} aria-hidden="true" /></button>
          </div>

          <section aria-labelledby="titulo" className="relative z-10 max-md:-mt-24 max-md:-mx-7 max-md:rounded-t-[32px] max-md:bg-surface max-md:px-6 max-md:py-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 id="titulo" className="text-xl font-bold md:text-[32px] md:leading-10">{nft.name}</h1>
                <Price value={nft.price} previous={nft.previousPrice} className="mt-1 text-2xl font-bold max-md:hidden" />
              </div>
              <p className="flex items-center gap-2 text-sm text-muted max-md:gap-1 max-md:rounded-full max-md:border max-md:border-accent max-md:px-2 max-md:py-1 max-md:text-xs"><span className="max-md:hidden"><Stars rating={nft.rating} /></span><span role="img" aria-label={`Nota ${nft.rating} de 5`} className="hidden text-accent max-md:inline-flex"><Star size={14} aria-hidden="true" className="fill-current" /></span><span className="md:hidden font-bold">{nft.rating.toFixed(1)}</span><span>({nft.ratingCount}<span className="max-md:sr-only"> avaliações de colecionadores</span><span className="md:hidden" aria-hidden="true">)</span></span><span className="max-md:hidden">)</span></p>
            </div>
            <hr className="my-4 border-line max-md:hidden" />
            <h2 className="mb-1 text-sm font-bold max-md:hidden">Sobre este NFT:</h2>
            <p className="text-sm leading-6 text-faint">{nft.description}</p>
            <div className="mt-4">{editions}</div>
            <div className="mt-4 hidden items-center justify-between gap-4 md:flex">
              <QuantityStepper value={qty} max={Math.max(max, 1)} onChange={setQty} label={nft.name} disabled={soldOut} />
              <div className="flex gap-2">
                <Button size="md" disabled={soldOut || add.isPending} onClick={() => addToCart(true)}>{add.isPending ? 'ADICIONANDO…' : 'COMPRAR'}</Button>
                <Button variant="outline" size="md" onClick={() => toggle(nft.id, isFav)} disabled={pending} aria-pressed={isFav}><Heart size={16} aria-hidden="true" className={cn(isFav && 'fill-accent')} />{isFav ? 'Favoritado' : 'Favoritar'}</Button>
              </div>
            </div>
            <div className="mt-2">{stock}</div>
            <div className="mt-4">{meta}</div>
            <p className="mt-4 hidden items-center gap-3 text-sm font-bold md:flex">Compartilhar este NFT:
              {['LinkedIn', 'E-mail', 'Twitter'].map((n) => <button key={n} type="button" onClick={() => soon('Compartilhar')} aria-label={`Compartilhar no ${n}`} className="text-ink hover:text-accent-hi">{n === 'E-mail' ? <Mail size={18} aria-hidden="true" /> : <span aria-hidden="true" className="text-xs">{n[0]}</span>}</button>)}
            </p>
          </section>
        </div>

        <div className="mt-16 hidden md:block">
          <div role="tablist" aria-label="Informações do NFT" className="flex gap-8 border-b border-line">
            {([['details', 'Detalhes do NFT'], ['reviews', `Avaliações de colecionadores (${nft.ratingCount})`]] as const).map(([k, l]) => (
              <button key={k} role="tab" id={`${tabsId}-${k}`} aria-selected={tab === k} aria-controls={`${tabsId}-panel`} tabIndex={tab === k ? 0 : -1} type="button" onClick={() => setTab(k)} onKeyDown={(e) => { if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') setTab(tab === 'details' ? 'reviews' : 'details') }} className={cn('-mb-px border-b-2 py-3 text-base', tab === k ? 'border-accent font-bold text-accent-hi' : 'border-transparent text-muted')}>{l}</button>
            ))}
          </div>
          <div role="tabpanel" id={`${tabsId}-panel`} aria-labelledby={`${tabsId}-${tab}`} className="space-y-4 py-5 text-sm leading-6 text-faint">
            {tab === 'details' ? (
              <>
                <p>{nft.name} é uma obra digital 1/50 finalizada à mão da coleção Kurio Editions. Cada atributo fica armazenado nos metadados do token e verificado na rede. A obra explora identidade, movimento e luz em um mundo digital sem fronteiras.</p>
                <p>A propriedade inclui a arte em alta resolução, lançamentos exclusivos para colecionadores e um registro permanente de procedência registrada na rede.</p>
                <p><b className="text-ink">Rede:</b><br />Cunhado na rede {nft.network === 'ethereum' ? 'Ethereum' : nft.network === 'polygon' ? 'Polygon' : 'Solana'} com procedência imutável e metadados armazenados no IPFS.</p>
                <p><b className="text-ink">Direitos autorais:</b><br />Direitos autorais do criador: {nft.royaltyPercent}% nas vendas secundárias, pagos automaticamente pelos mercados compatíveis.</p>
                <p><b className="text-ink">Contrato:</b><br />{nft.contract} · Contrato inteligente ERC-721 verificado.</p>
              </>
            ) : <p>As avaliações de colecionadores ainda não estão disponíveis nesta versão.</p>}
          </div>
        </div>

        <section aria-labelledby="mais" className="mt-12 md:mt-16">
          <h2 id="mais" className="border-b border-line pb-3 text-lg font-bold text-accent-hi">Mais desta coleção</h2>
          <ul className="mt-6 grid auto-cols-[160px] grid-flow-col gap-5 overflow-x-auto pb-4 md:grid-cols-5 md:auto-cols-auto md:grid-flow-row md:overflow-visible">
            {related.isPending ? Array.from({ length: 5 }, (_, i) => <li key={i}><Skeleton className="aspect-[0.9] w-full" /></li>)
              : related.data?.items.filter((n) => n.id !== nft.id).slice(0, 5).map((n) => (
                <li key={n.id}><Link to="/nft/$id" params={{ id: n.id }} className="block bg-surface p-1"><img src={n.image} alt={`Arte do NFT ${n.name}`} width={219} height={214} loading="lazy" decoding="async" className="aspect-square w-full rounded-2xl object-cover" /><span className="mt-2 block px-1 text-sm">{n.name}</span><span className="block px-1 text-sm font-bold text-accent-hi">{formatEth(n.price)}</span></Link></li>
              ))}
          </ul>
        </section>
      </div>

      {/* Barra de compra fixa no mobile */}
      <div className="fixed inset-x-0 bottom-0 z-30 rounded-t-[32px] bg-surface px-5 pb-6 pt-4 md:hidden">
        <div className="flex items-center justify-between"><QuantityStepper value={qty} max={Math.max(max, 1)} onChange={setQty} label={nft.name} disabled={soldOut} /><Price value={nft.price} className="text-xl font-bold" /></div>
        <div className="mt-3 flex gap-3">
          <Button size="lg" className="flex-1 rounded-full" disabled={soldOut || add.isPending} onClick={() => addToCart(true)}>Comprar NFT</Button>
          <Button variant="quiet" size="icon" className="size-12 bg-bg" disabled={soldOut || add.isPending} onClick={() => addToCart(false)} aria-label="Adicionar ao carrinho"><ShoppingCart size={20} aria-hidden="true" /></Button>
        </div>
      </div>

      <Dialog open={zoom} onOpenChange={setZoom} title={`Imagem ampliada de ${nft.name}`} hideTitle className="md:top-[60px] md:w-[min(90vw,720px)] p-3">
        <img src={gallery[shot] ?? nft.image} alt={`Arte do NFT ${nft.name}, ampliada`} className="mx-auto max-h-[80dvh] w-full rounded-2xl object-contain" />
      </Dialog>
    </div>
  )
}
