import type { Prisma } from "../../generated/prisma/client.js";
import { AppError } from "../../lib/errors.js";
import { BILLING_PLANS, freeMonthWindow } from "./plans.js";

export async function lockBilling(transaction: Prisma.TransactionClient, ownerId: string) {
  await transaction.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`billing:${ownerId}`}, 0))::text`;
}

export async function readEntitlement(transaction: Prisma.TransactionClient, ownerId: string, now = new Date()) {
  const period = await transaction.billingPeriod.findFirst({
    where: { ownerId, revokedAt: null, startsAt: { lte: now }, endsAt: { gt: now } },
    orderBy: { startsAt: "desc" },
  });
  const month = freeMonthWindow(now);
  const used = await transaction.approvalUsage.count({
    where: period ? { ownerId, periodId: period.id } : { ownerId, periodId: null, freeMonth: month.key },
  });
  const limit = period?.jobLimit ?? BILLING_PLANS[0].jobLimit;
  return {
    planId: period?.plan ?? "free",
    periodId: period?.id ?? null,
    startsAt: period?.startsAt ?? month.startsAt,
    endsAt: period?.endsAt ?? month.endsAt,
    limit, used, remaining: Math.max(0, limit - used),
    freeMonth: period ? null : month.key,
  };
}

// Caller holds the per-owner lock and commits this together with link rotation.
export async function consumeApproval(transaction: Prisma.TransactionClient, ownerId: string, jobId: string) {
  const previous = await transaction.approvalUsage.findUnique({ where: { jobId } });
  if (previous) return;
  const access = await readEntitlement(transaction, ownerId);
  if (access.remaining === 0) {
    throw new AppError(402, "PLAN_LIMIT_REACHED", "Você atingiu o limite de atendimentos com link deste período. Consulte Meu plano para continuar.");
  }
  await transaction.approvalUsage.create({
    data: { jobId, ownerId, periodId: access.periodId, freeMonth: access.freeMonth },
  });
}
