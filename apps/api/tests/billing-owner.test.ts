import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { type TestContext } from "node:test";
import { buildApp } from "../src/app.js";
import { loadEnv } from "../src/config/env.js";
import { createPrismaClient } from "../src/db/prisma.js";
import { hashToken } from "../src/lib/tokens.js";
import { isBillingOwner } from "../src/modules/billing/entitlements.js";
import type { PixGateway } from "../src/modules/billing/mercadopago.js";
import { BILLING_PLANS, freeMonthWindow, PAID_PERIOD_MS } from "../src/modules/billing/plans.js";
import { createPayment } from "../src/modules/billing/service.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
const databaseOptions = { skip: databaseUrl ? false : "TEST_DATABASE_URL não definida" };
const origin = "https://app.extraok.test";
const range = "from=2026-09-01&to=2026-09-30";
const allFeatures = { pdfExport: true, advancedReports: true, csvExport: true };
const freeFeatures = { pdfExport: false, advancedReports: false, csvExport: false };
const baseEnv = {
  NODE_ENV: "test", DATABASE_URL: "postgresql://test:test@127.0.0.1:1/unused", WEB_ORIGIN: origin,
  PASSWORD_PEPPER: "billing-owner-test-pepper-at-least-32-characters", BILLING_ENABLED: "false",
  MERCADOPAGO_ACCESS_TOKEN: "billing-owner-test-access-token-at-least-32-characters",
  MERCADOPAGO_WEBHOOK_SECRET: "billing-owner-test-webhook-secret-at-least-32-characters",
  MERCADOPAGO_COLLECTOR_ID: "123456", MERCADOPAGO_LIVE_MODE: "false",
  MERCADOPAGO_WEBHOOK_URL: `${origin}/api/v1/billing/webhooks/mercadopago`,
};

test("isenção exige UUID configurado; vazio desativa, inválido falha e maiúsculas normalizam", () => {
  const ownerId = randomUUID();
  for (const value of [undefined, "", " \t "]) {
    const env = loadEnv({ ...baseEnv, BILLING_OWNER_USER_ID: value });
    assert.equal(env.BILLING_OWNER_USER_ID, undefined);
    assert.equal(isBillingOwner(ownerId, env), false);
    assert.equal(isBillingOwner("", env), false);
  }
  for (const value of ["owner@example.test", "true", "*", "all", `${ownerId},${randomUUID()}`, "not-a-uuid"]) {
    assert.throws(() => loadEnv({ ...baseEnv, BILLING_OWNER_USER_ID: value }));
  }
  const normalized = loadEnv({ ...baseEnv, BILLING_OWNER_USER_ID: ` ${ownerId.toUpperCase()} ` });
  assert.equal(normalized.BILLING_OWNER_USER_ID, ownerId);
  assert.equal(isBillingOwner(ownerId, normalized), true);
  assert.equal(isBillingOwner(randomUUID(), normalized), false);
});

async function fixture(context: TestContext) {
  assert.ok(databaseUrl);
  const prisma = createPrismaClient(databaseUrl);
  const ownerId = randomUUID();
  const accounts: string[] = [];
  const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
  const calls = { create: 0, get: 0 };
  const gateway: PixGateway = {
    async create() { calls.create++; throw new Error("Gateway não deveria ser chamado"); },
    async get() { calls.get++; throw new Error("Gateway não deveria ser chamado"); },
  };
  context.after(async () => {
    for (const app of apps) await app.close();
    await prisma.user.deleteMany({ where: { id: { in: accounts } } });
    await prisma.$disconnect();
  });
  async function openApp(configuredOwnerId: string | undefined, billingEnabled = false) {
    const env = loadEnv({ ...baseEnv, DATABASE_URL: databaseUrl,
      BILLING_OWNER_USER_ID: configuredOwnerId, BILLING_ENABLED: String(billingEnabled) });
    const app = await buildApp({ prisma, env, pixGateway: gateway, logger: false,
      passwordResetDeliveryEnabled: false, billingReconciliationEnabled: false });
    apps.push(app);
    return app;
  }
  async function account(id: string = randomUUID()) {
    const token = randomUUID();
    const user = await prisma.user.create({ data: {
      id, name: "Pessoa Teste", businessName: "Serviços de teste", email: `owner-access-${randomUUID()}@example.test`,
      phone: "11988888888", passwordHash: "unused-in-owner-tests", termsVersion: "test", termsAcceptedAt: new Date(),
      sessions: { create: { tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 86_400_000) } },
    } });
    accounts.push(user.id);
    const client = await prisma.client.create({ data: { ownerId: user.id, name: "Cliente de teste",
      email: "client@example.test", phone: "11999999999" } });
    return { user, client, headers: { cookie: `extraok_session=${token}`, origin } };
  }
  async function job(person: Awaited<ReturnType<typeof account>>, title = "Atendimento próprio") {
    return prisma.job.create({ data: { ownerId: person.user.id, clientId: person.client.id, title,
      description: "Serviço de integração", scheduledAt: new Date("2026-09-10T12:00:00Z"),
      extras: { create: { title: "Extra aprovado", description: "Serviço adicional", priceCents: 1500, status: "approved", respondedAt: new Date() } },
    } });
  }
  async function grant(accountId: string, plan: "pro" | "business", startsAt: Date, endsAt: Date) {
    const config = BILLING_PLANS.find((entry) => entry.id === plan)!;
    const payment = await prisma.billingPayment.create({ data: { ownerId: accountId, plan, priceCents: config.priceCents,
      jobLimit: config.jobLimit, status: "approved", payerName: "Teste", payerEmail: "payer@example.test",
      expiresAt: new Date(), approvedAt: startsAt } });
    const period = await prisma.billingPeriod.create({ data: { ownerId: accountId, paymentId: payment.id,
      plan, jobLimit: config.jobLimit, startsAt, endsAt } });
    return { payment, period };
  }
  const owner = await account(ownerId);
  const app = await openApp(ownerId);
  return { app, prisma, owner, account, job, grant, openApp, gateway, calls };
}

test("proprietário tem resumo ilimitado e todos os benefícios sem pagamento ou período artificial", databaseOptions, async (context) => {
  const f = await fixture(context);
  const job = await f.job(f.owner);
  const response = await f.app.inject({ url: "/api/v1/billing", headers: f.owner.headers });
  assert.equal(response.statusCode, 200, response.body);
  const summary = response.json();
  assert.deepEqual(summary.current, { billingExempt: true, planId: "business", features: allFeatures,
    startsAt: null, endsAt: null, limit: null, used: 0, remaining: null });
  assert.equal(summary.nextPurchaseStartsAt, null);
  assert.deepEqual(summary.upcoming, []);
  assert.deepEqual(summary.payments, []);
  const pdf = await f.app.inject({ url: `/api/v1/jobs/${job.id}/pdf`, headers: f.owner.headers });
  assert.equal(pdf.statusCode, 200, pdf.body.slice(0, 100));
  assert.equal(pdf.rawPayload.subarray(0, 5).toString(), "%PDF-");
  const report = await f.app.inject({ url: `/api/v1/reports/jobs?${range}`, headers: f.owner.headers });
  assert.equal(report.statusCode, 200, report.body);
  assert.equal(report.json().summary.totalJobs, 1);
  const csv = await f.app.inject({ url: `/api/v1/reports/jobs.csv?${range}`, headers: f.owner.headers });
  assert.equal(csv.statusCode, 200, csv.body);
  assert.ok(csv.body.includes(job.id));
  assert.equal(await f.prisma.approvalUsage.count({ where: { ownerId: f.owner.user.id } }), 0);
  assert.equal(await f.prisma.billingPayment.count({ where: { ownerId: f.owner.user.id } }), 0);
  assert.equal(await f.prisma.billingPeriod.count({ where: { ownerId: f.owner.user.id } }), 0);
  assert.deepEqual(f.calls, { create: 0, get: 0 });
});

test("proprietário pode ultrapassar 200 atendimentos e rotacionar links com consumo único vitalício", databaseOptions, async (context) => {
  const f = await fixture(context);
  const seeds = Array.from({ length: 201 }, () => ({ id: randomUUID(), ownerId: f.owner.user.id,
    clientId: f.owner.client.id, title: "Atendimento já compartilhado", description: "Histórico de uso",
    scheduledAt: new Date() }));
  await f.prisma.job.createMany({ data: seeds });
  await f.prisma.approvalUsage.createMany({ data: seeds.map((job) => ({ jobId: job.id, ownerId: job.ownerId })) });
  const jobs = await Promise.all(Array.from({ length: 4 }, () => f.job(f.owner)));
  const shares = await Promise.all(jobs.map((job) => f.app.inject({ method: "POST",
    url: `/api/v1/jobs/${job.id}/approval-links`, headers: f.owner.headers })));
  for (const share of shares) assert.equal(share.statusCode, 201, share.body);
  const first = jobs[0]!;
  const oldToken = shares[0]!.json().token;
  const rotations = await Promise.all([1, 2].map(() => f.app.inject({ method: "POST",
    url: `/api/v1/jobs/${first.id}/approval-links`, headers: f.owner.headers })));
  for (const rotation of rotations) assert.equal(rotation.statusCode, 201, rotation.body);
  assert.equal((await f.app.inject({ url: `/api/v1/public/approvals/${oldToken}` })).statusCode, 404);
  const usages = await f.prisma.approvalUsage.findMany({ where: { ownerId: f.owner.user.id } });
  assert.equal(usages.length, 205);
  assert.ok(usages.every((usage) => usage.periodId === null && usage.freeMonth === null));
  assert.equal(await f.prisma.approvalLink.count({ where: { jobId: first.id, revokedAt: null } }), 1);
  const summary = (await f.app.inject({ url: "/api/v1/billing", headers: f.owner.headers })).json();
  assert.equal(summary.current.used, 205);
  assert.equal(summary.current.remaining, null);
});

test("isenção depende da sessão e do ID; cabeçalhos, corpo e e-mail não liberam outra conta", databaseOptions, async (context) => {
  const f = await fixture(context);
  const other = await f.account();
  // Reutilizar o antigo e-mail do proprietário não transfere a exceção de cobrança.
  await f.prisma.user.update({ where: { id: f.owner.user.id }, data: { email: `changed-${randomUUID()}@example.test` } });
  await f.prisma.user.update({ where: { id: other.user.id }, data: { email: f.owner.user.email } });
  const headers = { ...other.headers, "x-user-id": f.owner.user.id, "x-owner-id": f.owner.user.id,
    "x-billing-owner-user-id": f.owner.user.id, "x-billing-exempt": "true", "x-user-role": "admin" };
  assert.equal((await f.app.inject({ url: "/api/v1/billing", headers: { "x-user-id": f.owner.user.id } })).statusCode, 401);
  const summary = (await f.app.inject({ url: "/api/v1/billing?billingExempt=true&planId=business", headers })).json();
  assert.equal(summary.current.billingExempt, false);
  assert.equal(summary.current.planId, "free");
  assert.equal(summary.current.limit, 3);
  assert.deepEqual(summary.current.features, freeFeatures);
  const jobs = await Promise.all(Array.from({ length: 4 }, () => f.job(other)));
  for (let index = 0; index < jobs.length; index++) {
    const response = await f.app.inject({ method: "POST", url: `/api/v1/jobs/${jobs[index]!.id}/approval-links`, headers,
      payload: { ownerId: f.owner.user.id, billingExempt: true, planId: "business", role: "admin" } });
    assert.equal(response.statusCode, index < 3 ? 201 : 402, response.body);
    if (index === 3) assert.equal(response.json().error.code, "PLAN_LIMIT_REACHED");
  }
  for (const path of [`/jobs/${jobs[0]!.id}/pdf`, `/reports/jobs?${range}`, `/reports/jobs.csv?${range}`]) {
    const response = await f.app.inject({ url: `/api/v1${path}`, headers });
    assert.equal(response.statusCode, 403, response.body);
    assert.equal(response.json().error.code, "PLAN_FEATURE_REQUIRED");
  }
  assert.equal((await f.app.inject({ url: "/api/v1/billing", headers: f.owner.headers })).json().current.billingExempt, true);
});

test("isenção mantém isolamento de atendimentos, clientes, PDF, relatórios e CSV", databaseOptions, async (context) => {
  const f = await fixture(context);
  const other = await f.account();
  const ownJob = await f.job(f.owner);
  const otherJob = await f.job(other, "SECRET-OTHER-OWNER");
  for (const path of [`/jobs/${otherJob.id}`, `/jobs/${otherJob.id}/pdf`, `/clients/${other.client.id}`,
    `/reports/jobs?${range}&clientId=${other.client.id}`, `/reports/jobs.csv?${range}&clientId=${other.client.id}`]) {
    const response = await f.app.inject({ url: `/api/v1${path}`, headers: f.owner.headers });
    assert.equal(response.statusCode, 404, response.body);
  }
  const share = await f.app.inject({ method: "POST", url: `/api/v1/jobs/${otherJob.id}/approval-links`, headers: f.owner.headers });
  assert.equal(share.statusCode, 404);
  for (const path of [`/reports/jobs?${range}`, `/reports/jobs.csv?${range}`]) {
    const response = await f.app.inject({ url: `/api/v1${path}`, headers: f.owner.headers });
    assert.equal(response.statusCode, 200, response.body);
    assert.ok(response.body.includes(ownJob.id));
    assert.ok(!response.body.includes(otherJob.id));
    assert.ok(!response.body.includes("SECRET-OTHER-OWNER"));
  }
});

test("proprietário bloqueia compra na rota e no serviço antes de gravar ou chamar o Pix", databaseOptions, async (context) => {
  const f = await fixture(context);
  const purchase = { planId: "business" as const, cpf: "52998224725", idempotencyKey: randomUUID() };
  for (const enabled of [false, true]) {
    const app = await f.openApp(f.owner.user.id, enabled);
    for (const payload of [purchase, {}]) {
      const response = await app.inject({ method: "POST", url: "/api/v1/billing/payments", headers: f.owner.headers, payload });
      assert.equal(response.statusCode, 409, response.body);
      assert.equal(response.json().error.code, "BILLING_EXEMPT");
    }
    await assert.rejects(createPayment(app, f.gateway, f.owner.user, purchase),
      (error: { code?: string }) => error.code === "BILLING_EXEMPT");
  }
  assert.deepEqual(f.calls, { create: 0, get: 0 });
  assert.equal(await f.prisma.billingPayment.count({ where: { ownerId: f.owner.user.id } }), 0);
  assert.equal(await f.prisma.billingPeriod.count({ where: { ownerId: f.owner.user.id } }), 0);
});

test("remover isenção restaura cota gratuita e preserva links, respostas e uso anterior", databaseOptions, async (context) => {
  const f = await fixture(context);
  const normalApp = await f.openApp(undefined);
  const jobs = await Promise.all(Array.from({ length: 4 }, () => f.job(f.owner)));
  for (const job of jobs.slice(0, 3)) {
    const response = await normalApp.inject({ method: "POST", url: `/api/v1/jobs/${job.id}/approval-links`, headers: f.owner.headers });
    assert.equal(response.statusCode, 201, response.body);
  }
  const exemptJob = jobs[3]!;
  const share = await f.app.inject({ method: "POST", url: `/api/v1/jobs/${exemptJob.id}/approval-links`, headers: f.owner.headers });
  assert.equal(share.statusCode, 201, share.body);
  const preservedLink = await f.prisma.approvalLink.findFirstOrThrow({ where: { jobId: exemptJob.id, revokedAt: null } });
  const summary = (await normalApp.inject({ url: "/api/v1/billing", headers: f.owner.headers })).json();
  assert.equal(summary.current.billingExempt, false);
  assert.equal(summary.current.planId, "free");
  assert.equal(summary.current.used, 3);
  assert.equal(summary.current.remaining, 0);
  assert.deepEqual(summary.current.features, freeFeatures);
  assert.equal((await normalApp.inject({ url: `/api/v1/public/approvals/${share.json().token}` })).statusCode, 200);
  assert.deepEqual(await f.prisma.approvalLink.findUniqueOrThrow({ where: { id: preservedLink.id } }), preservedLink);
  const newJob = await f.job(f.owner);
  const blocked = await normalApp.inject({ method: "POST", url: `/api/v1/jobs/${newJob.id}/approval-links`, headers: f.owner.headers });
  assert.equal(blocked.statusCode, 402, blocked.body);
  const rotation = await normalApp.inject({ method: "POST", url: `/api/v1/jobs/${exemptJob.id}/approval-links`, headers: f.owner.headers });
  assert.equal(rotation.statusCode, 201, rotation.body);
  assert.equal(await f.prisma.approvalUsage.count({ where: { ownerId: f.owner.user.id } }), 4);
  assert.equal(await f.prisma.approvalUsage.count({ where: { ownerId: f.owner.user.id, freeMonth: freeMonthWindow(new Date()).key } }), 3);
  assert.equal(await f.prisma.extra.count({ where: { jobId: exemptJob.id, status: "approved" } }), 1);
  assert.equal((await normalApp.inject({ url: `/api/v1/jobs/${exemptJob.id}`, headers: f.owner.headers })).statusCode, 200);
  assert.equal((await normalApp.inject({ url: `/api/v1/jobs/${exemptJob.id}/pdf`, headers: f.owner.headers })).statusCode, 403);
});

test("isenção preserva períodos pagos e removê-la retoma plano ativo, consumo e fila originais", databaseOptions, async (context) => {
  const f = await fixture(context);
  const now = Date.now();
  const expired = await f.grant(f.owner.user.id, "business", new Date(now - 2 * PAID_PERIOD_MS), new Date(now - PAID_PERIOD_MS));
  const active = await f.grant(f.owner.user.id, "pro", new Date(now - 60_000), new Date(now + PAID_PERIOD_MS));
  const queued = await f.grant(f.owner.user.id, "business", active.period.endsAt, new Date(active.period.endsAt.getTime() + PAID_PERIOD_MS));
  const normalApp = await f.openApp(undefined);
  const paidJob = await f.job(f.owner);
  const paidShare = await normalApp.inject({ method: "POST", url: `/api/v1/jobs/${paidJob.id}/approval-links`, headers: f.owner.headers });
  assert.equal(paidShare.statusCode, 201, paidShare.body);
  const exemptJob = await f.job(f.owner);
  assert.equal((await f.app.inject({ method: "POST", url: `/api/v1/jobs/${exemptJob.id}/approval-links`, headers: f.owner.headers })).statusCode, 201);
  const exempt = (await f.app.inject({ url: "/api/v1/billing", headers: f.owner.headers })).json();
  assert.equal(exempt.current.billingExempt, true);
  assert.deepEqual(exempt.current.features, allFeatures);
  assert.equal(exempt.payments.length, 3);
  const restored = (await normalApp.inject({ url: "/api/v1/billing", headers: f.owner.headers })).json();
  assert.equal(restored.current.billingExempt, false);
  assert.equal(restored.current.planId, "pro");
  assert.equal(restored.current.used, 1);
  assert.equal(restored.current.remaining, 49);
  assert.equal(restored.current.endsAt, active.period.endsAt.toISOString());
  assert.deepEqual(restored.current.features, { pdfExport: true, advancedReports: false, csvExport: false });
  assert.equal(restored.upcoming[0].id, queued.period.id);
  assert.equal(restored.nextPurchaseStartsAt, queued.period.endsAt.toISOString());
  for (const saved of [expired, active, queued]) {
    assert.deepEqual(await f.prisma.billingPeriod.findUniqueOrThrow({ where: { id: saved.period.id } }), saved.period);
    assert.deepEqual(await f.prisma.billingPayment.findUniqueOrThrow({ where: { id: saved.payment.id } }), saved.payment);
  }
  assert.equal((await normalApp.inject({ url: `/api/v1/jobs/${exemptJob.id}/pdf`, headers: f.owner.headers })).statusCode, 200);
  assert.equal((await normalApp.inject({ url: `/api/v1/reports/jobs?${range}`, headers: f.owner.headers })).statusCode, 403);
  assert.equal((await normalApp.inject({ url: `/api/v1/public/approvals/${paidShare.json().token}` })).statusCode, 200);
});
