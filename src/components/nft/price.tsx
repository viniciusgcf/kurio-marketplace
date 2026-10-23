import { cn } from '@/lib/cn'
import { formatEth } from '@/lib/money'

/** Preço atual em destaque; o anterior riscado vem com texto para leitores de tela (não depende só do estilo). */
export function Price({ value, previous, className }: { value: string; previous?: string | null; className?: string }) {
  return (
    <p className={cn('text-accent-hi', className)}>
      <span>{formatEth(value)}</span>
      {previous && (
        <>
          <span className="sr-only"> (antes {formatEth(previous)})</span>
          <s aria-hidden="true" className="ml-2 font-normal text-muted">{formatEth(previous)}</s>
        </>
      )}
    </p>
  )
}
