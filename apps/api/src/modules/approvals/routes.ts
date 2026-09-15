import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";

import { conflict, gone, notFound } from "../../lib/errors.js";
import { createOpaqueToken, hashToken } from "../../lib/tokens.js";
import { parseWith } from "../../lib/validation.js";
import { currentUser, requireAuth } from "../../plugins/auth.js";
import { consumeApproval, lockBilling } from "../billing/entitlements.js";

const jobParamsSchema = z.object({ jobId: z.string().uuid() });
const tokenParamsSchema = z.object({
  token: z.string().min(32).max(200),
});
const decisionParamsSchema = tokenParamsSchema.extend({
  extraId: z.string().uuid(),
});
const decisionSchema = z.object({
  decision: z.enum(["approved", "rejected"]),
});

function assertActiveLink<T extends { revokedAt: Date | null; expiresAt: Date }>(
  link: T | null,
): asserts link is T & { revokedAt: null } {
  if (!link || link.revokedAt) {
    throw notFound("Link de aprovação não encontrado.");
  }
  if (link.expiresAt.getTime() <= Date.now()) {
    throw gone("Este link de aprovação expirou.");
  }
}

function setPublicApprovalHeaders(reply: FastifyReply): void {
  reply.header("Cache-Control", "no-store, max-age=0");
  reply.header("Pragma", "no-cache");
  reply.header("Referrer-Policy", "no-referrer");
  reply.header("X-Robots-Tag", "noindex, nofollow, noarchive");
}

async function readPublicApproval(app: FastifyInstance, tokenHash: string) {
  const link = await app.prisma.approvalLink.findUnique({
    where: { tokenHash },
    include: {
      job: {
        include: {
          owner: {
            select: { name: true, businessName: true },
          },
          extras: {
            select: {
              id: true,
              title: true,
              description: true,
              priceCents: true,
              status: true,
              respondedAt: true,
            },
            orderBy: { createdAt: "asc" },
          },
        },
      },
    },
  });

  assertActiveLink(link);
  const extras = link.job.extras;
  return {
    providerName: link.job.owner.name,
    businessName: link.job.owner.businessName,
    serviceTitle: link.job.title,
    scheduledAt: link.job.scheduledAt,
    extras,
    approvedTotalCents: extras
      .filter((extra) => extra.status === "approved")
      .reduce((total, extra) => total + extra.priceCents, 0),
  };
}

export async function registerApprovalRoutes(
  app: FastifyInstance,
): Promise<void> {
  app.post(
    "/jobs/:jobId/approval-links",
    { preHandler: requireAuth },
    async (request, reply) => {
      const user = currentUser(request);
      const { jobId } = parseWith(jobParamsSchema, request.params);
      const job = await app.prisma.job.findFirst({
        where: { id: jobId, ownerId: user.id },
        select: { id: true },
      });

      if (!job) throw notFound("Atendimento não encontrado.");

      const token = createOpaqueToken();
      const expiresAt = new Date(
        Date.now() + app.env.APPROVAL_LINK_TTL_DAYS * 24 * 60 * 60 * 1000,
      );
      const now = new Date();

      await app.prisma.$transaction(async (transaction) => {
        await lockBilling(transaction, user.id);
        await consumeApproval(transaction, user.id, jobId);
        // Serializa rotacoes do mesmo atendimento. O indice parcial da migration
        // continua sendo a ultima barreira para garantir apenas um link ativo.
        await transaction.$queryRaw`
          SELECT pg_advisory_xact_lock(hashtextextended(${jobId}, 0))::text
        `;
        await transaction.approvalLink.updateMany({
          where: { jobId, revokedAt: null },
          data: { revokedAt: now },
        });
        await transaction.approvalLink.create({
          data: {
            jobId,
            tokenHash: hashToken(token),
            expiresAt,
          },
        });
      });

      return reply.status(201).send({ token, expiresAt });
    },
  );

  app.get(
    "/public/approvals/:token",
    {
      config: { rateLimit: { max: 60, timeWindow: "1 minute" } },
    },
    async (request, reply) => {
      const { token } = parseWith(tokenParamsSchema, request.params);
      setPublicApprovalHeaders(reply);
      return readPublicApproval(app, hashToken(token));
    },
  );

  app.post(
    "/public/approvals/:token/extras/:extraId/decision",
    {
      config: { rateLimit: { max: 20, timeWindow: "5 minutes" } },
    },
    async (request, reply) => {
      const { token, extraId } = parseWith(
        decisionParamsSchema,
        request.params,
      );
      const { decision } = parseWith(decisionSchema, request.body);
      const tokenDigest = hashToken(token);
      setPublicApprovalHeaders(reply);

      await app.prisma.$transaction(async (transaction) => {
        const link = await transaction.approvalLink.findUnique({
          where: { tokenHash: tokenDigest },
          select: {
            jobId: true,
            revokedAt: true,
            expiresAt: true,
          },
        });
        assertActiveLink(link);

        const extra = await transaction.extra.findFirst({
          where: { id: extraId, jobId: link.jobId },
        });
        if (!extra) throw notFound("Serviço extra não encontrado.");

        if (extra.status !== "pending") {
          if (extra.status === decision) return;
          throw conflict(
            "Este serviço extra já recebeu outra resposta.",
            "FORBIDDEN_OPERATION",
          );
        }

        const respondedAt = new Date();
        const updated = await transaction.extra.updateMany({
          where: {
            id: extraId,
            jobId: link.jobId,
            status: "pending",
          },
          data: { status: decision, respondedAt },
        });

        if (updated.count === 0) {
          const current = await transaction.extra.findFirst({
            where: { id: extraId, jobId: link.jobId },
            select: { status: true },
          });
          if (current?.status === decision) return;
          throw conflict(
            "Este serviço extra já recebeu outra resposta.",
            "FORBIDDEN_OPERATION",
          );
        }
      });

      return readPublicApproval(app, tokenDigest);
    },
  );
}
