import assert from 'node:assert/strict'
import test from 'node:test'
import { apiRequest } from '../src/lib/http-client.ts'
import { ServiceError } from '../src/services/errors.ts'
import { authService } from '../src/services/auth.service.ts'

test('503 vazio da hospedagem recebe mensagem de indisponibilidade e pausa antes de nova tentativa manual', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 1_800_000_000_000 })
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => new Response(null, { status: 503 }))
  let failure: ServiceError | undefined
  await assert.rejects(apiRequest('/test/plans-unavailable'), (error: unknown) => {
    assert.ok(error instanceof ServiceError)
    failure = error
    assert.equal(error.status, 503)
    assert.match(error.message, /temporariamente indisponível/)
    assert.equal(error.retryAt, Date.now() + 15_000)
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

test('429 HTML da hospedagem informa indisponibilidade sem culpar o usuário e preserva a pausa', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 1_800_000_000_000 })
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => new Response('<html><title>Just a moment...</title></html>', {
    status: 429, headers: { 'Content-Type': 'text/html; charset=UTF-8' },
  }))
  let failure: ServiceError | undefined
  await assert.rejects(apiRequest('/test/plans-hosting-limited'), (error: unknown) => {
    assert.ok(error instanceof ServiceError)
    failure = error
    assert.equal(error.status, 429)
    assert.equal(error.code, 'RATE_LIMITED')
    assert.match(error.message, /temporariamente indisponível/)
    assert.doesNotMatch(error.message, /Muitas tentativas|Just a moment/)
    assert.equal(error.retryAt, Date.now() + 30_000)
    return true
  })
  await assert.rejects(apiRequest('/test/plans-hosting-limited'), (error: unknown) => error === failure)
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

test('login interrompe espera após 20 segundos sem reenviar credenciais automaticamente', async (t) => {
  const timeout = new AbortController()
  t.mock.method(AbortSignal, 'timeout', (milliseconds: number) => {
    assert.equal(milliseconds, 20_000)
    return timeout.signal
  })
  const fetchMock = t.mock.method(globalThis, 'fetch', async (url: string, options: RequestInit) => {
    assert.equal(url, '/api/v1/auth/login')
    assert.equal(options.method, 'POST')
    assert.equal(options.credentials, 'include')
    assert.deepEqual(JSON.parse(options.body as string), { email: 'person@example.com', password: 'test-password' })
    timeout.abort(new DOMException('Timeout', 'TimeoutError'))
    options.signal?.throwIfAborted()
    return Response.json({})
  })
  await assert.rejects(authService.signIn({ email: 'person@example.com', password: 'test-password' }), (error: unknown) => {
    assert.ok(error instanceof ServiceError)
    assert.equal(error.code, 'NETWORK_ERROR')
    assert.match(error.message, /demorou para responder/)
    return true
  })
  assert.equal(fetchMock.mock.callCount(), 1)
})

test('timeout também encerra a leitura de um corpo JSON de login que parou de chegar', async (t) => {
  const timeout = new AbortController()
  t.mock.method(AbortSignal, 'timeout', () => timeout.signal)
  const fetchMock = t.mock.method(globalThis, 'fetch', async (_url: string, options: RequestInit) => {
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"user":'))
        options.signal?.addEventListener('abort', () => controller.error(options.signal?.reason), { once: true })
      },
    })
    setImmediate(() => timeout.abort(new DOMException('Timeout', 'TimeoutError')))
    return new Response(body, { headers: { 'Content-Type': 'application/json' } })
  })
  await assert.rejects(authService.signIn({ email: 'person@example.com', password: 'test-password' }), (error: unknown) => {
    assert.ok(error instanceof ServiceError)
    assert.equal(error.code, 'NETWORK_ERROR')
    assert.equal(error.status, 0)
    assert.match(error.message, /demorou para responder/)
    return true
  })
  assert.equal(fetchMock.mock.callCount(), 1)
})

test('login preserva Retry-After para bloquear novas tentativas até o prazo do servidor', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 1_800_000_000_000 })
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => Response.json({ error: { code: 'RATE_LIMITED', message: 'Aguarde.' } }, {
    status: 429, headers: { 'Retry-After': '900' },
  }))
  await assert.rejects(authService.signIn({ email: 'person@example.com', password: 'test-password' }), (error: unknown) => {
    assert.ok(error instanceof ServiceError)
    assert.equal(error.code, 'RATE_LIMITED')
    assert.equal(error.retryAt, Date.now() + 900_000)
    return true
  })
  assert.equal(fetchMock.mock.callCount(), 1)
  await assert.rejects(authService.signIn({ email: 'person@example.com', password: 'test-password' }), ServiceError)
  assert.equal(fetchMock.mock.callCount(), 1)
  t.mock.timers.tick(900_000)
  assert.equal(fetchMock.mock.callCount(), 1, 'o fim da espera não envia as credenciais')
  t.mock.method(globalThis, 'fetch', async () => Response.json({ user: { id: 'test-user' } }))
  assert.deepEqual(await authService.signIn({ email: 'person@example.com', password: 'test-password' }), { user: { id: 'test-user' } })
})

test('401 continua identificável como sessão ausente e sucesso sem JSON não vira catálogo vazio', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ error: { code: 'UNAUTHORIZED' } }, { status: 401 }))
  await assert.rejects(apiRequest('/test/session-anonymous', { skipAuthRedirect: true }), (error: unknown) => {
    assert.ok(error instanceof ServiceError)
    assert.equal(error.code, 'UNAUTHORIZED')
    return true
  })
  t.mock.method(globalThis, 'fetch', async () => new Response('<html>Unavailable</html>'))
  await assert.rejects(apiRequest('/test/unexpected-html'), ServiceError)
})
