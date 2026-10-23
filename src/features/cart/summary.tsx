import { Skeleton } from '@/components/ui/skeleton'
import type { Quote } from '@/contracts'
import { cn } from '@/lib/cn'
import { formatEth, isZeroEth } from '@/lib/money'

/** Resumo de valores. Todos os números vêm da cotação da API — o cliente nunca recalcula. */
export function QuoteLines({ quote, loading, className }: { quote?: Quote; loading?: boolean; className?: string }) {
  if (loading || !quote) {
    return <div aria-busy="true" aria-label="Carregando resumo" className={cn('space-y-3', className)}>{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-6 w-full" />)}</div>
  }
  const rows: [string, string, string?][] = [
    ['Subtotal', formatEth(quote.subtotal)],
    [quote.coupon ? quote.coupon.description : 'Desconto do lançamento', isZeroEth(quote.discount) ? '(-) 00.00' : `(-) ${formatEth(quote.discount, false)} ETH`],
    ['Taxa de rede', formatEth(quote.networkFee), 'Taxa estimada'],
  ]
  return (
    <dl className={cn('space-y-3 text-sm', className)} aria-live="polite">
      {rows.map(([k, v, note]) => (
        <div key={k}><div className="flex justify-between gap-4"><dt>{k}</dt><dd className="text-base">{v}</dd></div>{note && <p className="text-right text-[11px] text-accent">{note}</p>}</div>
      ))}
      <div className="flex justify-between gap-4 border-t border-line pt-4 font-bold"><dt>Total</dt><dd className="text-lg text-accent-hi">{formatEth(quote.total)}</dd></div>
    </dl>
  )
}
