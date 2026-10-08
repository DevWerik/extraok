import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { notFound, unauthorized } from "../../lib/errors.js";
import { parseWith } from "../../lib/validation.js";
import { fullNameSchema } from "../../lib/person-name.js";
import { currentUser, requireAuth } from "../../plugins/auth.js";
import { BILLING_PLANS, validCpf } from "./plans.js";
import { validWebhookSignature, type PixGateway } from "./mercadopago.js";
import { providerResourceIdPattern } from "./orders.js";
import { deviceIdPattern, PaymentRetryLaterError } from "./payment-risk.js";
import { applyVerifiedPayment, billingSummary, createPayment, reconcilePayments, requireBilling, requirePaymentPurchase, serializePayment, synchronizePayment } from "./service.js";
import { registerStripeWebhook } from "./stripe-webhook.js";

const purchaseSchema = z.object({
  planId: z.enum(["pro", "business"]),
  cpf: z.string().max(18).transform((value) => value.replace(/[.\-\s]/g, "")).refine(validCpf, "Informe um CPF válido para gerar o Pix.").optional(),
  idempotencyKey: z.string().uuid(),
  // Optional for older clients/attempts; new checkout sends reviewed payer data.
  payerName: fullNameSchema.optional(),
  deviceId: z.string().regex(deviceIdPattern).optional(),
}).strict();
const idSchema = z.object({ id: z.string().uuid() });
const notificationSchema = z.object({ "data.id": z.string().regex(providerResourceIdPattern) });

export async function registerBillingRoutes(app: FastifyInstance, gateway: PixGateway, options: { reconciliationEnabled?: boolean } = {}) {
  app.get("/billing/plans", async (_request, reply) => {
    reply.header("Cache-Control", "no-store");
    return { plans: BILLING_PLANS, pixAvailable: app.env.BILLING_ENABLED, paymentProvider: app.env.BILLING_PROVIDER };
  });
  app.get("/billing", { preHandler: requireAuth }, async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    return billingSummary(app, currentUser(request).id);
  });
  app.post("/billing/payments", { preHandler: requireAuth, config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    requirePaymentPurchase(app, currentUser(request).id);
    const input = parseWith(purchaseSchema, request.body);
    try {
      return reply.status(201).send(await createPayment(app, gateway, currentUser(request), input));
    } catch (error) {
      if (error instanceof PaymentRetryLaterError) reply.header("Retry-After", error.retryAfterSeconds);
      throw error;
    }
  });
  app.get("/billing/payments/:id", { preHandler: requireAuth, config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const { id } = parseWith(idSchema, request.params);
    const payment = await app.prisma.billingPayment.findFirst({ where: { id, ownerId: currentUser(request).id } });
    if (!payment) throw notFound("Cobrança não encontrada.");
    if (app.env.BILLING_ENABLED && ["creating", "pending", "expired"].includes(payment.status) &&
      (!payment.lastCheckedAt || payment.lastCheckedAt.getTime() < Date.now() - 10_000)) {
      return serializePayment(await synchronizePayment(app, gateway, payment));
    }
    return serializePayment(payment);
  });
  app.post("/billing/webhooks/mercadopago", { config: { rateLimit: { max: 180, timeWindow: "1 minute" } } }, async (request, reply) => {
    requireBilling(app);
    if (!app.env.MERCADOPAGO_WEBHOOK_SECRET) throw unauthorized("Notificação inválida.");
    const query = parseWith(notificationSchema, request.query);
    const signature = request.headers["x-signature"];
    const requestId = request.headers["x-request-id"];
    if (!validWebhookSignature(app.env.MERCADOPAGO_WEBHOOK_SECRET!, typeof signature === "string" ? signature : undefined,
      typeof requestId === "string" ? requestId : undefined, query["data.id"])) throw unauthorized("Notificação inválida.");
    const remote = await gateway.get(query["data.id"]);
    if (remote.id.toLowerCase() !== query["data.id"].toLowerCase()) throw unauthorized("Notificação inválida.");
    await applyVerifiedPayment(app, remote);
    return reply.status(200).send({ received: true });
  });

  await registerStripeWebhook(app, gateway);

  if (app.env.BILLING_ENABLED && options.reconciliationEnabled !== false) {
    let running: Promise<void> | undefined;
    const tick = () => {
      if (running) return;
      running = reconcilePayments(app, gateway)
        .catch(() => { app.log.warn("Pix reconciliation unavailable; retry scheduled"); })
        .finally(() => { running = undefined; });
    };
    const timer = setInterval(tick, 60_000);
    timer.unref();
    app.addHook("onReady", async () => { tick(); });
    app.addHook("onClose", async () => { clearInterval(timer); await running; });
  }
}
