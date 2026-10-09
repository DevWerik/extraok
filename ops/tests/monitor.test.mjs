import assert from 'node:assert/strict'
import test from 'node:test'
import { spawnSync } from 'node:child_process'
import { mkdtemp, readFile, rm, rmdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { checkTarget, monitor, notify, alertConfig } from '../monitor.mjs'

const target = { name: 'Banco', url: 'https://api.example.test/ready', kind: 'json', expected: 'ready' }
test('monitor distingue banco pronto de 200 com erro, HTML e falhas HTTP/rede', async () => {
  for (const [response, expected] of [[Response.json({ status: 'ready' }), true], [Response.json({ status: 'unavailable' }), false], [new Response('<html>login</html>'), false], [new Response('', { status: 503 }), false]]) {
    assert.equal((await checkTarget(target, { fetcher: async () => response })).ok, expected)
  }
  assert.equal((await checkTarget(target, { fetcher: async () => { throw new Error('secret provider detail') } })).ok, false)
})
test('monitor repete falha transitória e usa a segunda resposta válida', async () => {
  let calls = 0
  const result = await monitor({ targets: [target], retryMs: 0, fetcher: async () => { calls++; return calls === 1 ? new Response('', { status: 503 }) : Response.json({ status: 'ready' }) } })
  assert.equal(calls, 2); assert.equal(result.ok, true)
  assert.equal(result.recoveredAfterRetry, true)
  assert.equal(result.attemptHistory.length, 2)
  assert.equal(result.attemptHistory[0].checks[0].ok, false)
  assert.equal(result.attemptHistory[1].checks[0].ok, true)
})

test('monitor permite recuperação na quarta tentativa e preserva os timeouts anteriores', async () => {
  let calls = 0
  const result = await monitor({ targets: [target], retryMs: 0, fetcher: async () => {
    calls++
    if (calls < 4) throw new DOMException('synthetic timeout', 'TimeoutError')
    return Response.json({ status: 'ready' })
  } })
  assert.equal(calls, 4)
  assert.equal(result.ok, true)
  assert.equal(result.recoveredAfterRetry, true)
  assert.equal(result.attemptHistory.length, 4)
  assert.equal(result.attemptHistory.slice(0, 3).every(a => a.checks[0].ok === false), true)
  assert.equal(result.checks[0].ok, true)
})

test('monitor encerra falha persistente após quatro tentativas e não marca recuperação', async () => {
  let calls = 0
  const result = await monitor({ targets: [target], retryMs: 0, fetcher: async () => {
    calls++
    return new Response('', { status: 503 })
  } })
  assert.equal(calls, 4)
  assert.equal(result.ok, false)
  assert.equal(result.recoveredAfterRetry, false)
  assert.equal(result.attemptHistory.length, 4)
  assert.equal(result.checks[0].reason, 'HTTP 503')
})

test('monitor encerra na primeira tentativa quando todos os serviços estão saudáveis', async () => {
  let calls = 0
  const result = await monitor({ targets: [target], retryMs: 0, fetcher: async () => {
    calls++
    return Response.json({ status: 'ready' })
  } })
  assert.equal(calls, 1)
  assert.equal(result.ok, true)
  assert.equal(result.recoveredAfterRetry, false)
  assert.equal(result.attemptHistory.length, 1)
})
test('alerta exige configuração, rejeita injeção de header e envia somente resumo técnico', async () => {
  const report = { id: 'test', checkedAt: '2026-10-09T12:00:00Z', checks: [{ name: 'Banco', ok: false, reason: 'HTTP 503' }] }
  await assert.rejects(notify(report, {}), /Configure/)
  assert.throws(() => alertConfig({ OPS_ALERT_FROM: 'ops@example.test', OPS_RESEND_API_KEY: 'fake-test-only' }), /Configure/)
  await assert.rejects(notify(report, { OPS_ALERT_TO: 'a@example.test\nBcc:b@example.test', OPS_ALERT_FROM: 'ops@example.test', OPS_RESEND_API_KEY: 'fake' }), /Configure/)
  let sent
  const env = { OPS_ALERT_TO: 'audit@example.test', OPS_ALERT_FROM: 'ops@example.test', OPS_RESEND_API_KEY: 'fake-test-only' }
  assert.equal(await notify(report, env, async (url, request) => { sent = { url, request }; return Response.json({ id: 'test-only' }) }), 'accepted-by-provider')
  assert.equal(sent.url, 'https://api.resend.com/emails'); assert.equal(sent.request.redirect, 'error')
  assert.equal(sent.request.headers['Idempotency-Key'], 'extraok-ops-test')
  const body = JSON.parse(sent.request.body)
  assert.deepEqual(body.to, ['audit@example.test']); assert.match(body.text, /HTTP 503/); assert.equal(body.html, undefined)
  await assert.rejects(notify(report, env, async () => new Response('provider-secret', { status: 401 })), error => !error.message.includes('provider-secret'))
})

test('CLI recusa notificações sem configuração antes de consultar a rede e registra a falha', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'extraok-monitor-test-'))
  const reportPath = join(directory, 'report.json')
  try {
    const result = spawnSync(process.execPath, ['ops/monitor.mjs', '--notify'], {
      env: { ...process.env, OPS_RESEND_API_KEY: '', OPS_ALERT_FROM: '', OPS_ALERT_TO: '', OPS_REPORT_PATH: reportPath },
      encoding: 'utf8', timeout: 5000, windowsHide: true,
    })
    assert.equal(result.status, 1)
    assert.match(result.stderr, /Configure/)
    const report = JSON.parse(await readFile(reportPath, 'utf8'))
    assert.equal(report.ok, false)
    assert.equal(report.notification, 'configuration-invalid')
    assert.deepEqual(report.checks, [])
  } finally { await rm(reportPath, { force: true }); await rmdir(directory) }
})
