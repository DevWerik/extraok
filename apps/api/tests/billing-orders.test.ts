import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import test from "node:test";
import { buildApp } from "../src/app.js";
import { loadEnv } from "../src/config/env.js";
import { createPrismaClient } from "../src/db/prisma.js";
import type { BillingPayment } from "../src/generated/prisma/client.js";
import { hashToken } from "../src/lib/tokens.js";
import { createPixGateway, validWebhookSignature } from "../src/modules/billing/mercadopago.js";
import { normalizeOrder, normalizeOrderAccount } from "../src/modules/billing/orders.js";
import { applyVerifiedPayment, reconcilePayments, synchronizePayment } from "../src/modules/billing/service.js";

const orderId = "ORD01HRYFWNYRE1MR1E60MW3X0T2P";
const sandboxOrderId = "ORDTST01HRYFWNYRE1MR1E60MW3X0T2P";
const transactionId = "PAY01HRYFXQ53Q3JPEC48MYWMR0TE";
const origin = "https://app.extraok.test";
const secret = "orders-webhook-secret-for-tests-at-least-32-characters";
const databaseUrl = process.env.TEST_DATABASE_URL;
const env = loadEnv({
  NODE_ENV: "test", DATABASE_URL: databaseUrl ?? "postgresql://test:test@127.0.0.1:1/unused",
  WEB_ORIGIN: origin, PASSWORD_PEPPER: "orders-tests-pepper-at-least-32-characters",
  BILLING_ENABLED: "true", MERCADOPAGO_ACCESS_TOKEN: "orders-tests-token-at-least-32-characters",
  MERCADOPAGO_WEBHOOK_SECRET: secret, MERCADOPAGO_COLLECTOR_ID: "123456", MERCADOPAGO_LIVE_MODE: "false",
  MERCADOPAGO_WEBHOOK_URL: `${origin}/api/v1/billing/webhooks/mercadopago`,
});

// Shape follows the published Pix Orders GET response, including the absence
// of live_mode/currency and the sandbox ticket used by the provider.
function pixOrder(reference: string = randomUUID(), amount = "9.99") {
  return {
    id: orderId, type: "online", user_id: "123456", country_code: "BRA",
    external_reference: reference, total_amount: amount, total_paid_amount: "0.00",
    status: "action_required", status_detail: "waiting_transfer",
    created_date: new Date().toISOString(), last_updated_date: new Date().toISOString(),
    transactions: {
      payments: [{
        id: transactionId, amount, paid_amount: "0.00", refunded_amount: "0.00",
        status: "action_required", status_detail: "waiting_transfer",
        date_of_expiration: new Date(Date.now() + 1_800_000).toISOString(),
        payment_method: {
          id: "pix", type: "bank_transfer",
          ticket_url: "https://www.mercadopago.com.br/sandbox/payments/123456789/ticket?caller_id=123456&hash=test",
          qr_code: "000201-PIX-ORDERS-TEST", qr_code_base64: "aW1hZ2U=",
        },
      }],
      refunds: [] as Array<{ transaction_id: string; amount: string; status: string }>,
    },
  };
}

function accredited(order = pixOrder()) {
  order.status = order.transactions.payments[0].status = "processed";
  order.status_detail = order.transactions.payments[0].status_detail = "accredited";
  order.total_paid_amount = order.transactions.payments[0].paid_amount = order.total_amount;
  order.last_updated_date = new Date(Date.now() + 1000).toISOString();
  return order;
}

function signed(id = orderId, lowercase = true) {
  const requestId = "orders-test-request";
  const timestamp = "1791200000";
  const signature = createHmac("sha256", secret).update(`id:${lowercase ? id.toLowerCase() : id};request-id:${requestId};ts:${timestamp};`).digest("hex");
  return { "x-request-id": requestId, "x-signature": `ts=${timestamp},v1=${signature}` };
}

test("Orders cria Pix com centavos exatos, expiração estável e consulta o mesmo recurso", async () => {
  for (const priceCents of [999, 1999, 2990]) {
    const local = {
      id: randomUUID(), providerApi: "orders", plan: "pro", priceCents,
      payerName: "Pessoa Teste", payerEmail: "payer@example.test", payerDocument: "52998224725",
      payerDeviceId: "device-session-test-123",
      expiresAt: new Date(Date.now() + 1_800_000),
    } as BillingPayment;
    const bodies: string[] = [];
    const paths: string[] = [];
    const gateway = createPixGateway(env, (async (url, options) => {
      paths.push(String(url));
      assert.equal(new Headers(options?.headers).get("Authorization"), `Bearer ${env.MERCADOPAGO_ACCESS_TOKEN}`);
      assert.equal(options?.redirect, "error");
      assert.ok(options?.signal);
      if (options?.method === "POST") {
        assert.equal(String(url), "https://api.mercadopago.com/v1/orders");
        assert.equal(new Headers(options.headers).get("X-Idempotency-Key"), local.id);
        assert.equal(new Headers(options.headers).get("X-meli-session-id"), local.payerDeviceId);
        bodies.push(String(options.body));
        const body = JSON.parse(String(options.body));
        assert.equal(body.type, "online");
        assert.equal(body.processing_mode, "automatic");
        assert.equal(body.total_amount, (priceCents / 100).toFixed(2));
        assert.equal(body.external_reference, local.id);
        assert.deepEqual(body.transactions.payments, [{ amount: body.total_amount, payment_method: { id: "pix", type: "bank_transfer" }, expiration_time: "PT30M" }]);
        assert.equal(body.payer.identification.number, local.payerDocument);
        assert.equal(body.payer.first_name, "Pessoa");
        assert.equal(body.payer.last_name, "Teste");
        assert.equal(body.notification_url, undefined);
        return Response.json({ id: orderId, status: "processing" }, { status: 201 });
      }
      assert.equal(String(url), `https://api.mercadopago.com/v1/orders/${orderId}`);
      assert.equal(new Headers(options?.headers).get("X-meli-session-id"), null);
      return Response.json(pixOrder(local.id, (priceCents / 100).toFixed(2)));
    }) as typeof fetch);
    const result = await gateway.create(local);
    await gateway.create(local);
    assert.equal(result.id, orderId);
    assert.equal(result.transaction_amount, priceCents / 100);
    assert.equal(result.live_mode, false);
    assert.equal(result.status, "pending");
    assert.equal(bodies[0], bodies[1]);
    assert.equal(paths.length, 4);
  }
});

test("Orders consulta HTTP 402 criado e preserva a recusa high_risk da transação", async () => {
  const local = { id: randomUUID(), providerApi: "orders", plan: "pro", priceCents: 999,
    payerName: "João da Silva", payerEmail: "payer@example.test", payerDocument: "52998224725",
    payerDeviceId: "device-session-test-123", expiresAt: new Date(Date.now() + 1_800_000) } as BillingPayment;
  for (const detail of ["high_risk", "rejected_high_risk"]) {
    const remote = pixOrder(local.id);
    remote.status = remote.transactions.payments[0].status = "failed";
    remote.status_detail = "failed";
    remote.transactions.payments[0].status_detail = detail;
    remote.transactions.payments[0].payment_method.qr_code = "";
    remote.transactions.payments[0].payment_method.qr_code_base64 = "";
    const requests: string[] = [];
    const gateway = createPixGateway(env, (async (url, options) => {
      requests.push(`${options?.method} ${url}`);
      if (options?.method === "POST") {
        return Response.json({ id: orderId, errors: [{ message: "private-provider-details" }] }, { status: 402 });
      }
      return Response.json(remote);
    }) as typeof fetch);
    const payment = await gateway.create(local);
    assert.equal(payment.status, "rejected");
    assert.equal(payment.status_detail, "high_risk");
    assert.equal(payment.external_reference, local.id);
    assert.equal(JSON.stringify(payment).includes("private-provider-details"), false);
    assert.deepEqual(requests, ["POST https://api.mercadopago.com/v1/orders", `GET https://api.mercadopago.com/v1/orders/${orderId}`]);
  }
});

test("Orders não infere uma recusa de HTTP 402 sem ID válido ou sem GET verificável", async () => {
  const local = { id: randomUUID(), providerApi: "orders", plan: "pro", priceCents: 999,
    payerName: "Pessoa Teste", payerEmail: "payer@example.test", payerDocument: "52998224725" } as BillingPayment;
  for (const body of [{ errors: [{ code: "high_risk" }] }, { id: "../../users/me" }, { id: orderId }]) {
    let posts = 0;
    const gateway = createPixGateway(env, (async (_url, options) => {
      if (options?.method === "POST") { posts++; return Response.json(body, { status: 402 }); }
      return Response.json({ private: "private-provider-details" }, { status: 503 });
    }) as typeof fetch);
    await assert.rejects(gateway.create(local), (error: Error & { code?: string }) => error.code === "PAYMENT_UNAVAILABLE" && !error.message.includes("private-provider-details"));
    assert.equal(posts, 1);
  }
});

test("gateway não inventa sobrenome nem envia Device ID inválido", async () => {
  let calls = 0;
  const gateway = createPixGateway(env, (async () => { calls++; throw new Error("unexpected transport"); }) as typeof fetch);
  for (const overrides of [{ payerName: "Pessoa" }, { payerName: "Pessoa Teste", payerDeviceId: "device\r\nAuthorization: forged" }]) {
    const local = { id: randomUUID(), providerApi: "orders", plan: "pro", priceCents: 999,
      payerEmail: "payer@example.test", payerDocument: "52998224725", ...overrides } as BillingPayment;
    await assert.rejects(gateway.create(local), (error: { code?: string }) => error.code === "PAYER_DATA_REQUIRED");
  }
  assert.equal(calls, 0);
});

test("Orders recupera pedido ORDTST aprovado sem ticket e preserva a validação de modo", async () => {
  const local = {
    id: randomUUID(), providerApi: "orders", plan: "pro", priceCents: 999,
    payerName: "APRO Teste", payerEmail: "payer@example.test", payerDocument: "52998224725",
    expiresAt: new Date(Date.now() + 1_800_000),
  } as BillingPayment;
  const approved = accredited(pixOrder(local.id));
  const remote = {
    ...approved, id: sandboxOrderId,
    transactions: { payments: approved.transactions.payments.map((payment) => ({
      ...payment, payment_method: { id: "pix", type: "bank_transfer" },
    })) },
  };
  const requests: string[] = [];
  const gateway = createPixGateway(env, (async (url, options) => {
    requests.push(String(url));
    if (options?.method === "POST") {
      assert.equal(new Headers(options.headers).get("X-Idempotency-Key"), local.id);
      return Response.json({ id: sandboxOrderId }, { status: 201 });
    }
    assert.equal(String(url), `https://api.mercadopago.com/v1/orders/${sandboxOrderId}`);
    return Response.json(remote);
  }) as typeof fetch);
  const recovered = await gateway.create(local);
  assert.equal(recovered.id, sandboxOrderId);
  assert.equal(recovered.status, "approved");
  assert.equal(recovered.live_mode, false);
  assert.equal(recovered.point_of_interaction?.transaction_data?.qr_code, undefined);
  assert.equal((await gateway.get(sandboxOrderId.toLowerCase())).id, sandboxOrderId);
  assert.equal(requests.length, 3);
  for (const lower of [true, false]) {
    const headers = signed(sandboxOrderId, lower);
    assert.equal(validWebhookSignature(secret, headers["x-signature"], headers["x-request-id"], sandboxOrderId), true);
    assert.equal(validWebhookSignature(secret, headers["x-signature"], headers["x-request-id"], orderId), false);
  }
  assert.throws(() => normalizeOrder({ ...remote, live_mode: true }));
  assert.throws(() => normalizeOrder({ ...remote, id: orderId }));
  assert.throws(() => normalizeOrder({ ...remote, id: `ORDTST${"X".repeat(23)}` }));
  const conflictingTicket = structuredClone(approved);
  conflictingTicket.id = sandboxOrderId;
  conflictingTicket.transactions.payments[0].payment_method.ticket_url = "https://www.mercadopago.com.br/payments/123456789/ticket";
  assert.throws(() => normalizeOrder(conflictingTicket));
  for (const id of ["ORDTST123", `${sandboxOrderId}/extra`, sandboxOrderId.slice(0, -1)]) {
    await assert.rejects(gateway.get(id));
  }
  assert.equal(requests.length, 3);
});

test("Orders mapeia aprovação, expiração, rejeição e reembolsos inclusive parciais", () => {
  const approved = normalizeOrder(accredited());
  assert.equal(approved.status, "approved");
  assert.ok(approved.date_approved);
  for (const [status, expected] of [["expired", "cancelled"], ["canceled", "cancelled"], ["failed", "rejected"], ["refunded", "refunded"], ["charged_back", "refunded"]]) {
    const order = pixOrder();
    order.status = status;
    const result = normalizeOrder(order);
    assert.equal(result.status, expected);
    if (status === "expired") assert.equal(result.status_detail, "expired");
  }
  const partial = accredited();
  partial.status_detail = "partially_refunded";
  assert.equal(normalizeOrder(partial).status, "refunded");
  const amountOnly = accredited();
  amountOnly.transactions.payments[0].refunded_amount = "0.01";
  assert.equal(normalizeOrder(amountOnly).status, "refunded");
  const refund = accredited();
  refund.transactions.refunds.push({ transaction_id: transactionId, amount: "0.01", status: "approved" });
  assert.equal(normalizeOrder(refund).status, "refunded");
  refund.transactions.refunds[0].status = "pending";
  assert.equal(normalizeOrder(refund).status, "approved");
  refund.transactions.refunds[0].status = "failed";
  assert.equal(normalizeOrder(refund).status, "approved");
});

test("Orders rejeita respostas ambíguas, pagamento incompleto, moeda e método incorretos", () => {
  const mutations: Array<(order: ReturnType<typeof pixOrder>) => void> = [
    (o) => { o.total_amount = "9.999"; },
    (o) => { o.total_amount = "9e2"; },
    (o) => { o.transactions.payments[0].amount = "0.01"; },
    (o) => { o.transactions.payments[0].paid_amount = "0.01"; },
    (o) => { o.total_paid_amount = "0.01"; },
    (o) => { o.transactions.payments.push(structuredClone(o.transactions.payments[0])); },
    (o) => { o.transactions.payments = []; },
    (o) => { o.transactions.payments[0].payment_method.id = "visa"; },
    (o) => { o.transactions.payments[0].payment_method.type = "credit_card"; },
    (o) => { o.country_code = "ARG"; },
    (o) => { Object.assign(o, { currency: "USD" }); },
    (o) => { Object.assign(o, { currency_id: "USD" }); },
    (o) => { Object.assign(o, { live_mode: true }); },
    (o) => { o.transactions.payments[0].payment_method.ticket_url = ""; },
    (o) => { o.transactions.payments[0].payment_method.ticket_url = "https://evil.test/payments/123/ticket"; },
    (o) => { o.transactions.payments[0].payment_method.ticket_url = "https://www.mercadopago.com.br/unknown/123/ticket"; },
    (o) => { o.id = "../../users/me"; },
    (o) => { o.last_updated_date = "invalid"; },
  ];
  for (const mutate of mutations) {
    const order = accredited();
    mutate(order);
    assert.throws(() => normalizeOrder(order));
  }
  const awaiting = accredited();
  awaiting.transactions.payments[0].status = "action_required";
  assert.equal(normalizeOrder(awaiting).status, "pending");
});

test("Orders diferencia sandbox do Pix real e aguarda transações assíncronas", () => {
  const real = accredited();
  real.transactions.payments[0].payment_method.ticket_url = "https://www.mercadopago.com.br/payments/123456789/ticket?hash=test";
  assert.equal(normalizeOrder(real).live_mode, true);
  const explicit = { ...real, live_mode: true };
  explicit.transactions.payments[0].payment_method.ticket_url = "";
  assert.equal(normalizeOrder(explicit).live_mode, true);
  const processing = pixOrder();
  processing.status = "processing";
  processing.transactions.payments = [];
  const normalized = normalizeOrder(processing);
  assert.equal(normalized.status, "processing");
  assert.equal(normalized.live_mode, null);
  assert.equal(normalized.payment_method_id, null);
});

test("Orders sem live_mode e ticket usa a conta autenticada para produção e teste", async () => {
  for (const tags of [[], ["test_user"]]) {
    const remote = accredited();
    remote.transactions.payments[0].payment_method.ticket_url = "";
    const paths: string[] = [];
    // Deliberately disagree with the configuration: it must not prove mode.
    const gateway = createPixGateway({ ...env, MERCADOPAGO_LIVE_MODE: tags.length > 0 }, (async (url, options) => {
      paths.push(String(url));
      assert.equal(options?.method, "GET");
      assert.equal(new Headers(options?.headers).get("Authorization"), `Bearer ${env.MERCADOPAGO_ACCESS_TOKEN}`);
      assert.equal(options?.redirect, "error");
      if (String(url).endsWith("/users/me")) return Response.json({ id: 123456, tags, site_id: "MLB" });
      return Response.json(remote);
    }) as typeof fetch);
    const result = await gateway.get(orderId);
    assert.equal(result.live_mode, tags.length === 0);
    assert.equal(result.status, "approved");
    assert.equal(result.collector_id, "123456");
    assert.deepEqual(paths, [`https://api.mercadopago.com/v1/orders/${orderId}`, "https://api.mercadopago.com/users/me"]);
  }
});

test("Orders exige conta completa e mesmo recebedor; falha de consulta não vira produção", async () => {
  const remote = accredited();
  remote.transactions.payments[0].payment_method.ticket_url = "";
  for (const account of [
    { id: "99999", tags: [], site_id: "MLB" },
    { id: "123456", site_id: "MLB" },
    { id: "123456", tags: [], site_id: "MLA" },
    { id: "123456", tags: "test_user", site_id: "MLB" },
  ]) {
    const gateway = createPixGateway(env, (async (url) => Response.json(String(url).endsWith("/users/me") ? account : remote)) as typeof fetch);
    await assert.rejects(gateway.get(orderId), (error: { code?: string }) => error.code === "PAYMENT_UNAVAILABLE");
  }
  let requests = 0;
  const retry = createPixGateway(env, (async (url) => {
    if (!String(url).endsWith("/users/me")) return Response.json(remote);
    requests++;
    return requests === 1 ? Response.json({ secret: "not-for-client" }, { status: 503 })
      : Response.json({ id: "123456", tags: [], site_id: "MLB" });
  }) as typeof fetch);
  await assert.rejects(retry.get(orderId));
  assert.equal((await retry.get(orderId)).live_mode, true);
  assert.equal(requests, 2);

  const productionAccount = normalizeOrderAccount({ id: "123456", tags: [], site_id: "MLB" });
  const sandboxAccount = normalizeOrderAccount({ id: "123456", tags: ["test_user"], site_id: "MLB" });
  assert.throws(() => normalizeOrder({ ...remote, id: sandboxOrderId }, productionAccount));
  assert.throws(() => normalizeOrder({ ...remote, live_mode: false }, productionAccount));
  assert.throws(() => normalizeOrder({ ...remote, live_mode: true }, sandboxAccount));
  assert.throws(() => normalizeOrder(pixOrder(), productionAccount));
  // Knowing the seller still does not permit incomplete payment amounts.
  remote.total_paid_amount = "0.01";
  assert.throws(() => normalizeOrder(remote, productionAccount));
});

test("Orders valida HMAC de IDs alfanuméricos e rejeita adulteração antes de consultar o provedor", async (context) => {
  for (const lower of [true, false]) {
    const headers = signed(orderId, lower);
    assert.equal(validWebhookSignature(secret, headers["x-signature"], headers["x-request-id"], orderId), true);
    assert.equal(validWebhookSignature(secret, headers["x-signature"], "changed-request", orderId), false);
    assert.equal(validWebhookSignature(secret, headers["x-signature"], headers["x-request-id"], "ORD01HRYFWNYRE1MR1E60MW3X0T2Q"), false);
  }
  let gets = 0;
  const unrelated = pixOrder("other-store");
  const gateway = createPixGateway(env, (async () => { gets++; return Response.json(unrelated); }) as typeof fetch);
  const app = await buildApp({ env, pixGateway: gateway, logger: false, billingReconciliationEnabled: false });
  context.after(() => app.close());
  const path = `/api/v1/billing/webhooks/mercadopago?data.id=${orderId}&type=order`;
  assert.equal((await app.inject({ method: "POST", url: path, payload: {} })).statusCode, 401);
  assert.equal(gets, 0);
  const accepted = await app.inject({ method: "POST", url: path, headers: signed(), payload: { data: { id: "another-order" }, live_mode: true, status: "processed" } });
  assert.equal(accepted.statusCode, 200, accepted.body);
  assert.equal(gets, 1);
  for (const id of ["../../users/me", "ORD123", "PAY01HRYFXQ53Q3JPEC48MYWMR0TE"]) {
    await assert.rejects(gateway.get(id), (error: { code?: string }) => error.code === "PAYMENT_UNAVAILABLE");
  }
  assert.equal(gets, 1);
});

test("Orders não expõe corpo do provedor nem detalhes de validação", async () => {
  for (const response of [() => Response.json({ cpf: "private-cpf" }, { status: 400 }), () => Response.json({ id: orderId, payer: { cpf: "private-cpf" } })]) {
    const gateway = createPixGateway(env, (async () => response()) as typeof fetch);
    await assert.rejects(gateway.get(orderId), (error: Error & { code?: string }) => error.code === "PAYMENT_UNAVAILABLE" && !error.message.includes("private-cpf"));
  }
  const wrongId = pixOrder();
  wrongId.id = "ORD01HRYFWNYRE1MR1E60MW3X0T2Q";
  const gateway = createPixGateway(env, (async () => Response.json(wrongId)) as typeof fetch);
  await assert.rejects(gateway.get(orderId));
});

for (const [providerOrderId, accountFallback] of [[orderId, false], [sandboxOrderId, false], [orderId, true]] as const) {
test(`Orders ${providerOrderId.slice(0, -26)} ${accountFallback ? "conta real autenticada" : "sandbox"} integra criação assíncrona, polling, HMAC, duplicatas e reembolso`, { skip: !databaseUrl && "TEST_DATABASE_URL não definida" }, async (context) => {
  const scenarioEnv = { ...env, MERCADOPAGO_LIVE_MODE: accountFallback };
  const account = accountFallback ? normalizeOrderAccount({ id: "123456", tags: [], site_id: "MLB" }) : undefined;
  const prisma = createPrismaClient(databaseUrl!);
  const token = randomUUID();
  const user = await prisma.user.create({ data: {
    name: "Orders Teste", businessName: "Teste", email: `orders-${randomUUID()}@example.test`, phone: "11999999999",
    passwordHash: "unused", termsAcceptedAt: new Date(), termsVersion: "test",
    sessions: { create: { tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 86_400_000) } },
  } });
  const remote = pixOrder();
  remote.id = providerOrderId;
  if (accountFallback) remote.transactions.payments[0].payment_method.ticket_url = "";
  const completedTransaction = structuredClone(remote.transactions.payments[0]);
  remote.status = "processing";
  remote.transactions.payments = [];
  let creates = 0;
  const gateway = createPixGateway(scenarioEnv, (async (url, options) => {
    if (options?.method === "POST") {
      creates++;
      assert.equal(String(url), "https://api.mercadopago.com/v1/orders");
      remote.external_reference = JSON.parse(String(options.body)).external_reference;
      return Response.json({ id: providerOrderId });
    }
    if (accountFallback && String(url) === "https://api.mercadopago.com/users/me") {
      return Response.json({ id: "123456", tags: [], site_id: "MLB" });
    }
    assert.equal(String(url), `https://api.mercadopago.com/v1/orders/${providerOrderId}`);
    return Response.json(remote);
  }) as typeof fetch);
  const app = await buildApp({ env: scenarioEnv, prisma, pixGateway: gateway, logger: false, billingReconciliationEnabled: false });
  context.after(async () => { await app.close(); await prisma.user.delete({ where: { id: user.id } }); await prisma.$disconnect(); });
  const headers = { origin, cookie: `extraok_session=${token}` };
  const purchase = () => app.inject({ method: "POST", url: "/api/v1/billing/payments", headers, payload: { planId: "pro", cpf: "52998224725", idempotencyKey: randomUUID() } });
  const created = await purchase();
  assert.equal(created.statusCode, 201, created.body);
  assert.equal(created.json().status, "creating");
  const id = created.json().id as string;
  assert.equal((await purchase()).json().id, id);
  assert.equal(creates, 1);
  const saved = await prisma.billingPayment.findUniqueOrThrow({ where: { id } });
  assert.equal(saved.providerApi, "orders");
  assert.equal(saved.providerId, providerOrderId);
  assert.equal(saved.payerDocument, null);
  assert.equal(await prisma.billingPeriod.count({ where: { paymentId: id } }), 0);

  remote.status = "action_required";
  remote.transactions.payments = [completedTransaction];
  await prisma.billingPayment.update({ where: { id }, data: { lastCheckedAt: null } });
  const polled = await app.inject({ url: `/api/v1/billing/payments/${id}`, headers });
  assert.equal(polled.json().status, "pending");
  assert.equal(polled.json().qrCode, completedTransaction.payment_method.qr_code);

  const notify = () => app.inject({ method: "POST", url: `/api/v1/billing/webhooks/mercadopago?data.id=${providerOrderId}&type=order`, headers: signed(providerOrderId), payload: { data: { id: "ignored" }, status: "approved" } });
  accredited(remote);
  if (providerOrderId === sandboxOrderId) {
    remote.transactions.payments[0].payment_method.ticket_url = "";
    remote.transactions.payments[0].payment_method.qr_code = "";
    remote.transactions.payments[0].payment_method.qr_code_base64 = "";
  }
  const oppositeMode = await buildApp({ env: { ...env, MERCADOPAGO_LIVE_MODE: !accountFallback }, prisma, pixGateway: gateway, logger: false, billingReconciliationEnabled: false });
  await assert.rejects(applyVerifiedPayment(oppositeMode, normalizeOrder(remote, account), id), (error: { code?: string }) => error.code === "PAYMENT_MISMATCH");
  await oppositeMode.close();
  const wrongReceiver = { ...remote, user_id: "99999", live_mode: accountFallback };
  await assert.rejects(applyVerifiedPayment(app, normalizeOrder(wrongReceiver), id), (error: { code?: string }) => error.code === "PAYMENT_MISMATCH");
  assert.equal(await prisma.billingPeriod.count({ where: { paymentId: id } }), 0);
  const callbacks = await Promise.all([notify(), notify()]);
  for (const response of callbacks) assert.equal(response.statusCode, 200, response.body);
  assert.equal(await prisma.billingPeriod.count({ where: { paymentId: id } }), 1);
  const approvedAt = (await prisma.billingPayment.findUniqueOrThrow({ where: { id } })).approvedAt;
  remote.last_updated_date = new Date(Date.now() + 2000).toISOString();
  await notify();
  assert.deepEqual((await prisma.billingPayment.findUniqueOrThrow({ where: { id } })).approvedAt, approvedAt);
  const stale = normalizeOrder(remote, account);
  remote.status_detail = "partially_refunded";
  remote.transactions.payments[0].refunded_amount = "0.01";
  remote.last_updated_date = new Date(Date.now() + 3000).toISOString();
  await prisma.billingPayment.update({ where: { id }, data: { lastCheckedAt: new Date(0) } });
  await reconcilePayments(app, gateway);
  assert.ok((await prisma.billingPeriod.findUniqueOrThrow({ where: { paymentId: id } })).revokedAt);
  await applyVerifiedPayment(app, stale, id);
  assert.equal((await prisma.billingPayment.findUniqueOrThrow({ where: { id } })).status, "refunded");
  assert.equal((await app.inject({ url: "/api/v1/billing", headers })).json().current.planId, "free");
  assert.equal(creates, 1);
});
}

test("Payments legado conserva API, idempotência e valor após a migration", { skip: !databaseUrl && "TEST_DATABASE_URL não definida" }, async (context) => {
  const prisma = createPrismaClient(databaseUrl!);
  const user = await prisma.user.create({ data: { name: "Legado", businessName: "Teste", email: `legacy-${randomUUID()}@example.test`, phone: "11999999999", passwordHash: "unused", termsAcceptedAt: new Date(), termsVersion: "test" } });
  const payment = await prisma.billingPayment.create({ data: { ownerId: user.id, providerApi: "payments", plan: "pro", priceCents: 2990, jobLimit: 50, payerName: "Pessoa Legado", payerEmail: user.email, payerDocument: "52998224725", expiresAt: new Date(Date.now() + 1_800_000) } });
  const gateway = createPixGateway(env, (async (url, options) => {
    assert.equal(String(url), options?.method === "POST" ? "https://api.mercadopago.com/v1/payments" : "https://api.mercadopago.com/v1/payments/987654321");
    if (options?.method === "POST") {
      assert.equal(new Headers(options.headers).get("X-Idempotency-Key"), payment.id);
      assert.equal(JSON.parse(String(options.body)).transaction_amount, 29.9);
    }
    return Response.json({ id: "987654321", collector_id: "123456", external_reference: payment.id, live_mode: false,
      payment_method_id: "pix", currency_id: "BRL", transaction_amount: 29.9, status: "approved",
      date_last_updated: new Date().toISOString(), date_approved: new Date().toISOString() });
  }) as typeof fetch);
  const app = await buildApp({ env, prisma, pixGateway: gateway, logger: false, billingReconciliationEnabled: false });
  context.after(async () => { await app.close(); await prisma.user.delete({ where: { id: user.id } }); await prisma.$disconnect(); });
  const updated = await synchronizePayment(app, gateway, payment);
  assert.equal(updated.providerApi, "payments");
  assert.equal(updated.priceCents, 2990);
  assert.equal(updated.status, "approved");
  await synchronizePayment(app, gateway, updated);
  assert.equal(await prisma.billingPeriod.count({ where: { paymentId: payment.id } }), 1);
  await assert.rejects(applyVerifiedPayment(app, normalizeOrder(accredited(pixOrder(payment.id, "29.90"))), payment.id), (error: { code?: string }) => error.code === "PAYMENT_MISMATCH");
});
