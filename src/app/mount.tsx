import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { setSessionLostHandler } from '@/api/http'
import { cartTokenStore, tokenStore } from '@/lib/session-store'
import { toast } from '@/lib/toast'
import { makeQueryClient, purgePrivateCache, qk } from './queries'
import { createAppRouter } from './router'

export function mountApp(el: HTMLElement) {
  const queryClient = makeQueryClient()
  const router = createAppRouter(queryClient)

  // Sessão perdida (expirou/foi invalidada): descarta dados privados e leva ao login com retorno ao contexto atual.
  setSessionLostHandler((reason) => {
    tokenStore.clear()
    cartTokenStore.reset()
    queryClient.setQueryData(qk.session, null)
    purgePrivateCache(queryClient)
    const here = router.state.location.href
    if (!here.startsWith('/login')) {
      toast(reason === 'expired' ? 'Sua sessão expirou. Entre novamente para continuar de onde parou.' : 'Entre para continuar.', 'error', 9000)
      void router.navigate({ to: '/login', search: { redirect: here, expired: reason === 'expired' } })
    }
  })

  createRoot(el).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </StrictMode>,
  )
}
