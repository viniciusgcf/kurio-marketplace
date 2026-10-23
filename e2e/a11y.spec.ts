import { expect, test } from './fixtures'

test('teclado: link de pular, foco visível e foco preso/devolvido no diálogo de login', async ({ app, page }) => {
  await app.open('/')
  const skipLink = page.getByRole('link', { name: 'Pular para o conteúdo' })
  await expect(skipLink).toBeAttached()
  await page.keyboard.press('Tab')
  await expect(skipLink).toBeFocused()
  await page.getByRole('link', { name: 'Entrar' }).first().focus()
  const outline = await page.evaluate(() => getComputedStyle(document.activeElement!).outlineStyle)
  expect(outline).not.toBe('none') // foco visível

  await page.goto('/login')
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab')
    expect(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))).toBe(true) // foco preso
  }
  await page.keyboard.press('Escape')
  await expect(page).toHaveURL('/')
})

test('formulário: erros associados ao campo (aria-invalid + aria-describedby) e anunciados', async ({ app, page }) => {
  await app.open('/login')
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: 'Entrar', exact: true }).click()
  const email = dialog.getByLabel(/^E-mail/)
  await expect(email).toHaveAttribute('aria-invalid', 'true')
  const describedby = await email.getAttribute('aria-describedby')
  await expect(page.locator(`#${describedby}`)).toHaveText(/e-mail válido/)
  await expect(page.locator(`#${describedby}`)).toHaveAttribute('role', 'alert')
})

test('imagens relevantes têm alternativa textual', async ({ app, page }) => {
  await app.open('/')
  const imgs = page.locator('main img:not([alt=""])')
  for (const img of await imgs.all()) expect((await img.getAttribute('alt'))!.length).toBeGreaterThan(3)
})

test('prefers-reduced-motion desliga o shimmer dos skeletons', async ({ app, page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await app.open('/', ['slow'])
  const anim = await page.locator('.skeleton').first().evaluate((el) => getComputedStyle(el).animationName)
  expect(anim === 'none' || (await page.locator('.skeleton').first().evaluate((el) => getComputedStyle(el).animationDuration)) !== '1.4s').toBe(true)
})
