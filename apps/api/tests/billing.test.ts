import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import test, { type TestContext } from "node:test";
import { buildApp } from "../src/app.js";
import { loadEnv } from "../src/config/env.js";
import { createPrismaClient } from "../src/db/prisma.js";
import type { BillingPayment } from "../src/generated/prisma/client.js";
import { hashToken } from "../src/lib/tokens.js";
import { createPixGateway, validWebhookSignature, type PixGateway, type PixPayment } from "../src/modules/billing/mercadopago.js";
import { BILLING_PLANS, freeMonthWindow, PAID_PERIOD_MS, validCpf } from "../src/modules/billing/plans.js";
import { applyVerifiedPayment, createPayment, reconcilePayments } from "../src/modules/billing/service.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
const databaseOptions = { skip: databaseUrl ? false : "TEST_DATABASE_URL não definida" };
const origin = "https://app.extraok.test";
const secret = "webhook-secret-for-billing-tests-only-32-chars";
const baseEnv = {
  NODE_ENV: "test", DATABASE_URL: "postgresql://test:test@127.0.0.1:1/unused", WEB_ORIGIN: origin,
  PASSWORD_PEPPER: "pepper-billing-tests-only-32-characters",
  BILLING_ENABLED: "true", MERCADOPAGO_ACCESS_TOKEN: "access-token-for-billing-tests-only-32-chars",
  MERCADOPAGO_WEBHOOK_SECRET: secret, MERCADOPAGO_COLLECTOR_ID: "123456",
  MERCADOPAGO_WEBHOOK_URL: `${origin}/api/v1/billing/webhooks/mercadopago`, MERCADOPAGO_LIVE_MODE: "false",
};
function sign(id: string, requestId = "test-request", timestamp = "1789400000") {
  const hash = createHmac("sha256", secret).update(`id:${id};request-id:${requestId};ts:${timestamp};`).digest("hex");
  return { "x-signature": `ts=${timestamp},v1=${hash}`, "x-request-id": requestId };
}
function remotePayment(payment: Pick<BillingPayment, "id" | "priceCents" | "expiresAt">, id = "1234"): PixPayment {
  return {
    id, collector_id: "123456", external_reference: payment.id, live_mode: false, payment_method_id: "pix",
    currency_id: "BRL", transaction_amount: payment.priceCents / 100, transaction_amount_refunded: 0,
    status: "pending", status_detail: "pending_waiting_transfer", date_last_updated: new Date().toISOString(),
    date_approved: null, date_of_expiration: payment.expiresAt.toISOString(),
    point_of_interaction: { transaction_data: { qr_code: "000201-PIX-TEST", qr_code_base64: "aW1hZ2U=" } },
  };
}

test("catálogo tem três planos, preços em centavos e mês gratuito em São Paulo", () => {
  assert.deepEqual(BILLING_PLANS.map((plan) => [plan.id, plan.priceCents, plan.jobLimit]), [["free", 0, 3], ["pro", 2990, 50], ["business", 5990, 200]]);
  assert.equal(freeMonthWindow(new Date("2026-10-01T02:59:59Z")).key, "2026-09");
  const month = freeMonthWindow(new Date("2026-10-01T03:00:00Z"));
  assert.equal(month.key, "2026-10");
  assert.equal(month.endsAt.toISOString(), "2026-11-01T03:00:00.000Z");
  assert.equal(freeMonthWindow(new Date("2026-12-15T12:00:00Z")).endsAt.toISOString(), "2027-01-01T03:00:00.000Z");
});

test("CPF exige dígitos verificadores e rejeita sequências repetidas", () => {
  assert.equal(validCpf("52998224725"), true);
  for (const cpf of ["", "52998224724", "11111111111", "00000000000", "529.982.247-25", "1234abc"]) assert.equal(validCpf(cpf), false);
});

test("HMAC vincula a notificação ao ID da query e request-id sem aceitar adulteração", () => {
  const headers = sign("1234");
  assert.equal(validWebhookSignature(secret, headers["x-signature"], headers["x-request-id"], "1234"), true);
  assert.equal(validWebhookSignature(secret, headers["x-signature"], headers["x-request-id"], "9999"), false);
  assert.equal(validWebhookSignature(secret, headers["x-signature"], "other-request", "1234"), false);
  for (const signature of [undefined, "invalid", "ts=1789400000,v1=bad", `${headers["x-signature"]},ts=1789400000`, `${headers["x-signature"]},v1=${"0".repeat(64)}`]) {
    assert.equal(validWebhookSignature(secret, signature, "test-request", "1234"), false);
  }
  assert.equal(validWebhookSignature(secret, headers["x-signature"], undefined, "1234"), false);
  assert.equal(validWebhookSignature("wrong-secret", headers["x-signature"], "test-request", "1234"), false);
});

test("ativação exige credenciais, conta recebedora, URL exata e modo real em produção", () => {
  assert.equal(loadEnv(baseEnv).BILLING_ENABLED, true);
  for (const key of ["MERCADOPAGO_ACCESS_TOKEN", "MERCADOPAGO_WEBHOOK_SECRET", "MERCADOPAGO_COLLECTOR_ID", "MERCADOPAGO_WEBHOOK_URL"]) {
    assert.throws(() => loadEnv({ ...baseEnv, [key]: "" }));
  }
  for (const url of ["http://app.test/api/v1/billing/webhooks/mercadopago", `${origin}/wrong`, `${baseEnv.MERCADOPAGO_WEBHOOK_URL}?secret=bad`]) {
    assert.throws(() => loadEnv({ ...baseEnv, MERCADOPAGO_WEBHOOK_URL: url }));
  }
  assert.throws(() => loadEnv({ ...baseEnv, NODE_ENV: "production" }));
  assert.equal(loadEnv({ ...baseEnv, NODE_ENV: "production", MERCADOPAGO_LIVE_MODE: "true" }).BILLING_ENABLED, true);
});

test("catálogo público não exige banco; somente webhook exato dispensa Origin e exige HMAC", async (context) => {
  let remoteCalls = 0;
  const gateway: PixGateway = { create: async () => { throw new Error("not expected"); }, get: async () => { remoteCalls++; throw new Error("not expected"); } };
  const app = await buildApp({ env: loadEnv(baseEnv), pixGateway: gateway, logger: false, billingReconciliationEnabled: false });
  context.after(() => app.close());
  const catalog = await app.inject({ url: "/api/v1/billing/plans" });
  assert.equal(catalog.statusCode, 200);
  assert.equal(catalog.json().plans.length, 3);
  assert.equal((await app.inject({ url: "/api/v1/billing" })).statusCode, 401);
  const unsigned = await app.inject({ method: "POST", url: "/api/v1/billing/webhooks/mercadopago?data.id=1234", payload: {} });
  assert.equal(unsigned.statusCode, 401, unsigned.body);
  assert.equal(remoteCalls, 0);
  for (const path of ["/billing/payments", "/auth/login", "/billing/webhooks/mercadopago/extra"]) {
    const response = await app.inject({ method: "POST", url: `/api/v1${path}`, headers: sign("1234"), payload: {} });
    assert.equal(response.statusCode, 403, response.body);
  }
});

test("gateway envia somente Pix, usa valor do servidor, chave estável e oculta erros externos", async () => {
  const env = loadEnv(baseEnv);
  const payment = { id: randomUUID(), plan: "pro", priceCents: 2990, payerEmail: "payer@example.test", payerName: "Pessoa Teste", payerDocument: "52998224725", expiresAt: new Date(Date.now() + 1_800_000) } as BillingPayment;
  let calls = 0;
  const gateway = createPixGateway(env, (async (url: string, options: RequestInit) => {
    calls++;
    assert.equal(url, "https://api.mercadopago.com/v1/payments");
    const headers = new Headers(options.headers);
    assert.equal(headers.get("X-Idempotency-Key"), payment.id);
    const body = JSON.parse(String(options.body));
    assert.equal(body.payment_method_id, "pix");
    assert.equal(body.transaction_amount, 29.9);
    assert.equal(body.external_reference, payment.id);
    assert.equal(body.notification_url, baseEnv.MERCADOPAGO_WEBHOOK_URL);
    assert.equal(body.payer.identification.number, "52998224725");
    assert.ok(options.signal);
    return Response.json(remotePayment(payment));
  }) as typeof fetch);
  await gateway.create(payment);
  await gateway.create(payment);
  assert.equal(calls, 2);
  const broken = createPixGateway(env, (async () => Response.json({ private: "secret-cpf-provider-details" }, { status: 400 })) as typeof fetch);
  await assert.rejects(broken.create(payment), (error: Error) => !error.message.includes("secret-cpf") && error.message.includes("Tente novamente"));
});

test("webhook ignora venda sem referência; sincronização de cobrança própria continua exigindo referência", async (context) => {
  const env = loadEnv(baseEnv);
  const payment = { id: randomUUID(), priceCents: 2990, expiresAt: new Date(Date.now() + 1_800_000) };
  let externalReference: string | null | undefined = null;
  const gateway = createPixGateway(env, (async () => Response.json({ ...remotePayment(payment), external_reference: externalReference })) as typeof fetch);
  // Invalid DB destination proves these unrelated notifications never access it.
  const app = await buildApp({ env, pixGateway: gateway, logger: false, billingReconciliationEnabled: false });
  context.after(() => app.close());
  for (const reference of [null, undefined, "another-store-order"]) {
    externalReference = reference;
    const notification = await app.inject({ method: "POST", url: "/api/v1/billing/webhooks/mercadopago?data.id=1234", headers: sign("1234"), payload: {} });
    assert.equal(notification.statusCode, 200, notification.body);
    assert.equal(notification.json().received, true);
    await assert.rejects(applyVerifiedPayment(app, await gateway.get("1234"), payment.id), (error: { code?: string }) => error.code === "PAYMENT_UNAVAILABLE");
  }
});

async function fixture(context: TestContext) {
  assert.ok(databaseUrl);
  const prisma = createPrismaClient(databaseUrl);
  const env = loadEnv({ ...baseEnv, DATABASE_URL: databaseUrl });
  const token = randomUUID();
  const user = await prisma.user.create({ data: {
    name: "Pessoa de teste", businessName: "Teste Pix", email: `billing-${randomUUID()}@example.test`, phone: "11999999999",
    passwordHash: "not-used-in-billing-tests", termsVersion: "test", termsAcceptedAt: new Date(),
    sessions: { create: { tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 86_400_000) } },
  } });
  const client = await prisma.client.create({ data: { ownerId: user.id, name: "Cliente de teste", email: "client@example.test", phone: "11988888888" } });
  let sequence = 10000;
  const remotes = new Map<string, PixPayment>();
  const createdKeys = new Set<string>();
  let failAfterCreate = false;
  let getCalls = 0;
  const gateway: PixGateway = {
    async create(payment) {
      let remote = [...remotes.values()].find((entry) => entry.external_reference === payment.id);
      if (!remote) { remote = remotePayment(payment, String(++sequence)); remotes.set(remote.id, remote); createdKeys.add(payment.id); }
      if (failAfterCreate) { failAfterCreate = false; throw new Error("response lost"); }
      return structuredClone(remote);
    },
    async get(id) { getCalls++; const remote = remotes.get(id); assert.ok(remote); return structuredClone(remote); },
  };
  const app = await buildApp({ env, prisma, pixGateway: gateway, logger: false, billingReconciliationEnabled: false });
  context.after(async () => { await app.close(); await prisma.user.delete({ where: { id: user.id } }); await prisma.$disconnect(); });
  const headers = { origin, cookie: `extraok_session=${token}` };
  async function job() {
    return prisma.job.create({ data: { ownerId: user.id, clientId: client.id, title: "Trabalho de teste", description: "Atendimento de integração", scheduledAt: new Date(), extras: { create: { title: "Extra", description: "Extra de teste", priceCents: 1000 } } } });
  }
  async function purchase(planId: "pro" | "business" = "pro", key: string = randomUUID()) {
    const response = await app.inject({ method: "POST", url: "/api/v1/billing/payments", headers,
      payload: { planId, cpf: "529.982.247-25", idempotencyKey: key } });
    assert.equal(response.statusCode, 201, response.body);
    return response.json<{ id: string; status: string }>();
  }
  function approve(id: string) {
    const payment = [...remotes.values()].find((entry) => entry.external_reference === id)!;
    payment.status = "approved";
    payment.date_approved = new Date().toISOString();
    payment.date_last_updated = new Date(Date.now() + 1000).toISOString();
    return payment;
  }
  async function webhook(remote: PixPayment) {
    return app.inject({ method: "POST", url: `/api/v1/billing/webhooks/mercadopago?data.id=${remote.id}`, headers: sign(remote.id), payload: { type: "payment", data: { id: "999999-body-is-not-authority" }, status: "approved" } });
  }
  return { prisma, app, user, job, headers, purchase, approve, webhook, gateway, remotes, createdKeys, getCalls: () => getCalls, loseResponse: () => { failAfterCreate = true; } };
}

test("limite gratuito é atômico entre atendimentos; rotações não consomem outra unidade", databaseOptions, async (context) => {
  const f = await fixture(context);
  const jobs = await Promise.all(Array.from({ length: 5 }, () => f.job()));
  const responses = await Promise.all(jobs.map((job) => f.app.inject({ method: "POST", url: `/api/v1/jobs/${job.id}/approval-links`, headers: f.headers })));
  assert.equal(responses.filter((response) => response.statusCode === 201).length, 3, responses.map((r) => r.body).join("\n"));
  assert.equal(responses.filter((response) => response.statusCode === 402).length, 2);
  const sharedIndex = responses.findIndex((response) => response.statusCode === 201);
  const shared = jobs[sharedIndex]!;
  const rotations = await Promise.all([1, 2].map(() => f.app.inject({ method: "POST", url: `/api/v1/jobs/${shared.id}/approval-links`, headers: f.headers })));
  assert.ok(rotations.every((response) => response.statusCode === 201));
  assert.equal(await f.prisma.approvalUsage.count({ where: { ownerId: f.user.id } }), 3);
  assert.equal(await f.prisma.approvalLink.count({ where: { jobId: shared.id, revokedAt: null } }), 1);
  const summary = await f.app.inject({ url: "/api/v1/billing", headers: f.headers });
  assert.equal(summary.json().current.remaining, 0);
});

test("duas abas reutilizam Pix; confirmação repetida libera um período e protege PII", databaseOptions, async (context) => {
  const f = await fixture(context);
  const results = await Promise.all([f.purchase(), f.purchase()]);
  assert.equal(results[0]!.id, results[1]!.id);
  assert.equal(f.createdKeys.size, 1);
  const id = results[0]!.id;
  assert.equal((await f.prisma.billingPayment.findUniqueOrThrow({ where: { id } })).payerDocument, null);
  assert.equal(await f.prisma.billingPeriod.count({ where: { ownerId: f.user.id } }), 0);
  const remote = f.approve(id);
  const callbacks = await Promise.all([f.webhook(remote), f.webhook(remote)]);
  assert.ok(callbacks.every((response) => response.statusCode === 200), callbacks.map((r) => r.body).join("\n"));
  assert.equal(await f.prisma.billingPeriod.count({ where: { ownerId: f.user.id } }), 1);
  const period = await f.prisma.billingPeriod.findUniqueOrThrow({ where: { paymentId: id } });
  assert.equal(period.endsAt.getTime() - period.startsAt.getTime(), PAID_PERIOD_MS);
  const replay = await f.purchase("pro", id);
  assert.equal(replay.status, "approved");
  assert.equal(f.createdKeys.size, 1);
  const summary = await f.app.inject({ url: "/api/v1/billing", headers: f.headers });
  assert.equal(summary.json().current.limit, 50);
  for (const privateField of ["payerDocument", "payerEmail", "providerId", "52998224725"]) assert.equal(summary.body.includes(privateField), false);
});

test("renovação agenda próximo período; reembolso revoga somente a compra correspondente", databaseOptions, async (context) => {
  const f = await fixture(context);
  const first = await f.purchase();
  const remote = f.approve(first.id);
  await f.webhook(remote);
  const second = await f.purchase("business");
  await f.webhook(f.approve(second.id));
  const periods = await f.prisma.billingPeriod.findMany({ where: { ownerId: f.user.id }, orderBy: { startsAt: "asc" } });
  assert.equal(periods.length, 2);
  assert.equal(periods[0]!.endsAt.getTime(), periods[1]!.startsAt.getTime());
  let summary = (await f.app.inject({ url: "/api/v1/billing", headers: f.headers })).json();
  assert.equal(summary.current.planId, "pro");
  assert.equal(summary.upcoming[0].plan, "business");
  const stale = structuredClone(remote);
  remote.status = "refunded";
  remote.transaction_amount_refunded = remote.transaction_amount;
  remote.date_last_updated = new Date(Date.now() + 2000).toISOString();
  assert.equal((await f.webhook(remote)).statusCode, 200);
  await applyVerifiedPayment(f.app, stale);
  summary = (await f.app.inject({ url: "/api/v1/billing", headers: f.headers })).json();
  assert.equal(summary.current.planId, "free");
  assert.equal(summary.upcoming.length, 1);
  assert.equal((await f.prisma.billingPayment.findUniqueOrThrow({ where: { id: first.id } })).status, "refunded");
});

test("valor, moeda, método, recebedor e modo de teste nunca concedem acesso se divergirem", databaseOptions, async (context) => {
  const f = await fixture(context);
  const purchase = await f.purchase();
  const remote = f.approve(purchase.id);
  for (const changed of [{ transaction_amount: 0.01 }, { currency_id: "USD" }, { payment_method_id: "visa" }, { collector_id: "other" }, { live_mode: true }]) {
    await assert.rejects(applyVerifiedPayment(f.app, { ...remote, ...changed }), (error: { code?: string }) => error.code === "PAYMENT_MISMATCH");
  }
  assert.equal(await f.prisma.billingPeriod.count({ where: { ownerId: f.user.id } }), 0);
  const forged = await f.app.inject({ method: "POST", url: `/api/v1/billing/webhooks/mercadopago?data.id=${remote.id}`, payload: { status: "approved" } });
  assert.equal(forged.statusCode, 401);
  const otherToken = randomUUID();
  const other = await f.prisma.user.create({ data: { name: "Outro", businessName: "Outro", email: `${randomUUID()}@example.test`, phone: "11999999999", passwordHash: "unused", termsVersion: "test", termsAcceptedAt: new Date(), sessions: { create: { tokenHash: hashToken(otherToken), expiresAt: new Date(Date.now() + 86_400_000) } } } });
  try {
    const before = f.getCalls();
    const response = await f.app.inject({ url: `/api/v1/billing/payments/${purchase.id}`, headers: { cookie: `extraok_session=${otherToken}` } });
    assert.equal(response.statusCode, 404);
    assert.equal(f.getCalls(), before);
    const forgedPrice = await f.app.inject({ method: "POST", url: "/api/v1/billing/payments", headers: f.headers, payload: { planId: "business", cpf: "52998224725", idempotencyKey: randomUUID(), priceCents: 1 } });
    assert.equal(forgedPrice.statusCode, 400);
  } finally { await f.prisma.user.delete({ where: { id: other.id } }); }
});

test("criação com retorno perdido é recuperada sem nova cobrança; expiração não reabre Pix antigo", databaseOptions, async (context) => {
  const f = await fixture(context);
  const key = randomUUID();
  f.loseResponse();
  await assert.rejects(createPayment(f.app, f.gateway, f.user, { planId: "pro", cpf: "52998224725", idempotencyKey: key }));
  assert.equal(f.createdKeys.size, 1);
  await f.prisma.billingPayment.update({ where: { id: key }, data: { lastCheckedAt: null } });
  await reconcilePayments(f.app, f.gateway);
  assert.equal(f.createdKeys.size, 1);
  const payment = await f.prisma.billingPayment.findUniqueOrThrow({ where: { id: key } });
  assert.equal(payment.status, "pending");
  assert.ok(payment.qrCode);
  assert.equal(payment.payerDocument, null);
  await f.prisma.billingPayment.update({ where: { id: key }, data: { status: "expired" } });
  const second = await f.purchase("business");
  await applyVerifiedPayment(f.app, f.remotes.get(payment.providerId!)!);
  assert.equal((await f.prisma.billingPayment.findUniqueOrThrow({ where: { id: key } })).status, "expired");
  assert.equal((await f.prisma.billingPayment.findUniqueOrThrow({ where: { id: second.id } })).status, "pending");
});

test("fim do período retorna ao Gratuito e permite rotacionar atendimento já contabilizado", databaseOptions, async (context) => {
  const f = await fixture(context);
  const payment = await f.purchase("business");
  await f.webhook(f.approve(payment.id));
  const job = await f.job();
  const first = await f.app.inject({ method: "POST", url: `/api/v1/jobs/${job.id}/approval-links`, headers: f.headers });
  assert.equal(first.statusCode, 201);
  const oldToken = first.json().token;
  await f.prisma.billingPeriod.update({ where: { paymentId: payment.id }, data: { startsAt: new Date(Date.now() - PAID_PERIOD_MS - 1000), endsAt: new Date(Date.now() - 1000) } });
  const summary = (await f.app.inject({ url: "/api/v1/billing", headers: f.headers })).json();
  assert.equal(summary.current.planId, "free");
  assert.equal(summary.current.remaining, 3);
  assert.equal((await f.app.inject({ url: `/api/v1/public/approvals/${oldToken}` })).statusCode, 200);
  const rotation = await f.app.inject({ method: "POST", url: `/api/v1/jobs/${job.id}/approval-links`, headers: f.headers });
  assert.equal(rotation.statusCode, 201);
  assert.equal(await f.prisma.approvalUsage.count({ where: { ownerId: f.user.id, freeMonth: freeMonthWindow(new Date()).key } }), 0);
});
