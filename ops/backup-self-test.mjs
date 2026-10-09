import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { disposablePostgres, databaseSummary, saveBackup, readEncryptedBackup, decryptBackup, run } from './lib.mjs'

const key = randomBytes(32), report = { startedAt: new Date().toISOString(), mode: 'Somente dados sintéticos; não comprova retenção/backup do Neon de produção.', checks: [], cleanup: false }
let source, target
const directory = resolve('.ops-state/backup-self-test')
await mkdir(directory, { recursive: true, mode: 0o700 })
try {
  source = await disposablePostgres()
  const env = { DATABASE_URL: source.url, TEST_DATABASE_URL: source.url }
  const args = process.platform === 'win32' ? ['/d', '/s', '/c', 'pnpm.cmd --filter @extraok/api prisma:migrate:deploy'] : ['--filter', '@extraok/api', 'prisma:migrate:deploy']
  await run(process.platform === 'win32' ? 'cmd.exe' : 'pnpm', args, { env })
  await source.sql(`
    INSERT INTO users(id,name,business_name,email,phone,password_hash,terms_version,terms_accepted_at,updated_at)
      SELECT ('00000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid, 'Auditoria Sintética', 'Backup teste', 'backup-'||n||'@example.invalid', '00000000000', 'synthetic-not-a-login-hash', 'restore-test', now(), now() FROM generate_series(1,2) n;
    INSERT INTO clients(id,owner_id,name,phone,email,notes,updated_at)
      SELECT ('10000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid, ('00000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid, 'Cliente sintético', '00000000000', 'client-'||n||'@example.invalid', 'Acentuação, dados de teste.', now() FROM generate_series(1,2) n;
    INSERT INTO jobs(id,owner_id,client_id,title,description,scheduled_at,status,updated_at)
      SELECT ('20000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid, ('00000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid, ('10000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid, 'Atendimento sintético', 'Não é um atendimento real', now(), 'scheduled', now() FROM generate_series(1,2) n;
    INSERT INTO extras(id,job_id,title,description,price_cents,status,updated_at)
      SELECT ('30000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid, ('20000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid, 'Extra sintético', 'Somente restauração', 123*n, 'pending', now() FROM generate_series(1,2) n;
  `)
  const before = await databaseSummary(source, { fingerprint: true })
  assert.equal(before.tables._prisma_migrations.rows, 6)
  const backup = await saveBackup(await source.dump(), key, directory)
  report.backup = { bytes: backup.bytes, sha256: backup.sha256, algorithm: backup.algorithm }
  const encrypted = await readFile(backup.file)
  assert.equal(encrypted.includes(Buffer.from('Cliente sintético')), false)
  assert.throws(() => decryptBackup(encrypted, randomBytes(32)), /adulterado|incorreta/)
  const tampered = Buffer.from(encrypted); tampered[tampered.length - 1] ^= 1
  assert.throws(() => decryptBackup(tampered, key), /adulterado|incorreta/)
  report.checks.push('Backup criptografado; chave errada e adulteração recusadas antes do restore')
  target = await disposablePostgres()
  await target.restore(await readEncryptedBackup(backup.file, key))
  const after = await databaseSummary(target, { fingerprint: true })
  assert.deepEqual(after, before)
  report.checks.push('14 tabelas, contagens, fingerprints de todas as linhas e constraints iguais após restauração')
  assert.equal(await target.sql("SELECT count(*) FROM jobs j JOIN clients c ON c.id=j.client_id WHERE j.owner_id<>c.owner_id;"), '0')
  report.checks.push('Vínculo entre atendimento, cliente e dono preservado')
  await assert.rejects(target.sql("DELETE FROM clients WHERE id='10000000-0000-4000-8000-000000000001';"))
  report.checks.push('Foreign key impede excluir cliente com atendimento após restore')
  report.summary = after
  report.status = 'passed'
} catch (error) { report.status = 'failed'; report.error = error.message; process.exitCode = 1 }
finally {
  const cleanup = await Promise.allSettled([source?.close(), target?.close()])
  report.cleanup = cleanup.every(r => r.status === 'fulfilled')
  if (!report.cleanup) process.exitCode = 1
  report.finishedAt = new Date().toISOString()
  await writeFile(resolve(directory, 'report.json'), JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify(report))
}
