import { expect, test as base, type Page } from '@playwright/test'

/**
 * Cada teste roda num contexto novo do Playwright => localStorage/IndexedDB limpos => banco de mocks nas fixtures.
 * `?reset=1&scenario=...` garante o estado conhecido; "fast" zera a latência e acelera a liquidação do pedido.
 */
export const PASSWORD = 'Kurio#2026'
export const ANA = 'ana@kurio.test'
export const BRUNO = 'bruno@kurio.test'

export const test = base.extend<{ app: App }>({ app: async ({ page }, run) => { await run(new App(page)) } })
export { expect }

export class App {
  constructor(readonly page: Page) {}

  async open(path = '/', scenarios: string[] = ['fast']) {
    const sep = path.includes('?') ? '&' : '?'
    await this.page.goto(`${path}${sep}reset=1&scenario=${scenarios.join(',')}`)
    await this.page.waitForFunction(() => !!window.__kurio)
  }
  /** Troca de cenário em runtime (a camada MSW roda na própria página). */
  async scenario(...names: string[]) { await this.page.evaluate((n) => window.__kurio!.scenario.set(n), names) }
  async login(email = ANA) {
    await this.page.goto('/login')
    const dialog = this.page.getByRole('dialog')
    await dialog.getByLabel(/^E-mail/).fill(email)
    await dialog.getByLabel(/^Senha/).fill(PASSWORD)
    await dialog.getByRole('button', { name: 'Entrar', exact: true }).click()
    await expect(this.page).not.toHaveURL(/\/login/)
  }
  async addToCart(id = 'emerald-ape-042') {
    await this.page.goto(`/nft/${id}`)
    await this.page.getByRole('button', { name: /COMPRAR|Comprar NFT/ }).first().click()
    await expect(this.page).toHaveURL(/\/carrinho/)
  }
  /** Chama a API simulada de dentro da página (autenticada com o token da sessão). */
  api<T = unknown>(path: string) {
    return this.page.evaluate(async (p) => {
      const r = await fetch(`/api${p}`, { headers: { Authorization: `Bearer ${localStorage.getItem('kurio:token')}` } })
      return (await r.json()) as T
    }, path)
  }
  async checkoutAndSubmit() {
    await this.page.getByRole('button', { name: 'Conectar e finalizar' }).click()
    await expect(this.page).toHaveURL(/\/pagamento/)
    const connect = this.page.getByRole('button', { name: /^Conectar (MetaMask|Coinbase|WalletConnect)/ })
    await expect(connect).toBeVisible()
    await connect.click()
    await expect(this.page.getByRole('status').getByText(/conectada à carteira/i)).toBeVisible()
    await this.page.getByRole('button', { name: 'Confirmar compra' }).click()
  }
}
