import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { type TestContext } from "node:test";
import { buildApp } from "../src/app.js";
import { loadEnv } from "../src/config/env.js";
import { createPrismaClient } from "../src/db/prisma.js";
import { hashToken } from "../src/lib/tokens.js";
import { BILLING_PLANS, PAID_PERIOD_MS } from "../src/modules/billing/plans.js";
import { csvCell, reportDateRange, reportQuerySchema } from "../src/modules/reports/service.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
const databaseOptions = { skip: databaseUrl ? false : "TEST_DATABASE_URL não definida" };
const origin = "http://localhost:5173";
const range = "from=2026-09-01&to=2026-09-30";

test("datas do relatório incluem dias inteiros em Brasília e limitam consultas", () => {
  const dates = reportDateRange({ from: "2026-09-01", to: "2026-09-30" });
  assert.equal(dates.gte.toISOString(), "2026-09-01T03:00:00.000Z");
  assert.equal(dates.lt.toISOString(), "2026-10-01T03:00:00.000Z");
  assert.equal(reportDateRange({ from: "2010-01-01", to: "2010-01-01" }).gte.toISOString(), "2010-01-01T02:00:00.000Z");
  const dst = reportDateRange({ from: "2010-10-17", to: "2010-10-17" });
  assert.equal(dst.gte.toISOString(), "2010-10-17T03:00:00.000Z");
  assert.equal(dst.lt.toISOString(), "2010-10-18T02:00:00.000Z");
  for (const query of [{ from: "2026-02-30", to: "2026-03-01" }, { from: "2026-09-30", to: "2026-09-01" },
    { from: "2025-01-01", to: "2026-01-02" }, { from: "2026-01-01", to: "2026-01-02", page: 0 },
    { from: "2026-01-01", to: "2026-01-02", planId: "business" }]) {
    assert.equal(reportQuerySchema.safeParse(query).success, false);
  }
  assert.equal(reportQuerySchema.safeParse({ from: "2024-01-01", to: "2024-12-31" }).success, true);
});

test("CSV escapa aspas, delimitadores e fórmulas de planilha", () => {
  assert.equal(csvCell('João; "Serviços"'), '"João; ""Serviços"""');
  for (const value of ["=1+1", "+123", "-123", "@SUM(A1)", " \t=1+1", "\u0000=1+1", "\rformula", "\nformula"]) {
    assert.ok(csvCell(value).startsWith('"\''), value);
  }
  assert.equal(csvCell("Texto comum"), '"Texto comum"');
});

async function fixture(context: TestContext) {
  assert.ok(databaseUrl);
  const prisma = createPrismaClient(databaseUrl);
  const ownerIds: string[] = [];
  const env = loadEnv({ NODE_ENV: "test", DATABASE_URL: databaseUrl, WEB_ORIGIN: origin,
    PASSWORD_PEPPER: "reports-test-pepper-at-least-32-characters", BILLING_ENABLED: "false" });
  const app = await buildApp({ prisma, env, logger: false, passwordResetDeliveryEnabled: false, billingReconciliationEnabled: false });
  context.after(async () => { await app.close(); await prisma.user.deleteMany({ where: { id: { in: ownerIds } } }); await prisma.$disconnect(); });
  async function account() {
    const token = randomUUID();
    const user = await prisma.user.create({ data: { name: "Pessoa Teste", businessName: "Serviços São João", email: `report-${randomUUID()}@example.test`, phone: "11988888888", passwordHash: "test-only", termsVersion: "test", termsAcceptedAt: new Date(),
      sessions: { create: { tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 86_400_000) } } } });
    ownerIds.push(user.id);
    const client = await prisma.client.create({ data: { ownerId: user.id, name: 'João; "Cliente"', email: "client@example.test", phone: "11999999999", notes: "INTERNAL-NOTE-DO-NOT-EXPORT" } });
    return { user, client, headers: { cookie: `extraok_session=${token}`, origin } };
  }
  async function grant(ownerId: string, plan: "pro" | "business", startsAt = new Date(Date.now() - 60_000), endsAt = new Date(Date.now() + PAID_PERIOD_MS)) {
    const config = BILLING_PLANS.find((entry) => entry.id === plan)!;
    const payment = await prisma.billingPayment.create({ data: { ownerId, plan, priceCents: config.priceCents, jobLimit: config.jobLimit, status: "approved", payerName: "Test", payerEmail: "payer@example.test", expiresAt: new Date(), approvedAt: startsAt } });
    return prisma.billingPeriod.create({ data: { ownerId, paymentId: payment.id, plan, jobLimit: config.jobLimit, startsAt, endsAt } });
  }
  async function job(ownerId: string, clientId: string, scheduledAt = new Date("2026-09-01T03:00:00Z"), title = "Instalação com revisão") {
    return prisma.job.create({ data: { ownerId, clientId, title, description: "Revisão elétrica com materiais e mão de obra.", scheduledAt,
      extras: { create: [
        { title: "Troca aprovada", description: "Serviço aprovado pelo cliente", priceCents: 12345, status: "approved", respondedAt: new Date("2026-10-10T12:00:00Z") },
        { title: "Peça pendente", description: "Aguardando resposta", priceCents: 2000 },
        { title: "Extra recusado", description: "Resposta registrada", priceCents: 3000, status: "rejected", respondedAt: new Date("2026-09-02T13:00:00Z") },
      ] } } });
  }
  return { app, prisma, account, grant, job };
}

test("Gratuito bloqueia exportações e relatórios; catálogo e resumo informam benefícios", databaseOptions, async (context) => {
  const f = await fixture(context);
  const a = await f.account();
  const job = await f.job(a.user.id, a.client.id);
  for (const url of [`/jobs/${job.id}/pdf`, `/reports/jobs?${range}`, `/reports/jobs.csv?${range}`]) {
    assert.equal((await f.app.inject({ url: `/api/v1${url}` })).statusCode, 401);
    const response = await f.app.inject({ url: `/api/v1${url}`, headers: a.headers });
    assert.equal(response.statusCode, 403, response.body);
    assert.equal(response.json().error.code, "PLAN_FEATURE_REQUIRED");
  }
  const summary = (await f.app.inject({ url: "/api/v1/billing", headers: a.headers })).json();
  assert.deepEqual(summary.current.features, { pdfExport: false, advancedReports: false, csvExport: false });
  const plans = (await f.app.inject({ url: "/api/v1/billing/plans" })).json().plans;
  assert.ok(plans[1].benefits.some((benefit: string) => benefit.includes("PDF")));
  assert.ok(plans[2].benefits.some((benefit: string) => benefit.includes("CSV")));
  assert.equal(await f.prisma.approvalUsage.count({ where: { ownerId: a.user.id } }), 0);
});

test("Pro permite PDF próprio, bloqueia relatórios e não libera Negócio agendado", databaseOptions, async (context) => {
  const f = await fixture(context);
  const a = await f.account();
  const b = await f.account();
  const ownJob = await f.job(a.user.id, a.client.id);
  const otherJob = await f.job(b.user.id, b.client.id);
  const pro = await f.grant(a.user.id, "pro");
  await f.grant(a.user.id, "business", pro.endsAt, new Date(pro.endsAt.getTime() + PAID_PERIOD_MS));
  const pdf = await f.app.inject({ url: `/api/v1/jobs/${ownJob.id}/pdf`, headers: a.headers });
  assert.equal(pdf.statusCode, 200, pdf.body.slice(0, 200));
  assert.equal(pdf.headers["content-type"], "application/pdf");
  assert.equal(pdf.rawPayload.subarray(0, 5).toString(), "%PDF-");
  assert.ok(pdf.rawPayload.length > 1000);
  assert.match(String(pdf.headers["cache-control"]), /no-store/);
  assert.match(String(pdf.headers["content-disposition"]), /attachment/);
  assert.equal((await f.app.inject({ url: `/api/v1/jobs/${otherJob.id}/pdf`, headers: a.headers })).statusCode, 404);
  for (const path of ["/reports/jobs", "/reports/jobs.csv"]) assert.equal((await f.app.inject({ url: `/api/v1${path}?${range}`, headers: a.headers })).statusCode, 403);
  const summary = (await f.app.inject({ url: "/api/v1/billing", headers: a.headers })).json();
  assert.deepEqual(summary.current.features, { pdfExport: true, advancedReports: false, csvExport: false });
  assert.equal(summary.upcoming.length, 1);
  assert.equal(await f.prisma.approvalUsage.count({ where: { ownerId: a.user.id } }), 0);
});

test("Negócio filtra somente dados próprios, usa dias de Brasília e exporta todas as páginas", databaseOptions, async (context) => {
  const f = await fixture(context);
  const a = await f.account();
  const b = await f.account();
  await f.grant(a.user.id, "business");
  await f.job(b.user.id, b.client.id, new Date("2026-09-10T12:00:00Z"), "SECRET-OTHER-OWNER");
  await f.job(a.user.id, a.client.id, new Date("2026-09-01T02:59:59.999Z"), "BEFORE-RANGE");
  await f.job(a.user.id, a.client.id, new Date("2026-10-01T03:00:00Z"), "AFTER-RANGE");
  const first = await f.job(a.user.id, a.client.id, new Date("2026-09-01T03:00:00Z"), "=HYPERLINK(\"malicious\")");
  await f.job(a.user.id, a.client.id, new Date("2026-10-01T02:59:59.999Z"));
  for (let index = 0; index < 25; index++) await f.job(a.user.id, a.client.id);
  const report = await f.app.inject({ url: `/api/v1/reports/jobs?${range}`, headers: a.headers });
  assert.equal(report.statusCode, 200, report.body);
  const body = report.json();
  assert.equal(body.summary.totalJobs, 27);
  assert.equal(body.summary.approvedCents, 27 * 12345);
  assert.equal(body.summary.pendingCents, 27 * 2000);
  assert.equal(body.summary.rejectedCents, 27 * 3000);
  assert.equal(body.summary.approvalRate, 50);
  assert.equal(body.rows.length, 25);
  assert.equal(body.totalPages, 2);
  const second = (await f.app.inject({ url: `/api/v1/reports/jobs?${range}&page=2`, headers: a.headers })).json();
  assert.equal(second.rows.length, 2);
  assert.equal(new Set([...body.rows, ...second.rows].map((row) => row.id)).size, 27);
  const csv = await f.app.inject({ url: `/api/v1/reports/jobs.csv?${range}&page=2`, headers: a.headers });
  assert.equal(csv.statusCode, 200, csv.body);
  assert.match(String(csv.headers["content-type"]), /text\/csv/);
  assert.ok(csv.body.startsWith("\uFEFF"));
  assert.equal(csv.body.trim().split("\r\n").length, 28);
  assert.ok(csv.body.includes(first.id));
  assert.ok(csv.body.includes('"\'=HYPERLINK('));
  assert.ok(csv.body.includes('"João; ""Cliente"""'));
  for (const forbidden of ["SECRET-OTHER-OWNER", "BEFORE-RANGE", "AFTER-RANGE", "INTERNAL-NOTE", "payer@example.test"]) {
    assert.ok(!csv.body.includes(forbidden)); assert.ok(!report.body.includes(forbidden));
  }
  const foreignFilter = await f.app.inject({ url: `/api/v1/reports/jobs?${range}&clientId=${b.client.id}`, headers: a.headers });
  assert.equal(foreignFilter.statusCode, 404);
  const empty = (await f.app.inject({ url: `/api/v1/reports/jobs?${range}&status=completed&clientId=${a.client.id}`, headers: a.headers })).json();
  assert.equal(empty.summary.totalJobs, 0);
  assert.equal(empty.summary.approvedCents, 0);
  assert.deepEqual(empty.rows, []);
  assert.equal((await f.app.inject({ url: `/api/v1/jobs/${first.id}/pdf`, headers: a.headers })).statusCode, 200);
});

for (const state of ["expired", "revoked", "future"] as const) {
  test(`${state}: benefício depende de período vigente sem apagar histórico`, databaseOptions, async (context) => {
    const f = await fixture(context);
    const a = await f.account();
    const job = await f.job(a.user.id, a.client.id);
    const start = new Date(Date.now() + (state === "future" ? 60_000 : -PAID_PERIOD_MS));
    const end = new Date(Date.now() + (state === "expired" ? -1000 : PAID_PERIOD_MS));
    const period = await f.grant(a.user.id, "business", start, end);
    if (state === "revoked") await f.prisma.billingPeriod.update({ where: { id: period.id }, data: { revokedAt: new Date() } });
    for (const path of [`/jobs/${job.id}/pdf`, `/reports/jobs?${range}`, `/reports/jobs.csv?${range}`]) {
      const response = await f.app.inject({ url: `/api/v1${path}`, headers: a.headers });
      assert.equal(response.statusCode, 403, response.body);
    }
    assert.equal((await f.app.inject({ url: `/api/v1/jobs/${job.id}`, headers: a.headers })).statusCode, 200);
    assert.equal((await f.app.inject({ url: "/api/v1/dashboard/summary", headers: a.headers })).statusCode, 200);
    const summary = (await f.app.inject({ url: "/api/v1/billing", headers: a.headers })).json();
    assert.equal(summary.current.features.pdfExport, false);
    assert.equal(await f.prisma.extra.count({ where: { jobId: job.id } }), 3);
  });
}
