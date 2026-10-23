# Kurio — Marketplace de NFTs

Front-end do desafio em **React + TypeScript**, com **TanStack Router/Query**, **Axios**, **Tailwind**, componentes no estilo **shadcn/ui**,
**MSW** (REST + Socket.IO), **Playwright** e **Lighthouse**. Tudo roda sem backend: a API, a sessão, as carteiras, os pagamentos e o tempo real são simulados na camada de rede.

> Decisões de arquitetura, contratos, política de cache/sessão, limitações e desvios do Figma: **[ARCHITECTURE.md](./ARCHITECTURE.md)**.

## Setup

Requisitos: Node 22+ e npm 10+.

```bash
npm ci
cp .env.example .env.local   # opcional: os padrões já funcionam
npm run dev:mocks            # http://localhost:5173 com mocks ligados
```

### Variáveis de ambiente

| Variável | Padrão | Efeito |
|---|---|---|
| `VITE_ENABLE_MOCKS` | ligado (qualquer valor ≠ `false`) | Liga o MSW (REST + Socket.IO). O build de demonstração e o deploy usam `true`. |
| `VITE_API_BASE_URL` | `/api` | Base do cliente Axios. Com mocks, é interceptada pelo MSW. |

## Credenciais fictícias

| Usuário | E-mail | Senha | Perfil |
|---|---|---|---|
| Ana Duarte | `ana@kurio.test` | `Kurio#2026` | Carteira principal (Ethereum) + secundária (Polygon); favorito inicial |
| Bruno Lima | `bruno@kurio.test` | `Kurio#2026` | Só carteira principal; sem favoritos |

Cupons: `LANCAMENTO10` (10%), `KURIO5` (5%), `EXPIRADO` (expirado). Qualquer outro código é inválido.
As senhas ficam no banco dos mocks como SHA-256 com sal; nenhuma senha é guardada em claro.

## Comandos

| Comando | O que faz |
|---|---|
| `npm run dev` / `npm run dev:mocks` | Desenvolvimento (mocks ligados por padrão) |
| `npm run build` | Typecheck + build de produção |
| `npm run build:demo` | Build de demonstração (mocks garantidamente ligados) |
| `npm run preview` | Serve o build em `http://localhost:4173` |
| `npm run typecheck` | `tsc -b --noEmit` |
| `npm run lint` | ESLint (inclui a regra “o app não importa os mocks”) |
| `npm run test:mocks` | 52 verificações de contrato dos handlers + Socket.IO real, em Node, sem navegador |
| `npx playwright install chromium` | Baixa o navegador (uma vez) |
| `npm run test:e2e` | E2E em Chromium desktop (1440) e mobile (390); relatório em `playwright-report/` |
| `npm run test:e2e:update` | Gera/atualiza as baselines de regressão visual |
| `npm run lighthouse` | 3 medições × (início, detalhe) × (mobile, desktop); mediana em `lighthouse/reports/summary.md` |

Fluxo completo de qualidade: `npm run typecheck && npm run lint && npm run test:mocks && npm run test:e2e`.
Para o Lighthouse: `npm run build:demo && npm run preview` e, em outro terminal, `npm run lighthouse`.

## Cenários dos mocks (seleção e reset)

Selecione pela URL (persiste em `localStorage`; combine com vírgula) ou pelo console:

```
http://localhost:5173/?scenario=slow,paymentDeclined     # aplica e remove o parâmetro da URL
http://localhost:5173/?reset=1                           # restaura integralmente as fixtures + cenário padrão
> __kurio.scenario.set(['jitter'])   > __kurio.reset()   > __kurio.presets
```

| Cenário | Efeito reproduzível |
|---|---|
| `default` / `success` | Latência 120–320 ms, pedido liquida em 2,5 s, pagamento confirmado |
| `fast` | Sem latência; liquidação em 0,4 s (usado nos testes) |
| `empty` | Catálogo vazio |
| `slow` / `jitter` | Latência de 2,5–3,5 s / variável de 80 ms a 2,2 s (PRNG com semente) |
| `outOfOrder` | 1ª listagem lenta, 2ª rápida: respostas chegam fora de ordem |
| `offline` | Toda requisição REST falha sem resposta (erro de conexão) |
| `error500` / `error404` | `GET /nfts` responde HTTP 500 / 404 |
| `flaky` | A 1ª tentativa de cada GET responde 503; a repetição funciona |
| `sessionExpired` | A próxima requisição autenticada responde 401 `SESSION_EXPIRED` (uso único) |
| `forbidden` | Endpoints privados respondem 403 |
| `priceChanged` | O preço do 1º item muda ao enviar o pedido (409 `QUOTE_CHANGED`) — uso único |
| `soldOut` | A edição do 1º item esgota ao enviar o pedido (409 `AVAILABILITY_CONFLICT`) — uso único |
| `orderTimeout` | O pedido é criado, mas a resposta se perde; reenviar com a mesma chave recupera o pedido — uso único |
| `paymentDeclined` / `paymentConfirmed` | Pedido termina recusado / confirmado |
| `walletRejected` | A conexão da carteira é recusada |
| `favoriteFailure` | Favoritar/desfavoritar responde 500 (testa o rollback otimista) |
| `duplicateEvents` | Cada evento Socket.IO é entregue duas vezes |

Cenários sem preset (conflito de cadastro, cupom inválido/expirado, validação de formulários) são determinísticos pelos dados:
cadastre com `ana@kurio.test` (409), use `NADA`/`EXPIRADO` no cupom, ou `ab` como usuário (422).

### Controle em tempo de execução (`window.__kurio`)

Usado pelo Playwright e útil em demonstrações. Todo evento passa pelo **servidor Socket.IO simulado e chega pelo `socket.io-client`**:
`realtime.updateNft(id, {price, availability})`, `duplicateNftEvent`, `staleNftEvent`, `settleOrder`, `dropConnections()`, `setOffline(bool)`, `session.expireAll()`.

## Reproduzir os fluxos de falha

1. **Preço mudando no carrinho:** entre como Ana, adicione “Emerald Ape #042”, abra `/carrinho` e no console: `__kurio.realtime.updateNft('emerald-ape-042', { price: '2.00' })`. O aviso aparece, o resumo atualiza e o checkout só confirma com a cotação nova.
2. **Timeout com recuperação:** `/?scenario=fast,orderTimeout` → compre. A 1ª resposta se perde; o app reenvia com a mesma chave e termina no mesmo pedido (`ord_00001`), sem duplicar.
3. **Desconexão com pedido pendente:** `/?scenario=default`, envie o pedido e rode `__kurio.realtime.setOffline(true)`; depois `setOffline(false)` ou recarregue a página. O estado é recuperado por REST + reconciliação.
4. **Sessão expirando no checkout:** `__kurio.session.expireAll()` e confirme a compra → login com retorno a `/pagamento`; o rascunho do formulário é preservado.

## Deploy (Vercel)

`vercel.json` já faz o rewrite de SPA (acesso direto e refresh em qualquer rota). Configure **Build Command** `npm run build:demo` e **Output** `dist`.
O Service Worker do MSW (`public/mockServiceWorker.js`) é servido da raiz. Nenhuma variável é obrigatória.

## Estrutura

```
src/contracts   schemas Zod = tipos e contratos REST/eventos (única fonte de verdade)
src/api         Axios + validação das respostas (cliente HTTP, sem dados fictícios)
src/app         roteador, política de cache, chaves de query por usuário
src/realtime    socket.io-client: dedupe por id/versão, reconciliação após reconexão
src/features    hooks de domínio (carrinho, favoritos, catálogo, checkout, auth)
src/routes      telas (code-split por rota)
src/mocks       MSW: handlers REST, servidor Socket.IO, fixtures, cenários, banco persistido
e2e             Playwright · lighthouse  auditoria · scripts  verificação de contratos
```
