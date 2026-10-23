import { useSyncExternalStore } from 'react'

export type RealtimeStatus = 'idle' | 'connecting' | 'online' | 'reconnecting'

let status: RealtimeStatus = 'idle'
const listeners = new Set<() => void>()

export const setRealtimeStatus = (next: RealtimeStatus) => {
  if (next !== status) {
    status = next
    listeners.forEach((listener) => listener())
  }
}

export const useRealtimeStatus = (): RealtimeStatus =>
  useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => status,
  )
