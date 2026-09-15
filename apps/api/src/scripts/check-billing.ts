import "dotenv/config";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { envSchema } from "../config/env.js";

// Only configuration validation and SELECTs. Never starts the API/reconciliation,
// runs a migration, contacts the payment provider or prints configuration values.
async function main() {
  let pending = false;
  function report(ok: boolean, message: string) {
    console.log(`${ok ? "OK" : "PENDENTE"}: ${message}`);
    if (!ok) pending = true;
  }

  console.log("Verificação de Pix — ambiente deste terminal e apps/api/.env");
  const current = envSchema.safeParse(process.env);
  report(current.success, "Configuração atual da API");
  // Validate activation even when billing is currently switched off.
  const activation = envSchema.safeParse({ ...process.env, BILLING_ENABLED: "true" });
  if (!activation.success) {
    const fields = [...new Set(activation.error.issues.map((issue) => issue.path.join(".")))];
    for (const field of fields) report(false, `Preencher ou corrigir ${field}`);
  } else {
    report(true, "Formato das configurações para ativação do Pix");
  }
  report(current.success && current.data.BILLING_ENABLED, "BILLING_ENABLED=true");

  const connectionString = process.env.DATABASE_URL?.trim();
  let validDatabase = false;
  try { validDatabase = ["postgres:", "postgresql:"].includes(new URL(connectionString ?? "").protocol); } catch { /* Report without disclosing the value. */ }
  if (!validDatabase) {
    report(false, "Definir uma DATABASE_URL PostgreSQL válida para consultar as migrations");
  } else {
    const pool = new Pool({ connectionString, max: 1, connectionTimeoutMillis: 5_000, statement_timeout: 5_000, application_name: "extraok-billing-check" });
    pool.on("error", () => { report(false, "Conexão com o banco interrompida"); });
    try {
      const client = await pool.connect();
      try {
        await client.query("BEGIN READ ONLY");
        const schema = await client.query<{ payments: string | null; periods: string | null; usage: string | null; migrations: string | null }>(`
          SELECT to_regclass('billing_payments')::text AS payments,
                 to_regclass('billing_periods')::text AS periods,
                 to_regclass('approval_usage')::text AS usage,
                 to_regclass('_prisma_migrations')::text AS migrations
        `);
        const tables = schema.rows[0]!;
        report(Boolean(tables.payments && tables.periods && tables.usage), "Tabelas de planos e consumo presentes no banco configurado");
        if (tables.migrations) {
          const migration = await client.query<{ checksum: string; finished_at: Date | null; rolled_back_at: Date | null }>(
            "SELECT checksum, finished_at, rolled_back_at FROM _prisma_migrations WHERE migration_name = $1 AND rolled_back_at IS NULL ORDER BY started_at DESC LIMIT 1",
            ["0003_pix_billing"],
          );
          const applied = migration.rows[0];
          const sql = await readFile(new URL("../../prisma/migrations/0003_pix_billing/migration.sql", import.meta.url), "utf8");
          const lf = sql.replace(/\r\n/g, "\n");
          // Windows and Linux checkouts can differ only in line endings.
          const checksums = [sql, lf, lf.replace(/\n/g, "\r\n")].map((text) => createHash("sha256").update(text).digest("hex"));
          report(Boolean(applied?.finished_at && checksums.includes(applied.checksum)), "Migration 0003_pix_billing aplicada e compatível com este código");
        } else {
          report(false, "Histórico de migrations ausente: aplicar as migrations pelo Prisma");
        }
        await client.query("ROLLBACK");
      } finally { client.release(); }
    } catch {
      report(false, "Não foi possível consultar o banco ou conferir a migration; verifique conexão, permissões e arquivos do deploy");
    } finally { await pool.end(); }
  }

  console.log("Nenhuma cobrança criada, migration aplicada ou credencial exibida.");
  console.log("Esta checagem não valida o token no Mercado Pago nem a entrega do webhook. Consulte apps/api/BILLING.md para homologação.");
  process.exitCode = pending ? 1 : 0;
}

main().catch(() => {
  console.error("PENDENTE: falha na verificação do Pix. Confira a configuração e tente novamente.");
  process.exitCode = 1;
});
