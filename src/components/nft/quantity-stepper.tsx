import { Minus, Plus } from 'lucide-react'
import { cn } from '@/lib/cn'

/** Quantidades são sempre inteiras; limites vêm da disponibilidade da API. */
export function QuantityStepper({ value, min = 1, max, onChange, label, disabled, className, compact = false }: { value: number; min?: number; max: number; onChange: (n: number) => void; label: string; disabled?: boolean; className?: string; compact?: boolean }) {
  const btn = cn('grid size-7 place-items-center rounded-full bg-accent text-bg hover:bg-accent-hi disabled:bg-accent/40 disabled:text-bg/60', compact && 'max-md:size-6')
  return (
    <div role="group" aria-label={label} className={cn('inline-flex items-center gap-3', compact && 'max-md:gap-1.5', className)}>
      <button type="button" className={btn} onClick={() => onChange(value - 1)} disabled={disabled || value <= min} aria-label={`Diminuir quantidade de ${label}`}><Minus size={16} aria-hidden="true" /></button>
      <output aria-live="polite" className={cn('w-6 text-center text-base', compact && 'max-md:w-3')} aria-label={`Quantidade: ${value}`}>{value}</output>
      <button type="button" className={btn} onClick={() => onChange(value + 1)} disabled={disabled || value >= max} aria-label={value >= max ? `Aumentar quantidade de ${label} (limite de ${max} atingido)` : `Aumentar quantidade de ${label}`}><Plus size={16} aria-hidden="true" /></button>
    </div>
  )
}
