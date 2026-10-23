import { Link, useNavigate, useRouter } from '@tanstack/react-router'
import { Bell, ChevronLeft, CircleUser, Download, Heart, LogOut, MapPin, ShoppingBasket, TriangleAlert } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { useLogout } from '@/features/auth/hooks'
import { cn } from '@/lib/cn'
import { container, soon } from './app-shell'

const SOON = [[ShoppingBasket, 'Atividade'], [Heart, 'Lista de interesse'], [Bell, 'Ofertas'], [Download, 'Arquivos baixados'], [TriangleAlert, 'Suporte']] as const

export function ProfileLayout({ active, title, children }: { active: 'perfil' | 'carteiras'; title: string; children: ReactNode }) {
  const logout = useLogout()
  const navigate = useNavigate()
  const router = useRouter()
  const row = 'flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-accent hover:text-accent-hi'
  return (
    <div className={cn(container, 'pb-10 pt-4 md:pt-8')}>
      <div className="mb-4 flex items-center gap-4 md:hidden"><Button variant="quiet" size="icon" className="size-10" onClick={() => router.history.back()} aria-label="Voltar"><ChevronLeft size={20} aria-hidden="true" /></Button><p className="flex-1 pr-10 text-center text-lg font-bold">Meu perfil</p></div>
      <div className="grid gap-8 lg:grid-cols-[310px_minmax(0,1fr)] lg:gap-7">
        <nav aria-label="Meu perfil" className="bg-surface lg:self-start">
          <p className="px-4 pb-2 pt-3 text-lg font-bold max-lg:hidden">Meu perfil</p>
          <ul className="flex overflow-x-auto lg:block">
            <li><Link to="/perfil" aria-current={active === 'perfil' ? 'page' : undefined} className={cn(row, active === 'perfil' && 'border-l-4 border-accent font-bold text-accent-hi')}><CircleUser size={18} aria-hidden="true" />Dados do perfil</Link></li>
            <li><Link to="/perfil/carteiras" aria-current={active === 'carteiras' ? 'page' : undefined} className={cn(row, active === 'carteiras' && 'border-l-4 border-accent font-bold text-accent-hi')}><MapPin size={18} aria-hidden="true" />Carteiras</Link></li>
            {SOON.map(([Icon, label]) => <li key={label} className="max-lg:hidden"><button type="button" onClick={() => soon(label)} className={row}><Icon size={18} aria-hidden="true" />{label}</button></li>)}
            <li className="border-t border-line max-lg:ml-auto max-lg:border-0"><button type="button" onClick={() => logout.mutate(undefined, { onSettled: () => void navigate({ to: '/' }) })} className={cn(row, 'font-bold')}><LogOut size={18} aria-hidden="true" />Sair</button></li>
          </ul>
        </nav>
        <section aria-labelledby="titulo-pagina"><h1 id="titulo-pagina" className="mb-5 text-lg font-bold">{title}</h1>{children}</section>
      </div>
    </div>
  )
}
