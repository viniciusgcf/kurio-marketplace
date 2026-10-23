import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api'
import { purgePrivateCache, qk } from '@/app/queries'
import type { AuthResult } from '@/contracts'
import { cartTokenStore, tokenStore } from '@/lib/session-store'

/** Troca de usuário: nada do usuário anterior pode sobrar no cache. */
function useStartSession() {
  const qc = useQueryClient()
  return (r: AuthResult) => {
    tokenStore.set(r.token)
    purgePrivateCache(qc)
    qc.setQueryData(qk.session, r.session)
    // O servidor mesclou o carrinho do visitante no do usuário: busca o carrinho consolidado.
    void qc.invalidateQueries({ queryKey: ['cart'] })
  }
}

export const useLogin = () => {
  const start = useStartSession()
  return useMutation({ mutationFn: api.auth.login, onSuccess: start })
}
export const useRegister = () => {
  const start = useStartSession()
  return useMutation({ mutationFn: api.auth.register, onSuccess: start })
}
export const useLogout = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => { try { await api.auth.logout() } catch { /* o logout local acontece de qualquer forma */ } },
    onSettled: () => {
      tokenStore.clear()
      cartTokenStore.reset()
      qc.setQueryData(qk.session, null)
      purgePrivateCache(qc)
    },
  })
}
