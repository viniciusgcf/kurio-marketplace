import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, itemKey } from '@/api'
import { cartQuery, qk, useSession } from '@/app/queries'
import type { Cart, EditionId } from '@/contracts'

export function useCart() {
  const { scope } = useSession()
  return { scope, ...useQuery(cartQuery(scope)) }
}

/** Toda mutation devolve o carrinho completo (com cotação). A resposta da API é a fonte de verdade. */
function useCartMutation<V>(fn: (v: V) => Promise<Cart>) {
  const qc = useQueryClient()
  const { scope } = useSession()
  return useMutation({
    mutationFn: fn,
    onSuccess: (cart) => {
      qc.setQueryData(qk.cart(scope), cart)
      void qc.invalidateQueries({ queryKey: [...qk.cart(scope), 'quote'] })
    },
  })
}
export const useAddToCart = () => useCartMutation((v: { nftId: string; editionId: EditionId; quantity: number }) => api.cart.add(v))
export const useUpdateQuantity = () => useCartMutation((v: { nftId: string; editionId: EditionId; quantity: number }) => api.cart.update(itemKey(v.nftId, v.editionId), v.quantity))
export const useRemoveItem = () => useCartMutation((v: { nftId: string; editionId: EditionId }) => api.cart.remove(itemKey(v.nftId, v.editionId)))
export const useApplyCoupon = () => useCartMutation((code: string) => api.cart.applyCoupon(code))
export const useRemoveCoupon = () => useCartMutation(() => api.cart.removeCoupon())
export const useAcknowledgePrices = () => useCartMutation(() => api.cart.acknowledge())
