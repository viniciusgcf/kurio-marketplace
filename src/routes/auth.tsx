import { Link, useNavigate, useRouter, useSearch } from '@tanstack/react-router'
import { useEffect, useState, type FormEvent } from 'react'
import { useSession } from '@/app/queries'
import { safeRedirect } from '@/app/router'
import { isApiError } from '@/api/http'
import { soon } from '@/components/layout/app-shell'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { PasswordField, TextField } from '@/components/ui/field'
import { useLogin, useRegister } from '@/features/auth/hooks'
import { HomeView } from './home'

type Mode = 'login' | 'signup'
type Errors = Record<string, string>
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export default function LoginRoute() { return <AuthRoute mode="login" /> }
export function SignupRoute() { return <AuthRoute mode="signup" /> }

function AuthRoute({ mode }: { mode: Mode }) {
  const search = useSearch({ from: mode === 'login' ? '/login' : '/cadastro' })
  const { user } = useSession()
  const router = useRouter()
  const navigate = useNavigate()
  // Autenticou (login, cadastro ou já estava logado): retorna ao fluxo anterior, preservando o contexto.
  useEffect(() => { if (user) router.history.replace(safeRedirect(search.redirect)) }, [user, search.redirect, router])
  const close = () => void navigate({ to: '/' })
  return (
    <>
      {/* O fundo reproduz o Figma: catálogo atrás do modal (inerte enquanto o diálogo está aberto). */}
      <div aria-hidden="true" className="max-md:hidden"><HomeView search={{}} onChange={() => undefined} /></div>
      <Dialog open onOpenChange={(o) => !o && close()} title={mode === 'login' ? 'Entrar' : 'Criar conta'} hideTitle className="md:top-[160px]">
        <AuthForm mode={mode} redirect={search.redirect} expired={!!search.expired} />
      </Dialog>
    </>
  )
}

function AuthForm({ mode, redirect, expired }: { mode: Mode; redirect?: string; expired: boolean }) {
  const login = useLogin()
  const register = useRegister()
  const [v, setV] = useState({ username: '', email: '', password: '', confirmPassword: '' })
  const [errors, setErrors] = useState<Errors>({})
  const [formError, setFormError] = useState('')
  const pending = login.isPending || register.isPending
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => { setV((s) => ({ ...s, [k]: e.target.value })); setErrors((x) => ({ ...x, [k]: '' })) }

  const validate = (): Errors => {
    const e: Errors = {}
    if (mode === 'signup' && !/^[a-z0-9_]{3,20}$/.test(v.username)) e.username = 'Use de 3 a 20 caracteres: letras minúsculas, números ou _.'
    if (!EMAIL.test(v.email)) e.email = 'Informe um e-mail válido.'
    if (!v.password) e.password = 'Informe a senha.'
    else if (mode === 'signup' && (v.password.length < 8 || !/[A-Za-z]/.test(v.password) || !/\d/.test(v.password))) e.password = 'Use ao menos 8 caracteres, com letras e números.'
    if (mode === 'signup' && v.confirmPassword !== v.password) e.confirmPassword = 'As senhas não coincidem.'
    return e
  }
  const onSubmit = (ev: FormEvent) => {
    ev.preventDefault()
    setFormError('')
    const e = validate()
    setErrors(e)
    if (Object.keys(e).length) { document.getElementById(`auth-${Object.keys(e)[0]}`)?.focus(); return }
    const onError = (err: unknown) => {
      if (isApiError(err)) { setErrors(err.fieldErrors); setFormError(Object.keys(err.fieldErrors).length ? '' : err.message) }
      else setFormError('Não foi possível concluir. Tente novamente.')
    }
    if (mode === 'login') login.mutate({ email: v.email, password: v.password }, { onError })
    else register.mutate(v, { onError })
  }
  const search = { redirect }
  return (
    <div className="px-6 pb-10 pt-24 md:px-12 md:pb-8 md:pt-12">
      <p aria-hidden="true" className="mb-20 mt-10 text-center text-3xl font-bold tracking-[0.12em] md:hidden">KURIO</p>
      <div className="mb-4 hidden items-center justify-center gap-0 text-lg md:flex" aria-label="Alternar entre entrar e criar conta">
        <Link to="/login" search={search} className={mode === 'login' ? 'border-r border-accent pr-3 text-accent-hi' : 'border-r border-accent pr-3 text-ink'} aria-current={mode === 'login' ? 'page' : undefined}>Entrar</Link>
        <Link to="/cadastro" search={search} className={mode === 'signup' ? 'pl-3 text-accent-hi' : 'pl-3 text-ink'} aria-current={mode === 'signup' ? 'page' : undefined}>Criar conta</Link>
      </div>
      <h2 className="mb-7 text-center text-lg font-bold md:hidden">{mode === 'login' ? 'Entrar' : 'Criar perfil de colecionador'}</h2>
      <p className="mb-5 hidden text-center text-xs leading-5 md:block">{mode === 'login' ? 'Entre para gerenciar sua carteira, coleção e perfil de criador.' : 'Crie seu perfil de colecionador e conecte uma carteira quando quiser.'}</p>
      {expired && <p role="alert" className="mb-4 border border-accent px-3 py-2 text-xs">Sua sessão expirou. Entre novamente para continuar de onde parou.</p>}
      {formError && <p role="alert" className="mb-4 border border-danger px-3 py-2 text-xs"><span aria-hidden="true">✕ </span>{formError}</p>}
      <form onSubmit={onSubmit} noValidate className="space-y-3 md:space-y-4">
        {mode === 'signup' && <TextField id="auth-username" label="Nome de usuário" value={v.username} onChange={set('username')} error={errors.username} autoComplete="username" required wrapperClassName="max-md:[&_label]:sr-only" className="max-md:h-[50px]" />}
        <TextField id="auth-email" label="E-mail" type="email" value={v.email} onChange={set('email')} error={errors.email} placeholder="contato@email.com" autoComplete="email" required wrapperClassName="max-md:[&_label]:sr-only" className="max-md:h-[50px]" />
        <PasswordField id="auth-password" label="Senha" value={v.password} onChange={set('password')} error={errors.password} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required wrapperClassName="max-md:[&_label]:sr-only" className="max-md:h-[50px]" />
        {mode === 'signup' && <PasswordField id="auth-confirmPassword" label="Confirmar senha" value={v.confirmPassword} onChange={set('confirmPassword')} error={errors.confirmPassword} autoComplete="new-password" required wrapperClassName="max-md:[&_label]:sr-only" className="max-md:h-[50px]" />}
        {mode === 'login' && <div className="text-right"><button type="button" onClick={() => soon('A recuperação de senha')} className="text-xs text-accent-hi hover:underline">Esqueceu a senha?</button></div>}
        <div className="pt-7 md:pt-0"><Button type="submit" size="lg" aria-label={mode === 'signup' ? 'Criar conta' : undefined} className="w-full max-md:h-[60px]" disabled={pending}>{pending ? 'Aguarde…' : mode === 'login' ? 'Entrar' : mode === 'signup' ? <><span className="md:hidden">Criar perfil</span><span className="hidden md:inline">Criar conta</span></> : 'Criar conta'}</Button></div>
      </form>
      <div className="mb-1 mt-12 flex items-center gap-3 text-xs md:my-5"><span className="h-px flex-1 bg-line" /><span>Ou continue com</span><span className="h-px flex-1 bg-line" /></div>
      <div className="space-y-4 md:space-y-3">
        {['Google', 'Facebook'].map((n) => <button key={n} type="button" onClick={() => soon(`O login com ${n}`)} className="flex h-10 w-full items-center justify-center gap-2 rounded-[3px] border border-line text-xs font-bold text-muted hover:border-accent">Continuar com {n}</button>)}
      </div>
      <p className="mt-12 text-center text-sm text-muted md:hidden">
        {mode === 'login' ? <>Novo na Kurio? <Link to="/cadastro" search={search} className="text-accent-hi underline">Crie uma conta</Link></> : <>Já tem uma conta? <Link to="/login" search={search} className="text-accent-hi underline">Entre</Link></>}
      </p>
    </div>
  )
}
