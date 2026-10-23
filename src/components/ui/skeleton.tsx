import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

/** Shimmer definido em index.css; respeita prefers-reduced-motion. Sempre receba dimensões para evitar CLS. */
export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div aria-hidden="true" className={cn('skeleton', className)} {...props} />
}
