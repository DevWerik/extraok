import assert from 'node:assert/strict'
import test from 'node:test'
import {
  passwordResetCodeSchema,
  passwordResetConfirmSchema,
  passwordResetRequestSchema,
} from '../src/features/auth/schemas/auth-schemas.ts'
import {
  formatCountdown,
  normalizePasswordResetCode,
  remainingSeconds,
} from '../src/features/auth/password-reset.utils.ts'
import worker, { type Env } from '../worker/index.ts'

test('recovery normalizes email and rejects invalid addresses before sending', () => {
  assert.deepEqual(passwordResetRequestSchema.parse({ email: '  Pessoa@EXAMPLE.com  ' }), {
    email: 'pessoa@example.com',
  })
  for (const email of ['', '   ', 'sem-arroba', 'pessoa@']) {
    assert.equal(passwordResetRequestSchema.safeParse({ email }).success, false)
  }
})

test('OTP entry and paste preserve leading zeros and require exactly eight digits', () => {
  assert.equal(normalizePasswordResetCode('0012 3456'), '00123456')
  assert.equal(normalizePasswordResetCode('00-12-34-56'), '00123456')
  assert.equal(normalizePasswordResetCode('123456789'), '12345678')
  assert.deepEqual(passwordResetCodeSchema.parse({ code: '00123456' }), { code: '00123456' })
  for (const code of ['', '1234567', '123456789', '1234abcd', '1234 567', 12345678]) {
    assert.equal(passwordResetCodeSchema.safeParse({ code }).success, false)
  }
})

test('new passwords enforce 12–128 characters and matching confirmation', () => {
  for (const length of [12, 128]) {
    const password = 'a'.repeat(length)
    assert.equal(passwordResetConfirmSchema.safeParse({ password, confirmPassword: password }).success, true)
  }
  for (const length of [0, 11, 129]) {
    const password = 'a'.repeat(length)
    assert.equal(passwordResetConfirmSchema.safeParse({ password, confirmPassword: password }).success, false)
  }
  const mismatch = passwordResetConfirmSchema.safeParse({ password: 'new-password-123', confirmPassword: 'different-password' })
  assert.equal(mismatch.success, false)
  if (!mismatch.success) assert.deepEqual(mismatch.error.issues[0].path, ['confirmPassword'])
})

test('countdowns expire at the deadline even after a background tab resumes', () => {
  const startedAt = 1_000_000
  const resendAt = startedAt + 60_000
  const codeExpiresAt = startedAt + 600_000
  const resetExpiresAt = startedAt + 300_000
  assert.equal(remainingSeconds(resendAt, startedAt), 60)
  assert.equal(remainingSeconds(resendAt, resendAt - 1), 1)
  assert.equal(remainingSeconds(resendAt, resendAt), 0)
  assert.equal(remainingSeconds(codeExpiresAt, startedAt), 600)
  assert.equal(remainingSeconds(resetExpiresAt, startedAt), 300)
  assert.equal(remainingSeconds(codeExpiresAt, codeExpiresAt + 120_000), 0)
  assert.equal(formatCountdown(600), '10:00')
  assert.equal(formatCountdown(59), '0:59')
  assert.equal(formatCountdown(0), '0:00')
})

test('password recovery crosses the site proxy with OTP text and HttpOnly authorization', async (t) => {
  const siteOrigin = 'https://extraok-web.example.workers.dev'
  const apiOrigin = 'https://extraok-api.onrender.com'
  const env: Env = {
    API_ORIGIN: apiOrigin,
    ASSETS: { fetch: async () => new Response('<html>ExtraOK</html>') },
  }
  const authorizationCookie = 'extraok_password_reset=test-reset-authorization; Path=/api/v1/auth/password-reset; HttpOnly; Secure; SameSite=Strict'
  const clearedCookie = 'extraok_password_reset=; Path=/api/v1/auth/password-reset; Max-Age=0; HttpOnly; Secure; SameSite=Strict'
  const email = 'person@example.com'
  t.mock.method(globalThis, 'fetch', async (request: Request) => {
    assert.equal(request.method, 'POST')
    assert.equal(request.headers.get('Origin'), siteOrigin)
    assert.equal(request.headers.get('X-Requested-With'), 'ExtraOK-Web')
    const body = await request.json()
    if (request.url.endsWith('/request')) {
      assert.deepEqual(body, { email })
      return Response.json({ message: 'Se houver uma conta com esse e-mail, você receberá um código de recuperação.', retryAfterSeconds: 60, expiresInSeconds: 600, codeLength: 8 }, { status: 202 })
    }
    if (request.url.endsWith('/verify')) {
      assert.deepEqual(body, { email, code: '00123456' })
      return Response.json({ expiresInSeconds: 300 }, { headers: { 'Set-Cookie': authorizationCookie } })
    }
    assert.equal(request.url, `${apiOrigin}/api/v1/auth/password-reset/confirm`)
    assert.deepEqual(body, { password: 'new-password-123', confirmPassword: 'new-password-123' })
    assert.equal(request.headers.get('Cookie'), 'extraok_password_reset=test-reset-authorization')
    return new Response(null, { status: 204, headers: { 'Set-Cookie': clearedCookie } })
  })

  function post(path: string, body: unknown, cookie?: string) {
    return worker.fetch(new Request(`${siteOrigin}/api/v1/auth/password-reset/${path}`, {
      method: 'POST',
      headers: {
        Origin: siteOrigin,
        'Content-Type': 'application/json',
        'X-Requested-With': 'ExtraOK-Web',
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: JSON.stringify(body),
    }), env)
  }

  const requested = await post('request', { email })
  assert.equal(requested.status, 202)
  assert.equal((await requested.json() as { codeLength: number }).codeLength, 8)
  const verified = await post('verify', { email, code: '00123456' })
  assert.deepEqual(await verified.json(), { expiresInSeconds: 300 })
  assert.equal(verified.headers.get('Set-Cookie'), authorizationCookie)
  const confirmed = await post('confirm', { password: 'new-password-123', confirmPassword: 'new-password-123' }, 'extraok_password_reset=test-reset-authorization')
  assert.equal(confirmed.status, 204)
  assert.equal(await confirmed.text(), '')
  assert.equal(confirmed.headers.get('Set-Cookie'), clearedCookie)
  assert.equal(confirmed.headers.get('Cache-Control'), 'no-store')
})

test('password recovery errors and limits reach the browser without an SPA response', async (t) => {
  const env: Env = {
    API_ORIGIN: 'https://extraok-api.onrender.com',
    ASSETS: { fetch: async () => new Response('<html>ExtraOK</html>') },
  }
  for (const [status, code] of [[400, 'VALIDATION'], [429, 'RATE_LIMITED'], [503, 'INTERNAL_ERROR']] as const) {
    const fetchMock = t.mock.method(globalThis, 'fetch', async () => Response.json({ error: { code } }, { status, headers: { 'Retry-After': '60' } }))
    const response = await worker.fetch(new Request('https://extraok-web.example.workers.dev/api/v1/auth/password-reset/verify', { method: 'POST' }), env)
    assert.equal(response.status, status)
    assert.deepEqual(await response.json(), { error: { code } })
    assert.equal(response.headers.get('Retry-After'), '60')
    assert.equal(response.headers.get('Cache-Control'), 'no-store')
    fetchMock.mock.restore()
  }
})
