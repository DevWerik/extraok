import { z } from "zod";
import type { Prisma } from "../../generated/prisma/client.js";
import { badRequest, notFound } from "../../lib/errors.js";

const DAY_MS = 86_400_000;
export const REPORT_PAGE_SIZE = 25;
export const CSV_MAX_JOBS = 5_000;
export const reportQuerySchema = z.object({
  from: z.iso.date().refine((value) => value >= "2000-01-01" && value <= "2100-12-31"),
  to: z.iso.date().refine((value) => value >= "2000-01-01" && value <= "2100-12-31"),
  clientId: z.string().uuid().optional(),
  status: z.enum(["all", "scheduled", "in_progress", "completed", "cancelled"]).default("all"),
  page: z.coerce.number().int().min(1).max(100_000).default(1),
}).strict().refine((value) => value.from <= value.to, { path: ["to"], message: "A data final deve ser igual ou posterior à inicial." })
  .refine((value) => Date.parse(value.to) - Date.parse(value.from) < 366 * DAY_MS,
    { path: ["to"], message: "Selecione até 366 dias por relatório." });

export type ReportQuery = z.infer<typeof reportQuerySchema>;
export const jobStatusLabels = { scheduled: "Agendado", in_progress: "Em andamento", completed: "Finalizado", cancelled: "Cancelado" } as const;
export const extraStatusLabels = { pending: "Pendente", approved: "Aprovado", rejected: "Recusado" } as const;

const offsetFormatter = new Intl.DateTimeFormat("en", { timeZone: "America/Sao_Paulo", timeZoneName: "longOffset" });
function businessDayStart(day: string): Date {
  const midnight = Date.parse(`${day}T00:00:00Z`);
  let candidate = midnight;
  let previous = candidate;
  for (let attempt = 0; attempt < 4; attempt++) {
    const offset = offsetFormatter.formatToParts(new Date(candidate)).find((part) => part.type === "timeZoneName")!.value;
    const match = /GMT([+-])(\d{2}):(\d{2})/.exec(offset)!;
    const minutes = (Number(match[2]) * 60 + Number(match[3])) * (match[1] === "+" ? 1 : -1);
    const next = midnight - minutes * 60_000;
    if (next === candidate) return new Date(candidate);
    // Historical DST can skip midnight; use the first valid time on that day.
    if (next === previous) return new Date(Math.max(next, candidate));
    previous = candidate;
    candidate = next;
  }
  return new Date(candidate);
}

export function reportDateRange(query: Pick<ReportQuery, "from" | "to">) {
  // Dates refer to scheduled appointments, with inclusive days in Sao Paulo.
  const nextDay = new Date(Date.parse(query.to) + DAY_MS).toISOString().slice(0, 10);
  return { gte: businessDayStart(query.from), lt: businessDayStart(nextDay) };
}

export async function readReport(transaction: Prisma.TransactionClient, ownerId: string, query: ReportQuery, csv = false) {
  if (query.clientId && !await transaction.client.findFirst({ where: { id: query.clientId, ownerId }, select: { id: true } })) {
    throw notFound("Cliente não encontrado.");
  }
  const where: Prisma.JobWhereInput = {
    ownerId,
    scheduledAt: reportDateRange(query),
    ...(query.clientId ? { clientId: query.clientId } : {}),
    ...(query.status !== "all" ? { status: query.status } : {}),
  };
  const totalJobs = await transaction.job.count({ where });
  if (csv && totalJobs > CSV_MAX_JOBS) {
    throw badRequest(`O CSV permite até ${CSV_MAX_JOBS} atendimentos. Reduza o período ou filtre por cliente.`);
  }
  const grouped = await transaction.extra.groupBy({
    by: ["status"], where: { job: where }, _sum: { priceCents: true }, _count: { _all: true },
  });
  const totals = { approvedCents: 0, pendingCents: 0, rejectedCents: 0, approvedCount: 0, pendingCount: 0, rejectedCount: 0 };
  for (const group of grouped) {
    totals[`${group.status}Cents`] = group._sum.priceCents ?? 0;
    totals[`${group.status}Count`] = group._count._all;
  }
  const jobs = await transaction.job.findMany({
    where, orderBy: [{ scheduledAt: "desc" }, { id: "asc" }],
    skip: csv ? 0 : (query.page - 1) * REPORT_PAGE_SIZE,
    take: csv ? CSV_MAX_JOBS : REPORT_PAGE_SIZE,
    select: { id: true, title: true, scheduledAt: true, status: true, client: { select: { name: true } } },
  });
  // Aggregate in the database instead of loading every extra in the period.
  const amounts = jobs.length ? await transaction.extra.groupBy({
    by: ["jobId", "status"], where: { jobId: { in: jobs.map((job) => job.id) }, job: { ownerId } },
    _sum: { priceCents: true },
  }) : [];
  const amountsByJob = new Map<string, { approvedCents: number; pendingCents: number; rejectedCents: number }>();
  for (const amount of amounts) {
    const sums = amountsByJob.get(amount.jobId) ?? { approvedCents: 0, pendingCents: 0, rejectedCents: 0 };
    sums[`${amount.status}Cents`] = amount._sum.priceCents ?? 0;
    amountsByJob.set(amount.jobId, sums);
  }
  return {
    filters: { from: query.from, to: query.to, clientId: query.clientId ?? null, status: query.status },
    timeZone: "America/Sao_Paulo", dateBasis: "scheduledAt", generatedAt: new Date(),
    summary: { totalJobs, ...totals, approvalRate: totals.approvedCount + totals.rejectedCount > 0
      ? Math.round(totals.approvedCount / (totals.approvedCount + totals.rejectedCount) * 1000) / 10 : 0 },
    page: csv ? 1 : query.page, pageSize: csv ? CSV_MAX_JOBS : REPORT_PAGE_SIZE,
    totalPages: Math.max(1, Math.ceil(totalJobs / REPORT_PAGE_SIZE)),
    rows: jobs.map(({ client, ...job }) => ({
      ...job, clientName: client.name, ...(amountsByJob.get(job.id) ?? { approvedCents: 0, pendingCents: 0, rejectedCents: 0 }),
    })),
  };
}

export type Report = Awaited<ReturnType<typeof readReport>>;

export function csvCell(value: string): string {
  // Quoting alone does not stop spreadsheet formulas. Prefix untrusted formulas
  // even when preceded by whitespace/control characters; retain delimiters inside quotes.
  const safe = /^[\s\u0000-\u001f]*[=+\-@]/u.test(value) || /^[\t\r\n]/u.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function reportCsv(report: Report): string {
  const date = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
  const currency = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");
  const rows = [
    ["ID do atendimento", "Atendimento", "Cliente", "Agendado (Brasília)", "Status", "Extras aprovados (R$)", "Extras pendentes (R$)", "Extras recusados (R$)"],
    ...report.rows.map((row) => [row.id, row.title, row.clientName, date.format(row.scheduledAt), jobStatusLabels[row.status],
      currency(row.approvedCents), currency(row.pendingCents), currency(row.rejectedCents)]),
  ];
  return "\uFEFF" + rows.map((row) => row.map(csvCell).join(";")).join("\r\n") + "\r\n";
}
