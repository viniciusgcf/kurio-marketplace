# Arquitetura, decisões e limitações

## Stack e responsabilidades

| Tecnologia | Papel real na solução |
|---|---|
| TanStack Router | Rotas code-split, **busca na URL** (catálogo), guard de rotas privadas (`beforeLoad`) com retorno ao ponto original, `notFound` |
| TanStack Query | Todo estado remoto; chaves isoladas por usuário; atualização otimista (favoritos); cache atualizado por eventos |
| Axios | Único cliente REST: token, `X-Cart-Token`, timeout, normalização de erros (`ApiError`), tratamento central de sessão perdida |
| Zod | Contratos tipados: o cliente **valida cada resposta**; os handlers usam os mesmos tipos |
| MSW | Mocks na camada de rede (REST + WebSocket); app, hooks e Axios não têm resposta fictícia (regra de lint impede importar `src/mocks`) |
| Socket.IO | `socket.io-client` real no app; servidor simulado via `@mswjs/socket.io-binding` |
| Tailwind + shadcn/ui | Tokens do Figma em `index.css`; componentes no padrão shadcn (Radix + CVA) em `components/ui` |
| decimal.js | ETH sempre como **string decimal**; aritmética em `lib/money.ts` |

## Contratos REST (`/api`, definidos em `src/contracts`)

| Recurso | Operações | Erros representados |
|---|---|---|
| Sessão | `POST /auth/register`, `POST /auth/login`, `GET /auth/session`, `POST /auth/logout` | 409 `EMAIL_TAKEN`/`USERNAME_TAKEN`, 422 validação (`fieldErrors`), 401 `INVALID_CREDENTIALS`/`UNAUTHENTICATED`/`SESSION_EXPIRED` |
| NFTs | `GET /nfts?q&category&network&minPrice&maxPrice&tab&sort&page`, `GET /nfts/:id` | 404 `NOT_FOUND`, 5xx `TRANSIENT` |
| Favoritos | `GET /favorites`, `PUT|DELETE /favorites/:nftId` | 401, 500 |
| Carrinho | `GET /cart`, `POST /cart/items`, `PATCH|DELETE /cart/items/:nftId~:edição`, `PUT|DELETE /cart/coupon`, `POST /cart/acknowledge` | 409 `AVAILABILITY_CONFLICT`, 422 `COUPON_INVALID`/`COUPON_EXPIRED` |
| Cotação | `POST /quote` (rede, cupom) → subtotal, desconto, taxa de rede, total, `quoteId` | 422 cupom |
| Pedidos | `POST /orders` (**`Idempotency-Key`**), `GET /orders`, `GET /orders/:id` | 409 `QUOTE_CHANGED` (com a nova cotação), `AVAILABILITY_CONFLICT`, `IDEMPOTENCY_CONFLICT`, `WALLET_NOT_CONNECTED` |
| Perfil | `GET|PATCH /profile` (inclui avatar), `POST /profile/password` | 422 por campo, 409 conflito |
| Carteiras | `GET /wallets`, `PUT /wallets/primary|secondary`, `DELETE /wallets/secondary` | 422 por campo (endereço), 409 duplicada |
| Conexão de carteira | `GET|PUT|DELETE /wallet/connection` | 409 `WALLET_REJECTED` |

**Pedido idempotente:** mesma chave + mesmo corpo ⇒ devolve o mesmo pedido (`Idempotent-Replay: true`); mesma chave + corpo diferente ⇒ 409.
O cliente gera a chave por **conteúdo** (persistida em `sessionStorage`), então refresh e reenvio reutilizam a chave; conteúdo novo (ex.: cotação nova) gera chave nova.
**Cotação como referência:** `quoteId` é um hash de preços, quantidades efetivas, cupom, rede e taxa. O pedido só é criado se o `quoteId` enviado ainda for o atual; senão 409 com a nova cotação, e o usuário precisa confirmar de novo.
**Recibo:** snapshot imutável dos itens/valores no momento da criação; `txId` e link só existem após `confirmed`.

## Eventos Socket.IO

| Evento | Payload (`id` estável, `resource`, `version`) | Efeito no cliente |
|---|---|---|
| `nft.updated` | `{ id, type, resource:{nft,id}, version, data:{ price, previousPrice, editions[{id,available}] } }` | Atualiza detalhe e listas; se o NFT está no carrinho, **rebusca o carrinho** (cotação da API) e avisa |
| `order.updated` | `{ id, type, resource:{order,id}, userId, version, data:{ status, txId, declineReason } }` | Atualiza o pedido; confirmação/recusa terminais; invalida carrinho |
| `session.subscribe` (cliente→servidor) | `{ token }` | O servidor associa a conexão ao usuário; eventos privados só chegam ao dono |

**Regras do cliente (`src/realtime/client.ts`):** (1) reentrega com mesmo `id` é ignorada; (2) evento com `version <= atual` é descartado (nunca regride); (3) `order.updated` de outro `userId` é descartado; (4) após **reconexão** invalida e refaz por REST o que está ativo (catálogo, carrinho, dados privados); (5) o socket é criado por sessão e, no cleanup, tem listeners removidos e é desconectado (troca de usuário/logout); (6) `GET /orders/:id` faz polling de 4 s enquanto pendente como rede de segurança.

## Sessão

Token opaco de 8 h em `localStorage` (simula cookie httpOnly; senha nunca guardada). A sessão é resolvida no `beforeLoad` da raiz. Qualquer 401 `SESSION_EXPIRED`/`UNAUTHENTICATED` com token presente dispara o handler central: limpa token, cache privado e leva a `/login?redirect=<URL atual>&expired=1`; o retorno é validado (`safeRedirect`, sem open redirect). O formulário de checkout é guardado em `sessionStorage` (sem dados sensíveis) e é restaurado após novo login. Logout e troca de usuário: `purgePrivateCache` (todas as chaves `['user', …]` e `['cart', …]`), novo token de visitante e novo socket.

## Carrinho

O servidor é a fonte de verdade. Visitante usa `X-Cart-Token`; ao autenticar, o servidor **mescla** o carrinho do visitante no do usuário (limite de 10 por item/edição). Persiste em refresh (banco dos mocks em `localStorage`). Cada item traz `status` (`ok | price_changed | reduced | unavailable`) e `addedPrice`; “Entendi” chama `POST /cart/acknowledge`. Após pedido confirmado o servidor remove **somente** itens e quantidades comprados; em falha/recusa tudo é preservado e o estoque reservado é devolvido.

## Cache (TanStack Query)

`staleTime` 30 s (catálogo/detalhe), 10 s (carrinho), 0 (cotação e pedido), ∞ (sessão); `gcTime` 5 min. **Retry:** só erros transitórios (rede/timeout/5xx), máx. 2, backoff 1 s/2 s; 4xx nunca repete; mutations não repetem sozinhas — o pedido é a exceção (3 tentativas com a **mesma chave**). Respostas obsoletas são descartadas por **chave** (parâmetros na chave) + `AbortSignal` do Query; `keepPreviousData` evita piscar na paginação (a UI marca `aria-busy`). Atualização otimista com rollback: favoritos (`onMutate` → `onError` restaura → `onSettled` invalida).

## Mocks e Socket.IO — o que foi descoberto e como ficou

1. **Ordem de inicialização.** `engine.io-client` captura `globalThis.WebSocket` ao ser **importado**. Se o app importar `socket.io-client` antes de o MSW ligar, o socket nunca é interceptado. Por isso `main.tsx` sobe os mocks e **só depois** importa o app dinamicamente.
2. **Padrão de URL do `ws.link`.** O MSW remove o prefixo `/socket.io/` da URL do cliente antes de comparar; o handler é registrado só com a **origem**. Isso também captura o WebSocket de HMR do Vite; o handler repassa tudo que não é Socket.IO (`server.connect()`).
3. **Keep-alive.** O binding envia o handshake, mas não os pings do engine.io; sem ping o cliente cai após ~30 s. O handler envia `2` a cada 20 s.
4. **Limitações do binding:** apenas eventos fire-and-forget na namespace `/`, sem acks, rooms ou broadcast; só transporte WebSocket (o cliente usa `transports: ['websocket']`). A autenticação do socket é um evento `session.subscribe` (não o `auth` do handshake).
5. **Versões.** `@mswjs/socket.io-binding` exige MSW 2.x; o MSW 3 usa outra versão do `interceptors`. O projeto fixa **msw 2.15.0**.

## Decisões de UX e desvios do Figma

- **Assets:** não havia arquivo de assets; as imagens dos NFTs foram **recortadas dos frames exportados** (4 artes únicas, reutilizadas nos 54 NFTs, como no próprio Figma), em WebP. Resolução limitada pela origem (~230–420 px). Trocar por originais é só substituir `public/images/*`.
- **Itens fora do escopo** (Criadores, Aprenda, Atividade, Ofertas, Lista de interesse, “Ler mais”, newsletter, redes sociais, login Google/Facebook, “Esqueceu a senha?”, compartilhar, avaliações): permanecem visíveis como no layout, mas **não simulam sucesso** — avisam “ainda não está disponível”. “Mercado” leva ao catálogo.
- **Pagamento:** o Figma mostra o endereço da carteira digitado no checkout; seguindo o enunciado (“usar as carteiras cadastradas”) o usuário **seleciona** uma carteira cadastrada, escolhe a rede, conecta (simulado) e **revisa** antes de enviar.
- **Mobile sem frame** (perfil, carteiras, confirmação, tablet): derivados do mesmo padrão visual (navegação do perfil em linha, tabela de recibo responsiva).
- **Selects:** `<select>` nativo estilizado (teclado e leitores de tela corretos, picker nativo no mobile) em vez de Radix Select. **shadcn/ui:** o CLI exige rede para `ui.shadcn.com`; os componentes foram escritos à mão no mesmo padrão (Radix + CVA + `cn`).
- **Nome ENS** é obrigatório nas carteiras (como no Figma) e opcional no perfil.
- **Contagens de coleções/redes:** vêm da API (facetas reais do dataset de 54 NFTs), não dos números do Figma.
- **Acessibilidade acrescentada:** link “Pular para o conteúdo”, anúncios `aria-live` (resultados, mutations, eventos), erros por campo com `aria-describedby`, preço anterior com texto para leitores de tela, foco preso/devolvido em diálogos (Radix), `prefers-reduced-motion` no shimmer.

## Performance (expectativas e riscos conhecidos)

- Code-split por rota; fontes e imagens locais (WebP, `width/height`, `fetchpriority=high` no LCP, `lazy` abaixo da dobra); skeletons com dimensões fixas (CLS).
- O cliente Socket.IO é carregado de forma assíncrona após a montagem inicial, preservando o status realtime e a reconciliação. O chunk inicial do AppShell caiu de ~250 kB para ~120 kB (41 kB gzip); o cliente realtime segue em um chunk separado.
- **Custo estrutural dos mocks:** o chunk do MSW (~470 kB, ~175 kB gzip) carrega em todas as páginas, porque o requisito é auditar **com** os mocks e sem simplificações. É a principal causa esperada de TBT/LCP acima da meta no perfil mobile.
- O hero e as artes são upscales de baixa resolução; a nitidez, não o peso, é o limite.

## Estado da verificação (leia antes de avaliar)

| Item | Estado |
|---|---|
| `tsc`, ESLint, build de produção | ✅ executados e limpos |
| `npm run test:mocks` (52 verificações: catálogo, filtros, cadastro/login, carrinho, cupom, idempotência, preço/estoque, timeout, recusa, sessão, perfil, carteiras, Socket.IO real com isolamento entre usuários) | ✅ passando |
| Testes Playwright (74 = 37 × 2 viewports) | ✅ **71 passaram; 3 casos de filtros exclusivos de desktop foram pulados no mobile**. Executados em Chromium no Windows |
| Baselines de regressão visual | ✅ **8 baselines** para início, detalhe, carrinho e pagamento, desktop e mobile; desktop captura a página inteira e mobile captura a viewport, como nos frames do Figma |
| Lighthouse (12 execuções; 3 por página/perfil) | ⚠️ última rodada: Performance mobile 86 (início) e 89 (detalhe), abaixo da meta interna configurada de 90; desktop 99 e 90. Acessibilidade, Best Practices e SEO atingiram as metas. A imagem LCP foi pré-carregada e o cliente realtime saiu do chunk inicial; o gargalo mobile restante inclui o carregamento dos mocks. Medianas, LCP/CLS/TBT e relatórios estão em `lighthouse/reports/summary.md`. |
| Fidelidade visual ao Figma | ⚠️ os 15 frames foram comparados; composição mobile da home, detalhe, login, cadastro e carrinho foi ajustada. Perfil, carteiras e recibo seguem a estrutura dos frames. Permanecem diferenças de conteúdo de demonstração (itens/valores) e o pagamento mantém seleção das carteiras salvas, conforme o requisito |
| Deploy | ⏳ pendente: rewrite de SPA pronto em `vercel.json`; este ambiente não tem projeto Vercel vinculado nem autenticação configurada |
