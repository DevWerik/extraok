import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { Env } from "../../config/env.js";
import type { BillingPayment } from "../../generated/prisma/client.js";
import { AppError } from "../../lib/errors.js";

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

export type PixPayment = z.infer<typeof paymentSchema>;
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
  async function request(path: string, options: RequestInit): Promise<PixPayment> {
    try {
      const response = await transport(`https://api.mercadopago.com/v1/payments${path}`, {
        ...options,
        headers: { Authorization: `Bearer ${env.MERCADOPAGO_ACCESS_TOKEN}`, "Content-Type": "application/json", ...options.headers },
        signal: AbortSignal.timeout(8_000),
        redirect: "error",
      });
      if (!response.ok) throw new PixGatewayError();
      return paymentSchema.parse(await response.json());
    } catch {
      // Never expose provider bodies, credentials, CPF or transport errors.
      throw new PixGatewayError();
    }
  }
  return {
    create(payment) {
      const [firstName, ...rest] = payment.payerName.trim().split(/\s+/);
      return request("", {
        method: "POST",
        headers: { "X-Idempotency-Key": payment.id },
        body: JSON.stringify({
          transaction_amount: payment.priceCents / 100,
          description: `ExtraOK ${payment.plan === "pro" ? "Pro" : "Negócio"} - 30 dias`,
          payment_method_id: "pix",
          external_reference: payment.id,
          notification_url: env.MERCADOPAGO_WEBHOOK_URL,
          date_of_expiration: payment.expiresAt.toISOString(),
          payer: {
            email: payment.payerEmail,
            first_name: firstName,
            last_name: rest.join(" ") || firstName,
            identification: { type: "CPF", number: payment.payerDocument },
          },
        }),
      });
    },
    get(id) {
      if (!/^\d{1,64}$/.test(id)) throw new PixGatewayError();
      return request(`/${id}`, { method: "GET" });
    },
  };
}

export function validWebhookSignature(secret: string, signature: string | undefined, requestId: string | undefined, dataId: string): boolean {
  if (!signature || signature.length > 512 || !requestId || !/^[\w-]{1,128}$/.test(requestId) || !/^\d{1,64}$/.test(dataId)) return false;
  const parts = signature.split(",").map((part) => part.trim().split("="));
  const timestamps = parts.filter(([key]) => key === "ts");
  const signatures = parts.filter(([key]) => key === "v1");
  const timestamp = timestamps[0]?.[1];
  if (timestamps.length !== 1 || signatures.length !== 1 || !/^\d{10,13}$/.test(timestamp ?? "")) return false;
  const supplied = signatures[0]?.[1] ?? "";
  if (!/^[a-fA-F0-9]{64}$/.test(supplied)) return false;
  const expected = createHmac("sha256", secret).update(`id:${dataId};request-id:${requestId};ts:${timestamp};`).digest();
  // Redelivery can be delayed. Replays are harmless: we fetch the current payment
  // from the provider and grant at most one period per payment in a transaction.
  return timingSafeEqual(expected, Buffer.from(supplied, "hex"));
}
