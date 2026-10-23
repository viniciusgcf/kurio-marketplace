import { useSyncExternalStore } from 'react'

export type ToastTone = 'info' | 'success' | 'error'
export interface Toast { id: number; tone: ToastTone; message: string }

let toasts: Toast[] = []
let nextId = 1
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

/** Feedback acessível: renderizado numa região aria-live (ver <Toaster />). */
export function toast(message: string, tone: ToastTone = 'info', ttl = 6000): void {
  const id = nextId++
  toasts = [...toasts.slice(-3), { id, tone, message }]
  emit()
  if (ttl > 0) setTimeout(() => dismissToast(id), ttl)
}
export function dismissToast(id: number): void {
  toasts = toasts.filter((t) => t.id !== id)
  emit()
}
export const useToasts = (): Toast[] =>
  useSyncExternalStore((cb) => (listeners.add(cb), () => void listeners.delete(cb)), () => toasts)
