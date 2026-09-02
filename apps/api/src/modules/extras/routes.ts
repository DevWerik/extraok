import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { conflict, notFound } from "../../lib/errors.js";
import { parseWith } from "../../lib/validation.js";
import { currentUser, requireAuth } from "../../plugins/auth.js";

const jobParamsSchema = z.object({ jobId: z.string().uuid() });
const extraParamsSchema = z.object({ id: z.string().uuid() });
const extraInputSchema = z.object({
  title: z.string().trim().min(3).max(160),
  description: z.string().trim().min(8).max(2_000),
  priceCents: z.number().int().positive().max(1_000_000_000),
});

export async function registerExtraRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/jobs/:jobId/extras",
    { preHandler: requireAuth },
    async (request) => {
      const user = currentUser(request);
      const { jobId } = parseWith(jobParamsSchema, request.params);
      const job = await app.prisma.job.findFirst({
        where: { id: jobId, ownerId: user.id },
        select: { id: true },
      });

      if (!job) throw notFound("Atendimento não encontrado.");

      return app.prisma.extra.findMany({
        where: { jobId, job: { ownerId: user.id } },
        orderBy: { createdAt: "asc" },
      });
    },
  );

  app.post(
    "/jobs/:jobId/extras",
    { preHandler: requireAuth },
    async (request, reply) => {
      const user = currentUser(request);
      const { jobId } = parseWith(jobParamsSchema, request.params);
      const input = parseWith(extraInputSchema, request.body);
      const job = await app.prisma.job.findFirst({
        where: { id: jobId, ownerId: user.id },
        select: { id: true },
      });

      if (!job) throw notFound("Atendimento não encontrado.");

      const extra = await app.prisma.extra.create({
        data: {
          jobId,
          ...input,
          status: "pending",
        },
      });
      return reply.status(201).send(extra);
    },
  );

  app.patch(
    "/extras/:id",
    { preHandler: requireAuth },
    async (request) => {
      const user = currentUser(request);
      const { id } = parseWith(extraParamsSchema, request.params);
      const input = parseWith(extraInputSchema, request.body);
      const extra = await app.prisma.extra.findFirst({
        where: { id, job: { ownerId: user.id } },
      });

      if (!extra) throw notFound("Serviço extra não encontrado.");
      if (extra.status !== "pending") {
        throw conflict(
          "Somente extras pendentes podem ser editados.",
          "FORBIDDEN_OPERATION",
        );
      }

      const updated = await app.prisma.extra.updateMany({
        where: {
          id,
          status: "pending",
          job: { ownerId: user.id },
        },
        data: input,
      });
      if (updated.count === 0) {
        throw conflict(
          "O serviço extra recebeu uma resposta e não pode mais ser editado.",
          "FORBIDDEN_OPERATION",
        );
      }

      return app.prisma.extra.findFirstOrThrow({
        where: { id, job: { ownerId: user.id } },
      });
    },
  );

  app.delete(
    "/extras/:id",
    { preHandler: requireAuth },
    async (request, reply) => {
      const user = currentUser(request);
      const { id } = parseWith(extraParamsSchema, request.params);
      const extra = await app.prisma.extra.findFirst({
        where: { id, job: { ownerId: user.id } },
        select: { status: true },
      });

      if (!extra) throw notFound("Serviço extra não encontrado.");
      if (extra.status !== "pending") {
        throw conflict(
          "Somente extras pendentes podem ser removidos.",
          "FORBIDDEN_OPERATION",
        );
      }

      const deleted = await app.prisma.extra.deleteMany({
        where: {
          id,
          status: "pending",
          job: { ownerId: user.id },
        },
      });
      if (deleted.count === 0) {
        throw conflict(
          "O serviço extra recebeu uma resposta e não pode mais ser removido.",
          "FORBIDDEN_OPERATION",
        );
      }

      return reply.status(204).send();
    },
  );
}
