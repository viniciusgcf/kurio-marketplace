import { ImagePlus } from 'lucide-react'
import { useRef, useState, type FormEvent } from 'react'
import { useSession } from '@/app/queries'
import { isApiError } from '@/api/http'
import { ProfileLayout } from '@/components/layout/profile-layout'
import { Button } from '@/components/ui/button'
import { PasswordField, SelectField, TextField } from '@/components/ui/field'
import { resizeAvatar, useChangePassword, useUpdateProfile } from '@/features/auth/profile-hooks'
import { toast } from '@/lib/toast'

type Errors = Record<string, string>
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export default function ProfileRoute() {
  const { user } = useSession()
  const update = useUpdateProfile()
  const changePw = useChangePassword()
  const fileRef = useRef<HTMLInputElement>(null)
  const [v, setV] = useState({ displayName: user!.displayName, username: user!.username, email: user!.email, ens: (user!.ensName ?? '').replace(/\.eth$/, ''), walletNickname: user!.walletNickname })
  const [avatar, setAvatar] = useState<string | null>(user!.avatarUrl)
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' })
  const [errors, setErrors] = useState<Errors>({})
  const [busy, setBusy] = useState(false)
  const setField = (k: keyof typeof v) => (e: { target: { value: string } }) => { setV((s) => ({ ...s, [k]: e.target.value })); setErrors((x) => ({ ...x, [k === 'ens' ? 'ensName' : k]: '' })) }
  const setPwField = (k: keyof typeof pw) => (e: { target: { value: string } }) => { setPw((s) => ({ ...s, [k]: e.target.value })); setErrors((x) => ({ ...x, [k]: '' })) }

  const onAvatar = async (file?: File) => {
    if (!file) return
    try { setAvatar(await resizeAvatar(file)); setErrors((x) => ({ ...x, avatarUrl: '' })) }
    catch (e) { setErrors((x) => ({ ...x, avatarUrl: e instanceof Error ? e.message : 'Imagem inválida.' })) }
    if (fileRef.current) fileRef.current.value = ''
  }

  const onSubmit = async (ev: FormEvent) => {
    ev.preventDefault()
    const e: Errors = {}
    if (!v.displayName.trim()) e.displayName = 'Informe o nome de exibição.'
    if (!/^[a-z0-9_]{3,20}$/.test(v.username)) e.username = 'Use de 3 a 20 caracteres: letras minúsculas, números ou _.'
    if (!EMAIL.test(v.email)) e.email = 'Informe um e-mail válido.'
    if (!v.walletNickname.trim()) e.walletNickname = 'Informe o apelido da carteira.'
    if (v.ens && !/^[a-z0-9-]+(\.[a-z0-9-]+)*$/.test(v.ens)) e.ensName = 'Use apenas letras minúsculas, números e hífen.'
    const wantsPw = !!(pw.currentPassword || pw.newPassword || pw.confirmPassword)
    if (wantsPw) {
      if (!pw.currentPassword) e.currentPassword = 'Informe a senha atual.'
      if (pw.newPassword.length < 8 || !/[A-Za-z]/.test(pw.newPassword) || !/\d/.test(pw.newPassword)) e.newPassword = 'Use ao menos 8 caracteres, com letras e números.'
      if (pw.confirmPassword !== pw.newPassword) e.confirmPassword = 'As senhas não coincidem.'
    }
    setErrors(e)
    const first = Object.keys(e)[0]
    if (first) { document.getElementById(`pf-${first}`)?.focus(); return }
    setBusy(true)
    try {
      await update.mutateAsync({ displayName: v.displayName.trim(), username: v.username, email: v.email, ensName: v.ens ? `${v.ens}.eth` : null, walletNickname: v.walletNickname.trim(), avatarUrl: avatar })
      if (wantsPw) { await changePw.mutateAsync(pw); setPw({ currentPassword: '', newPassword: '', confirmPassword: '' }) }
      toast(wantsPw ? 'Perfil e senha atualizados.' : 'Perfil atualizado.', 'success')
    } catch (err) {
      if (isApiError(err)) { setErrors(err.fieldErrors); if (!Object.keys(err.fieldErrors).length) toast(err.message, 'error') }
      else toast('Não foi possível salvar. Tente novamente.', 'error')
    } finally { setBusy(false) }
  }

  return (
    <ProfileLayout active="perfil" title="Perfil do colecionador">
      <form onSubmit={onSubmit} noValidate className="max-w-[862px]">
        <div className="grid gap-x-7 gap-y-5 sm:grid-cols-2">
          <TextField id="pf-displayName" label="Nome de exibição" required value={v.displayName} onChange={setField('displayName')} error={errors.displayName} autoComplete="name" />
          <TextField id="pf-username" label="Nome de usuário" required value={v.username} onChange={setField('username')} error={errors.username} autoComplete="username" />
          <TextField id="pf-email" label="E-mail" type="email" required value={v.email} onChange={setField('email')} error={errors.email} autoComplete="email" />
          <div className="flex items-end gap-2">
            <div className="w-24"><SelectField id="pf-tld" label="Domínio ENS" value=".eth" onChange={() => undefined}><option>.eth</option></SelectField></div>
            <TextField id="pf-ensName" label="Nome ENS" wrapperClassName="flex-1" value={v.ens} onChange={setField('ens')} error={errors.ensName} placeholder="seunome" />
          </div>
          <TextField id="pf-walletNickname" label="Apelido da carteira" required value={v.walletNickname} onChange={setField('walletNickname')} error={errors.walletNickname} />
          <div>
            <p id="avatar-label" className="mb-2 text-sm">Avatar</p>
            <div className="flex items-center gap-4" role="group" aria-labelledby="avatar-label">
              <span className="grid size-[50px] place-items-center overflow-hidden rounded-full bg-surface text-accent">{avatar ? <img src={avatar} alt="Seu avatar" width={50} height={50} className="size-full object-cover" /> : <ImagePlus size={20} aria-hidden="true" />}</span>
              <input ref={fileRef} id="pf-avatarUrl" type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => void onAvatar(e.target.files?.[0])} aria-describedby={errors.avatarUrl ? 'pf-avatarUrl-error' : undefined} />
              <Button size="md" onClick={() => fileRef.current?.click()}>Alterar</Button>
              <button type="button" onClick={() => setAvatar(null)} disabled={!avatar} className="text-sm hover:text-accent-hi disabled:opacity-40">Remover</button>
            </div>
            {errors.avatarUrl && <p id="pf-avatarUrl-error" role="alert" className="mt-1 text-xs text-danger"><span aria-hidden="true">✕ </span>{errors.avatarUrl}</p>}
          </div>
        </div>
        <h2 className="mb-4 mt-9 text-lg font-bold">Alterar senha</h2>
        <div className="grid max-w-[417px] gap-5">
          <PasswordField id="pf-currentPassword" label="Senha atual" value={pw.currentPassword} onChange={setPwField('currentPassword')} error={errors.currentPassword} autoComplete="current-password" />
          <PasswordField id="pf-newPassword" label="Nova senha" value={pw.newPassword} onChange={setPwField('newPassword')} error={errors.newPassword} autoComplete="new-password" />
          <PasswordField id="pf-confirmPassword" label="Confirmar nova senha" value={pw.confirmPassword} onChange={setPwField('confirmPassword')} error={errors.confirmPassword} autoComplete="new-password" />
        </div>
        <Button type="submit" size="lg" className="mt-8 min-w-32" disabled={busy}>{busy ? 'Salvando…' : 'Salvar'}</Button>
      </form>
    </ProfileLayout>
  )
}
