/**
 * Token de sessão + token do carrinho de visitante.
 * Simula o cookie httpOnly de um backend real: o token é opaco e a senha nunca é guardada.
 */
const TOKEN = 'kurio:token'
const CART = 'kurio:cart-token'
const safe = <T,>(fn: () => T, fallback: T): T => { try { return fn() } catch { return fallback } }

export const tokenStore = {
  get: (): string | null => safe(() => localStorage.getItem(TOKEN), null),
  set: (t: string) => safe(() => localStorage.setItem(TOKEN, t), undefined),
  clear: () => safe(() => localStorage.removeItem(TOKEN), undefined),
}

export const cartTokenStore = {
  get(): string {
    let t = safe(() => localStorage.getItem(CART), null)
    if (!t) {
      t = `g_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`
      safe(() => localStorage.setItem(CART, t!), undefined)
    }
    return t
  },
  /** Novo visitante (após logout): o carrinho do usuário anterior não é reaproveitado. */
  reset: () => safe(() => localStorage.removeItem(CART), undefined),
}

/** Rascunhos de formulário que sobrevivem à expiração de sessão (sem dados sensíveis). */
export const draftStore = {
  get: <T,>(key: string): T | null => safe(() => { const r = sessionStorage.getItem(`kurio:draft:${key}`); return r ? (JSON.parse(r) as T) : null }, null),
  set: (key: string, value: unknown) => safe(() => sessionStorage.setItem(`kurio:draft:${key}`, JSON.stringify(value)), undefined),
  clear: (key: string) => safe(() => sessionStorage.removeItem(`kurio:draft:${key}`), undefined),
}
