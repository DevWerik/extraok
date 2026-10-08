import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { Env } from "../../config/env.js";
import type { BillingPayment } from "../../generated/prisma/client.js";
import { AppError } from "../../lib/errors.js";
import { fullNameSchema } from "../../lib/person-name.js";
import { deviceIdPattern } from "./payment-risk.js";
import { normalizeOrder, normalizeOrderAccount, OrderModeUnavailableError, orderIdPattern, providerResourceIdPattern } from "./orders.js";

const providerId = z.union([z.string().regex(/^\d{1,64}$/), z.number().int().positive().max(Number.MAX_SAFE_INTEGER)]).transform(String);
const date = z.string().refine((value) => Number.isFinite(Date.parse(value)));
const paymentSchema = z.object({
  id: providerId,
  collector_id: providerId,
  external_reference: z.string().nullish(),
  live_mode: z.boolean(),
  payment_method_id: z.string(),
  currency_id: z.string(),
  transaction_amount: z.number().finite().positive(),
  transaction_amount_refunded: z.number().finite().nonnegative().optional().default(0),
  status: z.string(),
  status_detail: z.string().optional(),
  date_last_updated: date,
  date_approved: date.nullish(),
  date_of_expiration: date.nullish(),
  point_of_interaction: z.object({
    transaction_data: z.object({
      qr_code: z.string().max(10_000).nullish(),
      qr_code_base64: z.string().max(200_000).regex(/^[A-Za-z0-9+/=\r\n]*$/).nullish(),
    }).nullish(),
  }).nullish(),
});

export type PixPayment = Omit<z.infer<typeof paymentSchema>, "live_mode" | "payment_method_id"> & {
  providerApi?: "stripe";
  checkoutUrl?: string | null;
  // Null is allowed only while Orders is still creating its Pix transaction.
  live_mode: boolean | null;
  payment_method_id: string | null;
};
export interface PixGateway {
  create(payment: BillingPayment): Promise<PixPayment>;
  get(id: string): Promise<PixPayment>;
}

export class PixGatewayError extends AppError {
  constructor() {
    super(503, "PAYMENT_UNAVAILABLE", "Não foi possível confirmar a cobrança agora. Tente novamente em instantes; uma tentativa repetida reutiliza o mesmo Pix.");
  }
}

export function createPixGateway(env: Env, transport: typeof fetch = fetch): PixGateway {
  async function request(path: string, options: RequestInit): Promise<unknown> {
    try {
      const response = await transport(`https://api.mercadopago.com${path}`, {
        ...options,
        headers: { Authorization: `Bearer ${env.MERCADOPAGO_ACCESS_TOKEN}`, "Content-Type": "application/json", ...options.headers },
        signal: AbortSignal.timeout(8_000),
        redirect: "error",
      });
      // Orders documents HTTP 402 as an order created with a failed transaction.
      // Extract only its ID, then GET the resource and verify the full contract.
      // Never infer rejection or grant access from an error body alone.
      if (response.status === 402 && path === "/v1/orders" && options.method === "POST") {
        return z.object({ id: z.string().regex(orderIdPattern) }).parse(await response.json());
      }
      if (!response.ok) throw new PixGatewayError();
      return await response.json();
    } catch {
      // Never expose provider bodies, credentials, CPF or transport errors.
      throw new PixGatewayError();
    }
  }
  async function readOrder(id: string): Promise<PixPayment> {
    const data = await request(`/v1/orders/${id}`, { method: "GET" });
    let remote: PixPayment;
    try {
      remote = normalizeOrder(data);
    } catch (error) {
      if (!(error instanceof OrderModeUnavailableError)) throw error;
      const account = normalizeOrderAccount(await request("/users/me", { method: "GET" }));
      remote = normalizeOrder(data, account);
    }
    if (remote.id !== id) throw new PixGatewayError();
    return remote;
  }
  return {
    async create(payment) {
      const name = fullNameSchema.safeParse(payment.payerName);
      if (!name.success) throw new AppError(400, "PAYER_DATA_REQUIRED", "Confira o nome completo do pagador antes de gerar o Pix.");
      if (payment.payerDeviceId && !deviceIdPattern.test(payment.payerDeviceId)) {
        throw new AppError(400, "PAYER_DATA_REQUIRED", "Não foi possível preparar o pagamento. Atualize a página e tente novamente.");
      }
      const [firstName, ...rest] = name.data.split(" ");
      const headers = {
        "X-Idempotency-Key": payment.id,
        ...(payment.payerDeviceId ? { "X-meli-session-id": payment.payerDeviceId } : {}),
      };
      const payer = {
        email: payment.payerEmail, first_name: firstName, last_name: rest.join(" "),
        identification: { type: "CPF", number: payment.payerDocument },
      };
      try {
        if (payment.providerApi !== "payments") {
          const amount = (payment.priceCents / 100).toFixed(2);
          const created = z.object({ id: z.string().regex(orderIdPattern) }).parse(await request("/v1/orders", {
            method: "POST",
            headers,
            body: JSON.stringify({
              type: "online", processing_mode: "automatic", total_amount: amount,
              external_reference: payment.id,
              description: `ExtraOK ${payment.plan === "pro" ? "Pro" : "Negócio"} - 30 dias`,
              payer,
              transactions: { payments: [{ amount, payment_method: { id: "pix", type: "bank_transfer" }, expiration_time: "PT30M" }] },
            }),
          }));
          // Creation may return only partial/asynchronous data. Fetch the same
          // order for verification; a lost response reuses the persisted key.
          return await readOrder(created.id.toUpperCase());
        }
        // Only attempts persisted before migration 0004 may use Payments POST.
        return paymentSchema.parse(await request("/v1/payments", {
          method: "POST",
          headers,
          body: JSON.stringify({
            transaction_amount: payment.priceCents / 100,
            description: `ExtraOK ${payment.plan === "pro" ? "Pro" : "Negócio"} - 30 dias`,
            payment_method_id: "pix",
            external_reference: payment.id,
            notification_url: env.MERCADOPAGO_WEBHOOK_URL,
            date_of_expiration: payment.expiresAt.toISOString(),
            payer,
          }),
        }));
      } catch { throw new PixGatewayError(); }
    },
    async get(id) {
      try {
        if (orderIdPattern.test(id)) return await readOrder(id.toUpperCase());
        if (!/^\d{1,64}$/.test(id)) throw new PixGatewayError();
        const payment = paymentSchema.parse(await request(`/v1/payments/${id}`, { method: "GET" }));
        if (payment.id !== id) throw new PixGatewayError();
        return payment;
      } catch { throw new PixGatewayError(); }
    },
  };
}

export function validWebhookSignature(secret: string, signature: string | undefined, requestId: string | undefined, dataId: string): boolean {
  if (!signature || signature.length > 512 || !requestId || !/^[\w-]{1,128}$/.test(requestId) || !providerResourceIdPattern.test(dataId)) return false;
  const parts = signature.split(",").map((part) => part.trim().split("="));
  const timestamps = parts.filter(([key]) => key === "ts");
  const signatures = parts.filter(([key]) => key === "v1");
  const timestamp = timestamps[0]?.[1];
  if (timestamps.length !== 1 || signatures.length !== 1 || !/^\d{10,13}$/.test(timestamp ?? "")) return false;
  const supplied = signatures[0]?.[1] ?? "";
  if (!/^[a-fA-F0-9]{64}$/.test(supplied)) return false;
  const expected = createHmac("sha256", secret).update(`id:${dataId.toLowerCase()};request-id:${requestId};ts:${timestamp};`).digest();
  // Redelivery can be delayed. Replays are harmless: we fetch the current payment
  // from the provider and grant at most one period per payment in a transaction.
  if (timingSafeEqual(expected, Buffer.from(supplied, "hex"))) return true;
  // The current official SDK preserves data.id case; older instructions use
  // lowercase alphanumeric IDs. Both bind the same canonical ORD resource.
  if (dataId === dataId.toLowerCase()) return false;
  const originalCase = createHmac("sha256", secret).update(`id:${dataId};request-id:${requestId};ts:${timestamp};`).digest();
  return timingSafeEqual(originalCase, Buffer.from(supplied, "hex"));
}
