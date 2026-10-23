import { useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { api } from '@/api'
import { isApiError } from '@/api/http'
import { qk, useSession } from '@/app/queries'
import { ProfileLayout } from '@/components/layout/profile-layout'
import { Button } from '@/components/ui/button'
import { SelectField, TextField } from '@/components/ui/field'
import { Skeleton } from '@/components/ui/skeleton'
import { useWallets } from '@/features/checkout/hooks'
import { NETWORK_LABEL, PROVIDER_LABEL, type Network, type Wallet, type WalletInput, type WalletProvider } from '@/contracts'
import { toast } from '@/lib/toast'

type Errors = Record<string, string>
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const blank = (email = ''): WalletInput => ({ displayName: '', nickname: '', network: 'ethereum', address: '', provider: 'metamask', profileName: '', referralCode: '', email, ensName: null, linkedWallet: null })
const toInput = (w: Wallet): WalletInput => { const { id: _i, kind: _k, ...rest } = w; return rest }

export default function WalletsRoute() {
  const { user } = useSession()
  const wallets = useWallets()
  const [adding, setAdding] = useState(false)
  const [same, setSame] = useState(false)
  const primary = wallets.data?.primary ?? null
  const secondary = wallets.data?.secondary ?? null
  return (
    <ProfileLayout active="carteiras" title="Carteiras">
      {wallets.isPending ? <div aria-busy="true" aria-label="Carregando carteiras" className="space-y-4">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-10 w-full max-w-[862px]" />)}</div>
        : wallets.isError ? <div role="alert" className="space-y-3"><p>Não foi possível carregar as carteiras.</p><Button onClick={() => void wallets.refetch()}>Tentar novamente</Button></div> : (
          <div className="max-w-[862px] space-y-10">
            <WalletForm key={primary ? JSON.stringify(primary) : 'novo'} kind="primary" title="Carteira principal" description="Estas carteiras ficam disponíveis no pagamento e para receber NFTs comprados." wallet={primary} defaults={blank(user!.email)} />
            <section aria-labelledby="sec-titulo">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><h2 id="sec-titulo" className="text-lg font-bold">Carteira secundária</h2>{!secondary && !adding && <p className="mt-1 text-sm text-muted">Você ainda não adicionou uma carteira secundária.</p>}</div>
                {!secondary && !adding && (
                  <div className="flex items-center gap-4 text-sm">
                    <label className="flex cursor-pointer items-center gap-2 text-muted"><input type="checkbox" checked={same} onChange={(e) => setSame(e.target.checked)} className="size-4 accent-[#d28a4c]" />Copiar dados da principal</label>
                    <button type="button" onClick={() => setAdding(true)} className="font-bold text-accent-hi hover:underline">Adicionar</button>
                  </div>
                )}
              </div>
              {(secondary || adding) && <WalletForm key={secondary ? JSON.stringify(secondary) : 'novo'} kind="secondary" wallet={secondary} defaults={same && primary ? { ...toInput(primary), address: '', nickname: 'Reserva', ensName: null } : blank(user!.email)} onCancel={() => setAdding(false)} />}
            </section>
          </div>
        )}
    </ProfileLayout>
  )
}

function WalletForm({ kind, title, description, wallet, defaults, onCancel }: { kind: 'primary' | 'secondary'; title?: string; description?: string; wallet: Wallet | null; defaults: WalletInput; onCancel?: () => void }) {
  const qc = useQueryClient()
  const { user } = useSession()
  const [v, setV] = useState<WalletInput>(wallet ? toInput(wallet) : defaults)
  const [ens, setEns] = useState((wallet?.ensName ?? defaults.ensName ?? '').replace(/\.eth$/, ''))
  const [errors, setErrors] = useState<Errors>({})
  const [busy, setBusy] = useState(false)
  const p = `w-${kind}`
  const set = <K extends keyof WalletInput>(k: K, val: WalletInput[K]) => { setV((s) => ({ ...s, [k]: val })); setErrors((x) => ({ ...x, [k]: '' })) }

  const validate = (): Errors => {
    const e: Errors = {}
    if (!v.displayName.trim()) e.displayName = 'Informe o nome de exibição.'
    if (!v.nickname.trim()) e.nickname = 'Informe o apelido da carteira.'
    if (!v.profileName.trim()) e.profileName = 'Informe o nome do perfil.'
    if (!v.referralCode.trim()) e.referralCode = 'Informe o código de indicação.'
    if (!EMAIL.test(v.email)) e.email = 'Informe um e-mail válido.'
    if (!(v.network === 'solana' ? /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(v.address) : /^0x[a-fA-F0-9]{40}$/.test(v.address))) e.address = v.network === 'solana' ? 'Endereço Solana inválido.' : 'Endereço inválido. Use 0x seguido de 40 caracteres hexadecimais.'
    if (!ens.trim()) e.ensName = 'Informe o nome ENS.'
    else if (!/^[a-z0-9-]+(\.[a-z0-9-]+)*$/.test(ens)) e.ensName = 'Use apenas letras minúsculas, números e hífen.'
    return e
  }
  const onSubmit = async (ev: FormEvent) => {
    ev.preventDefault()
    const e = validate()
    setErrors(e)
    const first = Object.keys(e)[0]
    if (first) { document.getElementById(`${p}-${first}`)?.focus(); return }
    setBusy(true)
    try {
      const saved = await api.wallets.save(kind, { ...v, ensName: `${ens}.eth`, linkedWallet: v.linkedWallet || null })
      qc.setQueryData(qk.wallets(user!.id), (old: { primary: Wallet | null; secondary: Wallet | null } | undefined) => ({ primary: old?.primary ?? null, secondary: old?.secondary ?? null, [kind]: saved }))
      toast(kind === 'primary' ? 'Carteira principal salva.' : 'Carteira secundária salva.', 'success')
    } catch (err) {
      if (isApiError(err)) { setErrors(err.fieldErrors); if (!Object.keys(err.fieldErrors).length) toast(err.message, 'error') }
      else toast('Não foi possível salvar a carteira.', 'error')
    } finally { setBusy(false) }
  }
  const remove = async () => {
    setBusy(true)
    try { await api.wallets.removeSecondary(); qc.setQueryData(qk.wallets(user!.id), (old: { primary: Wallet | null } | undefined) => ({ primary: old?.primary ?? null, secondary: null })); toast('Carteira secundária removida.', 'info'); onCancel?.() }
    catch { toast('Não foi possível remover a carteira.', 'error') } finally { setBusy(false) }
  }

  return (
    <form onSubmit={onSubmit} noValidate aria-label={title ?? 'Carteira secundária'} className="mt-4">
      {title && <div className="mb-5"><h2 className="text-lg font-bold">{title}</h2><p className="mt-1 text-sm text-muted">{description}</p></div>}
      <div className="grid gap-x-7 gap-y-5 sm:grid-cols-2">
        <TextField id={`${p}-displayName`} label="Nome de exibição" required value={v.displayName} onChange={(e) => set('displayName', e.target.value)} error={errors.displayName} />
        <TextField id={`${p}-nickname`} label="Apelido da carteira" required value={v.nickname} onChange={(e) => set('nickname', e.target.value)} error={errors.nickname} />
        <SelectField id={`${p}-network`} label="Rede" required value={v.network} onChange={(e) => set('network', e.target.value as Network)} error={errors.network}>{(Object.keys(NETWORK_LABEL) as Network[]).map((n) => <option key={n} value={n}>{NETWORK_LABEL[n]}</option>)}</SelectField>
        <TextField id={`${p}-profileName`} label="Nome do perfil" required value={v.profileName} onChange={(e) => set('profileName', e.target.value)} error={errors.profileName} />
        <TextField id={`${p}-address`} label="Endereço da carteira" required value={v.address} onChange={(e) => set('address', e.target.value.trim())} error={errors.address} placeholder="Endereço 0x da carteira" spellCheck={false} autoComplete="off" />
        <TextField id={`${p}-linkedWallet`} label="ENS ou carteira secundária (opcional)" value={v.linkedWallet ?? ''} onChange={(e) => set('linkedWallet', e.target.value)} error={errors.linkedWallet} />
        <SelectField id={`${p}-provider`} label="Tipo de carteira" required value={v.provider} onChange={(e) => set('provider', e.target.value as WalletProvider)} error={errors.provider} placeholder="Selecione uma carteira">{(Object.keys(PROVIDER_LABEL) as WalletProvider[]).map((n) => <option key={n} value={n}>{PROVIDER_LABEL[n]}</option>)}</SelectField>
        <TextField id={`${p}-referralCode`} label="Código de indicação" required value={v.referralCode} onChange={(e) => set('referralCode', e.target.value)} error={errors.referralCode} />
        <TextField id={`${p}-email`} label="E-mail" type="email" required value={v.email} onChange={(e) => set('email', e.target.value)} error={errors.email} />
        <div className="flex items-end gap-2">
          <div className="w-24"><SelectField id={`${p}-tld`} label="Domínio ENS" value=".eth" onChange={() => undefined}><option>.eth</option></SelectField></div>
          <TextField id={`${p}-ensName`} label="Nome ENS" required wrapperClassName="flex-1" value={ens} onChange={(e) => { setEns(e.target.value); setErrors((x) => ({ ...x, ensName: '' })) }} error={errors.ensName} placeholder="seunome" />
        </div>
      </div>
      <div className="mt-6 flex flex-wrap gap-3">
        <Button type="submit" size="lg" disabled={busy}>{busy ? 'Salvando…' : 'Salvar carteira'}</Button>
        {kind === 'secondary' && (wallet ? <Button variant="outline" size="lg" onClick={() => void remove()} disabled={busy}>Remover carteira</Button> : <Button variant="outline" size="lg" onClick={onCancel} disabled={busy}>Cancelar</Button>)}
      </div>
    </form>
  )
}
