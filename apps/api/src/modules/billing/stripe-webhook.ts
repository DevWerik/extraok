import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { unauthorized } from "../../lib/errors.js";
import { PixGatewayError, type PixGateway } from "./mercadopago.js";
import { applyVerifiedPayment, requireBilling } from "./service.js";
import { STRIPE_API_VERSION, stripeSessionIdPattern, validStripeSignature } from "./stripe.js";

const eventSchema = z.object({
  id: z.string().regex(/^evt_[A-Za-z0-9]+$/), type: z.string(), livemode: z.boolean(),
  account: z.string().optional(),
  data: z.object({ object: z.object({ id: z.string(), payment_intent: z.string().nullable().optional(),
    metadata: z.object({ extraok_payment_id: z.string().optional() }).nullish() }) }),
});
const sessionEvents = new Set(["checkout.session.completed", "checkout.session.async_payment_succeeded", "checkout.session.async_payment_failed", "checkout.session.expired"]);
const chargeEvents = new Set(["charge.refunded", "charge.dispute.created", "charge.dispute.closed"]);

export async function registerStripeWebhook(app: FastifyInstance, gateway: PixGateway) {
  // Encapsulation preserves JSON parsing for every other API route.
  await app.register(async (scope) => {
    scope.removeContentTypeParser("application/json");
    scope.addContentTypeParser("application/json", { parseAs: "buffer" }, (_request, body, done) => done(null, body));
    scope.post("/billing/webhooks/stripe", { config: { rateLimit: { max: 180, timeWindow: "1 minute" } } }, async (request, reply) => {
      requireBilling(app);
      if (!Buffer.isBuffer(request.body) || !validStripeSignature(request.body, request.headers["stripe-signature"], app.env.STRIPE_WEBHOOK_SECRET)) {
        throw unauthorized("Notificação inválida.");
      }
      let event: z.infer<typeof eventSchema>;
      try { event = eventSchema.parse(JSON.parse(request.body.toString("utf8"))); }
      catch { throw unauthorized("Notificação inválida."); }
      if (event.livemode !== app.env.STRIPE_LIVE_MODE || (event.account && event.account !== app.env.STRIPE_ACCOUNT_ID)) {
        throw unauthorized("Notificação inválida.");
      }
      let sessionId: string | undefined;
      if (sessionEvents.has(event.type)) {
        // Events from other products in the same Stripe account are unrelated.
        if (!event.data.object.metadata?.extraok_payment_id) return reply.send({ received: true });
        sessionId = event.data.object.id;
        if (!stripeSessionIdPattern.test(sessionId)) throw unauthorized("Notificação inválida.");
      } else if (chargeEvents.has(event.type)) {
        if (!app.env.STRIPE_SECRET_KEY) throw new PixGatewayError();
        const intentId = event.data.object.payment_intent;
        if (!intentId || !/^pi_[A-Za-z0-9]{8,240}$/.test(intentId)) throw unauthorized("Notificação inválida.");
        // A charge/dispute refers to a PaymentIntent, not a Checkout Session.
        // Read only its server-owned reference, then refetch the saved session.
        let reference: string | undefined;
        try {
          const response = await fetch(`https://api.stripe.com/v1/payment_intents/${intentId}`, {
            headers: { Authorization: `Bearer ${app.env.STRIPE_SECRET_KEY}`, "Stripe-Version": STRIPE_API_VERSION },
            signal: AbortSignal.timeout(8_000), redirect: "error",
          });
          if (!response.ok) throw new PixGatewayError();
          const intent = z.object({ id: z.literal(intentId), livemode: z.boolean(), metadata: z.object({ extraok_payment_id: z.string().uuid().optional() }) }).parse(await response.json());
          if (intent.livemode !== app.env.STRIPE_LIVE_MODE) throw new PixGatewayError();
          reference = intent.metadata.extraok_payment_id;
        } catch { throw new PixGatewayError(); }
        if (reference) {
          const payment = await app.prisma.billingPayment.findUnique({ where: { id: reference } });
          if (payment?.providerApi === "stripe") {
            if (!payment.providerId) throw new PixGatewayError();
            sessionId = payment.providerId;
          }
        }
      }
      if (sessionId) {
        const remote = await gateway.get(sessionId);
        if (remote.providerApi !== "stripe" || remote.id !== sessionId) throw new PixGatewayError();
        await applyVerifiedPayment(app, remote);
      }
      // Duplicate events re-read provider state; the existing transaction/unique
      // payment period constraint prevents duplicate grants and stale regressions.
      return reply.header("Cache-Control", "no-store").send({ received: true });
    });
  });
}
