import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { soon } from '@/components/layout/app-shell'
import { Catalog, MobileCatalogSearch } from '@/features/catalog/catalog'
import type { CatalogSearch } from '@/features/catalog/search'
import { cn } from '@/lib/cn'

const SLIDES = [
  { src: '/images/emerald.webp', alt: 'Macaco de óculos redondos e jaqueta verde, arte do NFT Emerald Ape' },
  { src: '/images/violet.webp', alt: 'Gorila de chapéu e moletom roxo, arte do NFT Violet Nomad' },
  { src: '/images/golden.webp', alt: 'Orangotango de fones de ouvido, arte do NFT Golden Beat' },
] as const

export function Hero() {
  const [slide, setSlide] = useState(0)
  const s = SLIDES[slide]!
  return (
    <>
      {/* Desktop */}
      <section aria-label="Destaque" className="mx-auto hidden w-full max-w-[1200px] grid-cols-[1fr_450px] items-center gap-10 px-6 pb-16 pt-3 md:grid xl:px-0">
        <div className="pl-12">
          <p className="mb-5 text-sm">Bem-vindo à Kurio</p>
          <h1 className="text-[40px] font-bold leading-[70px] tracking-wide">SEJA DONO DO FUTURO DA ARTE DIGITAL</h1>
          <p className="mt-5 max-w-lg text-sm leading-6 text-muted">Descubra NFTs selecionados de criadores emergentes e consagrados. Colecione arte digital rara, apoie artistas e tenha uma parte da cultura da internet.</p>
          <Button asChild size="lg" className="mt-6 font-bold"><Link to="/" hash="catalogo">EXPLORAR</Link></Button>
          <div role="group" aria-label="Escolher destaque" className="mt-14 flex justify-center gap-2">
            {SLIDES.map((_, i) => <button key={i} type="button" onClick={() => setSlide(i)} aria-label={`Destaque ${i + 1} de ${SLIDES.length}`} aria-pressed={i === slide} className="grid size-6 place-items-center"><span className={cn('size-2.5 rounded-full', i === slide ? 'bg-accent' : 'bg-accent/40')} /></button>)}
          </div>
        </div>
        <img src={s.src} alt={s.alt} width={450} height={450} fetchPriority="high" decoding="async" className="aspect-square w-[450px] rounded-3xl object-cover" />
      </section>
      {/* Mobile */}
      <section aria-label="Destaque" className="relative mx-5 mb-6 h-[190px] overflow-hidden rounded-3xl bg-gradient-to-br from-[#5a3a22] to-[#2c1a12] p-4 md:hidden">
        <div className="grid grid-cols-[1fr_140px] items-center gap-3">
          <div>
            <p className="text-xs">Bem-vindo à Kurio</p>
            <h1 className="mt-1 text-lg font-bold leading-6">SEJA DONO DA CULTURA DIGITAL</h1>
            <p className="mt-2 text-[11px] leading-4 text-muted">Descubra NFTs selecionados de criadores do mundo todo.</p>
            <Link to="/" hash="catalogo" className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-accent-hi">EXPLORAR <ArrowRight size={14} aria-hidden="true" /></Link>
          </div>
          <img src={s.src} alt={s.alt} width={140} height={140} fetchPriority="high" decoding="async" className="aspect-square w-[140px] self-start rounded-2xl object-cover" />
        </div>
        <img src={SLIDES[(slide + 1) % SLIDES.length]!.src} alt="" width={70} height={70} aria-hidden="true" decoding="async" className="absolute bottom-8 right-[88px] size-[70px] rounded-2xl object-cover" />
        <div role="group" aria-label="Escolher destaque" className="absolute bottom-1 left-1/2 flex -translate-x-1/2 gap-1">
          {SLIDES.map((_, i) => <button key={i} type="button" onClick={() => setSlide(i)} aria-label={`Destaque ${i + 1} de ${SLIDES.length}`} aria-pressed={i === slide} className="grid size-4 place-items-center"><span className={cn('size-1.5 rounded-full', i === slide ? 'bg-accent' : 'bg-accent/40')} /></button>)}
        </div>
      </section>
    </>
  )
}

function Promos() {
  const items = [
    { img: '/images/emerald.webp', title: 'Lançamentos gênesis de edição limitada', text: 'Colecione edições escassas diretamente dos criadores antes da revelação pública.', to: { tab: 'new' } as CatalogSearch },
    { img: '/images/ivory.webp', title: 'Arte digital selecionada e muito mais', text: 'Explore novos artistas, coleções verificadas e obras digitais que definem a cultura.', to: { category: 'arte-digital' } as CatalogSearch },
  ]
  return (
    <section aria-label="Explorar mais" className="mx-auto mt-20 hidden w-full max-w-[1200px] gap-5 px-6 md:grid md:grid-cols-2 xl:px-0">
      {items.map((p) => (
        <article key={p.title} className="grid grid-cols-[200px_1fr] items-center gap-5 bg-surface pr-6">
          <img src={p.img} alt="" width={200} height={176} loading="lazy" decoding="async" className="h-44 w-[200px] object-cover" />
          <div className="text-right"><h2 className="text-lg font-bold leading-6">{p.title}</h2><p className="mt-2 text-xs leading-5 text-muted">{p.text}</p>
            <Button asChild size="sm" className="mt-3"><Link to="/" search={p.to} hash="catalogo">Explorar <ArrowRight size={14} aria-hidden="true" /></Link></Button></div>
        </article>
      ))}
    </section>
  )
}

function Journal() {
  const posts = [
    ['/images/ivory.webp', '12 de setembro', '6', 'Como funciona a propriedade de NFTs', 'Aprenda a colecionar, negociar e verificar ativos digitais.'],
    ['/images/emerald.webp', '13 de setembro', '2', '10 artistas digitais para acompanhar', 'Conheça criadores que moldam a cultura digital.'],
    ['/images/violet.webp', '15 de setembro', '3', 'Raridade, atributos e procedência', 'Entenda raridade, procedência, direitos autorais e utilidade.'],
    ['/images/golden.webp', '15 de setembro', '2', 'Como proteger sua carteira', 'Proteja sua carteira, seus ativos e sua identidade.'],
  ] as const
  return (
    <section aria-labelledby="diario" className="mx-auto mt-24 hidden w-full max-w-[1200px] px-6 md:block xl:px-0">
      <h2 id="diario" className="text-center text-3xl font-bold">Diário da Cunhagem</h2>
      <p className="mt-3 text-center text-sm text-muted">Histórias, guias e insights para colecionadores sobre o universo da propriedade digital.</p>
      <ul className="mt-8 grid gap-5 lg:grid-cols-4">
        {posts.map(([img, date, min, title, text]) => (
          <li key={title} className="bg-surface">
            <img src={img} alt="" width={280} height={160} loading="lazy" decoding="async" className="h-40 w-full object-cover object-top" />
            <div className="p-4"><p className="text-[10px] text-faint">{date} | Leitura de {min} min</p><h3 className="mt-2 font-bold leading-5">{title}</h3><p className="mt-2 text-xs leading-5 text-muted">{text}</p>
              <button type="button" onClick={() => soon('Esta matéria')} className="mt-3 text-xs font-bold text-accent-hi">Ler mais →</button></div>
          </li>
        ))}
      </ul>
    </section>
  )
}

export function HomeView({ search, onChange }: { search: CatalogSearch; onChange: (p: Partial<CatalogSearch>) => void }) {
  return (
    <>
      <div className="pt-10 md:pt-0">
        <MobileCatalogSearch search={search} onChange={onChange} className="mx-5 mb-3" />
        <Hero />
      </div>
      <Catalog search={search} onChange={onChange} showMobileSearch={false} />
      <Promos />
      <Journal />
    </>
  )
}

export default function HomeRoute() {
  const search = useSearch({ from: '/' })
  const navigate = useNavigate()
  // Qualquer mudança de filtro/busca/ordem zera a paginação; a navegação gera entrada no histórico (voltar restaura).
  const onChange = (patch: Partial<CatalogSearch>) =>
    void navigate({ to: '/', search: (prev) => ({ ...prev, page: undefined, ...patch }), hash: 'catalogo', resetScroll: false })
  return <HomeView search={search} onChange={onChange} />
}
