import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import worker, { type Env } from '../worker/index.ts'

const siteOrigin = 'https://extraok-web.example.workers.dev'
const apiOrigin = 'https://extraok-api.onrender.com'
const env: Env = {
  API_ORIGIN: apiOrigin,
  ASSETS: { fetch: async () => new Response('<html>ExtraOK</html>') },
}

test('login preserves body, browser Origin, session cookies and multiple Set-Cookie headers', async (t) => {
  const body = JSON.stringify({ email: 'test@example.com', password: 'test-only-password' })
  const cookies = [
    '__Host-extraok_session=new-session; Path=/; HttpOnly; Secure; SameSite=Strict',
    'test-cookie=value; Path=/; Secure',
  ]
  const fetchMock = t.mock.method(globalThis, 'fetch', async (request: Request, options: RequestInit) => {
    assert.equal(request.url, `${apiOrigin}/api/v1/auth/login`)
    assert.equal(request.method, 'POST')
    assert.equal(await request.text(), body)
    assert.equal(request.headers.get('Origin'), siteOrigin)
    assert.equal(request.headers.get('Cookie'), '__Host-extraok_session=old-session')
    assert.equal(request.headers.get('Content-Type'), 'application/json')
    assert.equal(request.headers.get('X-Requested-With'), 'ExtraOK-Web')
    for (const name of ['Host', 'Forwarded', 'X-Forwarded-For', 'X-Forwarded-Host', 'X-Forwarded-Proto', 'X-Real-IP']) {
      assert.equal(request.headers.get(name), null)
    }
    assert.equal(options.redirect, 'manual')
    assert.equal(options.cache, 'no-store')
    const headers = new Headers({ 'Content-Type': 'application/json' })
    for (const cookie of cookies) headers.append('Set-Cookie', cookie)
    return new Response('{"user":{"id":"user-1"}}', { status: 201, headers })
  })

  const response = await worker.fetch(new Request(`${siteOrigin}/api/v1/auth/login`, {
    method: 'POST',
    body,
    headers: {
      Origin: siteOrigin,
      Cookie: '__Host-extraok_session=old-session',
      'Content-Type': 'application/json',
      'X-Requested-With': 'ExtraOK-Web',
      Host: 'untrusted.example',
      Forwarded: 'for=untrusted',
      'X-Forwarded-For': 'untrusted',
      'X-Forwarded-Host': 'untrusted.example',
      'X-Forwarded-Proto': 'http',
      'X-Real-IP': 'untrusted',
    },
  }), env)

  assert.equal(fetchMock.mock.callCount(), 1)
  assert.equal(response.status, 201)
  assert.deepEqual(response.headers.getSetCookie(), cookies)
  assert.equal(response.headers.get('Cache-Control'), 'no-store')
  assert.deepEqual(await response.json(), { user: { id: 'user-1' } })
})

test('forwards GET queries to the configured API and preserves anonymous 401 responses', async (t) => {
  t.mock.method(globalThis, 'fetch', async (request: Request) => {
    assert.equal(request.url, `${apiOrigin}/api/v1/auth/session?returnTo=https%3A%2F%2Funtrusted.example`)
    assert.equal(request.method, 'GET')
    assert.equal(request.headers.get('Origin'), null)
    return Response.json({ error: { code: 'UNAUTHORIZED' } }, { status: 401 })
  })
  const response = await worker.fetch(new Request(`${siteOrigin}/api/v1/auth/session?returnTo=https%3A%2F%2Funtrusted.example`), env)
  assert.equal(response.status, 401)
  assert.deepEqual(await response.json(), { error: { code: 'UNAUTHORIZED' } })
})

test('does not replace an untrusted Origin or turn an API error into the SPA', async (t) => {
  t.mock.method(globalThis, 'fetch', async (request: Request) => {
    assert.equal(request.headers.get('Origin'), 'https://untrusted.example')
    return Response.json({ error: { code: 'FORBIDDEN' } }, { status: 403 })
  })
  const response = await worker.fetch(new Request(`${siteOrigin}/api/v1/auth/logout`, {
    method: 'POST', headers: { Origin: 'https://untrusted.example' },
  }), env)
  assert.equal(response.status, 403)
  assert.deepEqual(await response.json(), { error: { code: 'FORBIDDEN' } })
})

test('preserves logout cookie removal and empty 204 responses', async (t) => {
  const cookie = '__Host-extraok_session=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict'
  t.mock.method(globalThis, 'fetch', async () => new Response(null, {
    status: 204, headers: { 'Set-Cookie': cookie },
  }))
  const response = await worker.fetch(new Request(`${siteOrigin}/api/v1/auth/logout`, { method: 'POST' }), env)
  assert.equal(response.status, 204)
  assert.equal(await response.text(), '')
  assert.equal(response.headers.get('Set-Cookie'), cookie)
})

test('serves frontend pages through the assets binding', async (t) => {
  const fetchMock = t.mock.method(globalThis, 'fetch')
  for (const path of ['/', '/login', '/clientes', '/apiary']) {
    const response = await worker.fetch(new Request(`${siteOrigin}${path}`), env)
    assert.equal(await response.text(), '<html>ExtraOK</html>')
  }
  assert.equal(fetchMock.mock.callCount(), 0)
})

test('health routes reach the API even when requested as browser navigations', async (t) => {
  t.mock.method(globalThis, 'fetch', async (request: Request) => {
    assert.equal(new URL(request.url).origin, apiOrigin)
    return Response.json({ status: new URL(request.url).pathname === '/ready' ? 'ready' : 'ok' })
  })
  for (const path of ['/health', '/ready']) {
    const response = await worker.fetch(new Request(`${siteOrigin}${path}`, {
      headers: { 'Sec-Fetch-Mode': 'navigate' },
    }), env)
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { status: path === '/ready' ? 'ready' : 'ok' })
  }
  const config = JSON.parse(readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8'))
  assert.equal(config.main, 'worker/index.ts')
  assert.equal(config.assets.binding, 'ASSETS')
  for (const route of ['/api', '/api/*', '/health', '/ready']) {
    assert.ok(config.assets.run_worker_first.includes(route), `${route} must bypass SPA routing`)
  }
})

test('returns a generic non-cacheable error when the API cannot be reached', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('secret upstream details') })
  const response = await worker.fetch(new Request(`${siteOrigin}/api/v1/clients`), env)
  assert.equal(response.status, 502)
  assert.equal(response.headers.get('Cache-Control'), 'no-store')
  assert.equal((await response.text()).includes('secret upstream details'), false)
})

test('rejects invalid or recursive API origins before forwarding cookies', async (t) => {
  const fetchMock = t.mock.method(globalThis, 'fetch')
  for (const origin of ['', 'http://api.example', siteOrigin, `${apiOrigin}/api`, `${apiOrigin}?other=1`, 'https://user:secret@api.example']) {
    const response = await worker.fetch(new Request(`${siteOrigin}/api/v1/clients`), { ...env, API_ORIGIN: origin })
    assert.equal(response.status, 500)
  }
  assert.equal(fetchMock.mock.callCount(), 0)
})
