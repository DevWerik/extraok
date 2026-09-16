import type { FastifyInstance } from "fastify";
import type { BillingPayment, BillingPaymentStatus } from "../../generated/prisma/client.js";
import { AppError, conflict, notFound } from "../../lib/errors.js";
import type { AuthUser } from "../../types/fastify.js";
import { isBillingOwner, lockBilling, readEntitlement } from "./entitlements.js";
import { BILLING_PLANS, paidPlan, PAID_PERIOD_MS, PIX_EXPIRATION_MS, type PaidPlan } from "./plans.js";
import { PixGatewayError, type PixGateway, type PixPayment } from "./mercadopago.js";

export function requireBilling(app: FastifyInstance) {
  if (!app.env.BILLING_ENABLED) {
    throw new AppError(503, "PAYMENT_UNAVAILABLE", "O pagamento por Pix está temporariamente indisponível. Seu plano atual continua disponível.");
  }
}

export function requirePaymentPurchase(app: FastifyInstance, ownerId: string) {
  if (isBillingOwner(ownerId, app.env)) {
    throw new AppError(409, "BILLING_EXEMPT", "Sua conta de proprietário já tem acesso completo, sem cobrança.");
  }
  requireBilling(app);
}

export function serializePayment(payment: BillingPayment) {
  const pending = payment.status === "creating" || payment.status === "pending";
  const expired = pending && payment.expiresAt.getTime() <= Date.now();
  return {
    id: payment.id, planId: payment.plan, priceCents: payment.priceCents,
    status: expired ? "expired" as const : payment.status,
    createdAt: payment.createdAt, approvedAt: payment.approvedAt, expiresAt: payment.expiresAt,
    qrCode: pending && !expired ? payment.qrCode : null,
    qrCodeBase64: pending && !expired ? payment.qrCodeBase64 : null,
  };
}

export async function billingSummary(app: FastifyInstance, ownerId: string) {
  return app.prisma.$transaction(async (transaction) => {
    await lockBilling(transaction, ownerId);
    const now = new Date();
    const current = await readEntitlement(transaction, ownerId, app.env, now);
    const upcoming = await transaction.billingPeriod.findMany({
      where: { ownerId, revokedAt: null, startsAt: { gt: now } },
      select: { id: true, plan: true, startsAt: true, endsAt: true, jobLimit: true },
      orderBy: { startsAt: "asc" },
    });
    const payments = await transaction.billingPayment.findMany({ where: { ownerId }, orderBy: { createdAt: "desc" }, take: 20 });
    return {
      plans: BILLING_PLANS, pixAvailable: app.env.BILLING_ENABLED,
      current: { billingExempt: current.billingExempt, planId: current.planId, features: current.features, startsAt: current.startsAt, endsAt: current.endsAt, limit: current.limit, used: current.used, remaining: current.remaining },
      upcoming,
      nextPurchaseStartsAt: current.billingExempt ? null : upcoming.at(-1)?.endsAt ?? (current.planId === "free" ? now : current.endsAt),
      payments: payments.map(serializePayment),
    };
  });
}

export function verifiedPaymentStatus(payment: PixPayment): BillingPaymentStatus {
  if (payment.transaction_amount_refunded > 0 || payment.status === "refunded" || payment.status === "charged_back") return "refunded";
  if (payment.status === "approved") return "approved";
  if (payment.status === "rejected") return "rejected";
  if (payment.status === "cancelled") return payment.status_detail?.includes("expired") ? "expired" : "cancelled";
  return "pending";
}

export async function applyVerifiedPayment(app: FastifyInstance, remote: PixPayment, expectedId?: string) {
  // The reference is trusted only after an authenticated server-to-server GET/POST.
  if (expectedId && remote.external_reference !== expectedId) throw new PixGatewayError();
  if (!remote.external_reference || !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(remote.external_reference)) return null;
  const payment = await app.prisma.billingPayment.findUnique({ where: { id: remote.external_reference } });
  if (!payment) return null; // Other sales on the same merchant account are unrelated.
  const cents = remote.transaction_amount * 100;
  if ((expectedId && payment.id !== expectedId) ||
    (payment.providerId && payment.providerId !== remote.id) ||
    remote.collector_id !== app.env.MERCADOPAGO_COLLECTOR_ID ||
    remote.live_mode !== app.env.MERCADOPAGO_LIVE_MODE || remote.payment_method_id !== "pix" ||
    remote.currency_id !== "BRL" || Math.abs(cents - payment.priceCents) > 0.000001) {
    throw new AppError(409, "PAYMENT_MISMATCH", "A cobrança não corresponde ao plano solicitado. Entre em contato com o suporte.");
  }
  const remoteStatus = verifiedPaymentStatus(remote);
  if (remoteStatus === "approved" && !remote.date_approved) throw new PixGatewayError();
  const providerUpdatedAt = new Date(remote.date_last_updated);
  return app.prisma.$transaction(async (transaction) => {
    await lockBilling(transaction, payment.ownerId);
    const current = await transaction.billingPayment.findUniqueOrThrow({ where: { id: payment.id } });
    const expired = new Date(remote.date_of_expiration ?? current.expiresAt).getTime() <= Date.now();
    const status = remoteStatus === "pending"
      ? (["expired", "cancelled", "rejected"].includes(current.status) ? current.status : expired ? "expired" : "pending")
      : remoteStatus;
    if (current.providerId && current.providerId !== remote.id) throw new PixGatewayError();
    // Concurrent HTTP responses and out-of-order notifications must not regress state.
    if ((current.providerUpdatedAt && current.providerUpdatedAt > providerUpdatedAt) ||
      (current.status === "refunded" && status !== "refunded") ||
      (current.status === "approved" && status !== "approved" && status !== "refunded")) return current;
    const now = new Date();
    const pix = remote.point_of_interaction?.transaction_data;
    const updated = await transaction.billingPayment.update({
      where: { id: current.id },
      data: {
        providerId: remote.id, status, providerUpdatedAt, lastCheckedAt: now,
        payerDocument: null,
        approvedAt: remote.date_approved ? new Date(remote.date_approved) : current.approvedAt,
        qrCode: status === "pending" ? pix?.qr_code ?? current.qrCode : null,
        qrCodeBase64: status === "pending" ? pix?.qr_code_base64 ?? current.qrCodeBase64 : null,
        ...(remote.date_of_expiration ? { expiresAt: new Date(remote.date_of_expiration) } : {}),
      },
    });
    if (status === "approved") {
      const existing = await transaction.billingPeriod.findUnique({ where: { paymentId: current.id } });
      if (!existing) {
        const last = await transaction.billingPeriod.findFirst({
          where: { ownerId: current.ownerId, revokedAt: null, endsAt: { gt: now } },
          orderBy: { endsAt: "desc" },
        });
        const startsAt = last?.endsAt ?? now;
        await transaction.billingPeriod.create({
          data: {
            ownerId: current.ownerId, paymentId: current.id, plan: current.plan, jobLimit: current.jobLimit,
            startsAt, endsAt: new Date(startsAt.getTime() + PAID_PERIOD_MS),
          },
        });
      }
    } else if (status === "refunded") {
      await transaction.billingPeriod.updateMany({ where: { paymentId: current.id, revokedAt: null }, data: { revokedAt: now } });
    }
    return updated;
  });
}

export async function synchronizePayment(app: FastifyInstance, gateway: PixGateway, payment: BillingPayment) {
  await app.prisma.billingPayment.update({ where: { id: payment.id }, data: { lastCheckedAt: new Date() } });
  if (!payment.providerId && payment.expiresAt.getTime() <= Date.now()) {
    // No QR was shown. A later verified webhook can still recover a paid charge.
    return app.prisma.billingPayment.updateMany({
      where: { id: payment.id, providerId: null, status: "creating" },
      data: { status: "expired", payerDocument: null },
    }).then(() => app.prisma.billingPayment.findUniqueOrThrow({ where: { id: payment.id } }));
  }
  const remote = payment.providerId ? await gateway.get(payment.providerId) : await gateway.create(payment);
  return await applyVerifiedPayment(app, remote, payment.id) ?? payment;
}

export async function createPayment(app: FastifyInstance, gateway: PixGateway, user: AuthUser,
  input: { planId: PaidPlan; cpf: string; idempotencyKey: string }) {
  requirePaymentPurchase(app, user.id);
  const plan = paidPlan(input.planId);
  const payment = await app.prisma.$transaction(async (transaction) => {
    await lockBilling(transaction, user.id);
    const replay = await transaction.billingPayment.findUnique({ where: { id: input.idempotencyKey } });
    if (replay) {
      if (replay.ownerId !== user.id) throw notFound();
      if (replay.plan !== input.planId) throw conflict("Esta tentativa já pertence a outro plano.");
      return replay;
    }
    const now = new Date();
    await transaction.billingPayment.updateMany({
      where: { ownerId: user.id, status: { in: ["creating", "pending"] }, expiresAt: { lte: now } },
      data: { status: "expired", payerDocument: null, qrCode: null, qrCodeBase64: null },
    });
    const pending = await transaction.billingPayment.findFirst({ where: { ownerId: user.id, status: { in: ["creating", "pending"] } } });
    if (pending) {
      if (pending.plan !== input.planId) throw conflict("Você já possui um Pix pendente. Conclua o pagamento ou aguarde a validade para escolher outro plano.");
      return pending;
    }
    return transaction.billingPayment.create({
      data: {
        id: input.idempotencyKey, ownerId: user.id, plan: input.planId, priceCents: plan.priceCents, jobLimit: plan.jobLimit,
        payerEmail: user.email, payerName: user.name, payerDocument: input.cpf,
        expiresAt: new Date(now.getTime() + PIX_EXPIRATION_MS),
      },
    });
  });
  if (payment.status !== "creating" && payment.status !== "pending") return serializePayment(payment);
  const updated = await synchronizePayment(app, gateway, payment);
  if (updated.status === "pending" && (!updated.qrCode || !updated.qrCodeBase64)) throw new PixGatewayError();
  return serializePayment(updated);
}

export async function reconcilePayments(app: FastifyInstance, gateway: PixGateway) {
  const now = new Date();
  const candidates = await app.prisma.billingPayment.findMany({
    where: {
      AND: [
        { OR: [{ lastCheckedAt: null }, { lastCheckedAt: { lt: new Date(now.getTime() - 60_000) } }] },
        { OR: [
          { status: { in: ["creating", "pending"] } },
          { status: "expired", providerId: { not: null }, createdAt: { gt: new Date(now.getTime() - 7 * 86_400_000) } },
          { status: "approved", period: { is: { endsAt: { gt: now }, revokedAt: null } }, lastCheckedAt: { lt: new Date(now.getTime() - 3_600_000) } },
        ] },
      ],
    },
    orderBy: { lastCheckedAt: { sort: "asc", nulls: "first" } }, take: 5,
  });
  for (const payment of candidates) {
    try { await synchronizePayment(app, gateway, payment); }
    catch { app.log.warn({ paymentId: payment.id }, "Pix reconciliation will be retried"); }
  }
}
