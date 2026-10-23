import { ANA, BRUNO, expect, PASSWORD, test } from './fixtures'

test('cadastro: validação, conflito de e-mail e criação de conta', async ({ app, page }) => {
  await app.open('/cadastro')
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: 'Criar conta', exact: true }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'Informe um e-mail válido.' })).toBeVisible()
  await dialog.getByLabel(/^Nome de usuário/).fill('novo_user')
  await dialog.getByLabel(/^E-mail/).fill(ANA) // já existe
  await dialog.getByLabel(/^Senha/).fill('Senha1234')
  await dialog.getByLabel(/^Confirmar senha/).fill('Senha1234')
  await dialog.getByRole('button', { name: 'Criar conta', exact: true }).click()
  await expect(page.getByText('Já existe uma conta com este e-mail.')).toBeVisible()
  await dialog.getByLabel(/^E-mail/).fill('novo@kurio.test')
  await dialog.getByRole('button', { name: 'Criar conta', exact: true }).click()
  await expect(page).toHaveURL('/')
  if (page.viewportSize()!.width < 768) {
    await page.getByRole('navigation', { name: 'Navegação móvel' }).getByRole('link', { name: 'Meu perfil' }).click()
    await expect(page.getByRole('heading', { name: 'Perfil do colecionador' })).toBeVisible()
    await expect(page.getByLabel(/^Nome de usuário/)).toHaveValue('novo_user')
  } else {
    await expect(page.getByRole('link', { name: /novo_user/ })).toBeVisible()
  }
})

test('login inválido, retorno ao fluxo anterior e rota privada', async ({ app, page }) => {
  await app.open('/pagamento')
  await expect(page).toHaveURL(/\/login\?redirect=%2Fpagamento/)
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel(/^E-mail/).fill(ANA)
  await dialog.getByLabel(/^Senha/).fill('errada123')
  await dialog.getByRole('button', { name: 'Entrar', exact: true }).click()
  await expect(page.getByText('E-mail ou senha incorretos.')).toBeVisible()
  await dialog.getByLabel(/^Senha/).fill(PASSWORD)
  await dialog.getByRole('button', { name: 'Entrar', exact: true }).click()
  await expect(page).toHaveURL(/\/pagamento/) // voltou ao ponto original
})

test('sessão sobrevive a refresh; expiração leva ao login preservando o contexto', async ({ app, page }) => {
  await app.open('/')
  await app.login()
  await page.goto('/perfil')
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Perfil do colecionador' })).toBeVisible()
  await page.evaluate(() => window.__kurio!.session.expireAll())
  await page.getByRole('button', { name: 'Salvar', exact: true }).click()
  await expect(page).toHaveURL(/\/login\?redirect=%2Fperfil/)
  await expect(page.getByText(/sessão expirou/i).first()).toBeVisible()
})

test('logout e troca de usuário não vazam dados privados', async ({ app, page }) => {
  await app.open('/')
  await app.login(ANA)
  await page.goto('/nft/emerald-ape-042')
  await expect(page.getByRole('button', { name: /^(Favoritado|Remover dos favoritos)$/ }).filter({ visible: true })).toHaveCount(1) // favorito de Ana
  if (page.viewportSize()!.width < 768) await page.goto('/perfil')
  await page.getByRole('button', { name: 'Sair' }).click()
  if (page.viewportSize()!.width < 768) {
    await expect(page.getByRole('navigation', { name: 'Navegação móvel' }).getByRole('link', { name: 'Entrar' })).toBeVisible()
  } else {
    await expect(page.getByRole('link', { name: 'Entrar' })).toBeVisible()
  }
  await app.login(BRUNO)
  await page.goto('/nft/emerald-ape-042')
  await expect(page.getByRole('button', { name: 'Favoritar', exact: true }).filter({ visible: true })).toHaveCount(1) // Bruno não herda nada de Ana
})

test('favoritos: persistência e rollback otimista quando a mutation falha', async ({ app, page }) => {
  await app.open('/')
  await app.login(BRUNO)
  await page.goto('/nft/golden-beat-207')
  const favoriteButton = page.getByRole('button', { name: /^(Favoritar|Favoritado|Remover dos favoritos)$/ }).filter({ visible: true })
  await favoriteButton.click()
  const activeFavoriteButton = page.getByRole('button', { name: /^(Favoritado|Remover dos favoritos)$/ }).filter({ visible: true })
  await expect(activeFavoriteButton).toBeVisible()
  await page.reload()
  await expect(activeFavoriteButton).toBeVisible() // persistiu

  await app.scenario('fast', 'favoriteFailure')
  await activeFavoriteButton.click()
  await expect(page.getByRole('alert').getByText(/restaurado/)).toBeVisible() // erro anunciado
  await expect(activeFavoriteButton).toBeVisible() // estado anterior restaurado
})

test('perfil: validação, erro da API, avatar e persistência após refresh', async ({ app, page }) => {
  await app.open('/')
  await app.login()
  await page.goto('/perfil')
  await page.getByLabel(/^Nome de usuário/).fill('Ab')
  await page.getByRole('button', { name: 'Salvar', exact: true }).click()
  await expect(page.getByText(/Use de 3 a 20 caracteres/)).toBeVisible()
  await page.getByLabel(/^Nome de usuário/).fill('brunolima') // conflito com outro usuário (API)
  await page.getByRole('button', { name: 'Salvar', exact: true }).click()
  await expect(page.getByText('Este nome de usuário já está em uso.')).toBeVisible()
  await page.getByLabel(/^Nome de usuário/).fill('anaduarte')
  await page.getByLabel(/^Nome de exibição/).fill('Ana D.')
  await page.setInputFiles('#pf-avatarUrl', { name: 'a.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64') })
  await expect(page.getByAltText('Seu avatar')).toBeVisible()
  await page.getByLabel('Senha atual').fill('errada1')
  await page.getByLabel('Nova senha', { exact: true }).fill('Nova#2026')
  await page.getByLabel('Confirmar nova senha').fill('Nova#2026')
  await page.getByRole('button', { name: 'Salvar', exact: true }).click()
  await expect(page.getByText('Senha atual incorreta.')).toBeVisible()
  await page.getByLabel('Senha atual').fill(PASSWORD)
  await page.getByRole('button', { name: 'Salvar', exact: true }).click()
  await expect(page.getByRole('status').getByText('Perfil e senha atualizados.')).toBeVisible()
  await page.reload()
  await expect(page.getByLabel(/^Nome de exibição/)).toHaveValue('Ana D.')
  await expect(page.getByAltText('Seu avatar')).toBeVisible()
})

test('carteiras: erro de validação e salvamento persistente', async ({ app, page }) => {
  await app.open('/')
  await app.login(BRUNO)
  await page.goto('/perfil/carteiras')
  await page.locator('#w-primary-address').fill('0x123')
  await page.locator('#w-primary-ensName').fill('bruno')
  await page.getByRole('button', { name: 'Salvar carteira' }).first().click()
  await expect(page.getByText(/Endereço inválido/)).toBeVisible()
  await page.locator('#w-primary-address').fill('0x1De4B7a93C60f58e2A4d9B1c7E30aF5862d1C0b9')
  await page.getByRole('button', { name: 'Salvar carteira' }).first().click()
  await expect(page.getByRole('status').getByText('Carteira principal salva.')).toBeVisible()
  await page.reload()
  await expect(page.locator('#w-primary-ensName')).toHaveValue('bruno')
})
