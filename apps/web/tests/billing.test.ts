import assert from 'node:assert/strict'
import test from 'node:test'
import { currentPayment, pixCountdown, recoverPaymentAttempt, visiblePaymentStatus } from '../src/features/billing/billing.utils.ts'
import type { BillingPayment } from '../src/features/billing/billing.types.ts'
import worker from '../worker/index.ts'

const payment: BillingPayment = {
  id: '11111111-1111-4111-8111-111111111111', planId: 'business', priceCents: 1999,
  status: 'creating', createdAt: '2026-10-06T12:00:00Z', expiresAt: '2026-10-06T12:30:00Z',
  approvedAt: null, qrCode: null, qrCodeBase64: null,
}

test('503 na criação é substituído pela recusa reconciliada da mesma tentativa', () => {
  assert.equal(recoverPaymentAttempt([payment], payment.id, 'business'), undefined)
  const rejected: BillingPayment = { ...payment, status: 'rejected' }
  assert.equal(recoverPaymentAttempt([rejected], payment.id, 'business'), rejected)
  assert.equal(recoverPaymentAttempt([rejected], '22222222-2222-4222-8222-222222222222', 'business'), undefined)
  assert.equal(recoverPaymentAttempt([rejected], payment.id, 'pro'), undefined)
  assert.equal(recoverPaymentAttempt([], payment.id, 'business'), undefined)
})

test('resumo recupera Pix pendente ou confirmado após perda da resposta de criação', () => {
  for (const status of ['pending', 'approved', 'expired', 'cancelled', 'refunded'] as const) {
    const recovered = { ...payment, status }
    assert.equal(recoverPaymentAttempt([recovered], payment.id, 'business'), recovered)
  }
})

test('polling com dados antigos não esconde recusa, confirmação ou reembolso recebido no resumo', () => {
  const pending: BillingPayment = { ...payment, status: 'pending', qrCode: 'PIX-TEST' }
  const rejected: BillingPayment = { ...payment, status: 'rejected' }
  const approved: BillingPayment = { ...payment, status: 'approved', approvedAt: '2026-10-06T12:05:00Z' }
  const refunded: BillingPayment = { ...approved, status: 'refunded' }
  for (const cached of [payment, pending]) {
    for (const final of [rejected, approved, refunded]) {
      assert.equal(currentPayment(cached, final), final)
      assert.equal(currentPayment(final, cached), final)
    }
  }
  assert.equal(currentPayment(approved, refunded), refunded)
  assert.equal(currentPayment(refunded, approved), refunded)
  assert.equal(currentPayment(rejected, approved), approved)
  assert.equal(currentPayment(approved, rejected), approved)
  assert.equal(currentPayment(pending, payment), pending)
  assert.equal(currentPayment(undefined, rejected), rejected)
  assert.equal(currentPayment(pending, undefined), pending)
  assert.equal(currentPayment(undefined, undefined), undefined)
  assert.equal(currentPayment(pending, { ...rejected, id: 'another-attempt' }), pending)
})

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

for (const [id, type] of [['12345', 'payment'], ['ORD01HRYFWNYRE1MR1E60MW3X0T2P', 'order'], ['ORDTST01HRYFWNYRE1MR1E60MW3X0T2P', 'order']]) {
test(`proxy preserva query e assinatura do webhook ${type} sem inventar Origin ou cookie`, async (context) => {
  context.mock.method(globalThis, 'fetch', async (request: Request) => {
    assert.equal(request.url, `https://api.example.test/api/v1/billing/webhooks/mercadopago?data.id=${id}&type=${type}`)
    assert.equal(request.headers.get('x-signature'), 'ts=1789400000,v1=signature')
    assert.equal(request.headers.get('x-request-id'), 'request-id')
    assert.equal(request.headers.get('origin'), null)
    assert.equal(request.headers.get('cookie'), null)
    assert.deepEqual(await request.json(), { type })
    return Response.json({ received: true })
  })
  const response = await worker.fetch(new Request(`https://app.example.test/api/v1/billing/webhooks/mercadopago?data.id=${id}&type=${type}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-signature': 'ts=1789400000,v1=signature', 'x-request-id': 'request-id' }, body: JSON.stringify({ type }),
  }), { API_ORIGIN: 'https://api.example.test', ASSETS: { fetch: async () => new Response('SPA') } })
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('cache-control'), 'no-store')
})
}
