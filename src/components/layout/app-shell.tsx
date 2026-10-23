import { useQueryClient } from '@tanstack/react-query'
import { Link, Outlet, useNavigate, useRouterState, type ErrorComponentProps } from '@tanstack/react-router'
import { Heart, House, LogIn, LogOut, ScanLine, Search, ShoppingCart, User } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useSession } from '@/app/queries'
import { Button } from '@/components/ui/button'
import { Toaster } from '@/components/ui/toaster'
import { useCart } from '@/features/cart/hooks'
import { useLogout } from '@/features/auth/hooks'
import { cn } from '@/lib/cn'
import { tokenStore } from '@/lib/session-store'
import { toast } from '@/lib/toast'
import { useRealtimeStatus } from '@/realtime/status'
import { CATEGORY_LINKS } from './categories'

export const soon = (what: string) => toast(`${what} ainda não está disponível nesta versão.`, 'info')
const container = 'mx-auto w-full max-w-[1200px] px-5 md:px-6 xl:px-0'

export function AppShell() {
  const qc = useQueryClient()
  const { user } = useSession()
  const userId = user?.id ?? null
  // Um socket por sessão: ao trocar de usuário/fazer logout o anterior é encerrado e seus listeners removidos.
  useEffect(() => {
    let disposed = false
    let disconnect: (() => void) | undefined
    const timer = window.setTimeout(() => {
      void import('@/realtime/client')
        .then(({ connectRealtime }) => {
          if (!disposed) disconnect = connectRealtime(qc, userId, tokenStore.get)
        })
        .catch((error: unknown) => console.error('Não foi possível iniciar as atualizações em tempo real.', error))
    }, 0)
    return () => {
      disposed = true
      window.clearTimeout(timer)
      disconnect?.()
    }
  }, [qc, userId])
  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#conteudo" className="sr-only-focusable left-2 top-2 z-[70] rounded bg-accent px-3 py-2 font-bold text-bg">Pular para o conteúdo</a>
      <Header />
      <RealtimeNotice />
      <main id="conteudo" tabIndex={-1} className="flex-1 outline-none">
        <Outlet />
      </main>
      <Footer />
      <MobileNav />
      <Toaster />
    </div>
  )
}

function RealtimeNotice() {
  const status = useRealtimeStatus()
  return (
    <div role="status" aria-live="polite" className="contents">
      {status === 'reconnecting' && <p className="bg-surface-2 px-4 py-1.5 text-center text-xs text-muted">Reconectando às atualizações em tempo real… Os dados serão sincronizados ao voltar.</p>}
    </div>
  )
}

const navLink = 'relative inline-block py-6 text-base transition-colors hover:text-accent-hi'
function Header() {
  const { user } = useSession()
  const path = useRouterState({ select: (s) => s.location.pathname })
  const { data: cart } = useCart()
  const count = cart?.items.length ?? 0
  const marketActive = /^\/(nft|carrinho|pagamento|pedido)/.test(path)
  const homeActive = path === '/'
  const active = (on: boolean) => cn(navLink, on ? 'text-accent-hi after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-accent' : 'text-ink')
  return (
    <header className="hidden border-b border-line md:block">
      <div className={cn(container, 'relative flex h-[68px] items-center justify-between')}>
        <Link to="/" className="text-sm font-bold tracking-[0.12em]" aria-label="Kurio — página inicial">KURIO</Link>
        <nav aria-label="Principal" className="absolute left-1/2 flex -translate-x-1/2 items-center gap-10">
          <Link to="/" className={active(homeActive)} aria-current={homeActive ? 'page' : undefined}>Início</Link>
          <Link to="/" hash="catalogo" className={active(marketActive)} aria-current={marketActive ? 'page' : undefined}>Mercado</Link>
          <button type="button" onClick={() => soon('Criadores')} className={active(false)}>Criadores</button>
          <button type="button" onClick={() => soon('Aprenda')} className={active(false)}>Aprenda</button>
        </nav>
        <div className="flex items-center gap-4">
          <SearchBox />
          <Link to="/carrinho" aria-label={`Carrinho, ${count} ${count === 1 ? 'item' : 'itens'}`} className="relative grid size-10 place-items-center">
            <ShoppingCart size={24} aria-hidden="true" />
            {count > 0 && <span aria-hidden="true" className="absolute right-0 top-0.5 grid min-w-4 place-items-center rounded-full bg-accent px-1 text-[10px] font-bold leading-4 text-bg">{count}</span>}
          </Link>
          {user ? <UserMenu name={user.displayName} /> : (
            <Button asChild size="md"><Link to="/login"><LogIn size={16} aria-hidden="true" />Entrar</Link></Button>
          )}
        </div>
      </div>
    </header>
  )
}

function SearchBox() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()
  useEffect(() => { if (open) ref.current?.focus() }, [open])
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const q = ref.current?.value.trim()
    void navigate({ to: '/', search: { q: q || undefined }, hash: 'catalogo' })
    setOpen(false)
  }
  return (
    <form role="search" onSubmit={submit} className="flex items-center">
      {open && <><label htmlFor="busca-global" className="sr-only">Buscar NFTs</label>
        <input id="busca-global" ref={ref} type="search" placeholder="Buscar NFTs…" onKeyDown={(e) => e.key === 'Escape' && setOpen(false)} className="mr-2 h-9 w-48 rounded-[3px] border border-field bg-bg px-3 text-sm placeholder:text-faint" /></>}
      <button type={open ? 'button' : 'button'} onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label={open ? 'Fechar busca' : 'Abrir busca'} className="grid size-10 place-items-center"><Search size={22} aria-hidden="true" /></button>
    </form>
  )
}

function UserMenu({ name }: { name: string }) {
  const logout = useLogout()
  const navigate = useNavigate()
  return (
    <div className="flex items-center gap-2">
      <Link to="/perfil" className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:text-accent-hi"><User size={18} aria-hidden="true" /><span className="max-w-28 truncate">{name}</span></Link>
      <Button variant="outline" size="sm" onClick={() => logout.mutate(undefined, { onSettled: () => void navigate({ to: '/' }) })} disabled={logout.isPending}><LogOut size={14} aria-hidden="true" />Sair</Button>
    </div>
  )
}

function Footer() {
  const features = [
    ['W', 'Segurança da carteira', 'Proteja sua carteira e colecione arte digital verificada com confiança.'],
    ['C', 'Criadores em destaque', 'Conheça artistas, estúdios e comunidades que moldam a cultura digital na rede.'],
    ['D', 'Alertas de lançamentos', 'Receba calendários de cunhagem, novidades de listas de acesso e análises do mercado.'],
  ] as const
  return (
    <footer className={cn(container, 'mb-24 mt-20 md:mb-0 md:mt-24')}>
      <div className="grid gap-8 bg-surface p-6 md:grid-cols-2 md:p-8 xl:grid-cols-4">
        {features.map(([letter, title, text]) => (
          <section key={title} className="flex flex-col gap-3 border-accent/60 xl:border-r xl:pr-6">
            <div aria-hidden="true" className="grid size-[74px] place-items-center rounded-full bg-accent text-3xl font-bold text-bg">{letter}</div>
            <h2 className="text-lg font-bold">{title}</h2>
            <p className="text-sm leading-6 text-faint">{text}</p>
          </section>
        ))}
        <section>
          <h2 className="mb-3 text-lg font-bold leading-5">Antecipe-se ao próximo lançamento</h2>
          <form onSubmit={(e) => { e.preventDefault(); soon('A newsletter') }} className="flex">
            <label htmlFor="newsletter" className="sr-only">E-mail para novidades</label>
            <input id="newsletter" type="email" placeholder="digite seu e-mail…" className="h-10 min-w-0 flex-1 bg-surface-2 px-3 text-sm placeholder:text-faint" />
            <Button type="submit" className="rounded-none">Enviar</Button>
          </form>
          <p className="mt-3 text-xs leading-5 text-faint">Receba lançamentos selecionados, histórias de criadores e novidades do mercado.</p>
        </section>
      </div>
      <div className="grid gap-3 bg-surface-2 px-8 py-6 text-sm text-muted md:grid-cols-2 xl:grid-cols-4">
        <p className="font-bold text-ink">KURIO</p><p>Feito para colecionadores, criadores e cultura</p><p>contato@email.com</p><p>+55 11 4002 8922</p>
      </div>
      <nav aria-label="Rodapé" className="grid gap-8 bg-surface p-8 sm:grid-cols-2 xl:grid-cols-4">
        <FooterCol title="Meu perfil"><li><Link to="/perfil" className="hover:text-accent-hi">Meu perfil</Link></li>{['Minha coleção', 'Atividade', 'Estúdio do criador', 'Lista de interesse'].map((l) => <SoonItem key={l}>{l}</SoonItem>)}</FooterCol>
        <FooterCol title="Central de ajuda">{['Central de ajuda', 'Como comprar NFTs', 'Carteira e segurança', 'Política do mercado', 'Denunciar item'].map((l) => <SoonItem key={l}>{l}</SoonItem>)}</FooterCol>
        <FooterCol title="Coleções">{CATEGORY_LINKS.slice(0, 5).map((c) => <li key={c.id}><Link to="/" search={{ category: c.id }} hash="catalogo" className="hover:text-accent-hi">{c.label}</Link></li>)}</FooterCol>
        <div>
          <h2 className="mb-3 text-lg font-bold">Redes sociais</h2>
          <ul className="flex gap-2">{['Facebook', 'Instagram', 'Twitter', 'LinkedIn', 'YouTube'].map((n) => <li key={n}><button type="button" aria-label={n} onClick={() => soon(n)} className="grid size-8 place-items-center rounded border border-accent text-xs text-accent">{n[0]}</button></li>)}</ul>
          <h2 className="mb-2 mt-6 text-lg font-bold">Carteiras compatíveis</h2>
          <p className="rounded border border-line px-2 py-1 text-[10px] font-bold text-accent">METAMASK · WALLETCONNECT · COINBASE</p>
        </div>
      </nav>
      <p className="py-6 text-center text-sm text-muted">© 2026 Kurio. Propriedade digital para todos.</p>
    </footer>
  )
}
const FooterCol = ({ title, children }: { title: string; children: React.ReactNode }) => <div><h2 className="mb-3 text-lg font-bold">{title}</h2><ul className="space-y-2 text-sm text-ink">{children}</ul></div>
const SoonItem = ({ children }: { children: string }) => <li><button type="button" onClick={() => soon(children)} className="text-left hover:text-accent-hi">{children}</button></li>

function MobileNav() {
  const { user } = useSession()
  const path = useRouterState({ select: (s) => s.location.pathname })
  const { data: cart } = useCart()
  if (/^\/(login|cadastro|nft|carrinho|pagamento)/.test(path)) return null
  const item = 'grid size-11 place-items-center rounded-full'
  return (
    <nav aria-label="Navegação móvel" className="fixed inset-x-0 bottom-0 z-30 md:hidden">
      <div className="relative mx-auto flex h-20 max-w-[480px] items-center justify-around rounded-t-[32px] bg-surface px-6">
        <Link to="/" className={cn(item, path === '/' && 'text-accent-hi')} aria-label="Início"><House size={24} aria-hidden="true" /></Link>
        <button type="button" onClick={() => soon('Lista de interesse')} className={item} aria-label="Lista de interesse"><Heart size={24} aria-hidden="true" /></button>
        <span className="w-16" aria-hidden="true" />
        <Link to="/carrinho" className={cn(item, 'relative')} aria-label={`Carrinho, ${cart?.items.length ?? 0} itens`}><ShoppingCart size={24} aria-hidden="true" />{!!cart?.items.length && <span aria-hidden="true" className="absolute right-0 top-0 grid min-w-4 place-items-center rounded-full bg-accent px-1 text-[10px] font-bold leading-4 text-bg">{cart.items.length}</span>}</Link>
        <Link to={user ? '/perfil' : '/login'} className={item} aria-label={user ? 'Meu perfil' : 'Entrar'}><User size={24} aria-hidden="true" /></Link>
        <Link to="/" hash="catalogo" aria-label="Explorar catálogo" className="absolute -top-7 left-1/2 grid size-16 -translate-x-1/2 place-items-center rounded-full bg-accent text-bg ring-8 ring-bg"><ScanLine size={28} aria-hidden="true" /></Link>
      </div>
    </nav>
  )
}

export function NotFound() {
  return (
    <div className={cn(container, 'py-24 text-center')}>
      <h1 className="text-3xl font-bold">Página não encontrada</h1>
      <p className="mt-3 text-muted">O endereço que você acessou não existe ou foi movido.</p>
      <Button asChild className="mt-8"><Link to="/">Voltar ao início</Link></Button>
    </div>
  )
}

export function RouteError({ error, reset }: ErrorComponentProps) {
  return (
    <div role="alert" className={cn(container, 'py-24 text-center')}>
      <h1 className="text-2xl font-bold">Algo deu errado</h1>
      <p className="mt-3 text-muted">{error instanceof Error ? error.message : 'Erro inesperado.'}</p>
      <Button className="mt-8" onClick={reset}>Tentar novamente</Button>
    </div>
  )
}
export { container }
