import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { badRequest, notFound } from "../../lib/errors.js";
import { parseWith } from "../../lib/validation.js";
import { currentUser, requireAuth } from "../../plugins/auth.js";
import { requirePlanFeature } from "../billing/entitlements.js";
import { createJobPdf } from "./job-pdf.js";
import { readReport, reportCsv, reportQuerySchema } from "./service.js";

export async function registerReportRoutes(app: FastifyInstance) {
  app.get("/jobs/:id/pdf", { preHandler: requireAuth, config: { rateLimit: { max: 5, timeWindow: "1 minute" } } }, async (request, reply) => {
    reply.header("Cache-Control", "private, no-store");
    const user = currentUser(request);
    const { id } = parseWith(z.object({ id: z.string().uuid() }), request.params);
    const job = await app.prisma.$transaction(async (transaction) => {
      await requirePlanFeature(transaction, user.id, "pdfExport", app.env);
      const result = await transaction.job.findFirst({
        where: { id, ownerId: user.id },
        select: { id: true, title: true, description: true, scheduledAt: true, status: true,
          client: { select: { name: true, phone: true, email: true } },
          extras: { orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: 501,
            select: { title: true, description: true, priceCents: true, status: true, respondedAt: true } } },
      });
      if (!result) throw notFound("Atendimento não encontrado.");
      if (result.extras.length > 500) throw badRequest("A exportação PDF permite até 500 extras por atendimento.");
      return result;
    }, { isolationLevel: "RepeatableRead" });
    const pdf = await createJobPdf(job, user.businessName);
    return reply.type("application/pdf").header("Content-Disposition", `attachment; filename="atendimento-${id}.pdf"`).send(pdf);
  });

  for (const csv of [false, true]) {
    app.get(csv ? "/reports/jobs.csv" : "/reports/jobs", {
      preHandler: requireAuth, config: { rateLimit: { max: csv ? 5 : 30, timeWindow: "1 minute" } },
    }, async (request, reply) => {
      reply.header("Cache-Control", "private, no-store");
      const user = currentUser(request);
      const query = parseWith(reportQuerySchema, request.query);
      const report = await app.prisma.$transaction(async (transaction) => {
        await requirePlanFeature(transaction, user.id, csv ? "csvExport" : "advancedReports", app.env);
        return readReport(transaction, user.id, query, csv);
      }, { isolationLevel: "RepeatableRead", timeout: 15_000 });
      if (!csv) return report;
      return reply.type("text/csv; charset=utf-8")
        .header("Content-Disposition", `attachment; filename="atendimentos-${query.from}-${query.to}.csv"`).send(reportCsv(report));
    });
  }
}
