import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { type TestContext } from "node:test";
import { buildApp } from "../src/app.js";
import { loadEnv } from "../src/config/env.js";
import { createPrismaClient } from "../src/db/prisma.js";
import { hashToken } from "../src/lib/tokens.js";
import type { PixGateway, PixPayment } from "../src/modules/billing/mercadopago.js";
import { applyVerifiedPayment } from "../src/modules/billing/service.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
const databaseOptions = { skip: !databaseUrl && "TEST_DATABASE_URL não definida" };
const origin = "https://cancellation.example.test";

async function fixture(context: TestContext, provider: "stripe" | "orders" | "payments") {
  const prisma = createPrismaClient(databaseUrl!);
  const token = randomUUID();
  const user = await prisma.user.create({ data: {
    name: "Teste Cancelamento", businessName: "Teste", email: `cancel-${randomUUID()}@example.test`,
    phone: "11999999999", passwordHash: "unused", termsAcceptedAt: new Date(), termsVersion: "test",
    sessions: { create: { tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 86_400_000) } },
  } });
  const env = loadEnv({
    NODE_ENV: "test", DATABASE_URL: databaseUrl!, WEB_ORIGIN: origin,
    PASSWORD_PEPPER: "cancellation-tests-pepper-at-least-32-characters",
    BILLING_ENABLED: "true", BILLING_PROVIDER: "stripe", STRIPE_LIVE_MODE: "false",
    STRIPE_SECRET_KEY: `sk_test_${"x".repeat(24)}`, STRIPE_WEBHOOK_SECRET: `whsec_${"y".repeat(24)}`,
    STRIPE_ACCOUNT_ID: "acct_cancellationtest", MERCADOPAGO_COLLECTOR_ID: "123456",
  });
  const payment = await prisma.billingPayment.create({ data: {
    ownerId: user.id, plan: "pro", priceCents: 999, jobLimit: 50, providerApi: provider,
    providerId: provider === "stripe" ? `cs_test_${randomUUID().replaceAll("-", "")}`
      : provider === "orders" ? `ORD${randomUUID().replaceAll("-", "").slice(0, 26).toUpperCase()}`
      : String(Math.floor(Math.random() * 1_000_000_000)),
    status: "pending", payerEmail: user.email, payerName: user.name,
    qrCode: provider === "stripe" ? null : "PIX-CANCELLATION-TEST",
    checkoutUrl: provider === "stripe" ? "https://checkout.stripe.com/c/pay/cs_test_cancellation" : null,
    expiresAt: new Date(Date.now() + 1_800_000),
  } });
  let remote: PixPayment = {
    id: payment.providerId!, ...(provider === "stripe" ? { providerApi: "stripe" as const } : {}),
    collector_id: provider === "stripe" ? env.STRIPE_ACCOUNT_ID! : env.MERCADOPAGO_COLLECTOR_ID!,
    external_reference: payment.id, live_mode: false, payment_method_id: "pix", currency_id: "BRL",
    transaction_amount: 9.99, transaction_amount_refunded: 0, status: "pending",
    date_last_updated: new Date().toISOString(), date_approved: null,
    date_of_expiration: payment.expiresAt.toISOString(), checkoutUrl: payment.checkoutUrl,
    point_of_interaction: { transaction_data: { qr_code: payment.qrCode } },
  };
  let cancellations = 0;
  let mode: "cancel" | "unconfirmed" | "paid" = "cancel";
  const gateway: PixGateway = {
    create: async () => { throw new Error("unexpected creation"); },
    get: async (id) => { assert.equal(id, payment.providerId); return structuredClone(remote); },
    cancel: async (id) => {
      assert.equal(id, payment.providerId);
      cancellations++;
      if (mode === "unconfirmed") return;
      remote = { ...remote, status: mode === "paid" ? "approved" : "cancelled",
        status_detail: mode === "paid" ? "accredited" : provider === "stripe" ? "expired" : "cancelled",
        date_last_updated: new Date(Date.now() + 1).toISOString(),
        date_approved: mode === "paid" ? new Date().toISOString() : null };
    },
  };
  const app = await buildApp({ env, prisma, pixGateway: gateway, logger: false, billingReconciliationEnabled: false });
  context.after(async () => {
    try { await app.close(); await prisma.user.delete({ where: { id: user.id } }); }
    finally { await prisma.$disconnect(); }
  });
  const headers = { origin, cookie: `extraok_session=${token}` };
  const cancel = () => app.inject({ method: "POST", url: `/api/v1/billing/payments/${payment.id}/cancel`, headers });
  return { app, prisma, payment, user, headers, cancel, gateway,
    setMode: (value: typeof mode) => { mode = value; },
    snapshot: () => structuredClone(remote), cancellations: () => cancellations };
}

for (const provider of ["stripe", "orders", "payments"] as const) {
test(`database ${provider}: concurrent cancellation is persistent and preserves the active plan`, databaseOptions, async (context) => {
  const f = await fixture(context, provider);
  const stale = f.snapshot();
  const activePayment = await f.prisma.billingPayment.create({ data: {
    ownerId: f.user.id, plan: "pro", priceCents: 999, jobLimit: 50, providerApi: provider, status: "approved",
    payerEmail: f.user.email, payerName: f.user.name, expiresAt: new Date(),
    period: { create: { ownerId: f.user.id, plan: "pro", jobLimit: 50,
      startsAt: new Date(Date.now() - 1000), endsAt: new Date(Date.now() + 86_400_000) } },
  } });
  const results = await Promise.all([f.cancel(), f.cancel()]);
  for (const result of results) {
    assert.equal(result.statusCode, 200, result.body);
    assert.equal(result.json().status, "cancelled");
    assert.equal(result.json().checkoutUrl, null);
    assert.equal(result.json().qrCode, null);
  }
  await applyVerifiedPayment(f.app, stale, f.payment.id);
  await applyVerifiedPayment(f.app, f.snapshot(), f.payment.id);
  const before = f.cancellations();
  assert.equal((await f.cancel()).json().status, "cancelled");
  assert.equal(f.cancellations(), before);
  const stored = await f.prisma.billingPayment.findUniqueOrThrow({ where: { id: f.payment.id } });
  assert.equal(stored.status, "cancelled");
  assert.equal(await f.prisma.billingPeriod.count({ where: { paymentId: f.payment.id } }), 0);
  const active = await f.prisma.billingPeriod.findUniqueOrThrow({ where: { paymentId: activePayment.id } });
  assert.equal(active.revokedAt, null);
  const summary = await f.app.inject({ url: "/api/v1/billing", headers: f.headers });
  assert.equal(summary.statusCode, 200);
  assert.equal(summary.json().current.planId, "pro");
  assert.equal(summary.json().payments.some((entry: { status: string }) => ["creating", "pending"].includes(entry.status)), false);
});

test(`database ${provider}: paid during cancellation grants one period, including duplicate notifications`, databaseOptions, async (context) => {
  const f = await fixture(context, provider);
  f.setMode("paid");
  const result = await f.cancel();
  assert.equal(result.statusCode, 200, result.body);
  assert.equal(result.json().status, "approved");
  await Promise.all([applyVerifiedPayment(f.app, f.snapshot()), applyVerifiedPayment(f.app, f.snapshot())]);
  assert.equal(await f.prisma.billingPeriod.count({ where: { paymentId: f.payment.id } }), 1);
  const before = f.cancellations();
  assert.equal((await f.cancel()).json().status, "approved");
  assert.equal(f.cancellations(), before);
});

test(`database ${provider}: unconfirmed cancellation keeps payment pending and blocks a different plan`, databaseOptions, async (context) => {
  const f = await fixture(context, provider);
  f.setMode("unconfirmed");
  const result = await f.cancel();
  assert.equal(result.statusCode, 503, result.body);
  const stored = await f.prisma.billingPayment.findUniqueOrThrow({ where: { id: f.payment.id } });
  assert.equal(stored.status, "pending");
  const purchase = await f.app.inject({ method: "POST", url: "/api/v1/billing/payments", headers: f.headers,
    payload: { planId: "business", idempotencyKey: randomUUID() } });
  assert.equal(purchase.statusCode, 409, purchase.body);
  assert.equal(await f.prisma.billingPayment.count({ where: { ownerId: f.user.id } }), 1);
});
}
