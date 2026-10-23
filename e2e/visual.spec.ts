import { expect, test } from './fixtures'
import type { Page } from '@playwright/test'

/**
 * Regressão visual: início, detalhe, carrinho e pagamento, em desktop e mobile (um baseline por projeto).
 * Gere/atualize as baselines com `npm run test:e2e:update` e versione e2e/visual.spec.ts-snapshots/.
 */
const shot = (name: string) => `${name}.png`
const screenshotOptions = (page: Page) => ({ fullPage: (page.viewportSize()?.width ?? 0) >= 768 })
test('início', async ({ app, page }) => {
  await app.open('/')
  await expect(page.getByRole('link', { name: /Emerald Ape #042/ }).first()).toBeVisible()
  await page.waitForLoadState('networkidle')
  await expect(page).toHaveScreenshot(shot('inicio'), screenshotOptions(page))
})
test('detalhe', async ({ app, page }) => {
  await app.open('/nft/emerald-ape-042')
  await expect(page.getByRole('heading', { level: 1, name: 'Emerald Ape #042' })).toBeVisible()
  await page.waitForLoadState('networkidle')
  await expect(page).toHaveScreenshot(shot('detalhe'), screenshotOptions(page))
})
test('carrinho', async ({ app, page }) => {
  await app.open('/')
  await app.addToCart('emerald-ape-042')
  await page.waitForLoadState('networkidle')
  await expect(page).toHaveScreenshot(shot('carrinho'), screenshotOptions(page))
})
test('pagamento', async ({ app, page }) => {
  await app.open('/')
  await app.login()
  await app.addToCart('emerald-ape-042')
  await page.getByRole('button', { name: 'Conectar e finalizar' }).click()
  await expect(page.getByRole('heading', { name: /Perfil do colecionador|Pagamento com carteira/ }).first()).toBeVisible()
  await page.waitForLoadState('networkidle')
  await expect(page).toHaveScreenshot(shot('pagamento'), screenshotOptions(page))
})
