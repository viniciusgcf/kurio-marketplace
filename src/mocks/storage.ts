/** Persistência dos mocks: localStorage no navegador, memória no Node (testes de contrato). */
const memory = new Map<string, string>()
const hasLocal = (() => {
  try {
    return typeof localStorage !== 'undefined' && localStorage !== null
  } catch {
    return false
  }
})()

export const storage = {
  get(key: string): string | null {
    return hasLocal ? localStorage.getItem(key) : (memory.get(key) ?? null)
  },
  set(key: string, value: string): void {
    if (hasLocal) {
      try {
        localStorage.setItem(key, value)
        return
      } catch {
        /* cota cheia: cai para memória */
      }
    }
    memory.set(key, value)
  },
  remove(key: string): void {
    if (hasLocal) localStorage.removeItem(key)
    memory.delete(key)
  },
}
