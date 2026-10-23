import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import type { NftList } from '@/contracts'
import { formatEthComma, toEth } from '@/lib/money'
import { splitCsv, toggleCsv, type CatalogSearch } from './search'

interface Props { search: CatalogSearch; facets?: NftList['facets']; featured?: NftList['featured']; onChange: (patch: Partial<CatalogSearch>) => void; showFeatured?: boolean }

export function FiltersPanel({ search, facets, featured, onChange, showFeatured = true }: Props) {
  return (
    <div className="flex flex-col gap-8">
      <div className="bg-surface p-5">
        <FacetGroup legend="Coleções" items={facets?.categories} selected={splitCsv(search.category)} onToggle={(id) => onChange({ category: toggleCsv(search.category, id) })} />
        <PriceRange facets={facets} search={search} onChange={onChange} />
        <FacetGroup legend="Rede" items={facets?.networks} selected={splitCsv(search.network)} onToggle={(id) => onChange({ network: toggleCsv(search.network, id) })} muted />
      </div>
      {showFeatured && featured && (
        <section aria-labelledby="destaque-titulo" className="bg-surface-2/60">
          <h2 id="destaque-titulo" className="px-5 pt-5 text-xl font-bold text-accent-hi">NFT EM DESTAQUE</h2>
          <p className="px-5 pb-3 pt-1 text-center text-lg font-bold">OFERTA LIMITADA</p>
          <Link to="/nft/$id" params={{ id: featured.id }} aria-label={`Oferta limitada: ${featured.name}`}>
            <img src={featured.image} alt={`Arte do NFT ${featured.name}`} width={310} height={310} loading="lazy" decoding="async" className="aspect-square w-full rounded-[18px] object-cover" />
          </Link>
        </section>
      )}
    </div>
  )
}

function FacetGroup({ legend, items, selected, onToggle, muted }: { legend: string; items?: { id: string; label: string; count: number }[]; selected: string[]; onToggle: (id: string) => void; muted?: boolean }) {
  return (
    <fieldset className="mb-6 border-0 p-0">
      <legend className="mb-3 text-lg font-bold">{legend}</legend>
      {!items ? (
        <div className="space-y-3" aria-hidden="true">{Array.from({ length: legend === 'Rede' ? 3 : 9 }, (_, i) => <Skeleton key={i} className="h-5 w-full" />)}</div>
      ) : (
        <ul className="space-y-1">
          {items.map((it) => {
            const on = selected.includes(it.id)
            return (
              <li key={it.id}>
                <label className="flex min-h-9 cursor-pointer items-center justify-between gap-3 px-2 text-sm hover:text-accent-hi">
                  <span className="flex items-center gap-3">
                    <input type="checkbox" checked={on} onChange={() => onToggle(it.id)} className="size-4 accent-[#d28a4c]" />
                    <span className={on ? 'font-bold text-accent-hi' : muted ? 'text-muted' : 'text-accent'}>{it.label}</span>
                  </span>
                  <span className={on ? 'font-bold' : 'text-muted'}><span className="sr-only">, </span>({it.count})</span>
                </label>
              </li>
            )
          })}
        </ul>
      )}
    </fieldset>
  )
}

/** `key` remonta o slider quando a URL muda (voltar/limpar filtros), sem sincronizar estado por effect. */
function PriceRange(props: { facets?: NftList['facets']; search: CatalogSearch; onChange: Props['onChange'] }) {
  const { facets, search } = props
  return <PriceRangeInner key={`${search.min}|${search.max}|${facets?.priceRange.min}|${facets?.priceRange.max}`} {...props} />
}

function PriceRangeInner({ facets, search, onChange }: { facets?: NftList['facets']; search: CatalogSearch; onChange: Props['onChange'] }) {
  const lowBound = Number(facets?.priceRange.min ?? '0.02')
  const highBound = Number(facets?.priceRange.max ?? '12.30')
  const [lo, setLo] = useState(Number(search.min ?? lowBound))
  const [hi, setHi] = useState(Number(search.max ?? highBound))
  const apply = () => onChange({ min: lo <= lowBound ? undefined : toEth(lo.toFixed(2)), max: hi >= highBound ? undefined : toEth(hi.toFixed(2)) })
  const pct = (v: number) => ((v - lowBound) / Math.max(highBound - lowBound, 0.01)) * 100
  return (
    <fieldset className="mb-6 border-0 p-0">
      <legend className="mb-4 text-lg font-bold">Faixa de preço</legend>
      <div className="relative mx-1 h-5">
        <div className="absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 bg-line" />
        <div className="absolute top-1/2 h-0.5 -translate-y-1/2 bg-accent" style={{ left: `${pct(lo)}%`, right: `${100 - pct(hi)}%` }} />
        {[{ label: 'Preço mínimo', v: lo, set: (n: number) => setLo(Math.min(n, hi)) }, { label: 'Preço máximo', v: hi, set: (n: number) => setHi(Math.max(n, lo)) }].map((s) => (
          <input key={s.label} type="range" aria-label={s.label} aria-valuetext={`${formatEthComma(s.v.toFixed(2))} ETH`} min={lowBound} max={highBound} step={0.01} value={s.v} onChange={(e) => s.set(Number(e.target.value))} className="range-thumb pointer-events-none absolute inset-0 h-5 w-full appearance-none bg-transparent" />
        ))}
      </div>
      <p className="mt-3 text-sm text-muted" aria-live="polite">Preço: {formatEthComma(lo.toFixed(2))} - {formatEthComma(hi.toFixed(2))} ETH</p>
      <Button size="sm" className="mt-3" onClick={apply}>Aplicar</Button>
    </fieldset>
  )
}
