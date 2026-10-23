import { useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useRouter } from '@tanstack/react-router'
import { ChevronLeft, MoreVertical } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { useSession } from '@/app/queries'
import { isApiError } from '@/api/http'
import { container } from '@/components/layout/app-shell'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { SelectField, TextAreaField, TextField } from '@/components/ui/field'
import { Skeleton } from '@/components/ui/skeleton'
import { useCart } from '@/features/cart/hooks'
import { QuoteLines } from '@/features/cart/summary'
import { clearIdempotencyKey, idempotencyKeyFor, useConnectWallet, useCreateOrder, useDisconnectWallet, useQuote, useWalletConnection, useWallets } from '@/features/checkout/hooks'
import { NETWORK_LABEL, PROVIDER_LABEL, type Network, type OrderCreateBody, type Quote, type Wallet, type WalletProvider } from '@/contracts'
import { cn } from '@/lib/cn'
import { formatEth } from '@/lib/money'
import { draftStore } from '@/lib/session-store'
import { toast } from '@/lib/toast'

interface Draft { displayName: string; username: string; email: string; ensName: string; referralCode: string; note: string; walletId: string; network: Network; provider: WalletProvider }
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const short = (a: string) => (a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a)
const PROVIDERS: WalletProvider[] = ['walletconnect', 'metamask', 'coinbase']

export default function CheckoutRoute() {
  const { user } = useSession()
  const cart = useCart()
  const wallets = useWallets()
  if (cart.isPending || wallets.isPending) return <CheckoutSkeleton />
  const all = [wallets.data?.primary, wallets.data?.secondary].filter((w): w is Wallet => !!w)
  // Rascunho: restaura o que o usuário digitou (inclusive depois de sessão expirada) ou pré-preenche com perfil + carteira principal.
  const first = wallets.data?.primary ?? wallets.data?.secondary
  const initial: Draft = draftStore.get<Draft>(`checkout:${user!.id}`) ?? { displayName: user!.displayName, username: user!.username, email: user!.email, ensName: (user!.ensName ?? '').replace(/\.eth$/, ''), referralCode: first?.referralCode ?? '', note: '', walletId: first?.id ?? '', network: first?.network ?? 'ethereum', provider: first?.provider ?? 'metamask' }
  return <CheckoutInner initial={initial} wallets={all} />
}

function CheckoutInner({ initial, wallets: all }: { initial: Draft; wallets: Wallet[] }) {
  const { user } = useSession()
  const router = useRouter()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const cart = useCart()
  const connection = useWalletConnection()
  const connect = useConnectWallet()
  const disconnect = useDisconnectWallet()
  const draftKey = `checkout:${user?.id}`
  const [draft, setDraft] = useState<Draft>(initial)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [review, setReview] = useState(false)
  const [reviewed, setReviewed] = useState<Quote | null>(null)
  const [changeNotice, setChangeNotice] = useState('')
  const [attempt, setAttempt] = useState(0)
  useEffect(() => { draftStore.set(draftKey, draft) }, [draft, draftKey])

  const network = draft.network
  const quote = useQuote(network, cart.data?.couponCode ?? null, !!cart.data?.items.length)
  const create = useCreateOrder(setAttempt)
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => { setDraft((d) => ({ ...d, [k]: v })); setErrors((e) => ({ ...e, [k]: '' })) }
  const wallet = all.find((w) => w.id === draft.walletId)
  const connected = connection.data?.connected && connection.data.walletId === draft.walletId && connection.data.provider === draft.provider
  const items = cart.data?.items ?? []
  const blocked = items.some((i) => i.status === 'unavailable' || i.status === 'reduced')

  const validate = () => {
    const e: Record<string, string> = {}
    if (!draft.displayName.trim()) e.displayName = 'Informe o nome de exibição.'
    if (!/^[a-z0-9_]{3,20}$/.test(draft.username)) e.username = 'Use de 3 a 20 caracteres: letras minúsculas, números ou _.'
    if (!EMAIL.test(draft.email)) e.email = 'Informe um e-mail válido.'
    if (!draft.referralCode.trim()) e.referralCode = 'Informe o código de indicação.'
    if (draft.ensName && !/^[a-z0-9-]+(\.[a-z0-9-]+)*$/.test(draft.ensName)) e.ensName = 'Use apenas letras minúsculas, números e hífen.'
    if (!draft.walletId) e.walletId = 'Selecione uma carteira cadastrada.'
    else if (!connected) e.provider = 'Conecte a carteira antes de confirmar a compra.'
    return e
  }

  const onReview = async (ev: FormEvent) => {
    ev.preventDefault()
    const e = validate()
    setErrors(e)
    const first = Object.keys(e)[0]
    if (first) { document.getElementById(`co-${first}`)?.focus(); return }
    setChangeNotice('')
    setReviewed(null)
    setReview(true)
    // Revalida na API ao abrir a revisão: a cotação FRESCA é a que o usuário aprova (e que segue no pedido).
    const fresh = await quote.refetch()
    if (fresh.data) setReviewed(fresh.data)
  }

  const body: OrderCreateBody | null = reviewed && wallet ? {
    items: items.map((i) => ({ nftId: i.nftId, editionId: i.editionId, quantity: i.quantity })),
    couponCode: cart.data?.couponCode ?? null, network: draft.network, walletId: wallet.id, provider: draft.provider, quoteId: reviewed.quoteId,
    collectorNote: draft.note.trim() || undefined,
  } : null

  const submit = () => {
    if (!body || !user || create.isPending) return // cliques repetidos não geram novo envio
    setChangeNotice('')
    create.mutate({ body, key: idempotencyKeyFor(body, user.id) }, {
      onSuccess: (order) => {
        draftStore.clear(draftKey)
        clearIdempotencyKey(user.id)
        void qc.invalidateQueries({ queryKey: ['cart'] })
        void navigate({ to: '/pedido/$id', params: { id: order.id }, replace: true })
      },
      onError: (e) => {
        if (!isApiError(e)) return
        const d = e.details as { quote?: Quote } | undefined
        if (e.code === 'QUOTE_CHANGED' && d?.quote) {
          // Mudança de valor exige nova confirmação explícita do usuário.
          setChangeNotice(`O valor mudou de ${formatEth(reviewed!.total)} para ${formatEth(d.quote.total)}. Revise e confirme novamente.`)
          setReviewed(d.quote)
          void qc.invalidateQueries({ queryKey: ['cart'] })
        } else if (e.code === 'AVAILABILITY_CONFLICT') {
          void qc.invalidateQueries({ queryKey: ['cart'] })
        }
      },
    })
  }

  const onConnect = () => {
    if (!draft.walletId) { setErrors((x) => ({ ...x, walletId: 'Selecione uma carteira cadastrada.' })); return }
    connect.mutate({ provider: draft.provider, walletId: draft.walletId }, {
      onSuccess: () => { setErrors((x) => ({ ...x, provider: '' })); toast(`${PROVIDER_LABEL[draft.provider]} conectada.`, 'success') },
      onError: (e) => setErrors((x) => ({ ...x, provider: isApiError(e) ? e.message : 'Não foi possível conectar.' })),
    })
  }

  if (!items.length) return (
    <div className={cn(container, 'py-24 text-center')}><h1 className="text-2xl font-bold">Seu carrinho está vazio</h1><p className="mt-2 text-muted">Adicione NFTs antes de pagar.</p><Button asChild className="mt-6"><Link to="/" hash="catalogo">Explorar NFTs</Link></Button></div>
  )
  if (!all.length) return (
    <div className={cn(container, 'py-24 text-center')}><h1 className="text-2xl font-bold">Cadastre uma carteira</h1><p className="mt-2 text-muted">Você precisa de ao menos uma carteira para receber os NFTs.</p><Button asChild className="mt-6"><Link to="/perfil/carteiras">Cadastrar carteira</Link></Button></div>
  )

  const submitErr = create.error && isApiError(create.error) ? create.error : null
  return (
    <div className="pb-10">
      <div className="flex items-center gap-4 px-5 py-4 md:hidden"><Button variant="quiet" size="icon" className="size-10" onClick={() => router.history.back()} aria-label="Voltar"><ChevronLeft size={20} aria-hidden="true" /></Button><h1 className="flex-1 pr-10 text-center text-xl font-bold">Pagamento com carteira</h1></div>
      <div className={cn(container, 'md:pt-8')}>
        <nav aria-label="Trilha" className="mb-4 hidden text-sm font-bold md:block"><Link to="/" className="hover:text-accent-hi">Início</Link> / <Link to="/" hash="catalogo" className="hover:text-accent-hi">Mercado</Link> / Pagamento</nav>
        <form onSubmit={onReview} noValidate className="grid gap-10 md:grid-cols-[minmax(0,1fr)_405px] md:gap-[32px]">
          <div>
            <h1 className="mb-4 text-lg font-bold max-md:hidden">Perfil do colecionador</h1>
            <div className="grid gap-5 sm:grid-cols-2 max-md:hidden">
              <TextField id="co-displayName" label="Nome de exibição" required value={draft.displayName} onChange={(e) => set('displayName', e.target.value)} error={errors.displayName} autoComplete="name" />
              <TextField id="co-username" label="Nome de usuário" required value={draft.username} onChange={(e) => set('username', e.target.value)} error={errors.username} autoComplete="username" />
              <TextField id="co-email" label="E-mail" type="email" required value={draft.email} onChange={(e) => set('email', e.target.value)} error={errors.email} autoComplete="email" />
              <div className="flex items-end gap-2">
                <div className="w-24"><SelectField id="co-tld" label="Nome ENS" aria-label="Domínio ENS" value=".eth" onChange={() => undefined}><option>.eth</option></SelectField></div>
                <TextField id="co-ensName" label="Nome ENS (opcional)" wrapperClassName="flex-1 [&>label]:sr-only" value={draft.ensName} onChange={(e) => set('ensName', e.target.value)} error={errors.ensName} placeholder="seunome" />
              </div>
              <TextField id="co-referralCode" label="Código de indicação" required value={draft.referralCode} onChange={(e) => set('referralCode', e.target.value)} error={errors.referralCode} />
              <SelectField id="co-network" label="Rede" required value={draft.network} onChange={(e) => set('network', e.target.value as Network)} hint="A taxa de rede muda conforme a rede escolhida.">
                {(Object.keys(NETWORK_LABEL) as Network[]).map((n) => <option key={n} value={n}>{NETWORK_LABEL[n]}</option>)}
              </SelectField>
              <TextAreaField id="co-note" label="Observação do colecionador (opcional)" value={draft.note} maxLength={280} onChange={(e) => set('note', e.target.value)} className="sm:col-span-2" />
            </div>

            <fieldset className="mt-2 border-0 p-0 md:mt-8" aria-describedby={errors.walletId ? 'co-walletId-error' : undefined}>
              <legend className="mb-3 flex w-full items-center justify-between text-lg font-bold">Carteira conectada <Link to="/perfil/carteiras" className="text-sm font-normal text-accent-hi hover:underline">Trocar carteira</Link></legend>
              <ul className="space-y-3">
                {all.map((w) => (
                  <li key={w.id}>
                    <label className={cn('flex cursor-pointer items-center gap-3 rounded-2xl bg-surface p-4 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent-hi md:rounded', draft.walletId === w.id && 'ring-1 ring-accent')}>
                      <input id={w.kind === 'primary' ? 'co-walletId' : undefined} type="radio" name="carteira" value={w.id} checked={draft.walletId === w.id} onChange={() => { set('walletId', w.id); set('network', w.network) }} className="size-4 accent-[#d28a4c]" />
                      <span className="flex-1"><span className="block font-bold">{w.nickname}</span><span className="block text-sm text-muted">{w.ensName ?? short(w.address)}</span><span className="block text-xs text-faint">Rede {w.kind === 'primary' ? 'principal ' : ''}{NETWORK_LABEL[w.network]}</span></span>
                      <MoreVertical size={16} aria-hidden="true" className="text-faint" />
                    </label>
                  </li>
                ))}
              </ul>
              {errors.walletId && <p id="co-walletId-error" role="alert" className="mt-2 text-xs text-danger"><span aria-hidden="true">✕ </span>{errors.walletId}</p>}
            </fieldset>

            <fieldset className="mt-8 border-0 p-0">
              <legend className="mb-3 text-lg font-bold">Carteira e rede</legend>
              <ul className="space-y-3">
                {PROVIDERS.map((p) => (
                  <li key={p}>
                    <label className={cn('flex cursor-pointer items-center gap-3 rounded-2xl bg-surface p-4 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent-hi md:rounded', draft.provider === p && 'ring-1 ring-accent')}>
                      <span aria-hidden="true" className="grid size-10 place-items-center rounded-full bg-bg text-sm font-bold text-accent">{PROVIDER_LABEL[p][0]}</span>
                      <span className="flex-1">{PROVIDER_LABEL[p]}</span>
                      <input id={p === draft.provider ? 'co-provider' : undefined} type="radio" name="provedor" value={p} checked={draft.provider === p} onChange={() => { set('provider', p); setErrors((x) => ({ ...x, provider: '' })) }} className="size-4 accent-[#d28a4c]" />
                    </label>
                  </li>
                ))}
              </ul>
              <div className="mt-4 flex flex-wrap items-center gap-3" role="status" aria-live="polite">
                {connected ? (
                  <>
                    <p className="text-sm text-ok"><span aria-hidden="true">✓ </span>{PROVIDER_LABEL[draft.provider]} conectada à carteira {wallet?.nickname}.</p>
                    <Button variant="outline" size="sm" onClick={() => disconnect.mutate(undefined, { onSuccess: () => toast('Carteira desconectada.', 'info') })} disabled={disconnect.isPending}>Desconectar</Button>
                  </>
                ) : <Button variant="outline" size="md" onClick={onConnect} disabled={connect.isPending}>{connect.isPending ? 'Conectando…' : `Conectar ${PROVIDER_LABEL[draft.provider]}`}</Button>}
              </div>
              {errors.provider && <p id="co-provider-error" role="alert" className="mt-2 text-xs text-danger"><span aria-hidden="true">✕ </span>{errors.provider}</p>}
            </fieldset>
          </div>

          <aside aria-labelledby="seus-nfts" className="max-md:rounded-t-[32px] max-md:bg-surface max-md:p-5">
            <h2 id="seus-nfts" className="mb-3 text-lg font-bold max-md:sr-only">Seus NFTs</h2>
            <ul className="space-y-2 max-md:hidden">
              {items.map((i) => (
                <li key={`${i.nftId}-${i.editionId}`} className="flex items-center gap-3 bg-surface pr-3 text-sm">
                  <img src={i.image} alt={`Arte do NFT ${i.name}`} width={70} height={70} className="size-[70px] object-cover" />
                  <span className="flex-1"><b className="block">{i.name}</b><span className="text-xs text-faint">ID do token: {i.tokenId}</span></span>
                  <span className="text-muted">(x {i.quantity})</span><b className="w-20 text-right text-accent-hi">{formatEth(i.lineTotal, false)} ETH</b>
                </li>
              ))}
            </ul>
            {blocked && <p role="alert" className="mt-3 text-xs text-danger"><span aria-hidden="true">✕ </span>Há itens indisponíveis. <Link to="/carrinho" className="underline">Ajuste o carrinho</Link>.</p>}
            <QuoteLines quote={quote.data} loading={quote.isPending} className="mt-5" />
            {quote.isError && <p role="alert" className="mt-2 text-xs text-danger">Não foi possível atualizar a cotação. <button type="button" className="underline" onClick={() => void quote.refetch()}>Tentar novamente</button></p>}
            <div className="mt-5 md:hidden"><p className="flex justify-between font-bold"><span>Total:</span><span className="text-accent-hi">{quote.data ? formatEth(quote.data.total) : '—'}</span></p></div>
            <Button type="submit" size="lg" className="mt-5 w-full max-md:rounded-full" disabled={blocked || quote.isPending}>Confirmar compra</Button>
          </aside>
        </form>
      </div>

      <Dialog open={review} onOpenChange={(o) => { if (!create.isPending) { setReview(o); if (!o) { create.reset(); setReviewed(null) } } }} title="Revisar pedido" description="Confira os valores antes de enviar o pedido." className="p-6 md:top-[100px] md:w-[520px]">
        <div className="mt-4 space-y-4 text-sm">
          {!reviewed ? <div aria-busy="true"><Skeleton className="h-40 w-full" /></div> : (
            <>
              <ul className="space-y-1">{items.map((i) => <li key={`${i.nftId}${i.editionId}`} className="flex justify-between"><span>{i.name} <span className="text-faint">({i.editionLabel}) × {i.quantity}</span></span><span>{formatEth(i.lineTotal)}</span></li>)}</ul>
              <QuoteLines quote={reviewed} />
              <p className="text-xs text-muted">Carteira {wallet?.nickname} · {NETWORK_LABEL[reviewed.network]} · {PROVIDER_LABEL[draft.provider]}</p>
            </>
          )}
          <div role="alert" className="empty:hidden">
            {changeNotice && <p className="border border-accent px-3 py-2"><span aria-hidden="true">ℹ </span>{changeNotice}</p>}
            {submitErr && submitErr.code !== 'QUOTE_CHANGED' && (
              <p className="border border-danger px-3 py-2"><span aria-hidden="true">✕ </span>{submitErr.retryable ? 'Não recebemos a confirmação do envio. Seu pedido NÃO será duplicado: reenviar usa a mesma chave.' : submitErr.message}
                {submitErr.code === 'AVAILABILITY_CONFLICT' && <> <Link to="/carrinho" className="underline">Voltar ao carrinho</Link></>}</p>
            )}
          </div>
          {create.isPending && <p role="status" className="text-xs text-muted">{attempt > 1 ? `Reenviando com a mesma chave (tentativa ${attempt} de 3)…` : 'Enviando pedido…'}</p>}
          <Button size="lg" className="w-full" onClick={submit} disabled={!reviewed || create.isPending || submitErr?.code === 'AVAILABILITY_CONFLICT'} aria-disabled={create.isPending}>
            {create.isPending ? 'Enviando…' : changeNotice ? 'Confirmar novo valor' : submitErr?.retryable ? 'Reenviar pedido' : 'Enviar pedido'}
          </Button>
        </div>
      </Dialog>
    </div>
  )
}

function CheckoutSkeleton() {
  return (
    <div className={cn(container, 'py-8')} aria-busy="true" aria-label="Carregando pagamento">
      <div className="grid gap-8 md:grid-cols-[1fr_405px]"><div className="space-y-4"><Skeleton className="h-8 w-56" />{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div><div className="space-y-3"><Skeleton className="h-[70px] w-full" /><Skeleton className="h-[70px] w-full" /><Skeleton className="h-32 w-full" /></div></div>
    </div>
  )
}
