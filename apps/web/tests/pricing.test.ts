import assert from 'node:assert/strict'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { createServer } from 'vite'
import { publicPlans } from '../src/features/billing/public-plans.ts'

test('primeira visita exibe todos os planos sem API nem provedor de consultas', async (context) => {
  const server = await createServer({
    root: fileURLToPath(new URL('..', import.meta.url)),
    logLevel: 'error',
    server: { middlewareMode: true, hmr: false },
  })
  context.after(() => server.close())
  const { PricingSection } = await server.ssrLoadModule('/src/features/landing/components/pricing-section.tsx')
  const requests = context.mock.method(globalThis, 'fetch', async () => {
    throw new Error('API unavailable')
  })

  const html = renderToStaticMarkup(createElement(MemoryRouter, null, createElement(PricingSection)))

  for (const plan of publicPlans) {
    assert.ok(html.includes(plan.name), plan.name)
    assert.ok(html.includes((plan.priceCents / 100).toFixed(2).replace('.', ',')), plan.name)
    assert.ok(html.includes(plan.benefits[0]), plan.name)
  }
  assert.ok(html.includes('href="/cadastro"'))
  assert.ok(html.includes('href="/meu-plano"'))
  assert.ok(!html.includes('Carregando planos'))
  assert.equal(requests.mock.callCount(), 0)
})
