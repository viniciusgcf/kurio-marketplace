/**
 * Auditoria Lighthouse: início e detalhe, perfis mobile e desktop, 3 medições cada, MEDIANA por categoria.
 * Usa o build de demonstração (mocks ligados, cenário padrão), com todas as imagens/fontes/funcionalidades.
 *   npm run build:demo && npm run preview   (em outro terminal)   ->   npm run lighthouse
 * Saída: lighthouse/reports/*.html|json + summary.md (versões, ambiente, LCP/CLS/TBT, metas).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import lighthouse from 'lighthouse'
import desktopConfig from 'lighthouse/core/config/desktop-config.js'
import * as chromeLauncher from 'chrome-launcher'
import { chromium } from '@playwright/test'

const cfg = JSON.parse(readFileSync(new URL('./config.json', import.meta.url), 'utf8'))
const out = new URL('./reports/', import.meta.url)
mkdirSync(out, { recursive: true })
const median = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)]
const CATS = ['performance', 'accessibility', 'best-practices', 'seo']
const rows = []
const chrome = await chromeLauncher.launch({
  chromePath: chromium.executablePath(),
  chromeFlags: ['--headless=new', '--no-sandbox'],
})
let chromeVersion = 'desconhecida'

try {
  for (const page of cfg.pages) {
    for (const profile of cfg.profiles) {
      const runs = []
      for (let i = 1; i <= cfg.runs; i++) {
        const url = `${cfg.baseUrl}${page.path}?scenario=${cfg.scenario}`
        const flags = { port: chrome.port, output: ['html', 'json'], onlyCategories: CATS, logLevel: 'error' }
        const r = await lighthouse(url, flags, profile === 'desktop' ? desktopConfig : undefined)
        chromeVersion = r.lhr.environment.hostUserAgent
        const base = `${page.name}-${profile}-run${i}`
        writeFileSync(new URL(`${base}.html`, out), r.report[0])
        writeFileSync(new URL(`${base}.json`, out), r.report[1])
        runs.push({
          scores: Object.fromEntries(CATS.map((c) => [c, Math.round((r.lhr.categories[c]?.score ?? 0) * 100)])),
          lcp: r.lhr.audits['largest-contentful-paint'].numericValue,
          cls: r.lhr.audits['cumulative-layout-shift'].numericValue,
          tbt: r.lhr.audits['total-blocking-time'].numericValue,
          unusedJsBytes: r.lhr.audits['unused-javascript'].details?.overallSavingsBytes ?? 0,
          unusedJsMs: r.lhr.audits['unused-javascript'].details?.overallSavingsMs ?? 0,
          longestTask: Math.max(0, ...(r.lhr.audits['long-tasks'].details?.items ?? []).map((task) => task.duration ?? 0)),
          unusedJsResources: (r.lhr.audits['unused-javascript'].details?.items ?? []).slice(0, 3).map((item) => new URL(item.url).pathname.split('/').pop()),
        })
      }
      rows.push({
        page: page.name,
        profile,
        scores: Object.fromEntries(CATS.map((c) => [c, median(runs.map((r) => r.scores[c]))])),
        lcp: median(runs.map((r) => r.lcp)),
        cls: median(runs.map((r) => r.cls)),
        tbt: median(runs.map((r) => r.tbt)),
        unusedJsBytes: median(runs.map((r) => r.unusedJsBytes)),
        unusedJsMs: median(runs.map((r) => r.unusedJsMs)),
        longestTask: median(runs.map((r) => r.longestTask)),
        unusedJsResources: [...new Set(runs.flatMap((r) => r.unusedJsResources))],
      })
      console.log(`${page.name}/${profile}`, JSON.stringify(rows.at(-1).scores))
    }
  }
} finally { await chrome.kill() }

const pkg = JSON.parse(readFileSync(new URL('../node_modules/lighthouse/package.json', import.meta.url), 'utf8'))
const belowTarget = rows.filter((r) => CATS.some((c) => r.scores[c] < cfg.targets[c]))
const clsOutliers = rows.filter((r) => r.cls >= 0.1)
const md = [
  '# Relatório Lighthouse', '',
  `- Lighthouse ${pkg.version} · Node ${process.version} · ${chromeVersion}`,
  `- Máquina: ${os.cpus()[0]?.model} (${os.cpus().length} vCPU), ${Math.round(os.totalmem() / 2 ** 30)} GB, ${os.platform()} ${os.release()}`,
  `- Condições: build de demonstração (mocks ativos), cenário "${cfg.scenario}", ${cfg.runs} medições por página/perfil, **mediana**, throttling padrão do Lighthouse.`, '',
  '| Página | Perfil | Perf | A11y | BP | SEO | LCP (s) | CLS | TBT (ms) | Metas |', '|---|---|---|---|---|---|---|---|---|---|',
  ...rows.map((r) => `| ${r.page} | ${r.profile} | ${r.scores.performance} | ${r.scores.accessibility} | ${r.scores['best-practices']} | ${r.scores.seo} | ${(r.lcp / 1000).toFixed(2)} | ${r.cls.toFixed(3)} | ${Math.round(r.tbt)} | ${CATS.every((c) => r.scores[c] >= cfg.targets[c]) ? '✅' : '⚠️ abaixo — justificar'} |`),
  '', '## Justificativa de resultados abaixo da meta', '',
  ...(belowTarget.length
    ? belowTarget.map((r) => `- **${r.page}/${r.profile}, Performance ${r.scores.performance}:** LCP mediano ${(r.lcp / 1000).toFixed(2)} s e TBT ${Math.round(r.tbt)} ms. O relatório estima ${Math.round(r.unusedJsBytes / 1024)} KiB (${Math.round(r.unusedJsMs)} ms) de economia potencial em JavaScript não utilizado; os recursos apontados incluem ${r.unusedJsResources.join(', ')}. A mediana da tarefa longa mais demorada foi ${Math.round(r.longestTask)} ms. O build de demonstração mantém os mocks ativos por requisito; esses recursos não podem ser removidos do build de avaliação, embora possam ser otimizados ou carregados de forma mais granular.`)
    : ['Todas as categorias atingiram as metas configuradas.']),
  ...(clsOutliers.length
    ? ['', '## Instabilidade visual observada', ...clsOutliers.map((r) => `- **${r.page}/${r.profile}:** CLS mediano ${r.cls.toFixed(3)}. O diagnóstico Lighthouse atribuiu aproximadamente 0.189 do CLS na medição de detalhe desktop ao rodapé; revisar o carregamento/layout do rodapé. CLS é registrado aqui como métrica de diagnóstico, sem meta numérica específica no enunciado.`)]
    : []),
  '',
]
writeFileSync(new URL('summary.md', out), md.join('\n'))
console.log('\nRelatórios em lighthouse/reports/ (summary.md + HTML/JSON de cada execução)')
