import { z } from "zod";
import type { PixPayment } from "./mercadopago.js";
import { PIX_EXPIRATION_MS } from "./plans.js";

// Sandbox orders include TST before the 26-character resource identifier.
export const orderIdPattern = /^ORD(?:TST)?[A-Z0-9]{26}$/i;
export const providerResourceIdPattern = /^(?:\d{1,64}|ORD(?:TST)?[A-Z0-9]{26})$/i;
const date = z.string().refine((value) => Number.isFinite(Date.parse(value)));
// Convert decimal strings without rounding away fractions of a cent.
const amount = z.string().regex(/^\d{1,12}(?:\.\d{1,2})?$/).transform((value) => {
  const [whole, fraction = ""] = value.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
});
const status = z.enum(["created", "processing", "action_required", "processed", "canceled", "expired", "failed", "refunded", "charged_back"]);
const accountSchema = z.object({
  id: z.union([z.string().regex(/^\d{1,64}$/), z.number().int().positive().max(Number.MAX_SAFE_INTEGER)]).transform(String),
  tags: z.array(z.string()),
  site_id: z.literal("MLB"),
});
export type OrderAccount = { collectorId: string; liveMode: boolean };

// Only pass /users/me fetched with the same token as the order. Orders sandbox
// uses a test seller account; the APP_USR token prefix alone cannot prove mode.
export function normalizeOrderAccount(data: unknown): OrderAccount {
  const account = accountSchema.parse(data);
  return { collectorId: account.id, liveMode: !account.tags.includes("test_user") };
}

export class OrderModeUnavailableError extends Error {
  constructor() { super("Unverifiable order mode"); }
}

const orderSchema = z.object({
  id: z.string().regex(orderIdPattern).transform((value) => value.toUpperCase()),
  type: z.literal("online"),
  user_id: z.union([z.string().regex(/^\d{1,64}$/), z.number().int().positive().max(Number.MAX_SAFE_INTEGER)]).transform(String),
  external_reference: z.string().nullish(),
  country_code: z.enum(["BR", "BRA"]),
  currency: z.literal("BRL").optional(),
  currency_id: z.literal("BRL").optional(),
  live_mode: z.boolean().optional(),
  total_amount: amount.refine((value) => value > 0),
  total_paid_amount: amount.optional(),
  created_date: date,
  last_updated_date: date,
  status,
  status_detail: z.string(),
  transactions: z.object({
    payments: z.array(z.object({
      id: z.string().regex(/^PAY[A-Z0-9]{26}$/i),
      amount,
      paid_amount: amount.optional(),
      refunded_amount: amount.optional(),
      status,
      status_detail: z.string(),
      date_of_expiration: date.nullish(),
      payment_method: z.object({
        id: z.literal("pix"),
        type: z.literal("bank_transfer"),
        ticket_url: z.string().max(4096).nullish(),
        qr_code: z.string().max(10_000).nullish(),
        qr_code_base64: z.string().max(200_000).regex(/^[A-Za-z0-9+/=\r\n]*$/).nullish(),
      }),
    })).max(1).optional().default([]),
    refunds: z.array(z.object({
      transaction_id: z.string(), amount, status: z.string(),
    })).optional().default([]),
  }).optional(),
});

function ticketLiveMode(ticket: string | null | undefined): boolean | undefined {
  if (!ticket) return undefined;
  const url = new URL(ticket);
  if (url.origin !== "https://www.mercadopago.com.br" || url.username || url.password) throw new Error("Invalid Pix ticket");
  if (/^\/sandbox\/payments\/\d+\/ticket$/.test(url.pathname)) return false;
  if (/^\/payments\/\d+\/ticket$/.test(url.pathname)) return true;
  throw new Error("Unknown Pix ticket mode");
}

// Orders uses decimal amounts, ORD/PAY IDs and a different status vocabulary.
// Normalize only authenticated provider responses; webhook bodies never enter here.
export function normalizeOrder(data: unknown, account?: OrderAccount): PixPayment {
  const order = orderSchema.parse(data);
  const payment = order.transactions?.payments[0];
  const processing = !payment && ["created", "processing"].includes(order.status);
  if (!payment && !processing) throw new Error("Missing Pix transaction");
  if (payment && payment.amount !== order.total_amount) throw new Error("Inconsistent order amount");

  // Orders does not consistently expose live_mode. The Pix ticket returned by
  // its authenticated API distinguishes sandbox from production. Never assume
  // that the configured mode proves the mode of the remote transaction.
  const ticketMode = ticketLiveMode(payment?.payment_method.ticket_url);
  const sandboxOrder = /^ORDTST[A-Z0-9]{26}$/.test(order.id);
  if (sandboxOrder && (order.live_mode === true || ticketMode === true)) {
    throw new Error("Inconsistent sandbox order mode");
  }
  if (order.live_mode !== undefined && ticketMode !== undefined && order.live_mode !== ticketMode) {
    throw new Error("Inconsistent order mode");
  }
  // Accredited sandbox responses can omit both live_mode and the Pix ticket.
  // Only the authenticated ORDTST resource proves sandbox in that case; an
  // ordinary ORD identifier does not prove that a payment is live.
  const orderMode = order.live_mode ?? ticketMode ?? (sandboxOrder ? false : undefined);
  if (account && account.collectorId !== order.user_id) throw new Error("Order account mismatch");
  if (account && orderMode !== undefined && orderMode !== account.liveMode) throw new Error("Order account mode mismatch");
  // Real Orders GETs can omit both live_mode and ticket_url as well. In that
  // case use the authenticated seller, bound to order.user_id, never Env flags
  // or webhook fields. Missing/malformed seller data still fails closed.
  const liveMode = orderMode ?? account?.liveMode;
  if (liveMode === undefined && !processing) throw new OrderModeUnavailableError();

  const statuses = [order.status, payment?.status];
  const details = [order.status_detail, payment?.status_detail];
  const refundedCents = Math.max(payment?.refunded_amount ?? 0,
    (order.transactions?.refunds ?? []).filter((refund) => refund.transaction_id === payment?.id &&
      ["processed", "approved"].includes(refund.status)).reduce((sum, refund) => sum + refund.amount, 0));
  let normalizedStatus = processing ? "processing" : "pending";
  if (refundedCents > 0 || statuses.includes("refunded") || statuses.includes("charged_back") || details.includes("partially_refunded")) {
    normalizedStatus = "refunded";
  } else if (statuses.includes("expired")) {
    normalizedStatus = "cancelled";
  } else if (statuses.includes("canceled")) {
    normalizedStatus = "cancelled";
  } else if (statuses.includes("failed")) {
    normalizedStatus = "rejected";
  } else if (order.status === "processed" && order.status_detail === "accredited" &&
    payment?.status === "processed" && payment.status_detail === "accredited") {
    if (order.total_paid_amount !== order.total_amount || payment.paid_amount !== order.total_amount) {
      throw new Error("Order was not fully paid");
    }
    normalizedStatus = "approved";
  }
  return {
    id: order.id,
    collector_id: order.user_id,
    external_reference: order.external_reference,
    live_mode: liveMode ?? null,
    payment_method_id: payment ? "pix" : null,
    currency_id: "BRL", // Only Brazilian online Pix orders pass the schema above.
    transaction_amount: order.total_amount / 100,
    transaction_amount_refunded: refundedCents / 100,
    status: normalizedStatus,
    status_detail: statuses.includes("expired") ? "expired" : order.status_detail,
    date_last_updated: order.last_updated_date,
    // Orders has no date_approved. Record the provider update that confirms
    // accreditation; service.ts preserves it on subsequent notifications.
    date_approved: normalizedStatus === "approved" ? order.last_updated_date : null,
    date_of_expiration: payment?.date_of_expiration ?? new Date(Date.parse(order.created_date) + PIX_EXPIRATION_MS).toISOString(),
    point_of_interaction: { transaction_data: {
      qr_code: payment?.payment_method.qr_code,
      qr_code_base64: payment?.payment_method.qr_code_base64,
    } },
  };
}
