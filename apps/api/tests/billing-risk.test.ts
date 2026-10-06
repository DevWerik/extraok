import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { type TestContext } from "node:test";
import { buildApp } from "../src/app.js";
import { loadEnv } from "../src/config/env.js";
import type { BillingPayment, PrismaClient } from "../src/generated/prisma/client.js";
import { PixGatewayError, type PixGateway, type PixPayment } from "../src/modules/billing/mercadopago.js";
import { applyVerifiedPayment } from "../src/modules/billing/service.js";

const origin = "https://app.extraok.test";
const env = loadEnv({ NODE_ENV: "test", DATABASE_URL: "postgresql://test:test@127.0.0.1:1/unused",
  WEB_ORIGIN: origin, PASSWORD_PEPPER: "risk-tests-pepper-at-least-32-characters",
  BILLING_ENABLED: "true", MERCADOPAGO_ACCESS_TOKEN: "risk-tests-token-at-least-32-characters",
  MERCADOPAGO_WEBHOOK_SECRET: "risk-tests-webhook-secret-at-least-32-characters",
  MERCADOPAGO_COLLECTOR_ID: "123456", MERCADOPAGO_LIVE_MODE: "false",
  MERCADOPAGO_WEBHOOK_URL: `${origin}/api/v1/billing/webhooks/mercadopago` });

// In-memory persistence exercises the HTTP/service flow without a real charge.
// The PostgreSQL suite separately verifies the per-owner transaction lock.
async function fixture(context: TestContext) {
  const user = { id: randomUUID(), name: "Pessoa", businessName: "Teste", email: "payer@example.test", phone: "11999999999", createdAt: new Date() };
  const payments = new Map<string, BillingPayment>();
  type Where = { ownerId?: string; status?: string | { in: string[] }; rejectedAt?: { gt: Date } };
  function find(where: Where) {
    return [...payments.values()].filter((payment) =>
      (!where.ownerId || payment.ownerId === where.ownerId) &&
      (!where.status || (typeof where.status === "string" ? payment.status === where.status : where.status.in.includes(payment.status))) &&
      (!where.rejectedAt || Boolean(payment.rejectedAt && payment.rejectedAt > where.rejectedAt.gt)))
      .sort((a, b) => (b.rejectedAt?.getTime() ?? 0) - (a.rejectedAt?.getTime() ?? 0))[0] ?? null;
  }
  const transaction = {
    $queryRaw: async () => [],
    billingPayment: {
      findUnique: async ({ where }: { where: { id: string } }) => payments.get(where.id) ?? null,
      findUniqueOrThrow: async ({ where }: { where: { id: string } }) => { const payment = payments.get(where.id); assert.ok(payment); return payment; },
      findFirst: async ({ where }: { where: Where }) => find(where),
      findMany: async () => [...payments.values()],
      updateMany: async () => ({ count: 0 }),
      create: async ({ data }: { data: Partial<BillingPayment> & { id: string } }) => {
        const payment = { status: "creating", providerId: null, providerUpdatedAt: null, approvedAt: null,
          payerDeviceId: null, rejectionReason: null, rejectedAt: null, qrCode: null, qrCodeBase64: null,
          lastCheckedAt: null, createdAt: new Date(), updatedAt: new Date(), ...data } as BillingPayment;
        payments.set(payment.id, payment);
        return payment;
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<BillingPayment> }) => {
        const saved = payments.get(where.id); assert.ok(saved);
        const payment = { ...saved, ...data, updatedAt: new Date() };
        payments.set(payment.id, payment);
        return payment;
      },
    },
    billingPeriod: { findFirst: async () => null, findMany: async () => [] },
    approvalUsage: { count: async () => 0 },
  };
  const prisma = { ...transaction,
    $transaction: async (callback: (tx: typeof transaction) => unknown) => callback(transaction),
    session: { findUnique: async () => ({ id: randomUUID(), user, revokedAt: null, createdAt: new Date(),
      lastUsedAt: new Date(), expiresAt: new Date(Date.now() + 86_400_000) }) },
  } as unknown as PrismaClient;
  const sent: BillingPayment[] = [];
  let failNext = false;
  let status: "pending" | "rejected" = "rejected";
  let remote: PixPayment;
  const gateway: PixGateway = {
    create: async (payment) => {
      sent.push(structuredClone(payment));
      if (failNext) { failNext = false; throw new PixGatewayError(); }
      remote = { id: `ORD${String(sent.length).padStart(26, "0")}`, collector_id: "123456", live_mode: false, external_reference: payment.id,
        payment_method_id: "pix", currency_id: "BRL", transaction_amount: payment.priceCents / 100,
        transaction_amount_refunded: 0, status, status_detail: status === "rejected" ? "high_risk" : "waiting_transfer",
        date_last_updated: new Date().toISOString(), date_approved: null, date_of_expiration: payment.expiresAt.toISOString(),
        point_of_interaction: { transaction_data: { qr_code: status === "pending" ? "PIX-TEST" : null } } };
      return remote;
    },
    get: async () => remote,
  };
  const app = await buildApp({ env, prisma, pixGateway: gateway, logger: false, billingReconciliationEnabled: false });
  context.after(() => app.close());
  const headers = { origin, cookie: "extraok_session=test-session" };
  const input = { planId: "pro", cpf: "52998224725", payerName: "João da Silva", deviceId: "device-session-123" };
  const purchase = (idempotencyKey: string, changes = {}) => app.inject({ method: "POST", url: "/api/v1/billing/payments", headers, payload: { ...input, idempotencyKey, ...changes } });
  return { app, payments, sent, user, headers, purchase, gateway,
    remote: () => remote, loseResponse: () => { failNext = true; status = "pending"; } };
}

test("HTTP valida nome completo no cadastro antes de acessar o banco", async (context) => {
  let lookups = 0;
  const prisma = { user: { findUnique: async () => { lookups++; return { id: randomUUID() }; } } } as unknown as PrismaClient;
  const app = await buildApp({ env, prisma, logger: false, billingReconciliationEnabled: false });
  context.after(() => app.close());
  for (const [name, valid] of [["Pessoa", false], ["Pessoa 123", false], ["João da Silva", true], ["Ana-Maria D’Ávila", true]] as const) {
    const result = await app.inject({ method: "POST", url: "/api/v1/auth/register", headers: { origin },
      payload: { name, email: "payer@example.test", businessName: "Teste", phone: "11999999999", password: "Password123", acceptTerms: true } });
    assert.equal(result.statusCode, valid ? 409 : 400, result.body);
    if (!valid) assert.ok(result.json().error.fields.name);
  }
  assert.equal(lookups, 2);
});

test("HTTP confirma recusa específica, não cria período e impede novas referências na pausa", async (context) => {
  const f = await fixture(context);
  const id = randomUUID();
  const result = await f.purchase(id);
  assert.equal(result.statusCode, 201, result.body);
  assert.equal(result.json().status, "rejected");
  assert.equal(result.json().rejectionReason, "high_risk");
  assert.ok(result.json().retryAvailableAt);
  const saved = f.payments.get(id)!;
  assert.equal(saved.payerName, "João da Silva");
  assert.equal(f.user.name, "Pessoa");
  assert.equal(saved.payerDocument, null);
  assert.equal(saved.payerDeviceId, null);
  await applyVerifiedPayment(f.app, f.remote(), id);
  assert.deepEqual(f.payments.get(id)!.rejectedAt, saved.rejectedAt);
  const replay = await f.purchase(id);
  assert.equal(replay.statusCode, 201);
  assert.equal(replay.json().status, "rejected");
  for (const planId of ["pro", "business"]) {
    const blocked = await f.purchase(randomUUID(), { planId });
    assert.equal(blocked.statusCode, 429, blocked.body);
    assert.equal(blocked.json().error.code, "PAYMENT_RETRY_LATER");
    assert.ok(Number(blocked.headers["retry-after"]) > 0);
  }
  assert.equal(f.sent.length, 1);
  const summary = await f.app.inject({ url: "/api/v1/billing", headers: f.headers });
  assert.ok(summary.json().retryAvailableAt);
  assert.equal(summary.json().current.planId, "free");
  for (const privateField of ["payerDeviceId", "device-session-123", "payerDocument", "52998224725", "payer@example.test", "João da Silva"]) {
    assert.equal(summary.body.includes(privateField), false);
    assert.equal(result.body.includes(privateField), false);
  }
  f.payments.set(id, { ...f.payments.get(id)!, rejectedAt: new Date(Date.now() - 11 * 60_000) });
  assert.equal((await f.purchase(randomUUID())).statusCode, 201);
  assert.equal(f.sent.length, 2);
});

test("HTTP preserva nome, documento e Device ID originais ao recuperar uma resposta perdida", async (context) => {
  const f = await fixture(context);
  f.loseResponse();
  const id = randomUUID();
  assert.equal((await f.purchase(id)).statusCode, 503);
  assert.equal(f.payments.get(id)!.payerDeviceId, "device-session-123");
  const recovered = await f.purchase(id, { payerName: "Outra Pessoa", deviceId: "another-device-session" });
  assert.equal(recovered.statusCode, 201, recovered.body);
  assert.equal(recovered.json().status, "pending");
  assert.equal(f.sent.length, 2);
  assert.equal(f.sent[0].id, f.sent[1].id);
  assert.equal(f.sent[0].payerName, f.sent[1].payerName);
  assert.equal(f.sent[0].payerDocument, f.sent[1].payerDocument);
  assert.equal(f.sent[0].payerDeviceId, f.sent[1].payerDeviceId);
  assert.equal(f.payments.get(id)!.payerDeviceId, null);
  const bad = await f.purchase(randomUUID(), { deviceId: "device\r\nforged" });
  assert.equal(bad.statusCode, 400, bad.body);
  assert.ok(bad.json().error.fields.deviceId);
  assert.equal(f.sent.length, 2);
});
