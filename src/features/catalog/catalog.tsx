import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, SlidersHorizontal, Search } from 'lucide-react'
import { useId, useState, type FormEvent } from 'react'
import { nftListQuery } from '@/app/queries'
import { DeferredNftCard, NftCardSkeleton } from '@/components/nft/nft-card'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { cn } from '@/lib/cn'
import { FiltersPanel } from './filters'
import { toListParams, type CatalogSearch } from './search'

const TABS = [['all', 'Todos os NFTs'], ['new', 'Novos lançamentos'], ['trending', 'Em alta']] as const
const SORTS = [['recent', 'Listados recentemente'], ['price-asc', 'Menor preço'], ['price-desc', 'Maior preço'], ['popular', 'Mais avaliados']] as const

export function MobileCatalogSearch({ search, onChange, className }: { search: CatalogSearch; onChange: (patch: Partial<CatalogSearch>) => void; className?: string }) {
  const params = toListParams(search)
  const q = useQuery(nftListQuery(params))
  const [filtersOpen, setFiltersOpen] = useState(false)
  const data = q.data
  return (
    <>
      <form role="search" onSubmit={(e: FormEvent<HTMLFormElement>) => { e.preventDefault(); onChange({ q: String(new FormData(e.currentTarget).get('q') ?? '').trim() || undefined }) }} className={cn('mb-5 flex gap-2 md:hidden', className)}>
        <div className="relative flex-1">
          <label htmlFor="busca-mobile" className="sr-only">Buscar NFTs</label>
          <Search size={18} aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input id="busca-mobile" name="q" type="search" defaultValue={search.q} key={search.q ?? ''} placeholder="Explorar coleções" className="h-12 w-full rounded-lg bg-surface pl-10 pr-3 text-sm placeholder:text-muted" />
        </div>
        <Button type="button" variant="primary" size="icon" className="size-12 rounded-lg" aria-label="Abrir filtros" onClick={() => setFiltersOpen(true)}><SlidersHorizontal size={20} aria-hidden="true" /></Button>
      </form>
      <Dialog open={filtersOpen} onOpenChange={setFiltersOpen} title="Filtros" className="p-5 pt-12 text-left">
        <FiltersPanel search={search} facets={data?.facets} featured={null} showFeatured={false} onChange={(p) => { onChange(p); }} />
        <Button className="mt-4 w-full" onClick={() => setFiltersOpen(false)}>Ver {data?.totalItems ?? ''} resultados</Button>
      </Dialog>
    </>
  )
}

export function Catalog({ search, onChange, showMobileSearch = true }: { search: CatalogSearch; onChange: (patch: Partial<CatalogSearch>) => void; showMobileSearch?: boolean }) {
  const params = toListParams(search)
  const q = useQuery(nftListQuery(params))
  const sortId = useId()
  const tab = search.tab ?? 'all'
  const data = q.data
  const hasFilters = !!(search.q || search.category || search.network || search.min || search.max || (search.tab && search.tab !== 'all'))
  const clear = () => onChange({ q: undefined, category: undefined, network: undefined, min: undefined, max: undefined, tab: undefined, sort: undefined })

  return (
    <section id="catalogo" aria-label="Catálogo de NFTs" className="mx-auto w-full max-w-[1200px] scroll-mt-4 px-5 md:px-6 xl:px-0">
      {showMobileSearch && <MobileCatalogSearch search={search} onChange={onChange} />}
      <div className="grid gap-10 md:grid-cols-[minmax(0,1fr)] lg:grid-cols-[310px_minmax(0,1fr)] lg:gap-[50px]">
        <aside aria-label="Filtros" className="hidden lg:block lg:pt-[52px]"><FiltersPanel search={search} facets={data?.facets} featured={data?.featured} onChange={onChange} /></aside>
        <div>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-3 md:mb-4">
            <nav aria-label="Filtro rápido" className="flex gap-5 overflow-x-auto text-sm md:text-base">
              {TABS.map(([id, label]) => (
                <button key={id} type="button" aria-pressed={tab === id} onClick={() => onChange({ tab: id === 'all' ? undefined : id })} className={cn('whitespace-nowrap border-b-2 py-1', tab === id ? 'border-accent font-bold text-accent-hi' : 'border-transparent text-ink hover:text-accent-hi')}>{label}</button>
              ))}
            </nav>
            <div className="hidden items-center gap-2 text-sm md:flex">
              <label htmlFor={sortId} className="text-muted">Ordenar por:</label>
              <select id={sortId} value={search.sort ?? 'recent'} onChange={(e) => onChange({ sort: e.target.value === 'recent' ? undefined : (e.target.value as CatalogSearch['sort']) })} className="h-9 rounded-[3px] border border-field bg-bg px-2 text-sm">
                {SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
          </div>
          <hr className="mb-5 hidden border-line md:block" />

          {/* Resultado anunciado para leitores de tela sem mover o foco */}
          <p role="status" aria-live="polite" className="sr-only">{q.isPending ? 'Carregando NFTs' : data ? `${data.totalItems} NFTs encontrados, página ${data.page} de ${data.totalPages}` : ''}</p>
          {q.isFetching && data && <p className="mb-2 text-xs text-muted" aria-hidden="true">Atualizando…</p>}

          {q.isError && !data ? (
            <div role="alert" className="grid place-items-center gap-4 bg-surface px-6 py-16 text-center">
              <p className="text-lg font-bold">Não foi possível carregar o catálogo</p>
              <p className="text-sm text-muted">{q.error instanceof Error ? q.error.message : 'Tente novamente.'}</p>
              <Button onClick={() => void q.refetch()} disabled={q.isFetching}>Tentar novamente</Button>
            </div>
          ) : q.isPending ? (
            <ul aria-busy="true" className="grid grid-cols-2 gap-x-3 gap-y-6 lg:grid-cols-3 lg:gap-x-[26px] lg:gap-y-8">{Array.from({ length: 9 }, (_, i) => <NftCardSkeleton key={i} />)}</ul>
          ) : data && data.items.length === 0 ? (
            <div className="grid place-items-center gap-4 bg-surface px-6 py-16 text-center">
              <p className="text-lg font-bold">Nenhum NFT encontrado</p>
              <p className="max-w-sm text-sm text-muted">Nenhum item corresponde a esses filtros. Remova algum filtro ou limpe a busca.</p>
              {hasFilters && <Button onClick={clear}>Limpar filtros</Button>}
            </div>
          ) : (
            <ul aria-busy={q.isFetching} className={cn('grid grid-cols-2 gap-x-3 gap-y-6 transition-opacity lg:grid-cols-3 lg:gap-x-[26px] lg:gap-y-8', q.isFetching && q.isPlaceholderData && 'opacity-60')}>
              {data?.items.map((n, i) => <DeferredNftCard key={n.id} nft={n} priority={i < 2} className={i % 2 === 1 ? 'max-md:mt-8' : undefined} />)}
            </ul>
          )}
          {data && data.totalPages > 1 && <Pagination page={data.page} total={data.totalPages} onPage={(page) => { onChange({ page }); document.getElementById('catalogo')?.scrollIntoView() }} />}
        </div>
      </div>
    </section>
  )
}

function Pagination({ page, total, onPage }: { page: number; total: number; onPage: (p: number) => void }) {
  const start = Math.max(1, Math.min(page - 2, total - 4))
  const pages = Array.from({ length: Math.min(5, total) }, (_, i) => start + i)
  const btn = 'grid size-9 place-items-center rounded-[3px] border border-line text-sm hover:border-accent disabled:opacity-40'
  return (
    <nav aria-label="Paginação" className="mt-12 flex justify-end gap-2 max-md:justify-center">
      <button type="button" className={btn} disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Página anterior"><ChevronLeft size={16} aria-hidden="true" /></button>
      {pages.map((p) => <button key={p} type="button" onClick={() => onPage(p)} aria-label={`Página ${p}`} aria-current={p === page ? 'page' : undefined} className={cn(btn, p === page && 'border-accent bg-accent font-bold text-bg')}>{p}</button>)}
      <button type="button" className={btn} disabled={page >= total} onClick={() => onPage(page + 1)} aria-label="Próxima página"><ChevronRight size={16} aria-hidden="true" /></button>
    </nav>
  )
}
