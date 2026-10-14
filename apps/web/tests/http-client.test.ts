import assert from 'node:assert/strict'
import test from 'node:test'
import { apiRequest } from '../src/lib/http-client.ts'
import { queryRetryDelay, shouldRetryQuery } from '../src/lib/query-retry.ts'
import { ServiceError } from '../src/services/errors.ts'

test('503 vazio da hospedagem recebe mensagem de indisponibilidade e pausa antes de uma única repetição', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 1_800_000_000_000 })
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => new Response(null, { status: 503 }))
  let failure: ServiceError | undefined
  await assert.rejects(apiRequest('/test/plans-unavailable'), (error: unknown) => {
    assert.ok(error instanceof ServiceError)
    failure = error
    assert.equal(error.status, 503)
    assert.match(error.message, /temporariamente indisponível/)
    assert.equal(error.retryAt, Date.now() + 15_000)
    assert.equal(queryRetryDelay(0, error), 15_000)
    assert.equal(shouldRetryQuery(0, error), true)
    assert.equal(shouldRetryQuery(1, error), false)
    return true
  })
  await assert.rejects(apiRequest('/test/plans-unavailable'), (error: unknown) => error === failure)
  assert.equal(fetchMock.mock.callCount(), 1)
  t.mock.timers.tick(15_000)
  t.mock.method(globalThis, 'fetch', async () => Response.json({ plans: [] }))
  assert.deepEqual(await apiRequest('/test/plans-unavailable'), { plans: [] })
})

test('429 respeita Retry-After, bloqueia novas consultas ao mesmo recurso e não repete automaticamente', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 1_800_000_000_000 })
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => Response.json({ error: { code: 'RATE_LIMITED', message: 'Aguarde.' } }, {
    status: 429, headers: { 'Retry-After': '45' },
  }))
  let failure: ServiceError | undefined
  await assert.rejects(apiRequest('/test/session-limited'), (error: unknown) => {
    assert.ok(error instanceof ServiceError)
    failure = error
    assert.equal(error.retryAt, Date.now() + 45_000)
    assert.equal(error.code, 'RATE_LIMITED')
    assert.equal(shouldRetryQuery(0, error), false)
    return true
  })
  t.mock.timers.tick(44_999)
  await assert.rejects(apiRequest('/test/session-limited'), (error: unknown) => error === failure)
  assert.equal(fetchMock.mock.callCount(), 1)
  t.mock.timers.tick(1)
  await assert.rejects(apiRequest('/test/session-limited'), ServiceError)
  assert.equal(fetchMock.mock.callCount(), 2)
})

test('Retry-After aceita data HTTP e preserva o status com JSON inválido', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 1_800_000_000_000 })
  t.mock.method(globalThis, 'fetch', async () => new Response('{invalid', {
    status: 503, headers: { 'Content-Type': 'application/json', 'Retry-After': new Date(Date.now() + 120_000).toUTCString() },
  }))
  await assert.rejects(apiRequest('/test/dated-retry'), (error: unknown) => {
    assert.ok(error instanceof ServiceError)
    assert.equal(error.status, 503)
    assert.equal(error.retryAt, Date.now() + 120_000)
    assert.equal(shouldRetryQuery(0, error), false)
    return true
  })
})

test('429 sem Retry-After válido usa pausa conservadora e não bloqueia outro recurso', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 1_800_000_000_000 })
  t.mock.method(globalThis, 'fetch', async () => new Response(null, { status: 429, headers: { 'Retry-After': 'invalid' } }))
  await assert.rejects(apiRequest('/test/invalid-retry'), (error: unknown) => {
    assert.ok(error instanceof ServiceError)
    assert.equal(error.retryAt, Date.now() + 30_000)
    return true
  })
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => Response.json({ available: true }))
  assert.deepEqual(await apiRequest('/test/other-resource'), { available: true })
  assert.equal(fetchMock.mock.callCount(), 1)
})

test('consultas têm limite de 20 segundos e cancelamento do chamador é preservado', async (t) => {
  const timeout = new AbortController()
  t.mock.method(AbortSignal, 'timeout', (milliseconds: number) => {
    assert.equal(milliseconds, 20_000)
    return timeout.signal
  })
  t.mock.method(globalThis, 'fetch', async (_url: string, options: RequestInit) => {
    timeout.abort(new DOMException('Timeout', 'TimeoutError'))
    options.signal?.throwIfAborted()
    return Response.json({})
  })
  await assert.rejects(apiRequest('/test/timeout'), (error: unknown) => {
    assert.ok(error instanceof ServiceError)
    assert.equal(error.code, 'NETWORK_ERROR')
    assert.match(error.message, /demorou para responder/)
    return true
  })
  const caller = new AbortController()
  caller.abort()
  await assert.rejects(apiRequest('/test/aborted', { signal: caller.signal }), { name: 'AbortError' })
})

test('uma mutação preserva corpo e cookies, sem repetição automática nem timeout de consulta', async (t) => {
  const fetchMock = t.mock.method(globalThis, 'fetch', async (_url: string, options: RequestInit) => {
    assert.equal(options.method, 'POST')
    assert.equal(options.body, '{"planId":"pro"}')
    assert.equal(options.credentials, 'include')
    assert.equal(options.signal, undefined)
    return new Response(null, { status: 503 })
  })
  await assert.rejects(apiRequest('/test/create-payment', { method: 'POST', body: { planId: 'pro' } }), ServiceError)
  assert.equal(fetchMock.mock.callCount(), 1)
})

test('401 continua identificável como sessão ausente e sucesso sem JSON não vira catálogo vazio', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ error: { code: 'UNAUTHORIZED' } }, { status: 401 }))
  await assert.rejects(apiRequest('/test/session-anonymous', { skipAuthRedirect: true }), (error: unknown) => {
    assert.ok(error instanceof ServiceError)
    assert.equal(error.code, 'UNAUTHORIZED')
    assert.equal(shouldRetryQuery(0, error), false)
    return true
  })
  t.mock.method(globalThis, 'fetch', async () => new Response('<html>Unavailable</html>'))
  await assert.rejects(apiRequest('/test/unexpected-html'), ServiceError)
})
