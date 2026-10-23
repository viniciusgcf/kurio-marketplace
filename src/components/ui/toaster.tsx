import { X } from 'lucide-react'
import { dismissToast, useToasts } from '@/lib/toast'
import { cn } from '@/lib/cn'

/** Região aria-live: mutations, falhas e atualizações em tempo real são anunciadas sem roubar o foco. */
export function Toaster() {
  const toasts = useToasts()
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex flex-col items-center gap-2 px-4 md:bottom-6 md:items-end md:px-6" role="region" aria-label="Notificações">
      <div aria-live="polite" aria-atomic="false" role="status" className="flex flex-col gap-2">
        {toasts.filter((t) => t.tone !== 'error').map((t) => <ToastItem key={t.id} {...t} />)}
      </div>
      <div aria-live="assertive" role="alert" className="flex flex-col gap-2">
        {toasts.filter((t) => t.tone === 'error').map((t) => <ToastItem key={t.id} {...t} />)}
      </div>
    </div>
  )
}
function ToastItem({ id, tone, message }: { id: number; tone: 'info' | 'success' | 'error'; message: string }) {
  return (
    <div className={cn('pointer-events-auto flex max-w-md items-start gap-3 rounded border bg-surface px-4 py-3 text-sm shadow-xl', tone === 'error' ? 'border-danger' : tone === 'success' ? 'border-ok' : 'border-accent')}>
      <span aria-hidden="true" className={cn('mt-0.5 font-bold', tone === 'error' ? 'text-danger' : tone === 'success' ? 'text-ok' : 'text-accent')}>{tone === 'error' ? '✕' : tone === 'success' ? '✓' : 'ℹ'}</span>
      <p className="flex-1">{message}</p>
      <button type="button" onClick={() => dismissToast(id)} aria-label="Dispensar notificação" className="text-faint hover:text-ink"><X size={16} aria-hidden="true" /></button>
    </div>
  )
}
