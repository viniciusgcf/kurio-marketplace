import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useRouterState } from '@tanstack/react-router'
import { api } from '@/api'
import { favoritesQuery, qk, useSession } from '@/app/queries'
import type { Favorites } from '@/contracts'
import { toast } from '@/lib/toast'

export function useFavorites() {
  const { user } = useSession()
  const q = useQuery({ ...favoritesQuery(user?.id ?? 'none'), enabled: !!user })
  return { ids: new Set(q.data?.nftIds ?? []), ...q }
}

/**
 * Favoritar com ATUALIZAÇÃO OTIMISTA: o coração muda na hora; se a API falhar, o estado anterior é restaurado
 * (rollback) e o usuário é avisado. Sem sessão, leva ao login e volta para a mesma tela.
 */
export function useToggleFavorite() {
  const qc = useQueryClient()
  const { user } = useSession()
  const navigate = useNavigate()
  const href = useRouterState({ select: (s) => s.location.href })
  const mutation = useMutation({
    mutationFn: ({ id, next }: { id: string; next: boolean }) => (next ? api.favorites.add(id) : api.favorites.remove(id)),
    onMutate: async ({ id, next }) => {
      const key = qk.favorites(user!.id)
      await qc.cancelQueries({ queryKey: key })
      const previous = qc.getQueryData<Favorites>(key)
      qc.setQueryData<Favorites>(key, (old) => {
        const ids = old?.nftIds ?? []
        return { version: old?.version ?? 0, nftIds: next ? [...new Set([...ids, id])] : ids.filter((i) => i !== id) }
      })
      return { previous, key }
    },
    onError: (_e, { next }, ctx) => {
      if (ctx) qc.setQueryData(ctx.key, ctx.previous)
      toast(next ? 'Não foi possível favoritar. O coração foi restaurado.' : 'Não foi possível remover o favorito. O coração foi restaurado.', 'error')
    },
    onSettled: (_d, _e, _v, ctx) => { if (ctx) void qc.invalidateQueries({ queryKey: ctx.key }) },
  })
  return {
    pending: mutation.isPending,
    toggle: (id: string, isFav: boolean) => {
      if (!user) { void navigate({ to: '/login', search: { redirect: href } }); return }
      mutation.mutate({ id, next: !isFav })
    },
  }
}
