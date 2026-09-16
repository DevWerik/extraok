import type { Prisma } from "../../generated/prisma/client.js";
import type { Env } from "../../config/env.js";
import { AppError } from "../../lib/errors.js";
import { BILLING_PLANS, freeMonthWindow, planFeatures, type PlanFeature } from "./plans.js";

type BillingOwnerConfig = Pick<Env, "BILLING_OWNER_USER_ID">;

export function isBillingOwner(ownerId: string, env: BillingOwnerConfig): boolean {
  return Boolean(env.BILLING_OWNER_USER_ID && env.BILLING_OWNER_USER_ID === ownerId);
}

export async function lockBilling(transaction: Prisma.TransactionClient, ownerId: string) {
  await transaction.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`billing:${ownerId}`}, 0))::text`;
}

function activePeriod(transaction: Prisma.TransactionClient, ownerId: string, now: Date) {
  return transaction.billingPeriod.findFirst({
    where: { ownerId, revokedAt: null, startsAt: { lte: now }, endsAt: { gt: now } },
    orderBy: { startsAt: "desc" },
  });
}

export async function requirePlanFeature(transaction: Prisma.TransactionClient, ownerId: string, feature: PlanFeature, env: BillingOwnerConfig) {
  if (isBillingOwner(ownerId, env)) return;
  const period = await activePeriod(transaction, ownerId, new Date());
  if (!planFeatures(period?.plan ?? "free")[feature]) {
    const minimum = feature === "pdfExport" ? "Pro ou Negócio" : "Negócio";
    throw new AppError(403, "PLAN_FEATURE_REQUIRED", `Este recurso exige um plano ${minimum} ativo. Consulte Meu plano.`);
  }
}

export async function readEntitlement(transaction: Prisma.TransactionClient, ownerId: string, env: BillingOwnerConfig, now = new Date()) {
  if (isBillingOwner(ownerId, env)) {
    return {
      billingExempt: true as const, planId: "business" as const, features: planFeatures("business"),
      periodId: null, freeMonth: null, startsAt: null, endsAt: null, limit: null, remaining: null,
      used: await transaction.approvalUsage.count({ where: { ownerId } }),
    };
  }
  const period = await activePeriod(transaction, ownerId, now);
  const month = freeMonthWindow(now);
  const used = await transaction.approvalUsage.count({
    where: period ? { ownerId, periodId: period.id } : { ownerId, periodId: null, freeMonth: month.key },
  });
  const limit = period?.jobLimit ?? BILLING_PLANS[0].jobLimit;
  return {
    billingExempt: false as const,
    planId: period?.plan ?? "free",
    features: planFeatures(period?.plan ?? "free"),
    periodId: period?.id ?? null,
    startsAt: period?.startsAt ?? month.startsAt,
    endsAt: period?.endsAt ?? month.endsAt,
    limit, used, remaining: Math.max(0, limit - used),
    freeMonth: period ? null : month.key,
  };
}

// Caller holds the per-owner lock and commits this together with link rotation.
export async function consumeApproval(transaction: Prisma.TransactionClient, ownerId: string, jobId: string, env: BillingOwnerConfig) {
  const previous = await transaction.approvalUsage.findUnique({ where: { jobId } });
  if (previous) return;
  const access = await readEntitlement(transaction, ownerId, env);
  if (access.remaining === 0) {
    throw new AppError(402, "PLAN_LIMIT_REACHED", "Você atingiu o limite de atendimentos com link deste período. Consulte Meu plano para continuar.");
  }
  await transaction.approvalUsage.create({
    data: { jobId, ownerId, periodId: access.periodId, freeMonth: access.freeMonth },
  });
}
