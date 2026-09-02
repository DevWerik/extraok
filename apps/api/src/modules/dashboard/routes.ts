import type { FastifyInstance } from "fastify";

import { currentUser, requireAuth } from "../../plugins/auth.js";

const BUSINESS_TIME_ZONE = "America/Sao_Paulo";
const yearMonthFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: BUSINESS_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
});

export function businessMonthKey(date: Date): string {
  const parts = yearMonthFormatter.formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;

  if (!year || !month) {
    throw new Error("Nao foi possivel calcular o mes do faturamento.");
  }

  return `${year}-${month}`;
}

function lastMonthKeys(count: number): string[] {
  const [currentYear, currentMonth] = businessMonthKey(new Date())
    .split("-")
    .map(Number);

  return Array.from({ length: count }, (_, index) => {
    const date = new Date(
      Date.UTC(
        currentYear ?? 2000,
        (currentMonth ?? 1) - 1 - (count - 1 - index),
        15,
        12,
      ),
    );
    return businessMonthKey(date);
  });
}

function monthLabel(month: string): string {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", {
    month: "short",
    timeZone: "UTC",
  })
    .format(new Date(Date.UTC(year ?? 2000, (monthNumber ?? 1) - 1, 1)))
    .replace(".", "");
}

export async function registerDashboardRoutes(
  app: FastifyInstance,
): Promise<void> {
  app.get(
    "/dashboard/summary",
    { preHandler: requireAuth },
    async (request) => {
      const user = currentUser(request);
      const ownerFilter = { job: { ownerId: user.id } } as const;
      const months = lastMonthKeys(5);
      const firstMonth = new Date(`${months[0]}-01T00:00:00.000Z`);

      const [
        revenue,
        approvedCount,
        rejectedCount,
        pendingCount,
        recentRevenue,
        recentJobs,
        awaitingResponse,
      ] = await Promise.all([
        app.prisma.extra.aggregate({
          where: { ...ownerFilter, status: "approved" },
          _sum: { priceCents: true },
        }),
        app.prisma.extra.count({
          where: { ...ownerFilter, status: "approved" },
        }),
        app.prisma.extra.count({
          where: { ...ownerFilter, status: "rejected" },
        }),
        app.prisma.extra.count({
          where: { ...ownerFilter, status: "pending" },
        }),
        app.prisma.extra.findMany({
          where: {
            ...ownerFilter,
            status: "approved",
            respondedAt: { gte: firstMonth },
          },
          select: { priceCents: true, respondedAt: true },
        }),
        app.prisma.job.findMany({
          where: { ownerId: user.id },
          include: { client: { select: { name: true } } },
          orderBy: { updatedAt: "desc" },
          take: 4,
        }),
        app.prisma.extra.findMany({
          where: { ...ownerFilter, status: "pending" },
          include: {
            job: {
              select: {
                title: true,
                client: { select: { name: true } },
              },
            },
          },
          orderBy: { createdAt: "asc" },
          take: 4,
        }),
      ]);

      const totalsByMonth = new Map(months.map((month) => [month, 0]));
      for (const extra of recentRevenue) {
        if (!extra.respondedAt) continue;
        const key = businessMonthKey(extra.respondedAt);
        if (totalsByMonth.has(key)) {
          totalsByMonth.set(key, (totalsByMonth.get(key) ?? 0) + extra.priceCents);
        }
      }

      const decidedCount = approvedCount + rejectedCount;
      return {
        additionalRevenueCents: revenue._sum.priceCents ?? 0,
        approvedExtrasCount: approvedCount,
        pendingExtrasCount: pendingCount,
        approvalRate: decidedCount ? (approvedCount / decidedCount) * 100 : 0,
        revenueEvolution: months.map((month) => ({
          month,
          label: monthLabel(month),
          amountCents: totalsByMonth.get(month) ?? 0,
        })),
        recentJobs: recentJobs.map(
          ({ client, ownerId: _ownerId, ...job }) => ({
            ...job,
            clientName: client.name,
          }),
        ),
        awaitingResponse: awaitingResponse.map(({ job, ...extra }) => ({
          ...extra,
          jobTitle: job.title,
          clientName: job.client.name,
        })),
      };
    },
  );
}
