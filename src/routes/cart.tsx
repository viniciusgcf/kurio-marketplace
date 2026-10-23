import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useRouter } from '@tanstack/react-router'
import { ChevronLeft, Trash2, TriangleAlert } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { nftListQuery, useSession } from '@/app/queries'
import { isApiError } from '@/api/http'
import { container } from '@/components/layout/app-shell'
import { QuantityStepper } from '@/components/nft/quantity-stepper'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useAcknowledgePrices, useApplyCoupon, useCart, useRemoveCoupon, useRemoveItem, useUpdateQuantity } from '@/features/cart/hooks'
import { QuoteLines } from '@/features/cart/summary'
import type { CartItem } from '@/contracts'
import { formatEth } from '@/lib/money'
import { toast } from '@/lib/toast'
import { cn } from '@/lib/cn'

export default function CartRoute() {
  const router = useRouter()
  const navigate = useNavigate()
  const { user } = useSession()
  const cart = useCart()
  const update = useUpdateQuantity()
  const remove = useRemoveItem()
  const coupon = useApplyCoupon()
  const unCoupon = useRemoveCoupon()
  const ack = useAcknowledgePrices()
  const [code, setCode] = useState('')
  const [couponError, setCouponError] = useState('')
  const data = cart.data
  const items = data?.items ?? []
  const changed = items.filter((i) => i.status === 'price_changed')
  const blocked = items.filter((i) => i.status === 'unavailable' || i.status === 'reduced')

  const onQty = (i: CartItem, quantity: number) =>
    update.mutate({ nftId: i.nftId, editionId: i.editionId, quantity }, { onError: (e) => toast(isApiError(e) ? e.message : 'Não foi possível atualizar a quantidade.', 'error') })
  const onRemove = (i: CartItem) =>
    remove.mutate({ nftId: i.nftId, editionId: i.editionId }, { onSuccess: () => toast(`${i.name} foi removido do carrinho.`, 'info'), onError: () => toast('Não foi possível remover o item.', 'error') })
  const onCoupon = (e: FormEvent) => {
    e.preventDefault()
    setCouponError('')
    if (!code.trim()) { setCouponError('Digite um código promocional.'); return }
    coupon.mutate(code, { onSuccess: () => { setCode(''); toast('Cupom aplicado.', 'success') }, onError: (err) => setCouponError(isApiError(err) ? err.message : 'Não foi possível aplicar o cupom.') })
  }
  const checkout = () => void navigate(user ? { to: '/pagamento' } : { to: '/login', search: { redirect: '/pagamento' } })

  const summary = (
    <section aria-labelledby="resumo" className="max-md:rounded-t-[32px] max-md:bg-surface max-md:p-5">
      <h2 id="resumo" className="border-b border-line pb-3 text-lg font-bold max-md:hidden">Resumo da carteira</h2>
      <form onSubmit={onCoupon} noValidate className="md:mt-5">
        <label htmlFor="cupom" className="mb-2 block text-xs font-bold max-md:sr-only">Código promocional</label>
        <div className="flex overflow-hidden rounded-[3px] border border-accent max-md:rounded-full">
          <input id="cupom" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Digite o código promocional..." aria-invalid={!!couponError} aria-describedby={couponError ? 'cupom-erro' : undefined} className="h-10 min-w-0 flex-1 bg-bg px-3 text-xs placeholder:text-faint max-md:bg-transparent max-md:px-4" />
          <Button type="submit" size="md" className="rounded-none" disabled={coupon.isPending || !items.length}>{coupon.isPending ? '…' : 'Aplicar'}</Button>
        </div>
        {couponError && <p id="cupom-erro" role="alert" className="mt-1 text-xs text-danger"><span aria-hidden="true">✕ </span>{couponError}</p>}
        {data?.couponCode && (
          <p className="mt-2 flex items-center justify-between text-xs text-ok"><span><span aria-hidden="true">✓ </span>Cupom {data.couponCode} aplicado</span>
            <button type="button" onClick={() => unCoupon.mutate()} className="text-accent-hi underline" aria-label={`Remover cupom ${data.couponCode}`}>Remover</button></p>
        )}
      </form>
      <QuoteLines quote={data?.quote} loading={cart.isPending} className="mt-6" />
      <Button size="lg" className="mt-6 w-full max-md:rounded-full" onClick={checkout} disabled={!items.length || blocked.length > 0 || cart.isFetching && cart.isPending}>Conectar e finalizar</Button>
      {blocked.length > 0 && <p role="alert" className="mt-2 text-xs text-danger"><span aria-hidden="true">✕ </span>Remova ou ajuste os itens indisponíveis para continuar.</p>}
      <Link to="/" hash="catalogo" className="mt-4 block text-center text-sm text-accent-hi hover:underline max-md:hidden">Continuar explorando</Link>
    </section>
  )

  return (
    <div className="pb-6">
      <div className="flex items-center gap-4 px-7 py-4 md:hidden"><Button variant="quiet" size="icon" className="size-10" onClick={() => router.history.back()} aria-label="Voltar"><ChevronLeft size={20} aria-hidden="true" /></Button><h1 className="flex-1 pr-10 text-center text-xl font-bold">Carrinho de NFTs</h1></div>
      <div className={cn(container, 'max-md:px-7 md:pt-8')}>
        <nav aria-label="Trilha" className="mb-4 hidden text-sm font-bold md:block"><Link to="/" className="hover:text-accent-hi">Início</Link> / <Link to="/" hash="catalogo" className="hover:text-accent-hi">Mercado</Link> / Carrinho</nav>

        <div role="status" aria-live="polite" className="space-y-2 empty:hidden">
          {changed.map((i) => (
            <div key={`${i.nftId}-${i.editionId}`} className="flex flex-wrap items-center justify-between gap-3 border border-accent bg-surface px-4 py-3 text-sm">
              <span><TriangleAlert size={16} aria-hidden="true" className="mr-2 inline text-accent-hi" />O preço de <b>{i.name}</b> mudou de {formatEth(i.addedPrice)} para {formatEth(i.unitPrice)}. O resumo já foi atualizado.</span>
              <Button size="sm" variant="outline" onClick={() => ack.mutate()} disabled={ack.isPending}>Entendi</Button>
            </div>
          ))}
          {blocked.map((i) => (
            <p key={`${i.nftId}-${i.editionId}`} className="border border-danger bg-surface px-4 py-3 text-sm"><span aria-hidden="true">✕ </span>{i.status === 'unavailable' ? `${i.name} (${i.editionLabel}) não está mais disponível e não entra no total.` : `A disponibilidade de ${i.name} (${i.editionLabel}) diminuiu para ${i.maxQuantity}. Ajustamos a quantidade no resumo.`}</p>
          ))}
        </div>

        {cart.isError && !data ? (
          <div role="alert" className="mt-6 grid place-items-center gap-4 bg-surface py-16 text-center"><p className="font-bold">Não foi possível carregar o carrinho</p><p className="text-sm text-muted">{cart.error.message}</p><Button onClick={() => void cart.refetch()}>Tentar novamente</Button></div>
        ) : !cart.isPending && items.length === 0 ? (
          <div className="mt-6 grid place-items-center gap-4 bg-surface py-20 text-center"><h1 className="text-xl font-bold max-md:sr-only">Seu carrinho está vazio</h1><p className="text-muted">Adicione NFTs do catálogo para continuar.</p><Button asChild><Link to="/" hash="catalogo">Explorar NFTs</Link></Button></div>
        ) : (
          <div className="mt-4 grid gap-8 md:grid-cols-[minmax(0,1fr)_332px] md:gap-[86px]">
            <section aria-labelledby="lista">
              <h1 id="lista" className="sr-only">Carrinho de NFTs</h1>
              <div className="hidden grid-cols-[minmax(0,1fr)_110px_150px_110px_40px] border-b border-line pb-2 text-sm font-bold md:grid" aria-hidden="true"><span>NFTs</span><span>Preço</span><span>Edições</span><span>Total</span><span /></div>
              <ul className="mt-3 space-y-3" aria-busy={cart.isPending}>
                {cart.isPending ? Array.from({ length: 3 }, (_, i) => <li key={i}><Skeleton className="h-[70px] w-full" /></li>) : items.map((i) => (
                  <li key={`${i.nftId}-${i.editionId}`} className={cn('relative grid items-center gap-3 bg-surface pr-3 max-md:grid-cols-[100px_minmax(0,1fr)_72px] max-md:gap-2 max-md:pr-0 md:grid-cols-[minmax(0,1fr)_110px_150px_110px_40px]', i.status === 'unavailable' && 'opacity-60')}>
                    <div className="flex items-center gap-4 max-md:contents">
                      <Link to="/nft/$id" params={{ id: i.nftId }} aria-label={`Ver ${i.name}`}><img src={i.image} alt={`Arte do NFT ${i.name}`} width={70} height={70} className="size-[70px] object-cover max-md:size-[100px]" /></Link>
                      <div className="max-md:py-3"><p className="font-bold">{i.name}</p><p className="text-xs text-faint">Edição: {i.editionLabel}</p><p className="text-xs text-faint max-md:hidden">ID do token: {i.tokenId}</p><p className="font-bold text-accent-hi md:hidden">{formatEth(i.lineTotal)}</p></div>
                    </div>
                    <p className="text-sm text-accent-hi max-md:hidden">{formatEth(i.unitPrice)}</p>
                    <div className="max-md:flex max-md:items-center max-md:justify-center">
                      <QuantityStepper value={i.quantity} max={Math.max(i.maxQuantity, 1)} onChange={(n) => onQty(i, n)} label={i.name} disabled={update.isPending || i.status === 'unavailable'} compact />
                    </div>
                    <p className="text-sm font-bold text-accent-hi max-md:hidden">{formatEth(i.lineTotal)}</p>
                    <button type="button" onClick={() => onRemove(i)} aria-label={`Remover ${i.name} do carrinho`} className="absolute right-1 top-1 grid size-7 place-items-center text-accent hover:text-accent-hi md:hidden"><Trash2 size={16} aria-hidden="true" /></button>
                    <button type="button" onClick={() => onRemove(i)} aria-label={`Remover ${i.name} do carrinho`} className="grid size-10 place-items-center text-accent hover:text-accent-hi max-md:hidden"><Trash2 size={18} aria-hidden="true" /></button>
                  </li>
                ))}
              </ul>
            </section>
            <div className="max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:z-30 max-md:max-h-[70dvh] max-md:overflow-y-auto">{summary}</div>
          </div>
        )}
        <Suggestions />
      </div>
    </div>
  )
}

function Suggestions() {
  const q = useQuery(nftListQuery({ sort: 'popular', pageSize: 6 }))
  return (
    <section aria-labelledby="tambem" className="mt-24 hidden md:block">
      <h2 id="tambem" className="border-b border-line pb-3 text-lg font-bold text-accent-hi">Colecionadores também viram</h2>
      <ul className="mt-6 grid grid-cols-5 gap-5">
        {q.isPending ? Array.from({ length: 5 }, (_, i) => <li key={i}><Skeleton className="aspect-[0.85] w-full" /></li>) : q.data?.items.slice(0, 5).map((n) => (
          <li key={n.id}><Link to="/nft/$id" params={{ id: n.id }} className="block bg-surface p-1"><img src={n.image} alt={`Arte do NFT ${n.name}`} width={219} height={219} loading="lazy" decoding="async" className="aspect-square w-full rounded-2xl object-cover" /><span className="mt-2 block px-1 text-sm">{n.name}</span><span className="block px-1 text-sm font-bold text-accent-hi">{formatEth(n.price)}</span></Link></li>
        ))}
      </ul>
    </section>
  )
}
