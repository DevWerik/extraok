import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'

export const defaultTargets = [
  { name: 'Site', url: 'https://app.extraok.workers.dev/', kind: 'html' },
  { name: 'API', url: 'https://extraok-api.onrender.com/health', kind: 'json', expected: 'ok' },
  { name: 'Banco via API', url: 'https://extraok-api.onrender.com/ready', kind: 'json', expected: 'ready' },
  { name: 'Proxy e banco', url: 'https://app.extraok.workers.dev/ready', kind: 'json', expected: 'ready' },
]

export async function checkTarget(target, { fetcher = fetch, timeoutMs = 25000 } = {}) {
  const start = Date.now()
  try {
    const response = await fetcher(target.url, { redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(timeoutMs), headers: { 'User-Agent': 'ExtraOK-Availability-Monitor/1.0' } })
    if (response.status !== 200) return { name: target.name, ok: false, reason: `HTTP ${response.status}`, durationMs: Date.now() - start }
    if (target.kind === 'json') {
      const body = await response.json()
      if (body?.status !== target.expected) return { name: target.name, ok: false, reason: 'Contrato de saúde inesperado', durationMs: Date.now() - start }
    } else {
      const body = await response.text()
      if (!response.headers.get('content-type')?.includes('text/html') || !body.includes('id="root"') || !/\/assets\/[^"']+\.js/.test(body)) {
        return { name: target.name, ok: false, reason: 'HTML do aplicativo indisponível', durationMs: Date.now() - start }
      }
    }
    return { name: target.name, ok: true, durationMs: Date.now() - start }
  } catch { return { name: target.name, ok: false, reason: 'Timeout, redirecionamento ou falha de rede/resposta', durationMs: Date.now() - start } }
}

export function alertConfig(env = process.env) {
  const email = /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/
  const recipient = env.OPS_ALERT_TO
  const sender = env.OPS_ALERT_FROM
  if (!email.test(recipient ?? '') || !email.test(sender ?? '') || !env.OPS_RESEND_API_KEY?.trim()) throw new Error('Configure OPS_RESEND_API_KEY, OPS_ALERT_FROM (remetente verificado) e OPS_ALERT_TO antes de ativar notificações.')
  return { recipient, sender, key: env.OPS_RESEND_API_KEY }
}

export async function notify(report, env = process.env, fetcher = fetch) {
  const { recipient, sender, key } = alertConfig(env)
  const response = await fetcher('https://api.resend.com/emails', {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'Idempotency-Key': `extraok-ops-${report.id}` },
    body: JSON.stringify({ from: sender, to: [recipient], subject: report.testAlert ? '[ExtraOK] Teste de alerta operacional' : '[ExtraOK] Verificação operacional falhou', text: [report.testAlert ? 'Teste de entrega solicitado pelo operador.' : 'Uma verificação operacional do ExtraOK falhou.', `Data UTC: ${report.checkedAt}`, ...report.checks.map(c => `${c.name}: ${c.ok ? 'OK' : c.reason}`), 'Consulte o relatório da execução e os painéis da hospedagem. Nenhum dado de cliente está incluído.'].join('\n') }),
  })
  if (!response.ok) throw new Error(`Provedor de e-mail recusou o alerta (HTTP ${response.status}); resposta sensível omitida.`)
  return 'accepted-by-provider'
}

export async function monitor({ targets = defaultTargets, attempts = 4, retryMs = 5000, fetcher = fetch } = {}) {
  // Four bounded attempts allow ~115s for the configured Render Free instance to start.
  // Preserve every attempt so recovery does not erase timeouts or other failures.
  const startedAt = new Date().toISOString()
  const attemptHistory = []
  let checks
  for (let attempt = 1; attempt <= attempts; attempt++) {
    checks = await Promise.all(targets.map(t => checkTarget(t, { fetcher })))
    attemptHistory.push({ attempt, checkedAt: new Date().toISOString(), checks })
    if (checks.every(c => c.ok) || attempt === attempts) break
    await delay(retryMs)
  }
  const ok = checks.every(c => c.ok)
  return { id: `${Date.now()}-${process.pid}`, startedAt, checkedAt: new Date().toISOString(), ok, recoveredAfterRetry: ok && attemptHistory.length > 1, checks, attemptHistory }
}

async function main() {
  const testAlert = process.argv.includes('--send-test-alert')
  if (process.argv.includes('--notify') || testAlert || process.argv.includes('--check-config')) {
    try { alertConfig() }
    catch (error) {
      const output = resolve(process.env.OPS_REPORT_PATH || '.ops-state/monitor-report.json')
      await mkdir(dirname(output), { recursive: true, mode: 0o700 })
      await writeFile(output, JSON.stringify({ checkedAt: new Date().toISOString(), ok: false, checks: [], notification: 'configuration-invalid', notificationError: error.message }, null, 2) + '\n', { mode: 0o600 })
      console.error(error.message); process.exitCode = 1; return
    }
    if (process.argv.includes('--check-config')) { console.log('Configuração de alertas preenchida; envio ainda não testado.'); return }
  }
  const report = testAlert ? { id: `${Date.now()}-${process.pid}`, checkedAt: new Date().toISOString(), ok: true, testAlert: true, checks: [{ name: 'Canal de alertas', ok: true }] } : await monitor()
  if (testAlert || (!report.ok && process.argv.includes('--notify'))) {
    try { report.notification = await notify(report) }
    catch (error) { report.notification = 'failed'; report.notificationError = error.message; process.exitCode = 1 }
  } else report.notification = 'not-requested'
  const output = resolve(process.env.OPS_REPORT_PATH || '.ops-state/monitor-report.json')
  await mkdir(dirname(output), { recursive: true, mode: 0o700 })
  await writeFile(output, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 })
  console.log(JSON.stringify(report))
  if (!report.ok) process.exitCode = 1
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main()
