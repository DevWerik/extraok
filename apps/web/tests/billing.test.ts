import assert from 'node:assert/strict'
import test from 'node:test'
import { pixCountdown, visiblePaymentStatus } from '../src/features/billing/billing.utils.ts'
import worker from '../worker/index.ts'

test('Pix expira mesmo depois de retomar uma aba; confirmação real nunca é substituída por expiração', () => {
  const now = Date.parse('2026-09-14T12:00:00Z')
  const expiry = '2026-09-14T12:30:00Z'
  assert.equal(pixCountdown(expiry, now), '30:00')
  assert.equal(pixCountdown(expiry, now + 30 * 60_000), '0:00')
  assert.equal(pixCountdown(expiry, now + 40 * 60_000), '0:00')
  assert.equal(visiblePaymentStatus('pending', expiry, now), 'pending')
  assert.equal(visiblePaymentStatus('pending', expiry, now + 30 * 60_000), 'expired')
  assert.equal(visiblePaymentStatus('approved', expiry, now + 40 * 60_000), 'approved')
  assert.equal(visiblePaymentStatus('refunded', expiry, now + 40 * 60_000), 'refunded')
})

test('proxy preserva query e headers assinados do webhook sem inventar Origin ou cookie', async (context) => {
  context.mock.method(globalThis, 'fetch', async (request: Request) => {
    assert.equal(request.url, 'https://api.example.test/api/v1/billing/webhooks/mercadopago?data.id=12345&type=payment')
    assert.equal(request.headers.get('x-signature'), 'ts=1789400000,v1=signature')
    assert.equal(request.headers.get('x-request-id'), 'request-id')
    assert.equal(request.headers.get('origin'), null)
    assert.equal(request.headers.get('cookie'), null)
    assert.deepEqual(await request.json(), { type: 'payment' })
    return Response.json({ received: true })
  })
  const response = await worker.fetch(new Request('https://app.example.test/api/v1/billing/webhooks/mercadopago?data.id=12345&type=payment', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-signature': 'ts=1789400000,v1=signature', 'x-request-id': 'request-id' }, body: JSON.stringify({ type: 'payment' }),
  }), { API_ORIGIN: 'https://api.example.test', ASSETS: { fetch: async () => new Response('SPA') } })
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('cache-control'), 'no-store')
})
