import { writeFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { encryptionKey, readEncryptedBackup, disposablePostgres, databaseSummary } from './lib.mjs'

let database
const report = { startedAt: new Date().toISOString(), mode: 'Restauração somente em container novo, loopback/tmpfs; nunca no banco de produção.', cleanup: false }
try {
  if (!process.argv[2]) throw new Error('Uso: pnpm ops:restore arquivo.pgdump.enc')
  // Authenticate the entire archive before creating any database or executing restored SQL.
  const plain = await readEncryptedBackup(resolve(process.argv[2]), encryptionKey(process.env.BACKUP_ENCRYPTION_KEY))
  database = await disposablePostgres()
  await database.restore(plain)
  report.summary = await databaseSummary(database)
  report.status = 'passed'
} catch (error) { report.status = 'failed'; report.error = error.message; process.exitCode = 1 }
finally {
  if (database) { try { await database.close(); report.cleanup = true } catch (error) { report.cleanupError = error.message; process.exitCode = 1 } }
  report.finishedAt = new Date().toISOString()
  const file = resolve(process.env.RESTORE_REPORT_PATH || '.ops-state/restore-report.json')
  await mkdir(dirname(file), { recursive: true, mode: 0o700 })
  await writeFile(file, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 })
  console.log(JSON.stringify({ status: report.status, cleanup: report.cleanup, report: file }))
}
