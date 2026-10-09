import { spawn } from 'node:child_process'
import { randomBytes, createCipheriv, createDecipheriv, createHash } from 'node:crypto'
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

export const postgresImage = 'postgres:18.6-alpine3.24'
const postgresMount = '/var/lib/postgresql'
const postgresDataDirectory = `${postgresMount}/18/docker`
const magic = Buffer.from('EXTRAOK_BACKUP_V1\n')
const maxBytes = 512 * 1024 * 1024
export function encryptionKey(value) {
  if (!/^[a-fA-F0-9]{64}$/.test(value ?? '')) throw new Error('BACKUP_ENCRYPTION_KEY deve conter 32 bytes aleatórios em hexadecimal (64 caracteres).')
  return Buffer.from(value, 'hex')
}
export function encryptBackup(plain, key) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  cipher.setAAD(magic)
  const encrypted = Buffer.concat([cipher.update(plain), cipher.final()])
  return Buffer.concat([magic, iv, cipher.getAuthTag(), encrypted])
}
export function decryptBackup(encrypted, key) {
  if (!encrypted.subarray(0, magic.length).equals(magic) || encrypted.length < magic.length + 29) throw new Error('Formato de backup inválido.')
  const start = magic.length
  const decipher = createDecipheriv('aes-256-gcm', key, encrypted.subarray(start, start + 12))
  decipher.setAAD(magic)
  decipher.setAuthTag(encrypted.subarray(start + 12, start + 28))
  try { return Buffer.concat([decipher.update(encrypted.subarray(start + 28)), decipher.final()]) }
  catch { throw new Error('Backup adulterado ou chave incorreta. Nenhuma restauração iniciada.') }
}
export async function readEncryptedBackup(path, key) {
  if ((await stat(path)).size > maxBytes) throw new Error('Backup excede o limite de 512 MiB desta ferramenta. Use restauração administrada.')
  return decryptBackup(await readFile(path), key)
}
export async function saveBackup(plain, key, directory) {
  if (plain.length > maxBytes - 1024) throw new Error('Backup excede o limite de 512 MiB desta ferramenta.')
  const output = resolve(directory)
  if (/(?:^|[\\/])(?:public|dist)(?:[\\/]|$)/i.test(output)) throw new Error('Backups não podem ficar em pastas de publicação.')
  await mkdir(output, { recursive: true, mode: 0o700 })
  const file = resolve(output, `extraok-${new Date().toISOString().replaceAll(':', '-')}-${randomBytes(3).toString('hex')}.pgdump.enc`)
  const encrypted = encryptBackup(plain, key)
  await writeFile(file, encrypted, { flag: 'wx', mode: 0o600 })
  return { file, bytes: encrypted.length, sha256: createHash('sha256').update(encrypted).digest('hex'), algorithm: 'AES-256-GCM' }
}
// Never echo command arguments, SQL results or provider stderr: they can contain personal data.
export function run(bin, args, { env = {}, input, maxOutput = maxBytes } = {}) {
  return new Promise((done, reject) => {
    const child = spawn(bin, args, { env: { ...process.env, ...env }, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
    const chunks = []; let size = 0; let failure
    const timer = setTimeout(() => { failure = new Error('Operação excedeu 10 minutos.'); child.kill() }, 600_000)
    child.on('error', error => { clearTimeout(timer); reject(new Error(`Não foi possível iniciar ${bin}: ${error.code ?? 'erro'}`)) })
    child.stdout.on('data', bytes => { size += bytes.length; if (size > maxOutput) { failure = new Error('Saída excede o limite da ferramenta.'); child.kill() } else chunks.push(bytes) })
    child.stderr.on('data', () => {})
    child.stdin.on('error', () => {})
    child.on('close', code => { clearTimeout(timer); code === 0 && !failure ? done(Buffer.concat(chunks)) : reject(failure ?? new Error(`${bin} encerrou com código ${code}; saída sensível omitida.`)) })
    child.stdin.end(input)
  })
}
export async function disposablePostgres() {
  const id = randomBytes(8).toString('hex'), name = `extraok-restore-${id}`, password = randomBytes(32).toString('hex')
  const env = { POSTGRES_USER: 'audit', POSTGRES_DB: 'restore', POSTGRES_PASSWORD: password }
  await run('docker', ['run', '--detach', '--rm', '--name', name, '--label', `extraok.restore-drill=${id}`, '--publish', '127.0.0.1::5432', '--tmpfs', `${postgresMount}:rw`, '--env', 'POSTGRES_USER', '--env', 'POSTGRES_DB', '--env', 'POSTGRES_PASSWORD', postgresImage], { env })
  async function inspect() {
    const value = JSON.parse((await run('docker', ['inspect', name])).toString())[0]
    if (value.Name !== '/' + name || value.Config.Labels['extraok.restore-drill'] !== id) throw new Error('Container não pertence a este teste.')
    return value
  }
  async function close() { await inspect(); await run('docker', ['stop', '--time', '5', name]) }
  try {
    const value = await inspect(), binding = value.NetworkSettings.Ports['5432/tcp'][0]
    if (binding.HostIp !== '127.0.0.1') throw new Error('Porta de banco fora do loopback.')
    if (!Object.hasOwn(value.HostConfig.Tmpfs ?? {}, postgresMount) || !value.Config.Env.includes(`PGDATA=${postgresDataDirectory}`)) throw new Error('Diretório de dados do PostgreSQL fora do tmpfs esperado.')
    for (let n = 0; n < 40; n++) {
      try { await run('docker', ['exec', name, 'pg_isready', '-U', 'audit', '-d', 'restore']); break }
      catch (error) { if (n === 39) throw error; await delay(500) }
    }
    return {
      name, close, url: `postgresql://audit:${password}@127.0.0.1:${binding.HostPort}/restore`,
      sql: async sql => (await run('docker', ['exec', '-i', name, 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'audit', '-d', 'restore', '-At'], { input: sql })).toString().trim(),
      dump: () => run('docker', ['exec', name, 'pg_dump', '-U', 'audit', '-d', 'restore', '--format=custom', '--no-owner', '--no-acl']),
      restore: plain => run('docker', ['exec', '-i', name, 'pg_restore', '-U', 'audit', '-d', 'restore', '--no-owner', '--no-acl', '--single-transaction', '--exit-on-error'], { input: plain }),
    }
  } catch (error) { await close(); throw error }
}
export const appTables = ['_prisma_migrations', 'users', 'sessions', 'clients', 'jobs', 'extras', 'approval_links', 'password_reset_states', 'password_reset_challenges', 'password_reset_grants', 'password_reset_deliveries', 'billing_payments', 'billing_periods', 'approval_usage']
export async function databaseSummary(database, { fingerprint = false } = {}) {
  const tables = {}
  for (const name of appTables) {
    const projection = fingerprint ? "json_build_object('rows', count(*), 'fingerprint', md5(coalesce(string_agg(to_jsonb(t)::text, '' ORDER BY to_jsonb(t)::text), '')))" : "json_build_object('rows', count(*))"
    tables[name] = JSON.parse(await database.sql(`SELECT ${projection} FROM "${name}" t;`))
  }
  const constraints = JSON.parse(await database.sql("SELECT json_build_object('foreignKeys', count(*) FILTER (WHERE contype='f'), 'checks', count(*) FILTER (WHERE contype='c'), 'invalid', count(*) FILTER (WHERE NOT convalidated)) FROM pg_constraint WHERE connamespace='public'::regnamespace;"))
  if (constraints.invalid !== 0) throw new Error('Constraints não validadas após a restauração.')
  return { tables, constraints }
}
