import * as D from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

/** Radix Dialog: foco preso, Esc fecha, foco volta ao gatilho e leitores de tela anunciam título/descrição. */
interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  hideTitle?: boolean
  className?: string
  children: ReactNode
}
export function Dialog({ open, onOpenChange, title, description, hideTitle, className, children }: Props) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-40 bg-black/60" />
        <D.Content
          aria-describedby={description ? undefined : undefined}
          className={cn(
            'fixed z-50 border-b-[10px] border-accent bg-surface text-ink shadow-2xl',
            'max-md:inset-0 max-md:overflow-y-auto max-md:rounded-[28px] max-md:border-b-0 max-md:bg-bg',
            'md:left-1/2 md:top-[160px] md:max-h-[calc(100dvh-80px)] md:w-[500px] md:-translate-x-1/2 md:overflow-y-auto',
            className,
          )}
        >
          <D.Title className={hideTitle ? 'sr-only' : 'text-center text-lg font-medium'}>{title}</D.Title>
          {description ? <D.Description className="sr-only">{description}</D.Description> : null}
          {children}
          <D.Close aria-label="Fechar" className="absolute right-3 top-3 grid size-8 place-items-center rounded text-accent hover:text-accent-hi">
            <X size={18} aria-hidden="true" />
          </D.Close>
        </D.Content>
      </D.Portal>
    </D.Root>
  )
}
