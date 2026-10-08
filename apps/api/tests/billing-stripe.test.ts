import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import test, { type TestContext } from "node:test";
import { buildApp } from "../src/app.js";
import { loadEnv } from "../src/config/env.js";
import type { BillingPayment, PrismaClient } from "../src/generated/prisma/client.js";
import { PixGatewayError } from "../src/modules/billing/mercadopago.js";
import { createBillingGateway } from "../src/modules/billing/gateway.js";
import { createStripeGateway, normalizeStripeSession, STRIPE_API_VERSION, validStripeSignature } from "../src/modules/billing/stripe.js";
import { applyVerifiedPayment } from "../src/modules/billing/service.js";

const origin = "https://extraok.example.test";
const source = { NODE_ENV: "test", DATABASE_URL: "postgresql://test:test@localhost:1/unused", WEB_ORIGIN: origin,
  PASSWORD_PEPPER: "stripe-tests-pepper-at-least-32-characters", BILLING_ENABLED: "true", BILLING_PROVIDER: "stripe",
  STRIPE_SECRET_KEY: `sk_test_${"a".repeat(24)}`, STRIPE_WEBHOOK_SECRET: `whsec_${"b".repeat(24)}`, STRIPE_ACCOUNT_ID: "acct_1234567890", STRIPE_LIVE_MODE: "false" };
const env = loadEnv(source);
const reference = "33333333-3333-4333-8333-333333333333";
const sessionId = "cs_test_12345678901234567890";
const intentId = "pi_12345678901234567890";
function stripeSession(id = reference) {
  return {
    id: sessionId, object: "checkout.session", mode: "payment", currency: "brl", livemode: false,
    client_reference_id: id, metadata: { extraok_payment_id: id }, amount_total: 999,
    payment_method_types: ["pix"], status: "open", payment_status: "unpaid", expires_at: Math.floor(Date.now() / 1000) + 3600,
    url: `https://checkout.stripe.com/c/pay/${sessionId}`, payment_intent: null as null | {
      id: string; metadata: { extraok_payment_id: string }; amount: number; amount_received: number; currency: string;
      livemode: boolean; status: string; latest_charge: { id: string; payment_intent: string; amount: number; amount_refunded: number;
        currency: string; paid: boolean; captured: boolean; disputed: boolean; livemode: boolean; payment_method_details: { type: string } };
    },
  };
}
function paidSession(id = reference) {
  const session = stripeSession(id);
  session.status = "complete"; session.payment_status = "paid";
  session.payment_intent = { id: intentId, metadata: { extraok_payment_id: id }, amount: 999, amount_received: 999,
    currency: "brl", livemode: false, status: "succeeded", latest_charge: { id: "py_1234567890", payment_intent: intentId,
      amount: 999, amount_refunded: 0, currency: "brl", paid: true, captured: true, disputed: false, livemode: false, payment_method_details: { type: "pix" } } };
  return session;
}
function signature(raw: string | Buffer, time = Math.floor(Date.now() / 1000)) {
  return `t=${time},v1=${createHmac("sha256", env.STRIPE_WEBHOOK_SECRET!).update(`${time}.`).update(raw).digest("hex")}`;
}

test("Stripe config permits Pix independently of Mercado Pago and rejects mismatched modes", () => {
  assert.equal(env.BILLING_PROVIDER, "stripe");
  for (const update of [{ STRIPE_SECRET_KEY: "pk_test_aaaaaaaaaaaaaaaaaaaaaaaa" }, { STRIPE_LIVE_MODE: "true" },
    { STRIPE_ACCOUNT_ID: "123" }, { STRIPE_WEBHOOK_SECRET: "" }, { NODE_ENV: "production" }]) {
    assert.throws(() => loadEnv({ ...source, ...update }));
  }
});

test("Stripe restricted keys preserve test/live isolation and reject client-side keys", () => {
  for (const mode of ["test", "live"] as const) {
    const restricted = { ...source, NODE_ENV: mode === "live" ? "production" : "test",
      STRIPE_SECRET_KEY: `rk_${mode}_aaaaaaaaaaaaaaaaaaaaaaaa`, STRIPE_LIVE_MODE: String(mode === "live") };
    assert.equal(loadEnv(restricted).STRIPE_SECRET_KEY, restricted.STRIPE_SECRET_KEY);
    assert.throws(() => loadEnv({ ...restricted, STRIPE_LIVE_MODE: String(mode !== "live") }));
    assert.throws(() => loadEnv({ ...restricted, STRIPE_SECRET_KEY: `pk_${mode}_aaaaaaaaaaaaaaaaaaaaaaaa` }));
    assert.throws(() => loadEnv({ ...restricted, STRIPE_SECRET_KEY: `rk_${mode}_short` }));
  }
});

test("Stripe session requires actual full Pix payment and handles partial refunds/disputes", () => {
  assert.equal(normalizeStripeSession(stripeSession(), env.STRIPE_ACCOUNT_ID!).status, "pending");
  assert.equal(normalizeStripeSession(paidSession(), env.STRIPE_ACCOUNT_ID!).status, "approved");
  const chargeId = paidSession(); chargeId.payment_intent!.latest_charge.id = "ch_1234567890";
  assert.equal(normalizeStripeSession(chargeId, env.STRIPE_ACCOUNT_ID!).status, "approved");
  const refunded = paidSession(); refunded.payment_intent!.latest_charge.amount_refunded = 1;
  assert.equal(normalizeStripeSession(refunded, env.STRIPE_ACCOUNT_ID!).status, "refunded");
  const disputed = paidSession(); disputed.payment_intent!.latest_charge.disputed = true;
  assert.equal(normalizeStripeSession(disputed, env.STRIPE_ACCOUNT_ID!).status, "charged_back");
  for (const mutate of [
    (s: ReturnType<typeof paidSession>) => { s.payment_method_types = ["card"]; },
    (s: ReturnType<typeof paidSession>) => { s.payment_intent!.amount_received = 998; },
    (s: ReturnType<typeof paidSession>) => { s.payment_intent!.livemode = true; },
    (s: ReturnType<typeof paidSession>) => { s.metadata.extraok_payment_id = randomUUID(); },
    (s: ReturnType<typeof paidSession>) => { s.payment_intent!.latest_charge.id = "pi_1234567890"; },
    (s: ReturnType<typeof paidSession>) => { s.payment_intent!.latest_charge.payment_intent = "pi_9999999999"; },
    (s: ReturnType<typeof paidSession>) => { s.payment_intent!.latest_charge.payment_method_details.type = "card"; },
    (s: ReturnType<typeof paidSession>) => { s.payment_status = "no_payment_required"; },
    (s: ReturnType<typeof paidSession>) => { s.payment_intent = null; },
  ]) {
    const session = paidSession(); mutate(session);
    assert.throws(() => normalizeStripeSession(session, env.STRIPE_ACCOUNT_ID!));
  }
  const foreignUrl = stripeSession(); foreignUrl.url = "https://checkout.stripe.com.evil.test/c/pay/forged";
  assert.throws(() => normalizeStripeSession(foreignUrl, env.STRIPE_ACCOUNT_ID!));
});

for (const keyPrefix of ["sk_test", "rk_test"]) {
test(`Stripe gateway ${keyPrefix} fixes amount, Pix allowlist and idempotency; refuses unverified account/mode`, async () => {
  const env = loadEnv({ ...source, STRIPE_SECRET_KEY: `${keyPrefix}_aaaaaaaaaaaaaaaaaaaaaaaa` });
  const sent: RequestInit[] = [];
  const remote = stripeSession();
  const transport: typeof fetch = async (url, options) => {
    const path = new URL(String(url)).pathname;
    assert.equal(new Headers(options?.headers).get("Authorization"), `Bearer ${env.STRIPE_SECRET_KEY}`);
    assert.equal(new Headers(options?.headers).get("Stripe-Version"), STRIPE_API_VERSION);
    if (path === "/v1/account") return Response.json({ id: env.STRIPE_ACCOUNT_ID, country: "BR", charges_enabled: true });
    if (options?.method === "POST") { sent.push(options); return Response.json({ id: sessionId }); }
    return Response.json(remote);
  };
  const payment = { id: reference, providerApi: "stripe", priceCents: 999, plan: "pro", payerEmail: "payer@example.test", createdAt: new Date() } as BillingPayment;
  const gateway = createStripeGateway(env, transport);
  await gateway.create(payment); await gateway.create(payment);
  assert.equal(sent.length, 2);
  assert.equal(sent[0]!.body, sent[1]!.body);
  assert.equal(new Headers(sent[0]!.headers).get("Idempotency-Key"), reference);
  const form = new URLSearchParams(String(sent[0]!.body));
  assert.equal(form.get("allowed_payment_method_types[0]"), "pix");
  assert.equal(form.has("payment_method_types[0]"), false);
  assert.equal(form.get("line_items[0][price_data][unit_amount]"), "999");
  assert.equal(form.get("mode"), "payment");
  assert.equal(form.get("success_url"), `${origin}/meu-plano?payment=${reference}`);
  remote.livemode = true;
  await assert.rejects(gateway.get(sessionId), PixGatewayError);
  await assert.rejects(createStripeGateway({ ...env, STRIPE_ACCOUNT_ID: "acct_otheraccount" }, transport).create(payment), PixGatewayError);
});
}

test("Stripe signatures bind exact bytes, validate timestamp and allow key rotation", () => {
  const raw = Buffer.from('{ "type": "checkout.session.completed" }');
  const header = signature(raw);
  assert.equal(validStripeSignature(raw, header, env.STRIPE_WEBHOOK_SECRET), true);
  assert.equal(validStripeSignature(raw, `${header},v1=${"0".repeat(64)}`, env.STRIPE_WEBHOOK_SECRET), true);
  assert.equal(validStripeSignature(Buffer.from('{}'), header, env.STRIPE_WEBHOOK_SECRET), false);
  assert.equal(validStripeSignature(raw, signature(raw, Math.floor(Date.now() / 1000) - 301), env.STRIPE_WEBHOOK_SECRET), false);
  assert.equal(validStripeSignature(raw, signature(raw, Math.floor(Date.now() / 1000) + 301), env.STRIPE_WEBHOOK_SECRET), false);
  assert.equal(validStripeSignature(raw, `${header},t=1000000000`, env.STRIPE_WEBHOOK_SECRET), false);
});

async function fixture(context: TestContext) {
  const user = { id: randomUUID(), name: "Pessoa Teste", businessName: "Teste", email: "payer@example.test", phone: "11999999999", createdAt: new Date() };
  const payments = new Map<string, BillingPayment>();
  const periods = new Map<string, { paymentId: string; startsAt: Date; endsAt: Date; revokedAt?: Date }>();
  let remote = stripeSession();
  let creates = 0;
  let reads = 0;
  const prisma = {
    $queryRaw: async () => [],
    billingPayment: {
      findUnique: async ({ where }: { where: { id: string } }) => payments.get(where.id) ?? null,
      findUniqueOrThrow: async ({ where }: { where: { id: string } }) => payments.get(where.id)!,
      findFirst: async ({ where }: { where: { id?: string; ownerId?: string; status?: unknown } }) => where.id
        ? [...payments.values()].find((p) => p.id === where.id && p.ownerId === where.ownerId) ?? null : null,
      updateMany: async () => ({ count: 0 }),
      create: async ({ data }: { data: Partial<BillingPayment> & { id: string } }) => {
        const payment = { providerId: null, checkoutUrl: null, providerUpdatedAt: null, approvedAt: null,
          rejectedAt: null, rejectionReason: null, qrCode: null, qrCodeBase64: null, lastCheckedAt: null,
          ...data, status: "creating" as const, updatedAt: new Date() } as BillingPayment;
        payments.set(data.id, payment); remote = stripeSession(data.id); return payment;
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<BillingPayment> }) => {
        const saved = { ...payments.get(where.id)!, ...data }; payments.set(where.id, saved); return saved;
      },
    },
    billingPeriod: {
      findUnique: async ({ where }: { where: { paymentId: string } }) => periods.get(where.paymentId) ?? null,
      findFirst: async () => [...periods.values()].at(-1) ?? null,
      create: async ({ data }: { data: { paymentId: string; startsAt: Date; endsAt: Date } }) => { periods.set(data.paymentId, data); return data; },
      updateMany: async ({ where, data }: { where: { paymentId: string }; data: { revokedAt: Date } }) => {
        const saved = periods.get(where.paymentId); if (saved) periods.set(where.paymentId, { ...saved, ...data }); return { count: saved ? 1 : 0 };
      },
    },
    session: { findUnique: async () => ({ id: randomUUID(), user, revokedAt: null, createdAt: new Date(), lastUsedAt: new Date(), expiresAt: new Date(Date.now() + 86_400_000) }) },
    $transaction: async (callback: (tx: unknown) => unknown): Promise<unknown> => callback(prisma),
  };
  const gateway = createStripeGateway(env, async (url, options) => {
    if (new URL(String(url)).pathname === "/v1/account") return Response.json({ id: env.STRIPE_ACCOUNT_ID, country: "BR", charges_enabled: true });
    if (options?.method === "POST") { creates++; return Response.json({ id: sessionId }); }
    reads++; return Response.json(remote);
  });
  const app = await buildApp({ env, prisma: prisma as unknown as PrismaClient, pixGateway: gateway, logger: false, billingReconciliationEnabled: false });
  context.after(() => app.close());
  const headers = { origin, cookie: "extraok_session=test-session" };
  async function webhook(type = "checkout.session.completed", object = { id: sessionId, metadata: { extraok_payment_id: reference } } as Record<string, unknown>) {
    const payload = JSON.stringify({ id: "evt_123456789", type, livemode: false, data: { object } }, null, 2);
    return app.inject({ method: "POST", url: "/api/v1/billing/webhooks/stripe", payload, headers: { "content-type": "application/json", "stripe-signature": signature(payload) } });
  }
  return { app, headers, payments, periods, webhook, user, setRemote: (value: ReturnType<typeof stripeSession>) => { remote = value; }, counts: () => ({ creates, reads }) };
}

test("Stripe HTTP checkout, signed confirmation, duplicate delivery, ownership and partial refund", async (context) => {
  const f = await fixture(context);
  const result = await f.app.inject({ method: "POST", url: "/api/v1/billing/payments", headers: f.headers, payload: { planId: "pro", idempotencyKey: reference } });
  assert.equal(result.statusCode, 201, result.body);
  assert.equal(result.json().provider, "stripe"); assert.equal(result.json().status, "pending");
  assert.equal(f.payments.get(reference)!.payerDocument, null); assert.equal(f.periods.size, 0);
  assert.equal((await f.webhook()).statusCode, 200); assert.equal(f.periods.size, 0, "unpaid completion never grants access");
  const replay = await f.app.inject({ method: "POST", url: "/api/v1/billing/payments", headers: f.headers, payload: { planId: "pro", idempotencyKey: reference } });
  assert.equal(replay.statusCode, 201); assert.equal(f.counts().creates, 1);
  const saved = f.payments.get(reference)!;
  f.payments.set(reference, { ...saved, ownerId: randomUUID() });
  const foreign = await f.app.inject({ method: "GET", url: `/api/v1/billing/payments/${reference}`, headers: f.headers });
  assert.equal(foreign.statusCode, 404);
  f.payments.set(reference, saved);
  f.setRemote(paidSession());
  assert.equal((await f.webhook()).statusCode, 200);
  assert.equal((await f.webhook()).statusCode, 200); assert.equal(f.periods.size, 1);
  const period = f.periods.get(reference)!;
  assert.equal(period.endsAt.getTime() - period.startsAt.getTime(), 30 * 86_400_000);
  const refund = paidSession(); refund.payment_intent!.latest_charge.amount_refunded = 1;
  f.setRemote(refund);
  context.mock.method(globalThis, "fetch", async () => Response.json({ id: intentId, livemode: false, metadata: { extraok_payment_id: reference } }));
  const refunded = await f.webhook("charge.refunded", { id: "py_123456789", payment_intent: intentId });
  assert.equal(refunded.statusCode, 200, refunded.body); assert.ok(f.periods.get(reference)!.revokedAt);
  f.setRemote(paidSession()); await f.webhook();
  assert.equal(f.payments.get(reference)!.status, "refunded", "old approval must not restore refunded entitlement");
});

test("Stripe webhook rejects tampering before provider reads; CSRF and owner exemption remain enforced", async (context) => {
  const f = await fixture(context);
  const result = await f.app.inject({ method: "POST", url: "/api/v1/billing/webhooks/stripe", payload: '{}', headers: { "content-type": "application/json", "stripe-signature": signature('{ }') } });
  assert.equal(result.statusCode, 401); assert.equal(f.counts().reads, 0);
  const unrelated = await f.webhook("checkout.session.completed", { id: sessionId });
  assert.equal(unrelated.statusCode, 200); assert.equal(f.counts().reads, 0);
  const forbidden = await f.app.inject({ method: "POST", url: "/api/v1/billing/payments", headers: { cookie: f.headers.cookie }, payload: { planId: "pro", idempotencyKey: reference } });
  assert.equal(forbidden.statusCode, 403);
  f.app.env.BILLING_OWNER_USER_ID = f.user.id;
  const exempt = await f.app.inject({ method: "POST", url: "/api/v1/billing/payments", headers: f.headers, payload: { planId: "pro", idempotencyKey: reference } });
  assert.equal(exempt.statusCode, 409); assert.equal(exempt.json().error.code, "BILLING_EXEMPT"); assert.equal(f.counts().creates, 0);
});

test("Stripe verified payment cannot be applied to a Mercado Pago attempt or another value/account", async (context) => {
  const f = await fixture(context);
  await f.app.inject({ method: "POST", url: "/api/v1/billing/payments", headers: f.headers, payload: { planId: "pro", idempotencyKey: reference } });
  const remote = normalizeStripeSession(paidSession(), env.STRIPE_ACCOUNT_ID!);
  for (const change of [{ collector_id: "acct_otheraccount" }, { live_mode: true }, { transaction_amount: 19.99 }, { payment_method_id: "card" }]) {
    await assert.rejects(applyVerifiedPayment(f.app, { ...remote, ...change }), { code: "PAYMENT_MISMATCH" });
  }
  f.payments.get(reference)!.providerApi = "orders";
  await assert.rejects(applyVerifiedPayment(f.app, remote), { code: "PAYMENT_MISMATCH" });
  assert.equal(f.periods.size, 0);
});

test("selecting Stripe still routes persisted Mercado Pago IDs to Mercado Pago", async () => {
  const hosts: string[] = [];
  const gateway = createBillingGateway({ ...env, MERCADOPAGO_ACCESS_TOKEN: "legacy-token" }, async (url) => {
    hosts.push(new URL(String(url)).host); return new Response('', { status: 503 });
  });
  await assert.rejects(gateway.get("123456789"));
  await assert.rejects(gateway.get("ORD01HRYFWNYRE1MR1E60MW3X0T2P"));
  assert.deepEqual(hosts, ["api.mercadopago.com", "api.mercadopago.com"]);
});
