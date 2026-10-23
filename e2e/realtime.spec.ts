import { expect, test } from './fixtures'

/** Todos os eventos saem do servidor Socket.IO simulado (MSW) e chegam pelo socket.io-client. */

test('preço muda com o NFT no carrinho: UI avisa, resumo atualiza e o checkout recusa cotação velha', async ({ app, page }) => {
  await app.open('/')
  await app.login()
  await app.addToCart('emerald-ape-042')
  await expect.poll(() => page.evaluate(() => window.__kurio!.realtime.connections())).toBeGreaterThan(0)
  await page.evaluate(() => window.__kurio!.realtime.updateNft('emerald-ape-042', { price: '2.00' }))
  await expect(page.getByRole('region', { name: 'Notificações' }).getByText(
    'Emerald Ape #042 mudou de 1.19 ETH para 2.00 ETH. O resumo foi atualizado.',
    { exact: true },
  )).toBeVisible()
  await expect(page.getByText('2.00 ETH').filter({ visible: true }).first()).toBeVisible()
  await page.getByRole('button', { name: 'Entendi' }).click()
  await expect(page.getByText(/mudou de 1\.19/)).toHaveCount(0)
})

test('eventos duplicados e antigos não regridem nem reaplicam efeitos', async ({ app, page }) => {
  await app.open('/nft/golden-beat-207')
  await expect.poll(() => page.evaluate(() => window.__kurio!.realtime.connections())).toBeGreaterThan(0)
  await page.evaluate(() => window.__kurio!.realtime.updateNft('golden-beat-207', { price: '3.33' }))
  await expect(page.getByText('3.33 ETH').filter({ visible: true }).first()).toBeVisible()
  await page.evaluate(() => { window.__kurio!.realtime.duplicateNftEvent('golden-beat-207'); window.__kurio!.realtime.staleNftEvent('golden-beat-207', '9.99') })
  await page.waitForTimeout(500)
  await expect(page.getByText('3.33 ETH').filter({ visible: true }).first()).toBeVisible()
  await expect(page.getByText('9.99 ETH')).toHaveCount(0)
  // cenário que entrega cada evento duas vezes: o aviso aparece uma única vez
  await app.scenario('fast', 'duplicateEvents')
  await page.evaluate(() => window.__kurio!.realtime.updateNft('golden-beat-207', { price: '4.44' }))
  await expect(page.getByText('4.44 ETH').filter({ visible: true }).first()).toBeVisible()
  await expect(page.getByRole('status').getByText('Preço atualizado para 4.44 ETH.')).toHaveCount(1)
})

test('desconexão enquanto o pedido está pendente: reconecta e recupera o estado sem nova compra', async ({ app, page }) => {
  await app.open('/', ['default']) // liquidação em 2,5 s (cenário padrão)
  await app.login()
  await app.addToCart()
  await app.checkoutAndSubmit()
  await page.getByRole('button', { name: 'Enviar pedido' }).click()
  await expect(page.getByRole('heading', { name: 'Aguardando confirmação do pagamento' })).toBeVisible()
  await page.evaluate(() => window.__kurio!.realtime.setOffline(true))
  await expect(page.getByText(/Conexão em tempo real interrompida|Reconectando/).first()).toBeVisible()
  await page.evaluate(() => window.__kurio!.realtime.setOffline(false))
  await expect(page.getByRole('heading', { name: 'Seus NFTs agora estão na sua carteira' })).toBeVisible({ timeout: 20_000 })
  const { items } = await app.api<{ items: unknown[] }>('/orders')
  expect(items).toHaveLength(1)
})

test('recarregar a página com pedido pendente retoma o mesmo pedido', async ({ app, page }) => {
  await app.open('/', ['default'])
  await app.login()
  await app.addToCart()
  await app.checkoutAndSubmit()
  await page.getByRole('button', { name: 'Enviar pedido' }).click()
  await expect(page).toHaveURL(/\/pedido\/ord_00001/)
  await page.reload()
  await expect(page).toHaveURL(/\/pedido\/ord_00001/)
  await expect(page.getByRole('heading', { name: /Aguardando confirmação|Seus NFTs agora estão/ })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Seus NFTs agora estão na sua carteira' })).toBeVisible({ timeout: 20_000 })
})

test('evento de pedido de outro usuário não aparece após troca de sessão', async ({ app, page }) => {
  await app.open('/')
  await app.login('ana@kurio.test')
  await app.addToCart()
  await app.checkoutAndSubmit()
  await page.getByRole('button', { name: 'Enviar pedido' }).click()
  await expect(page).toHaveURL(/\/pedido\/ord_/)
  await page.goto('/perfil')
  await page.getByRole('navigation', { name: 'Meu perfil' }).getByRole('button', { name: 'Sair' }).click()
  await app.login('bruno@kurio.test')
  await page.evaluate(() => window.__kurio!.realtime.settleOrder('ord_00001'))
  await page.waitForTimeout(500)
  await expect(page.getByText('Pedido confirmado.')).toHaveCount(0)
})
