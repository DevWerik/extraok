import "dotenv/config";
import { Pool } from "pg";
import { z } from "zod";
import { envSchema } from "../config/env.js";

// Local operator command only. No HTTP endpoint and no account/permission writes.
async function main() {
  const email = z.email().safeParse(process.argv[2]?.trim().toLowerCase());
  if (!email.success || process.argv.length !== 3) {
    console.error("Uso: pnpm.cmd billing:owner email-da-conta@example.com");
    process.exitCode = 1;
    return;
  }
  const environment = envSchema.safeParse(process.env);
  if (!environment.success) {
    console.error(`Revise as configurações da API: ${[...new Set(environment.error.issues.map((issue) => issue.path.join(".")))].join(", ")}`);
    process.exitCode = 1;
    return;
  }
  const pool = new Pool({ connectionString: environment.data.DATABASE_URL, max: 1, connectionTimeoutMillis: 5000, statement_timeout: 5000 });
  pool.on("error", () => { console.error("Conexão com o banco interrompida."); process.exitCode = 1; });
  try {
    const client = await pool.connect();
    try {
      await client.query("BEGIN READ ONLY");
      const result = await client.query<{ id: string; email: string }>("SELECT id, email FROM users WHERE email = $1 LIMIT 2", [email.data]);
      await client.query("ROLLBACK");
      if (result.rows.length !== 1) {
        console.error("Não foi encontrada uma única conta com esse e-mail no banco configurado.");
        process.exitCode = 1;
        return;
      }
      const user = result.rows[0]!;
      console.log(`Conta encontrada: ${user.email}`);
      console.log(`BILLING_OWNER_USER_ID=${user.id}`);
      console.log(environment.data.BILLING_OWNER_USER_ID === user.id
        ? "A isenção está configurada para esta conta neste ambiente. A API precisa carregar essa configuração ao iniciar."
        : "Configure esse ID somente na API para ativar a isenção neste ambiente.");
      console.log("Nenhuma permissão, cobrança ou conta foi alterada por este comando.");
    } finally { client.release(); }
  } finally { await pool.end(); }
}

main().catch(() => {
  console.error("Não foi possível consultar a conta. Confira a conexão e as permissões do banco configurado.");
  process.exitCode = 1;
});
