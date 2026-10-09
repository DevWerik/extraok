import { mkdir, writeFile } from 'node:fs/promises'
const report = { checkedAt: new Date().toISOString(), mutations: false }
async function get(url, token) {
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(20000) })
  if (!response.ok) throw new Error(`Consulta administrativa recusada (HTTP ${response.status}).`)
  return response.json()
}
if (process.env.NEON_API_KEY && process.env.NEON_PROJECT_ID) {
  try {
    const { project } = await get('https://console.neon.tech/api/v2/projects/' + encodeURIComponent(process.env.NEON_PROJECT_ID), process.env.NEON_API_KEY)
    report.neon = { status: 'read', postgresVersion: project?.pg_version, historyRetentionSeconds: project?.history_retention_seconds ?? null, backupRestoredFromProduction: false }
  } catch (error) { report.neon = { status: 'failed', message: error.message } }
} else report.neon = { status: 'pending-access', missing: ['NEON_API_KEY', 'NEON_PROJECT_ID'].filter(n => !process.env[n]), backupRestoredFromProduction: false }
if (process.env.RENDER_API_KEY && process.env.RENDER_SERVICE_ID) {
  try {
    const service = await get('https://api.render.com/v1/services/' + encodeURIComponent(process.env.RENDER_SERVICE_ID), process.env.RENDER_API_KEY)
    report.render = { status: 'read', healthCheckPath: service.serviceDetails?.healthCheckPath ?? null, configuredForDatabaseCheck: service.serviceDetails?.healthCheckPath === '/ready', notificationSettings: 'Confirmar destinatários no painel Render; esta consulta não os atesta.' }
  } catch (error) { report.render = { status: 'failed', message: error.message } }
} else report.render = { status: 'pending-access', missing: ['RENDER_API_KEY', 'RENDER_SERVICE_ID'].filter(n => !process.env[n]), notificationSettings: 'not-verified' }
await mkdir('.ops-state', { recursive: true, mode: 0o700 })
await writeFile('.ops-state/hosting-report.json', JSON.stringify(report, null, 2) + '\n', { mode: 0o600 })
console.log(JSON.stringify(report))
if (report.neon.status !== 'read' || report.render.status !== 'read') process.exitCode = 2
