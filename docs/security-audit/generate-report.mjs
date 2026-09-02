import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const outputDirectory = scriptDirectory;
const htmlPath = join(outputDirectory, "relatorio-auditoria-seguranca.html");
const pdfPath = join(outputDirectory, "relatorio-auditoria-seguranca.pdf");
const previewDirectory = join(outputDirectory, "previews");
const temporaryDirectory = join(outputDirectory, ".render-tmp");

const AUDIT_DATE = "02 de setembro de 2026";
const REMEDIATION_DATE = "02 de setembro de 2026";
const AUDIT_BASE_COMMIT = "bb164eb957eaf688a4f7a5322750c6b49e5e7df8";
const REPORT_TITLE = "Relatório de Auditoria de Segurança — ExtraOK";

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function codeBlock(value, className = "") {
  return `<pre class="code-block ${className}"><code>${escapeHtml(value.trim())}</code></pre>`;
}

function severityChip(severity) {
  const slug = severity.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return `<span class="chip chip-${slug}">${severity}</span>`;
}

function resultChip(result) {
  const className = result === "Não se aplica" ? "neutral" : "strong";
  return `<span class="result-chip result-${className}">${result}</span>`;
}

let pageNumber = 0;
function page(kicker, title, body, extraClass = "") {
  pageNumber += 1;
  return `
    <section class="page ${extraClass}" id="page-${pageNumber}">
      <header class="page-header">
        <span>${escapeHtml(REPORT_TITLE)}</span>
        <span class="header-mark">EXTRAOK / SECURITY REVIEW</span>
      </header>
      <main class="page-content">
        <p class="kicker">${kicker}</p>
        <h1 class="page-title">${title}</h1>
        ${body}
      </main>
      <footer class="page-footer">
        <span>Uso interno • auditoria-base ${AUDIT_BASE_COMMIT.slice(0, 12)} • remediação verificada</span>
        <span>${pageNumber}</span>
      </footer>
    </section>`;
}

const findingOneSnippet = `// AUDITORIA-BASE — apps/api/src/config/env.ts:46-48
NODE_ENV: z
  .enum(["development", "test", "production"])
  .default("development"),

// REMEDIAÇÃO — apps/api/src/config/env.ts:46
NODE_ENV: z.enum(["development", "test", "production"]),

// REGRESSÃO — apps/api/tests/env.test.ts:26-43
assert.throws(() =>
  loadEnv({ ...requiredEnvironment, NODE_ENV: undefined })
);
assert.throws(() =>
  loadEnv({ ...requiredEnvironment, NODE_ENV: "staging" })
);`;

const findingTwoSnippet = `// AUDITORIA-BASE — apps/api/prisma.config.ts:10-14
datasource: {
  url:
    process.env.DATABASE_URL ??
    "postgresql://extraok:extraok@127.0.0.1:5432/extraok?schema=public",
},

// REMEDIAÇÃO — prisma.config.ts:3,11
import { defineConfig, env } from "prisma/config";
datasource: { url: env("DATABASE_URL") },

// REMEDIAÇÃO — prisma.studio.config.ts:3-5
import { defineConfig, env } from "prisma/config";
const databaseUrl = new URL(env("DATABASE_URL"));`;

const issueOne = `--- REGISTRO DE REMEDIAÇÃO SEC-01 ---
# [Segurança][Corrigido] Tornar a inicialização fail-closed para NODE_ENV

**Status:** corrigido e validado em ${REMEDIATION_DATE}
**Severidade original:** média
**Auditoria-base:** \`${AUDIT_BASE_COMMIT}\`
**Remediação:** incluída no commit que contém este relatório

## Problema original
O schema assumia \`development\` quando \`NODE_ENV\` era omitido. Isso desviava das validações de produção e permitia cookie sem \`Secure\`/\`__Host-\` em um deploy alternativo mal configurado.

## Correção aplicada
- Removido o default de \`NODE_ENV\` em \`apps/api/src/config/env.ts:46\`.
- \`development\`, \`test\` ou \`production\` agora precisam ser explícitos.
- A documentação da API passou a listar \`NODE_ENV\` como obrigatório.
- Dockerfile e Compose continuam declarando \`production\` explicitamente.

## Evidência atual
\`\`\`ts
NODE_ENV: z.enum(["development", "test", "production"])
\`\`\`

## Validação
- Regressões focadas: 12/12 aprovadas.
- Suíte padrão: 15 aprovadas; a integração foi executada separadamente.
- Integração real: 1/1 aprovada, confirmando \`__Host-extraok_session\` e \`Secure\`.
- \`typecheck\`, \`lint\`, \`build\` e \`git diff --check\`: aprovados.

## Critérios de aceite
- [x] Ausência e valor inválido são rejeitados.
- [x] \`development\`, \`test\` e \`production\` são cobertos.
- [x] Produção rejeita origem HTTP remota e pepper local conhecido.
- [x] A integração confirma cookie de produção endurecido.
- [x] Dockerfile/Compose preservam \`NODE_ENV=production\` por inspeção.

**Limite:** o Compose não foi iniciado nesta revalidação; o daemon Docker local estava indisponível.
--- FIM DO REGISTRO SEC-01 ---`;

const issueTwo = `--- REGISTRO DE REMEDIAÇÃO SEC-02 ---
# [Segurança][Corrigido] Remover credenciais padrão dos configs Prisma

**Status:** corrigido e validado em ${REMEDIATION_DATE}
**Severidade original:** baixa
**Auditoria-base:** \`${AUDIT_BASE_COMMIT}\`
**Remediação:** incluída no commit que contém este relatório

## Problema original
Migration e Studio usavam uma URL PostgreSQL previsível quando \`DATABASE_URL\` estava ausente, com risco de operar silenciosamente no banco errado.

## Correção aplicada
- Os dois configs usam \`env("DATABASE_URL")\` de \`prisma/config\`.
- Variável ausente ou vazia encerra o carregamento com erro claro.
- Studio preserva \`max=1\` sem alterar o pool da API.
- \`prisma.dev.config.ts\` mantém o bootstrap local sem datasource/fallback.

## Evidência atual
\`\`\`ts
datasource: { url: env("DATABASE_URL") }
const databaseUrl = new URL(env("DATABASE_URL"))
\`\`\`

## Validação
- Seis testes cobrem ambos os configs com variável ausente, vazia e URL válida.
- URL válida é carregada em subprocesso isolado sem conexão com banco.
- Busca nos fontes/configs confirmou a remoção de \`extraok:extraok\`.
- O placeholder do Docker permanece restrito ao estágio de geração.

## Critérios de aceite
- [x] Nenhum config operacional contém credencial de fallback.
- [x] Migration e Studio falham sem \`DATABASE_URL\`.
- [x] Valor vazio também é rejeitado.
- [x] Os dois configs têm regressões automatizadas.
- [x] O Prisma Client e o build do workspace foram gerados com sucesso.
- [x] O bootstrap \`prisma dev\` funciona sem reintroduzir fallback.

**Limite:** a imagem Docker não foi reconstruída; seu placeholder isolado foi verificado por inspeção.
--- FIM DO REGISTRO SEC-02 ---`;

const routeRowsOne = [
  ["GET /health", "Pública", "Somente liveness; não consulta dados", "app.ts:70"],
  ["GET /ready", "Pública", "Consulta estática SELECT 1", "app.ts:71-79"],
  ["POST /auth/register", "Pública", "Cria o próprio usuário e sessão", "auth/routes.ts:61-113"],
  ["POST /auth/login", "Pública", "Credencial validada; erro genérico", "auth/routes.ts:115-149"],
  ["GET /auth/session", "Sessão", "requireAuth", "auth/routes.ts:151-159"],
  ["POST /auth/logout", "Cookie", "Revoga apenas o hash do token recebido", "auth/routes.ts:161-179"],
  ["GET /clients", "Sessão", "ownerId = usuário", "clients/routes.ts:25-50"],
  ["GET /clients/:id", "Sessão", "id + ownerId", "clients/routes.ts:52-65"],
  ["POST /clients", "Sessão", "ownerId definido pelo servidor", "clients/routes.ts:67-79"],
  ["PATCH /clients/:id", "Sessão", "update e reload com id + ownerId", "clients/routes.ts:81-100"],
  ["DELETE /clients/:id", "Sessão", "precheck, count e delete com dono", "clients/routes.ts:102-130"],
];

const routeRowsTwo = [
  ["GET /jobs", "Sessão", "ownerId em lista e busca relacionada", "jobs/routes.ts:49-91"],
  ["GET /jobs/:id", "Sessão", "id + ownerId antes dos includes", "jobs/routes.ts:93-135"],
  ["POST /jobs", "Sessão", "cliente validado + dono do servidor", "jobs/routes.ts:137-164"],
  ["PATCH /jobs/:id/status", "Sessão", "dono + transição + update condicional", "jobs/routes.ts:166-204"],
  ["GET /jobs/:jobId/extras", "Sessão", "job.ownerId", "extras/routes.ts:17-35"],
  ["POST /jobs/:jobId/extras", "Sessão", "jobId validado contra o dono", "extras/routes.ts:37-60"],
  ["PATCH /extras/:id", "Sessão", "job.ownerId + status pending", "extras/routes.ts:62-100"],
  ["DELETE /extras/:id", "Sessão", "job.ownerId + status pending", "extras/routes.ts:102-137"],
  ["GET /dashboard/summary", "Sessão", "ownerFilter em todas as 7 queries", "dashboard/routes.ts:55-149"],
  ["POST /jobs/:jobId/approval-links", "Sessão", "jobId + ownerId antes da rotação", "approvals/routes.ts:80-120"],
  ["GET /public/approvals/:token", "Capability", "hash + link ativo/expiração", "approvals/routes.ts:20-74,122-132"],
  ["POST /public/.../:extraId/decision", "Capability", "extraId + jobId derivado do token", "approvals/routes.ts:134-198"],
];

function routeTable(rows) {
  return `<table class="route-table">
    <thead><tr><th>Handler</th><th>Gate</th><th>Escopo verificado</th><th>Evidência</th></tr></thead>
    <tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}</tbody>
  </table>`;
}

const pages = [];

pages.push(page(
  "AUDITORIA DE CÓDIGO • 2026",
  "Auditoria de Segurança e Validação das Correções",
  `<div class="cover-layout">
    <div class="cover-brand">Extra<span>OK</span></div>
    <p class="cover-lead">Auditoria verificável de isolamento de dados, autorização, IDOR, segredos e XSS, acompanhada da remediação validada dos achados.</p>
    <div class="cover-meta">
      <div><span>Auditoria-base</span><strong>${AUDIT_DATE} • ${AUDIT_BASE_COMMIT}</strong></div>
      <div><span>Remediação</span><strong>${REMEDIATION_DATE} • incluída no commit que contém este relatório</strong></div>
      <div><span>Status</span><strong>2 achados corrigidos • 0 achados abertos</strong></div>
      <div><span>Escopo</span><strong>API, web, Prisma, Docker/Compose, Nginx, documentação, bundle e histórico Git alcançável</strong></div>
    </div>
    <div class="cover-note">
      <strong>Nota metodológica</strong>
      <p>As cinco categorias solicitadas foram adaptadas à stack detectada. O ExtraOK não usa Supabase/RLS nem RBAC: o tenant é o usuário autenticado, e o isolamento é aplicado por <code>ownerId</code> nas queries Prisma. Todos os 23 handlers foram percorridos; gates do React foram cruzados com a API; segredos foram buscados no estado atual, nos cinco commits, em objetos Git adicionais e no bundle; sinks XSS foram pesquisados no frontend e backend.</p>
    </div>
  </div>`,
  "cover-page",
));

pages.push(page(
  "01 • RESUMO EXECUTIVO",
  "Dois achados corrigidos; nenhum risco confirmado permanece aberto",
  `<div class="severity-grid">
    <div class="severity-card critical"><span>Crítica aberta</span><strong>0</strong></div>
    <div class="severity-card high"><span>Alta aberta</span><strong>0</strong></div>
    <div class="severity-card medium"><span>Média corrigida</span><strong>1</strong></div>
    <div class="severity-card low"><span>Baixa corrigida</span><strong>1</strong></div>
  </div>
  <div class="chart-grid">
    <section class="panel chart-panel">
      <h2>Severidade histórica dos corrigidos</h2>
      <div class="donut-row">
        <div class="donut"><div><strong>2</strong><span>corrigidos</span></div></div>
        <div class="legend">
          <p><i class="dot medium-dot"></i>Média • corrigida <strong>1</strong></p>
          <p><i class="dot low-dot"></i>Baixa • corrigida <strong>1</strong></p>
          <p><i class="dot critical-dot"></i>Abertos <strong>0</strong></p>
        </div>
      </div>
    </section>
    <section class="panel chart-panel">
      <h2>Achados históricos por categoria</h2>
      <div class="bars">
        <div><span>Banco sem tranca</span><i><b style="width:0%"></b></i><strong>0</strong></div>
        <div><span>Permissão no browser</span><i><b style="width:0%"></b></i><strong>0</strong></div>
        <div><span>IDOR</span><i><b style="width:0%"></b></i><strong>0</strong></div>
        <div><span>Chaves/configuração</span><i><b style="width:100%"></b></i><strong>2</strong></div>
        <div><span>XSS</span><i><b style="width:0%"></b></i><strong>0</strong></div>
      </div>
    </section>
  </div>
  <div class="executive-grid">
    <section class="summary-box strength"><h2>Remediação concluída</h2><p><code>NODE_ENV</code> e <code>DATABASE_URL</code> agora falham de forma fechada quando ausentes. Os fallbacks previsíveis foram removidos sem alterar o endurecimento do cookie ou o limite do Studio.</p></section>
    <section class="summary-box strength"><h2>Autorização preservada</h2><p>Não foi encontrado acesso horizontal: listas, detalhes, mutações, agregações e o fluxo público vinculam o recurso ao usuário ou ao <code>jobId</code> derivado do token.</p></section>
  </div>
  <p class="assessment"><strong>Avaliação pós-correção:</strong> os dois riscos de configuração identificados na auditoria-base foram corrigidos e cobertos por regressões. Testes focados, suíte completa, integração real, typecheck, lint e build foram aprovados; não restou achado confirmado aberto nas cinco categorias revisadas.</p>`,
));

pages.push(page(
  "02 • STACK E MAPEAMENTO",
  "Como as categorias foram traduzidas para o ExtraOK",
  `<table class="stack-table">
    <tbody>
      <tr><th>Linguagem/runtime</th><td>TypeScript 6, ESM, Node.js 24.19.x</td><th>Backend</th><td>Fastify 5.12</td></tr>
      <tr><th>ORM/query</th><td>Prisma 7.10 + adapter-pg</td><th>Banco</th><td>PostgreSQL 17</td></tr>
      <tr><th>Autenticação</th><td>Sessão opaca persistida; cookie HttpOnly</td><th>Tenant</th><td>Um usuário = um tenant; filtro manual ownerId</td></tr>
      <tr><th>Frontend</th><td>React 19, Vite 8, Router, Query, Zod</td><th>Deploy</th><td>Docker multi-stage, Compose e Nginx sem privilégio</td></tr>
      <tr><th>Ausente</th><td colspan="3">Supabase/RLS, papéis/RBAC, CI, Helm, Terraform e Kubernetes</td></tr>
    </tbody>
  </table>
  <div class="mapping-list">
    <article><span>1</span><div><h2>Banco sem tranca</h2><p>Como não há RLS, a revisão seguiu o identificador autenticado até cada <code>findMany</code>, <code>findFirst</code>, <code>count</code>, <code>aggregate</code>, update e delete. Extras e links herdam posse por <code>Job</code>.</p></div></article>
    <article><span>2</span><div><h2>Permissão definida no navegador</h2><p>Não existe role/admin/can*. O gate de autenticação e cada gate de estado da UI foram cruzados com as rotas e regras equivalentes no servidor.</p></div></article>
    <article><span>3</span><div><h2>IDOR</h2><p>Todos os IDs em path, query ou body foram rastreados. Recursos privados exigem dono; a decisão pública cruza <code>extraId</code> com o <code>jobId</code> do link.</p></div></article>
    <article><span>4</span><div><h2>Chaves expostas e defaults</h2><p>Foram varridos source, configs, exemplos, docs, Docker, todos os commits/refs, objetos Git extras e o bundle. O <code>.env</code> local foi comparado sem divulgar valores.</p></div></article>
    <article><span>5</span><div><h2>Inputs sem tratamento / XSS</h2><p>Busca por sinks DOM/HTML, markdown, execução dinâmica, URLs controladas e HTML no backend; revisão manual dos locais que renderizam dados da API.</p></div></article>
  </div>`,
));

pages.push(page(
  "03 • RESULTADOS POR CATEGORIA",
  "Cobertura, histórico e status da remediação",
  `<div class="category-results">
    <div><span>1</span><p><strong>Banco sem tranca</strong><small>Isolamento manual por ownerId presente em todas as queries de negócio.</small></p>${resultChip("Sem achado")}</div>
    <div><span>2</span><p><strong>Permissão no navegador</strong><small>Não há papéis/RBAC; gates de estado têm validação equivalente na API.</small></p>${resultChip("Não se aplica")}</div>
    <div><span>3</span><p><strong>IDOR</strong><small>Todos os handlers por ID validam dono ou vínculo ao token.</small></p>${resultChip("Sem achado")}</div>
    <div><span>4</span><p><strong>Chaves/configuração</strong><small>Dois achados históricos corrigidos; nenhum segredo real localizado.</small></p>${resultChip("2 corrigidos")}</div>
    <div><span>5</span><p><strong>XSS</strong><small>Nenhum sink da aplicação; conteúdo dinâmico é texto React.</small></p>${resultChip("Sem achado")}</div>
  </div>
  <h2 class="section-heading">Tabela detalhada — arquivo por arquivo</h2>
  <table class="finding-table">
    <thead><tr><th>Severidade</th><th>Arquivo:linha</th><th>Descrição verificada</th></tr></thead>
    <tbody>
      <tr><td>${severityChip("Média")}</td><td><code>env.ts:46<br>env.test.ts:26-43</code></td><td><strong>SEC-01 • CORRIGIDO.</strong> <code>NODE_ENV</code> não possui default; ausência e valor inválido são rejeitados por regressão.</td></tr>
      <tr><td>${severityChip("Média")}</td><td><code>auth.ts:10-13,22-27<br>integration.test.ts:103-107</code></td><td>O modo de produção continua emitindo <code>__Host-extraok_session</code> com <code>Secure</code>, confirmado na integração real.</td></tr>
      <tr><td>${severityChip("Baixa")}</td><td><code>prisma.config.ts:3,11<br>prisma-config.test.ts:49-78</code></td><td><strong>SEC-02 • CORRIGIDO.</strong> O config usa <code>env("DATABASE_URL")</code> e falha sem valor ou com valor vazio.</td></tr>
      <tr><td>${severityChip("Baixa")}</td><td><code>prisma.studio.config.ts:3-5<br>prisma.dev.config.ts:1-5</code></td><td>Studio exige URL e preserva <code>max=1</code>; o bootstrap local ganhou config sem datasource nem credencial.</td></tr>
    </tbody>
  </table>
  <div class="coverage-strip">
    <div><strong>23</strong><span>handlers revisados</span></div>
    <div><strong>5</strong><span>commits alcançáveis</span></div>
    <div><strong>2</strong><span>achados corrigidos</span></div>
    <div><strong>0</strong><span>segredos reais encontrados</span></div>
  </div>`,
));

pages.push(page(
  "04 • ACHADO SEC-01",
  "Corrigido — modo de execução agora falha fechado",
  `<div class="finding-hero resolved-border">
    <div>${severityChip("Média")} ${resultChip("Corrigido")} <span class="finding-id">SEC-01 • Configuração / cookie de sessão</span></div>
    <p>Na auditoria-base, a omissão de <code>NODE_ENV</code> ativava silenciosamente o perfil de desenvolvimento. A remediação removeu esse default e tornou o modo de execução obrigatório.</p>
  </div>
  <div class="two-column finding-columns">
    <section>
      <h2>Antes e depois</h2>
      ${codeBlock(findingOneSnippet, "small-code")}
      <p class="verification"><strong>Verificação automática:</strong> <code>env.test.ts:13-43</code> cobre ausência, valor inválido, <code>development</code> e <code>test</code>; <code>env.test.ts:70-98</code> cobre as restrições de <code>production</code>.</p>
    </section>
    <section>
      <h2>Risco original</h2>
      <p>Um deploy alternativo que omitisse <code>NODE_ENV</code> podia iniciar com cookie sem <code>Secure</code>/<code>__Host-</code>, aceitar origem HTTP remota e permitir o pepper público de desenvolvimento.</p>
      <h2>Correção aplicada</h2>
      <ul>
        <li><code>NODE_ENV</code> agora aceita apenas um modo informado explicitamente.</li>
        <li><code>.env.example</code>, Dockerfile e Compose já definem seus modos esperados.</li>
        <li>A documentação passou a registrar a variável como obrigatória.</li>
      </ul>
      <h2>Resultado validado</h2>
      <p>A integração em modo de produção confirmou <code>__Host-extraok_session</code> e <code>Secure</code> (<code>integration.test.ts:37-48,103-107</code>). O fluxo real passou 1/1 e removeu os dados temporários ao final.</p>
      <h2>Status</h2>
      <p><strong>Corrigido.</strong> A configuração inválida é recusada antes da criação do cliente Prisma e do servidor Fastify.</p>
    </section>
  </div>`,
));

pages.push(page(
  "05 • ACHADO SEC-02",
  "Corrigido — configs Prisma exigem DATABASE_URL",
  `<div class="finding-hero resolved-border">
    <div>${severityChip("Baixa")} ${resultChip("Corrigido")} <span class="finding-id">SEC-02 • CWE-798 / configuração local</span></div>
    <p>Os fallbacks com credencial previsível foram removidos. Migration e Studio agora encerram o carregamento com erro claro quando <code>DATABASE_URL</code> está ausente ou vazia.</p>
  </div>
  <div class="two-column finding-columns uneven">
    <section>
      <h2>Antes e depois</h2>
      ${codeBlock(findingTwoSnippet, "small-code")}
      <p class="verification"><strong>Verificação automática:</strong> <code>prisma-config.test.ts:49-78</code> importa os dois configs em subprocessos isolados e cobre variável ausente, vazia e URL válida sem abrir conexão.</p>
    </section>
    <section>
      <h2>Risco original</h2>
      <p>Sem a variável, um comando podia operar silenciosamente contra um PostgreSQL local que aceitasse a combinação pública, causando leitura ou alteração no banco errado.</p>
      <h2>Correção aplicada</h2>
      <ul>
        <li><code>env("DATABASE_URL")</code> centraliza a leitura fail-closed nos dois configs.</li>
        <li>Studio mantém <code>max=1</code> apenas em sua URL.</li>
        <li><code>prisma.dev.config.ts</code> preserva create/start/stop sem datasource nem fallback.</li>
      </ul>
      <h2>Controles preservados</h2>
      <p>Compose continua exigindo a URL por interpolação. O único placeholder restante está no estágio isolado de geração do Dockerfile e não é propagado para migration ou runtime.</p>
      <h2>Status</h2>
      <p><strong>Corrigido.</strong> As seis regressões específicas e o build foram aprovados; a busca nos configs operacionais não encontrou o fallback removido.</p>
    </section>
  </div>`,
));

pages.push(page(
  "06 • PONTOS FORTES",
  "Controles confirmados com evidência no código",
  `<div class="strength-grid">
    <article><span>01</span><h2>Isolamento consistente</h2><p>Clientes: <code>routes.ts:32-46,58-60,88-97,108-127</code>. Jobs: <code>routes.ts:55-80,99-111,143-159,173-200</code>. Extras: <code>routes.ts:23-33,44-57,69-98,108-127</code>.</p></article>
    <article><span>02</span><h2>Dashboard escopado</h2><p><code>dashboard/routes.ts:57-60,73-113</code> aplica <code>ownerFilter</code> às agregações/listas e <code>ownerId</code> à lista de jobs.</p></article>
    <article><span>03</span><h2>Capability pública restrita</h2><p>Token aleatório de 256 bits e somente hash persistido (<code>tokens.ts:3-14</code>); decisão cruza <code>extraId</code> e <code>jobId</code> (<code>approvals/routes.ts:148-191</code>).</p></article>
    <article><span>04</span><h2>Sessão endurecida</h2><p>Cookie HttpOnly, SameSite=Strict e Secure em produção (<code>auth.ts:16-38</code>); expiração absoluta, ociosidade e revogação verificadas em <code>auth.ts:61-99</code>.</p></article>
    <article><span>05</span><h2>Sem sink XSS da aplicação</h2><p>Nenhum raw HTML, eval, markdown ou template HTML no backend. Dados são children React; redirects validam origem/allowlist (<code>login-page.tsx:16-39</code>).</p></article>
    <article><span>06</span><h2>Bundle sem segredos</h2><p><code>DATABASE_URL</code> e <code>PASSWORD_PEPPER</code> locais não aparecem no build web. A única variável pública é <code>VITE_API_URL</code> (<code>http-client.ts:3-4</code>).</p></article>
    <article><span>07</span><h2>Logs e links protegidos</h2><p>Token/query redigidos em <code>app.ts:37-56</code>; páginas e API públicas usam no-store/no-referrer/noindex; Nginx desliga access log nas URLs com token.</p></article>
    <article><span>08</span><h2>Deploy com fail-fast</h2><p><code>NODE_ENV</code> é obrigatório no schema; configs Prisma exigem <code>DATABASE_URL</code>; Compose exige password, URL, origin e pepper. Containers de app seguem read-only e sem capabilities.</p></article>
  </div>
  <div class="strong-note"><strong>Também correto:</strong> updates/deletes repetem o filtro de dono na própria mutação; respostas 404 não distinguem objeto ausente de objeto alheio; IDs de dono não são aceitos nos schemas de entrada.</div>`,
));

pages.push(page(
  "07 • COBERTURA DE ROTAS (1/2)",
  "Infraestrutura, autenticação e clientes",
  `${routeTable(routeRowsOne)}
  <div class="coverage-note">
    <h2>Leitura da tabela</h2>
    <p><strong>Sessão</strong> significa <code>preHandler: requireAuth</code>. <strong>Cookie</strong> no logout significa que a operação é idempotente e só consegue revogar o próprio token apresentado. Nenhuma linha depende do <code>ProtectedRoute</code> do navegador para proteger dados.</p>
  </div>`,
));

pages.push(page(
  "08 • COBERTURA DE ROTAS (2/2)",
  "Atendimentos, extras, dashboard e aprovações",
  `${routeTable(routeRowsTwo)}
  <div class="coverage-note compact-note">
    <h2>Conclusão IDOR/tenant</h2>
    <p>Todos os endpoints que recebem identificadores privados combinam o ID com o dono autenticado, diretamente ou pela relação <code>job.ownerId</code>. No fluxo público, o token seleciona o job e o update exige o mesmo <code>jobId</code>; um token de um atendimento não opera um extra de outro.</p>
  </div>`,
));

pages.push(page(
  "09 • STATUS E PRÓXIMOS PASSOS",
  "Remediação concluída e reforços futuros",
  `<div class="priority-list">
    <article class="priority done"><span>P1</span><div><h2>Concluído — modo de execução fail-closed</h2><p>Default de <code>NODE_ENV</code> removido; modos explícitos e restrições de produção cobertos por testes. SEC-01 encerrado.</p><small>Concluído em ${REMEDIATION_DATE} • testes focados e integração aprovados</small></div></article>
    <article class="priority done"><span>P2</span><div><h2>Concluído — configs Prisma sem credenciais padrão</h2><p><code>DATABASE_URL</code> obrigatória em migration/Studio; bootstrap local isolado e regressões para ambos os configs. SEC-02 encerrado.</p><small>Concluído em ${REMEDIATION_DATE} • 6/6 regressões específicas aprovadas</small></div></article>
    <article class="priority p3"><span>P3</span><div><h2>Automatizar a matriz negativa de isolamento</h2><p>Adicionar testes cross-tenant para cada listagem, detalhe, mutação, agregação e para <code>extraId</code> de outro job no fluxo público. O código atual está correto; isso evita regressões.</p><small>Hardening, fora da contagem de achados</small></div></article>
    <article class="priority p4"><span>P4</span><div><h2>Adicionar varredura de segredos no CI futuro</h2><p>Quando CI for criado, verificar source, histórico e artefatos; bloquear URLs com credencial e chaves de alta confiança.</p><small>Hardening, fora da contagem de achados</small></div></article>
    <article class="priority p5"><span>P5</span><div><h2>Reforçar invariantes no banco</h2><p>Considerar constraint composta/repository tenant-scoped para impedir que escritores futuros associem Job de um dono a Client de outro. Hoje não há caminho explorável pela API.</p><small>Defesa em profundidade, fora da contagem de achados</small></div></article>
  </div>
  <div class="limitations">
    <h2>Limites da auditoria e da revalidação</h2>
    <p>A auditoria-base foi estática; a remediação teve regressões, integração local, typecheck, lint e build. O Compose não foi iniciado porque o daemon Docker local estava indisponível; Dockerfile/Compose foram reinspecionados. O trabalho não substitui pentest publicado, análise de CVEs, SAST ou testes de restauração/observabilidade.</p>
  </div>`,
));

pages.push(page(
  "10 • REGISTRO DE REMEDIAÇÃO (1/2)",
  "SEC-01 — corrigido e validado",
  `${codeBlock(issueOne, "issue-block")}`,
  "issue-page",
));

pages.push(page(
  "11 • REGISTRO DE REMEDIAÇÃO (2/2)",
  "SEC-02 — corrigido e validado",
  `${codeBlock(issueTwo, "issue-block")}`,
  "issue-page",
));

const styles = `
  :root {
    --navy: #0f2742;
    --navy-2: #163b61;
    --ink: #172033;
    --muted: #5f6b7a;
    --line: #dbe3ec;
    --paper: #ffffff;
    --canvas: #e9eef4;
    --critical: #B91C1C;
    --high: #EA580C;
    --medium: #D97706;
    --low: #2563EB;
    --strong: #059669;
    --soft-blue: #eff6ff;
    --soft-green: #ecfdf5;
    --soft-amber: #fffbeb;
    --soft-red: #fef2f2;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: var(--canvas); color: var(--ink); font-family: "Segoe UI", Arial, sans-serif; }
  body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  code, pre { font-family: "Cascadia Code", "Consolas", monospace; }
  code { color: #123b63; }
  .page {
    position: relative;
    width: 210mm;
    height: 297mm;
    margin: 8mm auto;
    padding: 18mm 18mm 16mm;
    overflow: hidden;
    background: var(--paper);
    box-shadow: 0 8px 34px rgba(15, 39, 66, .16);
    page-break-after: always;
  }
  .page:last-child { page-break-after: auto; }
  .page::after { content: ""; position: absolute; top: 0; left: 0; width: 100%; height: 3.5mm; background: linear-gradient(90deg, var(--navy), #167a68 72%, #23a98e); }
  .page-header { position: absolute; top: 8mm; left: 18mm; right: 18mm; display: flex; justify-content: space-between; align-items: center; padding-bottom: 3mm; border-bottom: .25mm solid var(--line); color: var(--muted); font-size: 7.5pt; letter-spacing: .025em; }
  .header-mark { color: var(--navy); font-weight: 700; letter-spacing: .12em; }
  .page-content { margin-top: 11mm; }
  .page-footer { position: absolute; left: 18mm; right: 18mm; bottom: 7mm; display: flex; justify-content: space-between; align-items: center; padding-top: 2.5mm; border-top: .25mm solid var(--line); color: var(--muted); font-size: 7.5pt; }
  .page-footer span:last-child { display: grid; place-items: center; width: 7mm; height: 7mm; border-radius: 50%; color: white; background: var(--navy); font-weight: 700; }
  .kicker { margin: 0 0 2.5mm; color: var(--strong); font-size: 8.5pt; font-weight: 800; letter-spacing: .13em; }
  .page-title { margin: 0 0 7mm; color: var(--navy); font-size: 23pt; line-height: 1.08; letter-spacing: -.03em; }
  h2 { margin: 0; color: var(--navy); font-size: 11.5pt; }
  p { margin: 0; font-size: 9.5pt; line-height: 1.5; }
  ul { margin: 2mm 0 4mm 5mm; padding-left: 4mm; }
  li { margin-bottom: 1.5mm; font-size: 9pt; line-height: 1.42; }
  .cover-page { background: linear-gradient(145deg, #fff 0 68%, #edf8f5 100%); }
  .cover-page .page-title { max-width: 145mm; margin-top: 15mm; font-size: 38pt; line-height: 1.02; }
  .cover-layout { position: relative; height: 188mm; }
  .cover-brand { position: absolute; top: -33mm; right: 0; color: rgba(15,39,66,.08); font-weight: 900; font-size: 68pt; letter-spacing: -.08em; }
  .cover-brand span { color: rgba(5,150,105,.13); }
  .cover-lead { max-width: 128mm; margin-top: 8mm; color: var(--muted); font-size: 15pt; line-height: 1.42; }
  .cover-meta { margin-top: 22mm; display: grid; gap: 3mm; max-width: 155mm; }
  .cover-meta div { display: grid; grid-template-columns: 35mm 1fr; align-items: start; padding: 3mm 0; border-bottom: .3mm solid var(--line); }
  .cover-meta span { color: var(--muted); font-size: 8pt; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; }
  .cover-meta strong { color: var(--navy); font-size: 9.5pt; line-height: 1.4; overflow-wrap: anywhere; }
  .cover-note { position: absolute; left: 0; bottom: 5mm; max-width: 166mm; padding: 6mm; border-left: 1.4mm solid var(--strong); border-radius: 0 3mm 3mm 0; background: rgba(236,253,245,.9); }
  .cover-note strong { display: block; margin-bottom: 2mm; color: var(--strong); font-size: 9pt; text-transform: uppercase; letter-spacing: .08em; }
  .cover-note p { font-size: 8.8pt; }
  .severity-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 3mm; }
  .severity-card { height: 26mm; padding: 4mm; border-radius: 3mm; color: white; display: flex; align-items: center; justify-content: space-between; }
  .severity-card span { font-size: 8.5pt; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; }
  .severity-card strong { font-size: 24pt; }
  .severity-card.critical { background: var(--critical); }
  .severity-card.high { background: var(--high); }
  .severity-card.medium { background: var(--medium); }
  .severity-card.low { background: var(--low); }
  .chart-grid { display: grid; grid-template-columns: 1fr 1.2fr; gap: 4mm; margin-top: 5mm; }
  .panel { border: .3mm solid var(--line); border-radius: 3mm; background: #fff; padding: 5mm; }
  .chart-panel { height: 77mm; }
  .donut-row { display: flex; align-items: center; justify-content: space-around; margin-top: 5mm; }
  .donut { display: grid; place-items: center; width: 48mm; height: 48mm; border-radius: 50%; background: conic-gradient(var(--medium) 0 50%, var(--low) 50% 100%); }
  .donut::after { content: ""; position: absolute; }
  .donut > div { display: grid; place-items: center; width: 30mm; height: 30mm; border-radius: 50%; background: white; }
  .donut strong { color: var(--navy); font-size: 21pt; line-height: 1; }
  .donut span { color: var(--muted); font-size: 7.5pt; text-transform: uppercase; }
  .legend { min-width: 31mm; }
  .legend p { display: flex; align-items: center; gap: 2mm; margin-bottom: 2.4mm; font-size: 8.5pt; }
  .legend p strong { margin-left: auto; }
  .dot { display: inline-block; width: 3mm; height: 3mm; border-radius: 50%; }
  .medium-dot { background: var(--medium); }.low-dot { background: var(--low); }.critical-dot { background: var(--critical); }.high-dot { background: var(--high); }
  .bars { margin-top: 7mm; display: grid; gap: 4mm; }
  .bars > div { display: grid; grid-template-columns: 39mm 1fr 6mm; gap: 2mm; align-items: center; }
  .bars span { color: var(--muted); font-size: 7.8pt; }
  .bars i { display: block; height: 3.2mm; border-radius: 2mm; background: #e9eef4; overflow: hidden; }
  .bars b { display: block; height: 100%; border-radius: inherit; background: linear-gradient(90deg, var(--navy-2), var(--strong)); }
  .bars strong { color: var(--navy); font-size: 8.5pt; text-align: right; }
  .executive-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4mm; margin-top: 5mm; }
  .summary-box { min-height: 45mm; padding: 5mm; border-radius: 3mm; }
  .summary-box h2 { margin-bottom: 2mm; }
  .summary-box.risk { border: .35mm solid #f2c980; background: var(--soft-amber); }
  .summary-box.strength { border: .35mm solid #9ee2cc; background: var(--soft-green); }
  .assessment { margin-top: 5mm; padding: 4mm 5mm; border-left: 1mm solid var(--navy); background: #f7f9fc; font-size: 8.8pt; }
  .stack-table, .finding-table, .route-table { width: 100%; border-collapse: collapse; }
  .stack-table { margin-bottom: 6mm; }
  .stack-table th, .stack-table td { border: .25mm solid var(--line); padding: 3mm; font-size: 8.5pt; text-align: left; vertical-align: top; }
  .stack-table th { width: 26mm; color: var(--navy); background: #f3f6f9; }
  .mapping-list { display: grid; gap: 3mm; }
  .mapping-list article { display: grid; grid-template-columns: 10mm 1fr; gap: 3mm; padding: 3.4mm 4mm; border: .25mm solid var(--line); border-radius: 2.5mm; }
  .mapping-list article > span { display: grid; place-items: center; width: 8mm; height: 8mm; border-radius: 50%; color: white; background: var(--navy); font-weight: 800; font-size: 8pt; }
  .mapping-list h2 { margin-bottom: 1mm; font-size: 10pt; }
  .mapping-list p { font-size: 8.1pt; line-height: 1.4; }
  .category-results { display: grid; gap: 2.2mm; }
  .category-results > div { display: grid; grid-template-columns: 8mm 1fr 27mm; gap: 3mm; align-items: center; padding: 2.4mm 3mm; border: .25mm solid var(--line); border-radius: 2mm; }
  .category-results > div > span:first-child { display: grid; place-items: center; width: 6mm; height: 6mm; border-radius: 50%; background: var(--navy); color: #fff; font-size: 7pt; font-weight: 800; }
  .category-results p strong, .category-results p small { display: block; }
  .category-results p strong { color: var(--navy); font-size: 8.8pt; }
  .category-results p small { margin-top: .7mm; color: var(--muted); font-size: 7.5pt; }
  .result-chip { display: inline-flex; justify-content: center; padding: 1.5mm 2mm; border-radius: 5mm; font-size: 7pt; font-weight: 800; white-space: nowrap; }
  .result-strong { color: #047857; background: #d1fae5; }.result-attention { color: #92400e; background: #fef3c7; }.result-neutral { color: #475569; background: #e2e8f0; }
  .section-heading { margin: 6mm 0 3mm; }
  .finding-table th, .finding-table td { border: .25mm solid var(--line); padding: 3mm; text-align: left; vertical-align: top; font-size: 8pt; line-height: 1.35; }
  .finding-table th { color: white; background: var(--navy); font-size: 7.5pt; text-transform: uppercase; letter-spacing: .05em; }
  .finding-table th:first-child { width: 24mm; }.finding-table th:nth-child(2) { width: 54mm; }
  .chip { display: inline-flex; padding: 1.3mm 2.4mm; border-radius: 5mm; color: white; font-size: 7.2pt; font-weight: 800; text-transform: uppercase; letter-spacing: .04em; }
  .chip-critica { background: var(--critical); }.chip-alta { background: var(--high); }.chip-media { background: var(--medium); }.chip-baixa { background: var(--low); }
  .coverage-strip { display: grid; grid-template-columns: repeat(4, 1fr); gap: 3mm; margin-top: 6mm; }
  .coverage-strip div { padding: 3mm; border-radius: 2mm; background: #f1f5f9; text-align: center; }
  .coverage-strip strong { display: block; color: var(--navy); font-size: 16pt; }.coverage-strip span { display: block; margin-top: .5mm; color: var(--muted); font-size: 7pt; }
  .finding-hero { margin-bottom: 6mm; padding: 5mm; border-radius: 3mm; background: #fafbfd; border: .3mm solid var(--line); }
  .finding-hero.medium-border { border-left: 1.5mm solid var(--medium); }.finding-hero.low-border { border-left: 1.5mm solid var(--low); }.finding-hero.resolved-border { border-left: 1.5mm solid var(--strong); background: var(--soft-green); }
  .finding-hero > div { display: flex; align-items: center; gap: 3mm; margin-bottom: 3mm; }.finding-id { color: var(--muted); font-size: 8pt; font-weight: 700; }
  .two-column { display: grid; grid-template-columns: 1fr 1fr; gap: 5mm; }.two-column.uneven { grid-template-columns: 1.12fr .88fr; }
  .finding-columns h2 { margin: 0 0 2mm; }.finding-columns section > h2:not(:first-child) { margin-top: 4.5mm; }
  .finding-columns p { font-size: 8.7pt; }.finding-columns li { font-size: 8.3pt; }
  .code-block { margin: 0; padding: 4mm; border-radius: 2.5mm; color: #dbeafe; background: #10243a; white-space: pre-wrap; overflow-wrap: anywhere; font-size: 7.3pt; line-height: 1.5; }
  .code-block code { color: inherit; }
  .small-code { font-size: 6.9pt; line-height: 1.45; }
  .verification { margin-top: 4mm; padding: 3.5mm; border-radius: 2mm; background: var(--soft-green); border: .25mm solid #a7e1ce; }
  .strength-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 3mm; }
  .strength-grid article { min-height: 37mm; padding: 4mm; border: .25mm solid #cde8de; border-radius: 3mm; background: linear-gradient(145deg, #fff, #f2fbf8); }
  .strength-grid article > span { float: right; color: rgba(5,150,105,.3); font-size: 16pt; font-weight: 900; }
  .strength-grid h2 { margin-bottom: 2mm; color: var(--strong); font-size: 10pt; }
  .strength-grid p { font-size: 7.8pt; line-height: 1.42; }
  .strong-note { margin-top: 4mm; padding: 3.5mm 4mm; border-left: 1mm solid var(--strong); background: var(--soft-green); font-size: 8.2pt; line-height: 1.45; }
  .route-table th, .route-table td { border-bottom: .25mm solid var(--line); padding: 2.5mm 2.2mm; text-align: left; vertical-align: top; font-size: 7.6pt; line-height: 1.3; }
  .route-table th { color: white; background: var(--navy); font-size: 7pt; text-transform: uppercase; letter-spacing: .04em; }
  .route-table tr:nth-child(even) td { background: #f6f8fa; }
  .route-table th:first-child { width: 48mm; }.route-table th:nth-child(2) { width: 22mm; }.route-table th:last-child { width: 37mm; }
  .coverage-note { margin-top: 6mm; padding: 4mm 5mm; border-radius: 2.5mm; background: var(--soft-blue); border: .25mm solid #bfdbfe; }.coverage-note h2 { margin-bottom: 1.5mm; }.coverage-note p { font-size: 8.3pt; }.compact-note { margin-top: 4mm; padding: 3mm 4mm; }
  .priority-list { display: grid; gap: 3mm; }
  .priority { display: grid; grid-template-columns: 13mm 1fr; gap: 4mm; padding: 3.5mm 4mm; border: .25mm solid var(--line); border-radius: 2.5mm; }
  .priority > span { display: grid; place-items: center; align-self: start; width: 11mm; height: 11mm; border-radius: 2mm; color: white; background: var(--navy); font-size: 9pt; font-weight: 900; }
  .priority.p1 > span { background: var(--medium); }.priority.p2 > span { background: var(--low); }.priority.done > span { background: var(--strong); }
  .priority h2 { margin-bottom: 1mm; font-size: 9.8pt; }.priority p { font-size: 8.2pt; }.priority small { display: block; margin-top: 1.2mm; color: var(--muted); font-size: 7.2pt; }
  .limitations { margin-top: 5mm; padding: 4mm 5mm; border-left: 1mm solid #64748b; background: #f1f5f9; }.limitations h2 { margin-bottom: 1.5mm; }.limitations p { font-size: 8pt; }
  .issue-page .page-title { margin-bottom: 4mm; }
  .issue-block { height: 222mm; padding: 4.5mm; font-size: 6.65pt; line-height: 1.39; color: #e7eef7; }
  body.preview { width: 210mm; height: 297mm; overflow: hidden; }
  body.preview .page { margin: 0; box-shadow: none; }
  @media print {
    html, body { background: white; }
    .page { margin: 0; box-shadow: none; }
  }
  @page { size: A4; margin: 0; }
`;

function documentHtml(content, preview = false) {
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(REPORT_TITLE)}</title>
  <style>${styles}</style>
</head>
<body${preview ? ' class="preview"' : ""}>${content}</body>
</html>`;
}

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  ].filter(Boolean);

  const executable = candidates.find((candidate) => existsSync(candidate));
  if (!executable) {
    throw new Error("Chrome/Edge não encontrado. Defina CHROME_PATH para regerar o PDF.");
  }
  return executable;
}

function ensureSafeTemporaryPath(target) {
  const outputRoot = resolve(outputDirectory) + sep;
  const resolvedTarget = resolve(target);
  if (!resolvedTarget.startsWith(outputRoot) || !resolvedTarget.endsWith(`${sep}.render-tmp`)) {
    throw new Error(`Recusa ao remover diretório temporário inesperado: ${resolvedTarget}`);
  }
}

function stopOrphanedBrowserProcesses() {
  const escapedNeedle = temporaryDirectory.replaceAll("'", "''");
  const command = [
    `$needle = '${escapedNeedle}'`,
    "$processes = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |",
    "  Where-Object { ($_.Name -eq 'chrome.exe' -or $_.Name -eq 'msedge.exe') -and $_.CommandLine -like \"*$needle*\" }",
    "$processes | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }",
  ].join("; ");

  spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", command], {
    windowsHide: true,
    timeout: 15_000,
    stdio: "ignore",
  });
}

function runChrome(chromePath, args, label) {
  const result = spawnSync(chromePath, args, {
    cwd: outputDirectory,
    windowsHide: true,
    timeout: 60_000,
    stdio: "ignore",
  });

  if (result.error || result.status !== 0) {
    const detail = result.error?.message ?? `Chrome encerrou com status ${result.status}`;
    throw new Error(`${label} falhou. ${detail}`);
  }
}

function chromeBaseArgs(profilePath) {
  return [
    "--headless=new",
    "--disable-gpu",
    "--disable-extensions",
    "--disable-background-networking",
    "--disable-breakpad",
    "--disable-component-update",
    "--disable-crash-reporter",
    "--disable-sync",
    "--no-first-run",
    "--no-default-browser-check",
    "--hide-scrollbars",
    `--user-data-dir=${profilePath}`,
  ];
}

function countPdfPages(filePath) {
  const source = readFileSync(filePath).toString("latin1");
  return source.match(/\/Type\s*\/Page\b/g)?.length ?? 0;
}

function generate() {
  mkdirSync(outputDirectory, { recursive: true });
  mkdirSync(previewDirectory, { recursive: true });
  ensureSafeTemporaryPath(temporaryDirectory);
  stopOrphanedBrowserProcesses();
  rmSync(temporaryDirectory, { recursive: true, force: true });
  mkdirSync(temporaryDirectory, { recursive: true });

  const html = documentHtml(pages.join("\n"));
  writeFileSync(htmlPath, html, "utf8");

  const chromePath = findChrome();
  const pdfProfile = join(temporaryDirectory, "profile-pdf");
  mkdirSync(pdfProfile, { recursive: true });
  runChrome(
    chromePath,
    [
      ...chromeBaseArgs(pdfProfile),
      "--no-pdf-header-footer",
      "--print-to-pdf-no-header",
      `--print-to-pdf=${pdfPath}`,
      pathToFileURL(htmlPath).href,
    ],
    "Geração do PDF",
  );

  pages.forEach((pageMarkup, index) => {
    const number = String(index + 1).padStart(2, "0");
    const previewHtmlPath = join(temporaryDirectory, `preview-${number}.html`);
    const screenshotPath = join(previewDirectory, `pagina-${number}.png`);
    const profilePath = join(temporaryDirectory, `profile-${number}`);
    mkdirSync(profilePath, { recursive: true });
    writeFileSync(previewHtmlPath, documentHtml(pageMarkup, true), "utf8");
    runChrome(
      chromePath,
      [
        ...chromeBaseArgs(profilePath),
        "--force-device-scale-factor=1",
        "--window-size=794,1123",
        `--screenshot=${screenshotPath}`,
        pathToFileURL(previewHtmlPath).href,
      ],
      `Rasterização da página ${number}`,
    );
    if (!existsSync(screenshotPath) || statSync(screenshotPath).size < 10_000) {
      throw new Error(`Preview inválido para a página ${number}.`);
    }
  });

  if (!existsSync(pdfPath) || statSync(pdfPath).size < 50_000) {
    throw new Error("PDF ausente ou pequeno demais após a geração.");
  }

  const detectedPages = countPdfPages(pdfPath);
  if (detectedPages !== pages.length) {
    throw new Error(`PDF deveria ter ${pages.length} páginas, mas foram detectadas ${detectedPages}.`);
  }

  stopOrphanedBrowserProcesses();
  rmSync(temporaryDirectory, { recursive: true, force: true });

  console.log(JSON.stringify({
    report: relative(process.cwd(), pdfPath),
    html: relative(process.cwd(), htmlPath),
    previews: relative(process.cwd(), previewDirectory),
    pages: detectedPages,
    findings: {
      historical: { critical: 0, high: 0, medium: 1, low: 1 },
      status: { corrected: 2, open: 0 },
    },
  }, null, 2));
}

generate();
