import { expect, test } from './fixtures'

test.describe('catálogo', () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 1024, 'filtros laterais são desktop; mobile coberto em responsive.spec')

  test('busca, filtros combinados, ordenação, paginação e histórico', async ({ app, page }) => {
    await app.open('/')
    await expect(page.getByRole('link', { name: /Emerald Ape #042/ }).first()).toBeVisible()

    await page.getByRole('checkbox', { name: /Música/ }).check()
    await expect(page).toHaveURL(/category=musica/)
    await page.getByRole('checkbox', { name: /Ethereum/ }).check()
    await expect(page).toHaveURL(/category=musica/)
    await expect(page).toHaveURL(/network=ethereum/)
    const cards = page.getByRole('list').filter({ has: page.getByRole('link', { name: /Ver detalhes/ }) })
    await expect(cards.getByRole('link', { name: /Cosmic Bloom #118/ }).first()).toBeVisible() // música + ethereum

    await page.getByLabel('Ordenar por:').selectOption('price-desc')
    await expect(page).toHaveURL(/sort=price-desc/)

    // paginação: página 2 entra na URL e mudar filtro reinicia a paginação
    await page.getByRole('checkbox', { name: /Música/ }).uncheck()
    await page.getByRole('checkbox', { name: /Ethereum/ }).uncheck()
    await page.getByRole('button', { name: 'Página 2' }).click()
    await expect(page).toHaveURL(/page=2/)
    await page.getByRole('checkbox', { name: /Solana/ }).check()
    await expect(page).not.toHaveURL(/page=/)

    // histórico restaura o estado anterior
    await page.goBack()
    await expect(page).toHaveURL(/page=2/)
    await expect(page.getByRole('button', { name: 'Página 2' })).toHaveAttribute('aria-current', 'page')

    // refresh preserva o estado vindo da URL
    await page.reload()
    await expect(page).toHaveURL(/page=2/)
    await expect(page.getByRole('button', { name: 'Página 2' })).toHaveAttribute('aria-current', 'page')
  })

  test('resultado vazio e limpar filtros', async ({ app, page }) => {
    await app.open('/?q=zzzz-inexistente')
    await expect(page.getByText('Nenhum NFT encontrado')).toBeVisible()
    await page.getByRole('button', { name: 'Limpar filtros' }).click()
    await expect(page.getByRole('link', { name: /Emerald Ape #042/ }).first()).toBeVisible()
  })

  test('respostas fora de ordem: a lista final corresponde ao último filtro', async ({ app, page }) => {
    await app.open('/', ['outOfOrder'])
    await expect(page.getByRole('link', { name: /Emerald Ape #042/ }).first()).toBeVisible({ timeout: 15_000 })
    await page.getByRole('checkbox', { name: /Música/ }).check()
    await page.getByRole('checkbox', { name: /Ethereum/ }).check()
    await expect(page.getByRole('status').filter({ hasText: /NFTs encontrados/ })).toContainText(/encontrados/, { timeout: 15_000 })
    await expect(page).toHaveURL(/network=ethereum/)
    // a 1ª resposta (lenta) pode chegar depois da 2ª, mas só a consulta da URL atual é exibida
    await page.waitForTimeout(2000)
    await expect(page.getByRole('checkbox', { name: /Ethereum/ })).toBeChecked()
    for (const l of await page.getByRole('link', { name: /Ver detalhes de/ }).all()) await expect(l).toBeAttached()
  })
})

test('acesso direto ao detalhe e NFT inexistente', async ({ app, page }) => {
  await app.open('/nft/emerald-ape-042')
  await expect(page.getByRole('heading', { name: 'Emerald Ape #042', level: 1 })).toBeVisible()
  await page.goto('/nft/nao-existe')
  await expect(page.getByRole('heading', { name: 'NFT não encontrado' })).toBeVisible()
  await page.goto('/rota-inexistente')
  await expect(page.getByRole('heading', { name: 'Página não encontrada' })).toBeVisible()
})

test('skeletons em carregamento lento, erro e recuperação por nova tentativa', async ({ app, page }) => {
  await app.open('/', ['slow'])
  await expect(page.locator('[aria-busy="true"] .skeleton').first()).toBeVisible()
  await expect(page.getByRole('link', { name: /Emerald Ape #042/ }).first()).toBeVisible({ timeout: 15_000 })

  await app.scenario('error500')
  await page.goto('/?q=ape')
  await expect(page.getByRole('alert').getByText('Não foi possível carregar o catálogo')).toBeVisible({ timeout: 20_000 })
  await app.scenario('fast') // a camada de mocks é recriada no reload; aqui só alteramos o cenário em memória
  await page.getByRole('button', { name: 'Tentar novamente' }).click()
  await expect(page.getByRole('link', { name: /Emerald Ape #042/ }).first()).toBeVisible()
})
