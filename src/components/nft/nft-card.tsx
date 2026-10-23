import { Link } from '@tanstack/react-router'
import { Heart, Search, ShoppingCart } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { useAddToCart } from '@/features/cart/hooks'
import { useFavorites, useToggleFavorite } from '@/features/favorites/hooks'
import type { Edition, Nft } from '@/contracts'
import { isApiError } from '@/api/http'
import { cn } from '@/lib/cn'
import { formatEth } from '@/lib/money'
import { toast } from '@/lib/toast'
import { Price } from './price'

/** Edição padrão para compra rápida: a aberta, se houver estoque; senão a primeira disponível. */
export const defaultEdition = (nft: Nft): Edition | undefined =>
  nft.editions.find((e) => e.id === 'open' && e.available > 0) ?? nft.editions.find((e) => e.available > 0)

export function NftCard({ nft, priority = false, className }: { nft: Nft; priority?: boolean; className?: string }) {
  const { ids } = useFavorites()
  const { toggle, pending } = useToggleFavorite()
  const add = useAddToCart()
  const isFav = ids.has(nft.id)
  const edition = defaultEdition(nft)
  const quickAdd = () => {
    if (!edition) return
    add.mutate({ nftId: nft.id, editionId: edition.id, quantity: 1 }, {
      onSuccess: () => toast(`${nft.name} (${edition.label}) foi adicionado ao carrinho.`, 'success'),
      onError: (e) => toast(isApiError(e) ? e.message : 'Não foi possível adicionar ao carrinho.', 'error'),
    })
  }
  const action = 'grid size-9 place-items-center rounded-[3px] bg-surface text-ink ring-1 ring-line hover:text-accent-hi disabled:opacity-50'
  return (
    <li className={cn('group relative flex flex-col', className)}>
      <div className="relative rounded-[20px] bg-surface p-[3px]">
        <Link to="/nft/$id" params={{ id: nft.id }} className="block" aria-label={`${nft.name}, ${formatEth(nft.price)}. Ver detalhes`}>
          <img src={nft.image} alt={`Arte do NFT ${nft.name}`} width={250} height={250} loading={priority ? 'eager' : 'lazy'} fetchPriority={priority ? 'high' : 'auto'} decoding="async" className="aspect-square w-full rounded-[18px] object-cover" />
        </Link>
        {nft.rare && <span className="absolute left-0 top-3 bg-accent px-2 py-1 text-xs font-bold text-bg">RARO</span>}
        <button type="button" onClick={() => toggle(nft.id, isFav)} disabled={pending} aria-pressed={isFav} aria-label={isFav ? `Remover ${nft.name} dos favoritos` : `Favoritar ${nft.name}`} className={cn(action, 'absolute right-3 top-3 md:hidden')}>
          <Heart size={18} aria-hidden="true" className={cn(isFav && 'fill-accent text-accent')} />
        </button>
        <div className="absolute inset-x-0 bottom-3 hidden justify-center gap-2 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 md:flex">
          <button type="button" onClick={quickAdd} disabled={!edition || add.isPending} aria-label={edition ? `Adicionar ${nft.name} ao carrinho` : `${nft.name} esgotado`} className={action}><ShoppingCart size={18} aria-hidden="true" /></button>
          <button type="button" onClick={() => toggle(nft.id, isFav)} disabled={pending} aria-pressed={isFav} aria-label={isFav ? `Remover ${nft.name} dos favoritos` : `Favoritar ${nft.name}`} className={action}><Heart size={18} aria-hidden="true" className={cn(isFav && 'fill-accent text-accent')} /></button>
          <Link to="/nft/$id" params={{ id: nft.id }} aria-label={`Ver detalhes de ${nft.name}`} className={action}><Search size={18} aria-hidden="true" /></Link>
        </div>
      </div>
      <div className="mt-3 min-h-[3.25rem]">
        <p className="text-sm text-ink md:text-base">{nft.name}</p>
        <Price value={nft.price} previous={nft.previousPrice} className="text-sm font-bold md:text-base" />
        {!edition && <p className="text-xs text-danger">Esgotado</p>}
      </div>
    </li>
  )
}

/** Mesmas dimensões do card real: carregar não desloca o layout. */
export function NftCardSkeleton() {
  return (
    <li aria-hidden="true" className="flex flex-col">
      <div className="bg-surface p-[3px]"><Skeleton className="aspect-square w-full rounded-[18px]" /></div>
      <div className="mt-3 min-h-[3.25rem] space-y-2"><Skeleton className="h-4 w-3/4" /><Skeleton className="h-4 w-1/3" /></div>
    </li>
  )
}
