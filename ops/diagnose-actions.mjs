import { appendFile, mkdir, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

const flagState = (value) => value === 'true' ? 'true' : value === 'false' ? 'false' : value ? 'invalid-value' : 'missing'
const runSummary = (run) => ({
  id: run.id,
  event: run.event,
  status: run.status,
  conclusion: run.conclusion,
  createdAt: run.created_at,
  branch: run.head_branch,
  commit: run.head_sha,
  actor: run.actor?.login ?? null,
})

export async function diagnoseActions({ repository, token, monitorEnabled, backupEnabled, request = fetch }) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository ?? '') || !token) {
    throw new Error('Execute o diagnóstico pelo workflow do GitHub, com o token automático.')
  }
  const errors = []
  async function get(path) {
    try {
      const response = await request(`https://api.github.com/repos/${repository}${path}`, {
        method: 'GET',
        redirect: 'error',
        signal: AbortSignal.timeout(20_000),
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${token}`,
          'X-GitHub-Api-Version': '2026-03-10',
          'User-Agent': 'ExtraOK-actions-diagnostics',
        },
      })
      if (!response.ok) {
        await response.body?.cancel()
        errors.push({ path, status: response.status })
        return null
      }
      return await response.json()
    } catch {
      errors.push({ path, status: 'network-timeout-or-invalid-response' })
      return null
    }
  }
  const workflowPath = '/actions/workflows/availability.yml'
  const [repo, workflow, scheduled, recent] = await Promise.all([
    get(''),
    get(workflowPath),
    get(`${workflowPath}/runs?event=schedule&per_page=10`),
    get(`${workflowPath}/runs?per_page=10`),
  ])
  const source = repo?.default_branch
    ? await get(`/contents/.github/workflows/availability.yml?ref=${encodeURIComponent(repo.default_branch)}`)
    : null
  const sourceText = source?.encoding === 'base64' && typeof source.content === 'string'
    ? Buffer.from(source.content, 'base64').toString('utf8') : null
  const latestScheduledRun = scheduled?.workflow_runs?.[0]
  const jobs = latestScheduledRun
    ? await get(`/actions/runs/${encodeURIComponent(latestScheduledRun.id)}/jobs?per_page=100`)
    : null
  return {
    checkedAt: new Date().toISOString(),
    mode: 'Somente leitura dos metadados do GitHub; não executa o monitor nem envia alertas.',
    apiQueriesOk: errors.length === 0,
    repository: repo ? {
      name: repository, defaultBranch: repo.default_branch,
      private: repo.private, fork: repo.fork, archived: repo.archived, disabled: repo.disabled,
    } : null,
    flags: { monitor: flagState(monitorEnabled), backup: flagState(backupEnabled) },
    workflow: workflow ? {
      id: workflow.id, path: workflow.path, state: workflow.state,
      createdAt: workflow.created_at, updatedAt: workflow.updated_at,
    } : null,
    defaultBranchFile: sourceText === null ? null : {
      blobSha: source.sha,
      cronLines: sourceText.split(/\r?\n/).filter((line) => /^\s*-?\s*cron\s*:/.test(line)).map((line) => line.trim()),
    },
    scheduledRunCount: scheduled?.total_count ?? null,
    latestScheduledRuns: scheduled?.workflow_runs?.map(runSummary) ?? null,
    latestScheduledJobs: jobs?.jobs?.map((job) => ({
      id: job.id, name: job.name, status: job.status, conclusion: job.conclusion,
    })) ?? null,
    recentRuns: recent?.workflow_runs?.map(runSummary) ?? null,
    errors,
    limitation: 'Uma consulta bem-sucedida não significa agendamento saudável. Contagem zero não identifica, sozinha, a causa; consulta negada aparece como null, não como zero.',
  }
}

async function main() {
  const report = await diagnoseActions({
    repository: process.env.GITHUB_REPOSITORY,
    token: process.env.GH_TOKEN,
    monitorEnabled: process.env.OPS_MONITOR_ENABLED,
    backupEnabled: process.env.OPS_BACKUP_ENABLED,
  })
  const json = JSON.stringify(report, null, 2)
  await mkdir('.ops-state', { recursive: true })
  await writeFile('.ops-state/actions-diagnostics.json', `${json}\n`)
  // Indent every line so API metadata stays text, never workflow commands.
  console.log(json.split('\n').map((line) => `    ${line}`).join('\n'))
  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(process.env.GITHUB_STEP_SUMMARY,
      `## Diagnóstico do agendamento\n\nConsultas concluídas: ${report.apiQueriesOk ? 'sim' : 'não'}. Isso não indica sucesso do monitor.\n\n${json.split('\n').map((line) => `    ${line}`).join('\n')}\n`)
  }
  if (!report.apiQueriesOk) process.exitCode = 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => {
    console.error('Não foi possível concluir o diagnóstico. Execute pelo GitHub Actions e confira as permissões de leitura.')
    process.exitCode = 1
  })
}
