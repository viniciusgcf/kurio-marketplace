import { expect, test } from './fixtures'

test('carrinho: quantidade, cupom, remoção e persistência após refresh e login', async ({ app, page }) => {
  await app.open('/')
  await app.addToCart('emerald-ape-042') // como visitante
  await page.getByRole('button', { name: /Aumentar quantidade/ }).click()
  await expect(page.getByRole('status', { name: '' }).first()).toBeAttached()
  await expect(page.getByText('2.38 ETH').filter({ visible: true }).first()).toBeVisible()

  await page.getByLabel('Código promocional').fill('NADA')
  await page.getByRole('button', { name: 'Aplicar' }).click()
  await expect(page.getByText(/Cupom inválido/)).toBeVisible()
  await page.getByLabel('Código promocional').fill('EXPIRADO')
  await page.getByRole('button', { name: 'Aplicar' }).click()
  await expect(page.getByText(/expirou/)).toBeVisible()
  await page.getByLabel('Código promocional').fill('LANCAMENTO10')
  await page.getByRole('button', { name: 'Aplicar' }).click()
  await expect(page.getByText('Cupom LANCAMENTO10 aplicado')).toBeVisible()

  await page.reload() // persistência do carrinho de visitante
  await expect(page.getByText('Emerald Ape #042').first()).toBeVisible()
  await app.login() // visitante -> autenticado: itens preservados
  await page.goto('/carrinho')
  await expect(page.getByText('Emerald Ape #042').first()).toBeVisible()

  await page.getByRole('button', { name: /Remover Emerald Ape #042 do carrinho/ }).first().click()
  await expect(page.getByText('Seu carrinho está vazio')).toBeVisible()
})

test('limite de quantidade respeita a disponibilidade da edição', async ({ app, page }) => {
  await app.open('/nft/emerald-ape-042')
  await page.getByRole('radio', { name: /Edição 1\/10/ }).check({ force: true })
  for (let i = 0; i < 12; i++) { const plus = page.getByRole('button', { name: /Aumentar quantidade/ }).first(); if (await plus.isEnabled()) await plus.click() }
  await expect(page.getByText(/Limite de \d+ unidade/).first()).toBeVisible()
})

test('compra completa: catálogo -> carrinho -> pagamento -> recibo confirmado', async ({ app, page }) => {
  await app.open('/')
  await app.login()
  await page.getByRole('link', { name: /Emerald Ape #042/ }).first().click()
  await page.getByRole('button', { name: /COMPRAR|Comprar NFT/ }).first().click()
  await app.checkoutAndSubmit()
  await expect(page.getByRole('heading', { name: 'Revisar pedido' })).toBeVisible()
  await page.getByRole('button', { name: 'Enviar pedido' }).click()
  await expect(page).toHaveURL(/\/pedido\/ord_/)
  await expect(page.getByRole('heading', { name: 'Seus NFTs agora estão na sua carteira' })).toBeVisible({ timeout: 15_000 })
  await expect(page.getByRole('cell', { name: /Emerald Ape #042/ })).toBeVisible()
  await page.reload() // o recibo é recuperável
  await expect(page.getByRole('heading', { name: 'Seus NFTs agora estão na sua carteira' })).toBeVisible()
  await page.goto('/carrinho')
  await expect(page.getByText('Seu carrinho está vazio')).toBeVisible() // só os itens comprados saíram
})

test('pagamento recusado: estado terminal e itens preservados', async ({ app, page }) => {
  await app.open('/', ['fast', 'paymentDeclined'])
  await app.login()
  await app.addToCart()
  await app.checkoutAndSubmit()
  await page.getByRole('button', { name: 'Enviar pedido' }).click()
  await expect(page.getByRole('heading', { name: /Pagamento recusado/ })).toBeVisible({ timeout: 15_000 })
  await expect(page.getByRole('heading', { name: 'Seus NFTs agora estão na sua carteira' })).toHaveCount(0)
  await page.goto('/carrinho')
  await expect(page.getByText('Emerald Ape #042').first()).toBeVisible()
})

test('clique repetido não duplica o pedido', async ({ app, page }) => {
  await app.open('/')
  await app.login()
  await app.addToCart()
  await app.checkoutAndSubmit()
  const send = page.getByRole('button', { name: 'Enviar pedido' })
  await send.dblclick({ timeout: 5000 })
  await expect(page).toHaveURL(/\/pedido\/ord_/, { timeout: 15_000 })
  const { items } = await app.api<{ items: unknown[] }>('/orders')
  expect(items).toHaveLength(1)
})

test('timeout após criar o pedido: reenvio com a mesma chave recupera o mesmo pedido', async ({ app, page }) => {
  await app.open('/', ['fast', 'orderTimeout'])
  await app.login()
  await app.addToCart()
  await app.checkoutAndSubmit()
  await page.getByRole('button', { name: 'Enviar pedido' }).click()
  await expect(page).toHaveURL(/\/pedido\/ord_00001/, { timeout: 20_000 })
  const { items } = await app.api<{ items: unknown[] }>('/orders')
  expect(items).toHaveLength(1) // a 1ª resposta se perdeu, mas não houve segundo pedido
})

test('preço alterado durante o checkout exige nova confirmação', async ({ app, page }) => {
  await app.open('/', ['fast', 'priceChanged'])
  await app.login()
  await app.addToCart()
  await app.checkoutAndSubmit()
  await page.getByRole('button', { name: 'Enviar pedido' }).click()
  await expect(page.getByText(/O valor mudou de/)).toBeVisible()
  await expect(page).toHaveURL(/\/pagamento/) // não finalizou
  await page.getByRole('button', { name: 'Confirmar novo valor' }).click()
  await expect(page).toHaveURL(/\/pedido\/ord_/)
})

test('edição esgotada durante a compra preserva os itens', async ({ app, page }) => {
  await app.open('/', ['fast', 'soldOut'])
  await app.login()
  await app.addToCart()
  await app.checkoutAndSubmit()
  await page.getByRole('button', { name: 'Enviar pedido' }).click()
  await expect(page.getByRole('alert').getByText(/não está mais disponível/)).toBeVisible()
  await page.goto('/carrinho')
  await expect(page.getByText(/não está mais disponível e não entra no total/)).toBeVisible()
})

test('conexão de carteira: recusa e desconexão', async ({ app, page }) => {
  await app.open('/', ['fast', 'walletRejected'])
  await app.login()
  await app.addToCart()
  await page.getByRole('button', { name: 'Conectar e finalizar' }).click()
  await page.getByRole('button', { name: /^Conectar/ }).click()
  await expect(page.getByText(/conexão foi recusada/i)).toBeVisible()
  await app.scenario('fast')
  await page.getByRole('button', { name: /^Conectar/ }).click()
  await expect(page.getByText(/conectada à carteira/)).toBeVisible()
  await page.getByRole('button', { name: 'Desconectar' }).click()
  await expect(page.getByRole('button', { name: /^Conectar/ })).toBeVisible()
})
