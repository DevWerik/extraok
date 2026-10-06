import { diagnosePix } from "../modules/billing/diagnose.js";

async function main() {
  const reference = process.argv[2];
  if (!reference || process.stdin.isTTY) {
    console.error("Use o comando documentado em apps/api/BILLING.md. O token deve vir pela entrada padrão, nunca como argumento.");
    process.exitCode = 1;
    return;
  }
  let input = "";
  for await (const chunk of process.stdin) {
    input += chunk.toString();
    if (input.length > 8192) throw new Error("INVALID_TOKEN_INPUT");
  }
  const token = input.trim();
  input = "";
  console.log("Diagnóstico somente de leitura; credencial informada neste terminal, sem carregar .env.");
  const report = await diagnosePix(token, reference);
  console.log(JSON.stringify(report, null, 2));
  console.log("Nenhuma cobrança criada ou alterada. Este resultado não confirma as variáveis salvas no Render nem a entrega do webhook.");
}

main().catch(() => {
  console.error("Diagnóstico não concluído. Confira o ID da cobrança e informe o token somente pela entrada padrão.");
  process.exitCode = 1;
});
