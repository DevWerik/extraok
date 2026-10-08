import type { Env } from "../../config/env.js";
import { createPixGateway, type PixGateway } from "./mercadopago.js";
import { createStripeGateway, stripeSessionIdPattern } from "./stripe.js";

// Dispatch by persisted provider, never by the currently selected provider.
// Switching new purchases to Stripe must not reinterpret old Mercado Pago Pix.
export function createBillingGateway(env: Env, transport: typeof fetch = fetch): PixGateway {
  const mercadoPago = createPixGateway(env, transport);
  const stripe = createStripeGateway(env, transport);
  return {
    create: (payment) => (payment.providerApi === "stripe" ? stripe : mercadoPago).create(payment),
    get: (id) => (stripeSessionIdPattern.test(id) ? stripe : mercadoPago).get(id),
  };
}
