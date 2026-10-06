import { z } from "zod";
import { normalizeOrder, normalizeOrderAccount, orderIdPattern } from "./orders.js";

const referenceSchema = z.string().uuid();
const accountSchema = z.object({
  id: z.union([z.string().regex(/^\d{1,64}$/), z.number().int().positive().max(Number.MAX_SAFE_INTEGER)]).transform(String),
  tags: z.array(z.string()),
  site_id: z.string(),
});
const searchSchema = z.object({ data: z.array(z.object({
  id: z.string().regex(orderIdPattern),
  external_reference: z.string().nullish(),
})).max(5) });
const knownValidationErrors = new Set([
  "Invalid Pix ticket", "Unknown Pix ticket mode", "Missing Pix transaction",
  "Inconsistent order amount", "Inconsistent sandbox order mode", "Inconsistent order mode",
  "Unverifiable order mode", "Order was not fully paid",
  "Order account mismatch", "Order account mode mismatch",
]);

// Published Orders statuses/details only. Never print arbitrary provider text:
// even a status_detail or attempt can unexpectedly include personal data.
// https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/payment-management/status/transaction-status
const knownProviderCodes = new Set([
  "created", "processed", "processing", "action_required", "charged_back", "expired", "refunded", "failed", "canceled", "in_review",
  "accredited", "partially_refunded", "in_process", "pending_review_manual", "waiting_payment", "waiting_capture",
  "waiting_transfer", "pending_challenge", "waiting_retry", "settled", "reimbursed", "bad_filled_card_data",
  "invalid_card_token", "high_risk", "rejected_by_issuer", "required_call_for_authorize", "max_attempts_exceeded",
  "card_disabled", "insufficient_amount", "amount_limit_exceeded", "processing_error", "invalid_installments",
  "3ds_challenge_expired", "card_insufficient_amount", "approved", "rejected", "pending", "cc_rejected_other_reason",
]);
function providerCode(value: unknown): string | null {
  return value == null ? null : typeof value === "string" && knownProviderCodes.has(value) ? value : "unrecognized";
}
function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function statusFields(value: unknown) {
  const data = object(value);
  return { status: providerCode(data.status), statusDetail: providerCode(data.status_detail) };
}
function providerDetails(value: unknown) {
  const transactions = object(object(value).transactions);
  const payments = Array.isArray(transactions.payments) ? transactions.payments : [];
  return {
    ...statusFields(value),
    payments: payments.slice(0, 1).map((entry) => {
      const payment = object(entry);
      const attempts = Array.isArray(payment.attempts) ? payment.attempts : [];
      return { ...statusFields(payment), attempts: attempts.slice(-5).map(statusFields) };
    }),
  };
}

type ReadResult = { ok: true; body: unknown } | { ok: false; httpStatus?: number; reason: string };

// Uses only GETs to a fixed origin. It never loads .env, imports the database,
// starts reconciliation or returns raw provider bodies, payer data or QR codes.
export async function diagnosePix(token: string, reference: string, transport: typeof fetch = fetch, now = new Date()) {
  if (!referenceSchema.safeParse(reference).success) throw new Error("INVALID_REFERENCE");
  if (!token || token.length > 4096 || /\s/.test(token)) throw new Error("INVALID_TOKEN_INPUT");

  async function read(path: string): Promise<ReadResult> {
    try {
      const response = await transport(`https://api.mercadopago.com${path}`, {
        method: "GET", headers: { Authorization: `Bearer ${token}` },
        redirect: "error", signal: AbortSignal.timeout(15_000),
      });
      // Error bodies may contain personal data or echo the request. Do not log them.
      if (!response.ok) return { ok: false, httpStatus: response.status, reason: "PROVIDER_HTTP_ERROR" };
      try { return { ok: true, body: await response.json() }; }
      catch { return { ok: false, reason: "INVALID_JSON_RESPONSE" }; }
    } catch {
      return { ok: false, reason: "CONNECTION_FAILED_OR_TIMED_OUT" };
    }
  }

  const accountResponse = await read("/users/me");
  if (!accountResponse.ok) return { stage: "account", ...accountResponse };
  const parsedAccount = accountSchema.safeParse(accountResponse.body);
  if (!parsedAccount.success) return { stage: "account", ok: false, reason: "INVALID_ACCOUNT_RESPONSE" };
  const account = {
    collectorId: parsedAccount.data.id,
    mode: parsedAccount.data.tags.includes("test_user") ? "test" : "production",
    brazilianAccount: parsedAccount.data.site_id === "MLB",
  };

  const window = { begin_date: new Date(now.getTime() - 7 * 86_400_000).toISOString(), end_date: now.toISOString() };
  const query = new URLSearchParams({ ...window, external_reference: reference, type: "online", page: "1", page_size: "5" });
  const searchResponse = await read(`/v1/orders?${query}`);
  if (!searchResponse.ok) return { stage: "search", account, window, ...searchResponse };
  const search = searchSchema.safeParse(searchResponse.body);
  if (!search.success) return { stage: "search", account, window, ok: false, reason: "INVALID_SEARCH_RESPONSE" };
  // Even a filtered search must not lead to inspecting unrelated customers.
  const matches = search.data.data.filter((order) => order.external_reference === reference);
  if (matches.length === 0) return {
    stage: "search", account, window, ok: false, reason: "NO_MATCH_IN_LAST_7_DAYS",
  };

  const orders = [];
  for (const match of matches) {
    const orderId = match.id.toUpperCase();
    const response = await read(`/v1/orders/${orderId}`);
    if (!response.ok) { orders.push({ orderId, ...response }); continue; }
    try {
      const order = normalizeOrder(response.body, normalizeOrderAccount(parsedAccount.data));
      orders.push({
        orderId, normalized: true,
        idMatches: order.id === orderId,
        referenceMatches: order.external_reference === reference,
        collectorMatchesToken: order.collector_id === account.collectorId,
        mode: order.live_mode === null ? "unknown" : order.live_mode ? "production" : "test",
        status: order.status, amountCents: Math.round(order.transaction_amount * 100),
        hasPixCode: Boolean(order.point_of_interaction?.transaction_data?.qr_code),
        provider: providerDetails(response.body),
      });
    } catch (error) {
      orders.push({
        orderId, normalized: false,
        reason: error instanceof z.ZodError ? "ORDER_SCHEMA_MISMATCH"
          : error instanceof Error && knownValidationErrors.has(error.message) ? error.message : "INVALID_ORDER_RESPONSE",
        // Schema paths and Zod codes are safe; messages/inputs may include data.
        ...(error instanceof z.ZodError ? {
          fields: error.issues.map((issue) => ({ path: issue.path.join("."), code: issue.code })),
        } : {}),
      });
    }
  }
  return { stage: "orders", account, window, orders };
}
