import { expect, test } from './fixtures'

const ROUTES = ['/', '/nft/emerald-ape-042', '/carrinho', '/login', '/cadastro']
for (const width of [390, 768, 1440]) {
  test(`sem overflow horizontal em ${width}px`, async ({ app, page }) => {
    await page.setViewportSize({ width, height: 900 })
    await app.open('/')
    for (const r of ROUTES) {
      await page.goto(r)
      await page.waitForLoadState('networkidle')
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
      expect(overflow, `${r} a ${width}px`).toBeLessThanOrEqual(1)
    }
  })
}
