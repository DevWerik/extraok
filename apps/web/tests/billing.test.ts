import assert from 'node:assert/strict'
import test from 'node:test'
import { billingReturnPayment, currentPayment, paymentRejectionMessage, paymentRetryBlocked, pixCountdown, recoverPaymentAttempt, stripeCheckoutUrl, visiblePaymentStatus } from '../src/features/billing/billing.utils.ts'
import { isFullName, normalizeFullName } from '../src/lib/person-name.ts'
import { readMercadoPagoDeviceId } from '../src/lib/mercadopago-device.ts'
import type { BillingPayment } from '../src/features/billing/billing.types.ts'
import worker from '../worker/index.ts'

const payment: BillingPayment = {
  id: '11111111-1111-4111-8111-111111111111', planId: 'business', priceCents: 1999,
  status: 'creating', createdAt: '2026-10-06T12:00:00Z', expiresAt: '2026-10-06T12:30:00Z',
  approvedAt: null, qrCode: null, qrCodeBase64: null, rejectionReason: null, retryAvailableAt: null,
}

test('retorno Stripe aceita apenas referência interna e checkout aceita somente domínio oficial HTTPS', () => {
  assert.equal(billingReturnPayment(`?payment=${payment.id}&status=paid`), payment.id)
  for (const search of ['', '?payment=cs_test_forged', '?payment=https://evil.test', '?status=paid']) assert.equal(billingReturnPayment(search), null)
  const url = 'https://checkout.stripe.com/c/pay/cs_test_123#token'
  assert.equal(stripeCheckoutUrl(url), url)
  for (const value of [undefined, null, '', '//checkout.stripe.com/c/pay/id', 'javascript:alert(1)',
    'https://checkout.stripe.com.evil.test/c/pay/id', 'https://user:pass@checkout.stripe.com/c/pay/id',
    'http://checkout.stripe.com/c/pay/id', 'https://evil.test/c/pay/id']) assert.equal(stripeCheckoutUrl(value), undefined)
})

test('proxy Stripe preserva bytes exatos e assinatura para verificação no backend', async (context) => {
  const raw = '{ "id": "evt_test", "data": {"name":"João"} }\n'
  context.mock.method(globalThis, 'fetch', async (request: Request) => {
    assert.equal(request.url, 'https://api.example.test/api/v1/billing/webhooks/stripe')
    assert.equal(request.headers.get('stripe-signature'), 't=1789400000,v1=signature')
    assert.equal(await request.text(), raw)
    return Response.json({ received: true })
  })
  const response = await worker.fetch(new Request('https://app.example.test/api/v1/billing/webhooks/stripe', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Stripe-Signature': 't=1789400000,v1=signature' }, body: raw,
  }), { API_ORIGIN: 'https://api.example.test', ASSETS: { fetch: async () => new Response('SPA') } })
  assert.equal(response.status, 200)
})

test('dados do pagador aceitam nomes compostos reais e rejeitam nome isolado e documentos no nome', () => {
  for (const name of ['João da Silva', "Ana-Maria D’Ávila", "José D'Ávila", 'Érica Souza']) assert.equal(isFullName(name), true)
  for (const name of ['', 'João', '  João  ', '52998224725', 'Pessoa 123', 'A'.repeat(101) + ' Silva']) assert.equal(isFullName(name), false)
  assert.equal(normalizeFullName('  João   da\tSilva  '), 'João da Silva')
})

test('Device ID aceita o identificador do script e rejeita ausência, tamanho excessivo e quebra de header', () => {
  assert.equal(readMercadoPagoDeviceId('device-session-123_test'), 'device-session-123_test')
  for (const value of [null, undefined, '', 123, {}, 'x'.repeat(257), 'device\r\nAuthorization: forged']) assert.equal(readMercadoPagoDeviceId(value), undefined)
})

test('pausa acaba no horário exato e recusa por risco tem orientação específica', () => {
  const retryAt = '2026-10-06T12:10:00Z'
  assert.equal(paymentRetryBlocked(retryAt, Date.parse(retryAt) - 1), true)
  assert.equal(paymentRetryBlocked(retryAt, Date.parse(retryAt)), false)
  assert.equal(paymentRetryBlocked(null, Date.parse(retryAt)), false)
  assert.equal(paymentRetryBlocked(undefined, Date.parse(retryAt)), false)
  assert.equal(paymentRetryBlocked('invalid', Date.parse(retryAt)), false)
  assert.match(paymentRejectionMessage('high_risk'), /análise de risco/)
  assert.doesNotMatch(paymentRejectionMessage(null), /análise de risco/)
  assert.doesNotMatch(paymentRejectionMessage('high_risk'), /instantes|indisponível/)
})

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
