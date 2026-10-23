# Kurio Marketplace

Aplicação front-end em React e TypeScript para um marketplace de NFTs. A API, as sessões, as carteiras, os pagamentos e os eventos em tempo real são simulados com MSW; não é necessário um backend.

## Requisitos

- Node.js 22 ou superior
- npm 10 ou superior

## Instalação e execução

```bash
npm ci
npm run dev:mocks
```

O Vite inicia a aplicação em `http://localhost:5173`.

## Comandos

- `npm run build`: verifica os tipos e gera o build de produção.
- `npm run build:demo`: gera o build com os mocks ativados.
- `npm run preview`: serve o build em `http://localhost:4173`.
- `npm run typecheck`: executa o TypeScript.
- `npm run lint`: executa o ESLint.
- `npm run test:mocks`: verifica os handlers REST e Socket.IO simulados.
- `npx playwright install chromium`: instala o navegador usado nos testes.
- `npm run test:e2e`: executa os testes de ponta a ponta em desktop e mobile.
- `npm run test:e2e:update`: atualiza as imagens de referência dos testes visuais.
- `npm run lighthouse`: executa três medições nas páginas inicial e de detalhe, em desktop e mobile.

Para rodar os testes principais:

```bash
npm run typecheck
npm run lint
npm run test:mocks
npm run test:e2e
```

Para medir o Lighthouse, execute `npm run build:demo` e `npm run preview`. Em outro terminal, execute `npm run lighthouse`. Os resultados ficam em `lighthouse/reports/summary.md`.

## Contas de demonstração

| Nome | E-mail | Senha |
|---|---|---|
| Ana Duarte | `ana@kurio.test` | `Kurio#2026` |
| Bruno Lima | `bruno@kurio.test` | `Kurio#2026` |

Ana tem carteiras Ethereum e Polygon e um favorito inicial. Bruno tem uma carteira Ethereum e nenhum favorito. Os cupons disponíveis são `LANCAMENTO10` e `KURIO5`; `EXPIRADO` representa um cupom vencido.

## Mocks

Os mocks são ativados por padrão. `VITE_ENABLE_MOCKS=false` desativa o MSW. `VITE_API_BASE_URL` define a base da API e usa `/api` por padrão.

É possível selecionar cenários pela URL, por exemplo:

```text
http://localhost:5173/?scenario=slow,paymentDeclined
http://localhost:5173/?reset=1
```

O primeiro endereço ativa latência e recusa do pagamento. O segundo restaura os dados de demonstração.

Os cenários incluem catálogo vazio (`empty`), latência (`slow`, `jitter`), falhas de rede (`offline`), erros HTTP (`error500`, `error404`, `flaky`), sessão expirada (`sessionExpired`), mudança de preço (`priceChanged`), falta de estoque (`soldOut`), timeout do pedido (`orderTimeout`), recusa de pagamento (`paymentDeclined`) e falha ao favoritar (`favoriteFailure`).

O objeto `window.__kurio` permite controlar os mocks no console. Entre as ações disponíveis estão atualizar um NFT, encerrar conexões, alternar o modo offline e expirar sessões.

## Deploy

O projeto pode ser publicado na Vercel usando `npm run build:demo` como comando de build e `dist` como diretório de saída. O arquivo `vercel.json` configura o fallback das rotas para `index.html`. O Service Worker do MSW é servido a partir de `public/mockServiceWorker.js`.

O deploy é uma demonstração: autenticação, API, carteiras e pagamentos são simulados.

## Estrutura

- `src/contracts`: schemas Zod usados pelos tipos e contratos da API e dos eventos.
- `src/api`: cliente HTTP e validação das respostas.
- `src/app`: roteamento e configuração do cache.
- `src/realtime`: cliente Socket.IO e atualização dos dados em tempo real.
- `src/features`: funcionalidades de catálogo, carrinho, favoritos, checkout e autenticação.
- `src/routes`: páginas da aplicação.
- `src/mocks`: handlers MSW, dados de demonstração e cenários.
- `e2e`: testes Playwright.
- `lighthouse`: configuração e relatórios Lighthouse.

As decisões de arquitetura e os contratos estão descritos em [ARCHITECTURE.md](./ARCHITECTURE.md).
