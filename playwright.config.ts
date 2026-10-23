import { defineConfig } from '@playwright/test'

/**
 * Os testes rodam contra o build de DEMONSTRAÇÃO (mocks ligados) servido por `vite preview`.
 * Chromium em desktop (1440) e mobile (390). Relatório HTML + traces das falhas.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: 'http://localhost:4173', trace: 'retain-on-failure', screenshot: 'only-on-failure', locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' },
  expect: { timeout: 10_000, toHaveScreenshot: { maxDiffPixelRatio: 0.02, animations: 'disabled' } },
  projects: [
    { name: 'desktop', use: { browserName: 'chromium', viewport: { width: 1440, height: 900 } } },
    { name: 'mobile', use: { browserName: 'chromium', viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true } },
  ],
  webServer: { command: 'npm run build:demo && npm run preview', url: 'http://localhost:4173', reuseExistingServer: !process.env.CI, timeout: 180_000 },
})
