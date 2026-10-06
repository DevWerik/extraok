import assert from "node:assert/strict";
import test from "node:test";
import { diagnosePix } from "../src/modules/billing/diagnose.js";

const reference = "11111111-1111-4111-8111-111111111111";
const orderId = "ORD01HRYFWNYRE1MR1E60MW3X0T2P";
const secret = "diagnostic-secret-never-printed";
const now = new Date("2026-10-06T01:00:00Z");
const account = { id: 123456, tags: [], site_id: "MLB" };
function order() {
  return {
    id: orderId, type: "online", user_id: "123456", country_code: "BRA", external_reference: reference,
    total_amount: "9.99", total_paid_amount: "0.00", status: "action_required", status_detail: "waiting_transfer",
    created_date: now.toISOString(), last_updated_date: now.toISOString(),
    payer: { email: "private@example.test", identification: { number: "52998224725" } },
    transactions: { payments: [{
      id: "PAY01HRYFXQ53Q3JPEC48MYWMR0TE", amount: "9.99", paid_amount: "0.00",
      status: "action_required", status_detail: "waiting_transfer",
      payment_method: { id: "pix", type: "bank_transfer", qr_code: "private-pix-code",
        ticket_url: "https://www.mercadopago.com.br/payments/123456789/ticket?hash=private-hash" },
    }] },
  };
}
function transport(bodies: unknown[], paths: URL[]) {
  return (async (url, options) => {
    assert.equal(options?.method, "GET");
    assert.equal(options?.body, undefined);
    assert.equal(options?.redirect, "error");
    assert.ok(options?.signal);
    assert.equal(new Headers(options?.headers).get("authorization"), `Bearer ${secret}`);
    const parsed = new URL(String(url));
    assert.equal(parsed.origin, "https://api.mercadopago.com");
    paths.push(parsed);
    return Response.json(bodies.shift());
  }) as typeof fetch;
}

test("diagnóstico usa apenas GETs filtrados e não retorna dados do pagador, QR ou token", async () => {
  const paths: URL[] = [];
  const report = await diagnosePix(secret, reference, transport([account, { data: [{ id: orderId, external_reference: reference }] }, order()], paths), now);
  assert.equal(report.stage, "orders");
  assert.equal(paths.length, 3);
  assert.equal(paths[1].searchParams.get("external_reference"), reference);
  assert.equal(paths[1].searchParams.get("begin_date"), "2026-09-29T01:00:00.000Z");
  assert.equal(paths[1].searchParams.get("end_date"), now.toISOString());
  assert.equal(paths[2].pathname, `/v1/orders/${orderId}`);
  assert.ok(report.orders);
  assert.deepEqual(report.orders[0], { orderId, normalized: true, idMatches: true, referenceMatches: true,
    collectorMatchesToken: true, mode: "production", status: "pending", amountCents: 999, hasPixCode: true,
    provider: { status: "action_required", statusDetail: "waiting_transfer",
      payments: [{ status: "action_required", statusDetail: "waiting_transfer", attempts: [] }] },
  });
  for (const value of [secret, "private@example.test", "52998224725", "private-pix-code", "private-hash"]) {
    assert.equal(JSON.stringify(report).includes(value), false);
  }
});

test("diagnóstico identifica teste, não consulta outras referências e não cria cobrança ausente", async () => {
  const paths: URL[] = [];
  const report = await diagnosePix(secret, reference, transport([
    { ...account, tags: ["test_user"] }, { data: [{ id: orderId, external_reference: "other-customer" }] },
  ], paths), now);
  assert.equal(paths.length, 2);
  assert.ok(report.account);
  assert.equal(report.account.mode, "test");
  assert.ok("reason" in report);
  assert.equal(report.reason, "NO_MATCH_IN_LAST_7_DAYS");
});

test("diagnóstico resolve modo ausente pela conta e informa schema sem exibir valores rejeitados", async () => {
  const missingMode = order();
  missingMode.transactions.payments[0].payment_method.ticket_url = "";
  const recovered = await diagnosePix(secret, reference, transport([account, { data: [{ id: orderId, external_reference: reference }] }, missingMode], []), now);
  assert.ok(recovered.orders);
  assert.equal(recovered.orders[0].normalized, true);
  assert.equal(recovered.orders[0].mode, "production");
  const wrongAccount = { ...order(), user_id: "999999" };
  const invalidField = { ...order(), user_id: secret };
  const invalidUrl = order();
  invalidUrl.transactions.payments[0].payment_method.ticket_url = `invalid ${secret}`;
  for (const [payload, reason] of [[wrongAccount, "Order account mismatch"], [invalidField, "ORDER_SCHEMA_MISMATCH"], [invalidUrl, "INVALID_ORDER_RESPONSE"]] as const) {
    const report = await diagnosePix(secret, reference, transport([account, { data: [{ id: orderId, external_reference: reference }] }, payload], []), now);
    assert.ok(report.orders);
    const result = report.orders[0];
    assert.ok("reason" in result);
    assert.equal(result.reason, reason);
    assert.equal(JSON.stringify(report).includes(secret), false);
    if (reason === "ORDER_SCHEMA_MISMATCH") {
      assert.ok("fields" in result);
      assert.deepEqual(result.fields, [{ path: "user_id", code: "invalid_format" }]);
    }
  }
});

test("diagnóstico oculta corpos de erro e exceções de transporte, rejeita IDs antes de acessar a rede", async () => {
  const http = await diagnosePix(secret, reference, (async () => Response.json({ message: secret }, { status: 401 })) as typeof fetch, now);
  assert.deepEqual(http, { stage: "account", ok: false, httpStatus: 401, reason: "PROVIDER_HTTP_ERROR" });
  const failed = (async () => { throw new Error(secret); }) as typeof fetch;
  assert.deepEqual(await diagnosePix(secret, reference, failed, now), { stage: "account", ok: false, reason: "CONNECTION_FAILED_OR_TIMED_OUT" });
  let called = false;
  await assert.rejects(diagnosePix(secret, "invalid-reference", (async () => { called = true; }) as unknown as typeof fetch, now));
  assert.equal(called, false);
});

test("diagnóstico mostra motivo de falha do provedor sem expor texto livre ou dados das tentativas", async () => {
  const remote = order();
  remote.status = "failed";
  remote.status_detail = "failed";
  const payment = remote.transactions.payments[0];
  payment.status = "failed";
  payment.status_detail = "processing_error";
  Object.assign(payment, { attempts: [
    { status: "failed", status_detail: "high_risk", payer: { email: "private@example.test" } },
    { status: secret, status_detail: "private_customer_data", payment_method: { token: secret } },
  ] });
  const report = await diagnosePix(secret, reference, transport([account, { data: [{ id: orderId, external_reference: reference }] }, remote], []), now);
  assert.ok(report.orders);
  const result = report.orders[0];
  assert.equal(result.status, "rejected");
  assert.ok("provider" in result);
  assert.deepEqual(result.provider, { status: "failed", statusDetail: "failed", payments: [
    { status: "failed", statusDetail: "processing_error", attempts: [
      { status: "failed", statusDetail: "high_risk" }, { status: "unrecognized", statusDetail: "unrecognized" },
    ] },
  ] });
  for (const value of [secret, "private@example.test", "private_customer_data"]) assert.equal(JSON.stringify(report).includes(value), false);
});
