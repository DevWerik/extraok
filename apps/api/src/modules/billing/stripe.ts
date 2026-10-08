import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { Env } from "../../config/env.js";
import { PixGatewayError, type PixGateway, type PixPayment } from "./mercadopago.js";

export const STRIPE_API_VERSION = "2026-09-30.endive";
export const STRIPE_CHECKOUT_MS = 60 * 60_000;
export const stripeSessionIdPattern = /^cs_(?:test_|live_)?[A-Za-z0-9]{8,240}$/;
const intentId = z.string().regex(/^pi_[A-Za-z0-9]{8,240}$/);
const metadata = z.object({ extraok_payment_id: z.string().uuid() });
const chargeSchema = z.object({
  // Pix charges can use the py_ prefix for non-card payments.
  id: z.string().regex(/^(?:ch|py)_[A-Za-z0-9]+$/),
  payment_intent: intentId, amount: z.number().int().positive(),
  amount_refunded: z.number().int().nonnegative(), currency: z.literal("brl"),
  paid: z.boolean(), captured: z.boolean(), disputed: z.boolean(), livemode: z.boolean(),
  payment_method_details: z.object({ type: z.literal("pix") }),
});
const intentSchema = z.object({
  id: intentId, metadata, amount: z.number().int().positive(),
  amount_received: z.number().int().nonnegative(), currency: z.literal("brl"), livemode: z.boolean(),
  status: z.enum(["requires_payment_method", "requires_confirmation", "requires_action", "processing", "requires_capture", "canceled", "succeeded"]),
  latest_charge: chargeSchema.nullable(),
  next_action: z.object({ pix_display_qr_code: z.object({ expires_at: z.number().int().positive().optional() }).optional() }).nullish(),
});
const sessionSchema = z.object({
  id: z.string().regex(stripeSessionIdPattern), object: z.literal("checkout.session"),
  mode: z.literal("payment"), currency: z.literal("brl"), livemode: z.boolean(),
  client_reference_id: z.string().uuid(), metadata,
  amount_total: z.number().int().positive(),
  payment_method_types: z.array(z.string()).refine((types) => types.length === 1 && types[0] === "pix"),
  status: z.enum(["open", "complete", "expired"]),
  payment_status: z.enum(["paid", "unpaid", "no_payment_required"]),
  expires_at: z.number().int().positive(), url: z.string().max(4096).nullable(),
  payment_intent: intentSchema.nullable(),
});

export function safeStripeCheckoutUrl(value: string | null): string | null {
  if (!value) return null;
  const url = new URL(value);
  if (url.origin !== "https://checkout.stripe.com" || url.username || url.password || !url.pathname.startsWith("/c/pay/")) {
    throw new PixGatewayError();
  }
  return value;
}

export function normalizeStripeSession(data: unknown, accountId: string, observedAt = new Date()): PixPayment {
  const session = sessionSchema.parse(data);
  if (session.client_reference_id !== session.metadata.extraok_payment_id) throw new PixGatewayError();
  const intent = session.payment_intent;
  const charge = intent?.latest_charge;
  if (intent && (intent.metadata.extraok_payment_id !== session.client_reference_id || intent.amount !== session.amount_total ||
      intent.livemode !== session.livemode)) throw new PixGatewayError();
  if (charge && (charge.payment_intent !== intent!.id || charge.amount !== session.amount_total ||
      charge.livemode !== session.livemode || charge.amount_refunded > charge.amount)) throw new PixGatewayError();
  const paid = session.payment_status === "paid";
  if (paid && (session.status !== "complete" || intent?.status !== "succeeded" ||
      intent.amount_received !== session.amount_total || !charge?.paid || !charge.captured)) throw new PixGatewayError();
  // A successful intent without a paid session is an incomplete snapshot. Retry.
  if (!paid && intent?.status === "succeeded") throw new PixGatewayError();
  if (session.payment_status === "no_payment_required") throw new PixGatewayError();
  const status = charge?.disputed ? "charged_back" : charge?.amount_refunded ? "refunded"
    : paid ? "approved" : session.status === "expired" || intent?.status === "canceled" ? "cancelled" : "pending";
  return {
    id: session.id, providerApi: "stripe", collector_id: accountId,
    external_reference: session.client_reference_id, live_mode: session.livemode, payment_method_id: "pix",
    currency_id: "BRL", transaction_amount: session.amount_total / 100,
    transaction_amount_refunded: (charge?.amount_refunded ?? 0) / 100,
    status, status_detail: session.status === "expired" ? "expired" : undefined,
    date_last_updated: observedAt.toISOString(), date_approved: paid ? observedAt.toISOString() : null,
    date_of_expiration: new Date(Math.max(session.expires_at, intent?.next_action?.pix_display_qr_code?.expires_at ?? 0) * 1000).toISOString(),
    checkoutUrl: session.status === "open" && status === "pending" ? safeStripeCheckoutUrl(session.url) : null,
    point_of_interaction: null,
  };
}

export function createStripeGateway(env: Env, transport: typeof fetch = fetch): PixGateway {
  let account: Promise<string> | undefined;
  async function request(path: string, body?: URLSearchParams, key?: string): Promise<unknown> {
    if (!env.STRIPE_SECRET_KEY) throw new PixGatewayError();
    try {
      const response = await transport(`https://api.stripe.com/v1${path}`, {
        method: body ? "POST" : "GET", redirect: "error", signal: AbortSignal.timeout(8_000),
        headers: {
          Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, "Stripe-Version": STRIPE_API_VERSION,
          ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
          ...(key ? { "Idempotency-Key": key } : {}),
        },
        ...(body ? { body: body.toString() } : {}),
      });
      if (!response.ok) throw new PixGatewayError();
      return await response.json();
    } catch { throw new PixGatewayError(); }
  }
  function verifiedAccount() {
    account ??= request("/account").then((body) => {
      const found = z.object({ id: z.string(), country: z.literal("BR"), charges_enabled: z.boolean() }).parse(body);
      if (found.id !== env.STRIPE_ACCOUNT_ID || (env.STRIPE_LIVE_MODE && !found.charges_enabled)) throw new PixGatewayError();
      return found.id;
    }).catch(() => { account = undefined; throw new PixGatewayError(); });
    return account;
  }
  async function get(id: string) {
    if (!stripeSessionIdPattern.test(id)) throw new PixGatewayError();
    try {
      const collector = await verifiedAccount();
      const observedAt = new Date();
      const data = await request(`/checkout/sessions/${id}?expand[]=payment_intent.latest_charge`);
      const remote = normalizeStripeSession(data, collector, observedAt);
      if (remote.id !== id || remote.live_mode !== env.STRIPE_LIVE_MODE) throw new PixGatewayError();
      return remote;
    } catch { throw new PixGatewayError(); }
  }
  return {
    get,
    async create(payment) {
      if (payment.providerApi !== "stripe") throw new PixGatewayError();
      await verifiedAccount();
      // All parameters are derived from the persisted attempt, including expiry.
      // Lost responses reuse the same request and key, never a second session.
      const form = new URLSearchParams({
        mode: "payment", locale: "pt-BR", "allowed_payment_method_types[0]": "pix",
        "adaptive_pricing[enabled]": "false",
        client_reference_id: payment.id, "metadata[extraok_payment_id]": payment.id,
        "payment_intent_data[metadata][extraok_payment_id]": payment.id,
        customer_email: payment.payerEmail,
        "line_items[0][price_data][currency]": "brl",
        "line_items[0][price_data][unit_amount]": String(payment.priceCents),
        "line_items[0][price_data][product_data][name]": `ExtraOK ${payment.plan === "pro" ? "Pro" : "Negócio"} - 30 dias`,
        "line_items[0][quantity]": "1",
        "payment_method_options[pix][expires_after_seconds]": "1800",
        expires_at: String(Math.floor((payment.createdAt.getTime() + STRIPE_CHECKOUT_MS) / 1000)),
        success_url: `${env.WEB_ORIGIN}/meu-plano?payment=${payment.id}`,
        cancel_url: `${env.WEB_ORIGIN}/meu-plano?payment=${payment.id}`,
      });
      try {
        const created = z.object({ id: z.string().regex(stripeSessionIdPattern) }).parse(await request("/checkout/sessions", form, payment.id));
        return await get(created.id);
      } catch { throw new PixGatewayError(); }
    },
  };
}

// Stripe signs the exact raw bytes. Support secret rotation (multiple v1 values)
// while rejecting stale/future timestamps and never parsing an unsigned body.
export function validStripeSignature(raw: Buffer, header: unknown, secret: string | undefined, now = Date.now()): boolean {
  if (!secret || typeof header !== "string" || header.length > 4096) return false;
  const parts = header.split(",").map((part) => part.trim().split("="));
  const timestamps = parts.filter(([key]) => key === "t");
  const time = timestamps[0]?.[1];
  if (timestamps.length !== 1 || !/^\d{10,13}$/.test(time ?? "") || Math.abs(now / 1000 - Number(time)) > 300) return false;
  const expected = createHmac("sha256", secret).update(`${time}.`).update(raw).digest();
  return parts.some(([key, value]) => key === "v1" && /^[a-fA-F0-9]{64}$/.test(value ?? "") && timingSafeEqual(expected, Buffer.from(value!, "hex")));
}
