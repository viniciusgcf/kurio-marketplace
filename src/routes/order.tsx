import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from '@tanstack/react-router'
import { Copy, MailOpen } from 'lucide-react'
import { orderQuery, useSession } from '@/app/queries'
import { isApiError } from '@/api/http'
import { container } from '@/components/layout/app-shell'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { NETWORK_LABEL, PROVIDER_LABEL, type Order } from '@/contracts'
import { cn } from '@/lib/cn'
import { formatEth } from '@/lib/money'
import { toast } from '@/lib/toast'
import { useRealtimeStatus } from '@/realtime/status'

const shortTx = (tx: string) => `${tx.slice(0, 6)}…${tx.slice(-4)}`
function formatDate(iso: string) {
  const d = new Date(iso)
  const month = d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')
  return `${String(d.getDate()).padStart(2, '0')} ${month[0]!.toUpperCase()}${month.slice(1)}, ${d.getFullYear()}`
}

export default function OrderRoute() {
  const { id } = useParams({ from: '/pedido/$id' })
  const { user } = useSession()
  const q = useQuery(orderQuery(user!.id, id))
  const rt = useRealtimeStatus()

  if (q.isPending) return <div className={cn(container, 'py-16')} aria-busy="true" aria-label="Carregando pedido"><Skeleton className="mx-auto h-[480px] w-full max-w-[578px]" /></div>
  if (q.isError && !q.data) {
    const notFound = isApiError(q.error) && q.error.status === 404
    return (
      <div role="alert" className={cn(container, 'py-24 text-center')}>
        <h1 className="text-2xl font-bold">{notFound ? 'Pedido não encontrado' : 'Não foi possível carregar o pedido'}</h1>
        <p className="mt-2 text-muted">{notFound ? 'Este pedido não existe ou pertence a outra conta.' : q.error.message}</p>
        <div className="mt-6 flex justify-center gap-3">{!notFound && <Button onClick={() => void q.refetch()}>Tentar novamente</Button>}<Button asChild variant="outline"><Link to="/">Voltar ao início</Link></Button></div>
      </div>
    )
  }
  const order = q.data!
  if (order.status === 'pending') {
    return (
      <div className={cn(container, 'py-20')}>
        <section aria-labelledby="pend" className="mx-auto max-w-[578px] border-b-[10px] border-accent bg-surface p-10 text-center">
          <div aria-hidden="true" className="mx-auto mb-6 size-12 animate-spin rounded-full border-4 border-line border-t-accent motion-reduce:animate-none" />
          <h1 id="pend" className="text-xl font-bold">Aguardando confirmação do pagamento</h1>
          <p role="status" aria-live="polite" className="mt-3 text-sm text-muted">
            Pedido {order.id} em processamento. {rt === 'reconnecting' ? 'Conexão em tempo real interrompida: continuamos consultando a API.' : 'Esta página atualiza sozinha.'}
          </p>
          <p className="mt-2 text-xs text-faint">Pode recarregar a página ou perder a conexão: o pedido não será duplicado e o estado é recuperado.</p>
          <Button variant="outline" className="mt-6" onClick={() => void q.refetch()} disabled={q.isFetching}>{q.isFetching ? 'Atualizando…' : 'Atualizar agora'}</Button>
        </section>
      </div>
    )
  }
  if (order.status === 'declined') {
    return (
      <div className={cn(container, 'py-20')}>
        <section role="alert" aria-labelledby="rec" className="mx-auto max-w-[578px] border-b-[10px] border-danger bg-surface p-10 text-center">
          <h1 id="rec" className="text-xl font-bold"><span aria-hidden="true">✕ </span>Pagamento recusado</h1>
          <p className="mt-3 text-sm text-muted">{order.declineReason ?? 'A carteira recusou a transação.'} Seus itens continuam no carrinho e nada foi cobrado.</p>
          <div className="mt-6 flex justify-center gap-3"><Button asChild><Link to="/pagamento">Tentar novamente</Link></Button><Button asChild variant="outline"><Link to="/carrinho">Voltar ao carrinho</Link></Button></div>
        </section>
      </div>
    )
  }
  return <Receipt order={order} />
}

function Receipt({ order }: { order: Order }) {
  const s = order.snapshot
  return (
    <div className={cn(container, 'py-12')}>
      <section aria-labelledby="ok" className="mx-auto max-w-[578px] border-b-[10px] border-accent bg-surface pb-8 text-ink">
        <div className="px-8 pt-6 text-center">
          <MailOpen size={72} strokeWidth={1.25} aria-hidden="true" className="mx-auto text-accent" />
          <h1 id="ok" className="mt-3 pb-4 text-base font-bold text-muted">Seus NFTs agora estão na sua carteira</h1>
        </div>
        <dl className="grid grid-cols-2 border-y border-accent/70 px-4 py-3 text-xs sm:grid-cols-4 [&>div]:px-3">
          <div className="sm:border-r sm:border-accent/70"><dt className="font-bold text-muted">ID da transação</dt><dd className="text-faint">{order.txId ? shortTx(order.txId) : '—'}</dd></div>
          <div className="sm:border-r sm:border-accent/70"><dt className="text-faint">Data</dt><dd className="text-faint">{formatDate(order.updatedAt)}</dd></div>
          <div className="sm:border-r sm:border-accent/70"><dt className="text-faint">Total</dt><dd className="text-faint">{formatEth(s.total)}</dd></div>
          <div><dt className="font-bold text-muted">Carteira</dt><dd className="text-faint">{PROVIDER_LABEL[s.provider]}</dd></div>
        </dl>
        <div className="px-8 pt-6">
          <h2 className="font-bold">Detalhes da transação</h2>
          <table className="mt-3 w-full text-sm">
            <caption className="sr-only">Itens do pedido {order.id}</caption>
            <thead><tr className="border-b border-line text-left"><th scope="col" className="pb-2 font-bold">NFTs</th><th scope="col" className="pb-2 text-center font-bold">Edições</th><th scope="col" className="pb-2 text-right font-bold">Subtotal</th></tr></thead>
            <tbody>
              {s.items.map((i) => (
                <tr key={`${i.nftId}${i.editionId}`}>
                  <td className="py-2"><div className="flex items-center gap-3"><img src={i.image} alt={`Arte do NFT ${i.name}`} width={70} height={70} className="size-[70px] rounded-lg object-cover" /><div><b>{i.name}</b><p className="text-xs text-faint">ID do token: {i.tokenId}</p></div></div></td>
                  <td className="text-center text-muted">(x {i.quantity})</td>
                  <td className="text-right font-bold text-accent-hi">{formatEth(i.subtotal)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              {!!s.couponCode && <tr><td colSpan={2} className="pt-3 text-right text-muted">Desconto ({s.couponCode})</td><td className="pt-3 text-right">(-) {formatEth(s.discount, false)} ETH</td></tr>}
              <tr><th scope="row" colSpan={2} className="pt-3 text-right font-normal">Taxa de rede</th><td className="pt-3 text-right">{formatEth(s.networkFee)}</td></tr>
              <tr className="border-t border-line"><th scope="row" colSpan={2} className="pt-2 text-right">Total</th><td className="pt-2 text-right font-bold text-accent-hi">{formatEth(s.total)}</td></tr>
            </tfoot>
          </table>
          <p className="mt-5 text-center text-xs leading-5 text-muted">Transação confirmada na {NETWORK_LABEL[s.network]}. A propriedade foi transferida para sua carteira conectada e registrada na rede.</p>
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <Button onClick={() => toast(`Link de exploração simulado nesta demonstração. Transação: ${order.txId}`, 'info', 9000)}>Ver no Etherscan</Button>
            {order.txId && <Button variant="outline" onClick={() => { void navigator.clipboard?.writeText(order.txId!).then(() => toast('ID da transação copiado.', 'success')) }}><Copy size={14} aria-hidden="true" />Copiar ID</Button>}
            <Button asChild variant="ghost"><Link to="/" hash="catalogo">Continuar explorando</Link></Button>
          </div>
        </div>
      </section>
    </div>
  )
}
