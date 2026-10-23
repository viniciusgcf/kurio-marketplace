import { createRootRouteWithContext, createRoute, createRouter, lazyRouteComponent, redirect, type AnyRouter } from '@tanstack/react-router'
import type { QueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { catalogSearchSchema, toListParams } from '@/features/catalog/search'
import { nftListQuery, nftQuery, sessionQuery } from './queries'
import { AppShell, NotFound, RouteError } from '@/components/layout/app-shell'

export interface RouterContext { queryClient: QueryClient }

const root = createRootRouteWithContext<RouterContext>()({
  // A sessão é resolvida uma vez antes de qualquer tela renderizar (sem "flash" de visitante).
  beforeLoad: ({ context }) => context.queryClient.ensureQueryData(sessionQuery),
  component: AppShell,
  notFoundComponent: NotFound,
  errorComponent: RouteError,
})

/** Rotas privadas: sem sessão, volta para o login e retorna ao ponto original depois. */
const requireAuth = async ({ context, location }: { context: RouterContext; location: { href: string } }) => {
  const session = await context.queryClient.ensureQueryData(sessionQuery)
  if (!session) throw redirect({ to: '/login', search: { redirect: location.href } })
}

const authSearch = z.object({ redirect: z.string().optional().catch(undefined), expired: z.coerce.boolean().optional().catch(undefined) })
/** Só aceita caminhos internos como destino de retorno (evita open redirect). */
export const safeRedirect = (r?: string) => (r && r.startsWith('/') && !r.startsWith('//') ? r : '/')

const index = createRoute({
  getParentRoute: () => root,
  path: '/',
  validateSearch: catalogSearchSchema,
  loaderDeps: ({ search }) => ({ search }),
  loader: ({ context, deps }) => { void context.queryClient.prefetchQuery(nftListQuery(toListParams(deps.search))) },
  component: lazyRouteComponent(() => import('@/routes/home')),
})
const login = createRoute({ getParentRoute: () => root, path: '/login', validateSearch: authSearch, component: lazyRouteComponent(() => import('@/routes/auth')) })
const signup = createRoute({ getParentRoute: () => root, path: '/cadastro', validateSearch: authSearch, component: lazyRouteComponent(() => import('@/routes/auth').then((m) => ({ default: m.SignupRoute }))) })
const nft = createRoute({
  getParentRoute: () => root,
  path: '/nft/$id',
  loader: ({ context, params }) => { void context.queryClient.prefetchQuery(nftQuery(params.id)) },
  component: lazyRouteComponent(() => import('@/routes/nft-detail')),
})
const cart = createRoute({ getParentRoute: () => root, path: '/carrinho', component: lazyRouteComponent(() => import('@/routes/cart')) })
const checkout = createRoute({ getParentRoute: () => root, path: '/pagamento', beforeLoad: requireAuth, component: lazyRouteComponent(() => import('@/routes/checkout')) })
const order = createRoute({ getParentRoute: () => root, path: '/pedido/$id', beforeLoad: requireAuth, component: lazyRouteComponent(() => import('@/routes/order')) })
const profile = createRoute({ getParentRoute: () => root, path: '/perfil', beforeLoad: requireAuth, component: lazyRouteComponent(() => import('@/routes/profile')) })
const wallets = createRoute({ getParentRoute: () => root, path: '/perfil/carteiras', beforeLoad: requireAuth, component: lazyRouteComponent(() => import('@/routes/wallets')) })

const routeTree = root.addChildren([index, login, signup, nft, cart, checkout, order, profile, wallets])

/** Valores de busca ficam como string: "1.50" não pode virar o número 1.5 (ETH é decimal exato). */
const parseSearch = (s: string) => Object.fromEntries(new URLSearchParams(s)) as Record<string, string>
const stringifySearch = (o: Record<string, unknown>) => {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== null && v !== '') p.set(k, String(v))
  const s = p.toString()
  return s ? `?${s}` : ''
}

export const createAppRouter = (queryClient: QueryClient) =>
  createRouter({ routeTree, context: { queryClient }, parseSearch, stringifySearch, defaultPreload: 'intent', scrollRestoration: true })

declare module '@tanstack/react-router' {
  interface Register { router: ReturnType<typeof createAppRouter> }
}
export type AppRouter = AnyRouter
