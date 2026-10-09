import { encryptionKey, postgresImage, run, saveBackup } from './lib.mjs'

try {
  const key = encryptionKey(process.env.BACKUP_ENCRYPTION_KEY)
  if (!process.env.BACKUP_DATABASE_URL) throw new Error('Defina BACKUP_DATABASE_URL separadamente; DATABASE_URL do produto nunca é carregada automaticamente.')
  let url
  try { url = new URL(process.env.BACKUP_DATABASE_URL) } catch { throw new Error('BACKUP_DATABASE_URL inválida.') }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || !url.username || !url.pathname.slice(1)) throw new Error('A origem deve ser uma URL PostgreSQL completa.')
  if (url.hostname.includes('-pooler.')) throw new Error('Use a conexão direta do Neon para pg_dump, não a conexão pooled.')
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  const env = {
    PGHOST: local ? 'host.docker.internal' : url.hostname, PGPORT: url.port || '5432',
    PGDATABASE: decodeURIComponent(url.pathname.slice(1)), PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password),
    PGSSLMODE: local ? 'disable' : 'verify-full', ...(local ? {} : { PGSSLROOTCERT: 'system' }),
    PGCONNECT_TIMEOUT: '20', PGOPTIONS: '-c default_transaction_read_only=on',
  }
  const plain = await run('docker', ['run', '--rm', '--interactive', ...Object.keys(env).flatMap(name => ['--env', name]), postgresImage, 'pg_dump', '--format=custom', '--no-owner', '--no-acl', '--lock-wait-timeout=15000'], { env })
  const result = await saveBackup(plain, key, process.env.BACKUP_OUTPUT_DIR || '.backups')
  console.log(JSON.stringify({ status: 'created', ...result, createdAt: new Date().toISOString(), source: local ? 'local-explicit' : 'remote-explicit' }))
} catch (error) { console.error(error.message); process.exitCode = 1 }
