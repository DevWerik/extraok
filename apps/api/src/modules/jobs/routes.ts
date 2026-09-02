import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { conflict, notFound } from "../../lib/errors.js";
import { parseWith } from "../../lib/validation.js";
import { currentUser, requireAuth } from "../../plugins/auth.js";

const JOB_STATUSES = [
  "scheduled",
  "in_progress",
  "completed",
  "cancelled",
] as const;

const idParamsSchema = z.object({ id: z.string().uuid() });
const listQuerySchema = z.object({
  search: z.string().trim().max(100).optional().default(""),
  status: z.enum([...JOB_STATUSES, "all"]).optional().default("all"),
});
const createJobSchema = z.object({
  clientId: z.string().uuid(),
  title: z.string().trim().min(3).max(160),
  description: z.string().trim().min(10).max(2_000),
  scheduledAt: z
    .string()
    .refine(
      (value) =>
        /(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
        !Number.isNaN(new Date(value).getTime()),
      "Envie data e horário ISO 8601 com fuso horário.",
    ),
});
const updateStatusSchema = z.object({ status: z.enum(JOB_STATUSES) });
type JobStatus = (typeof JOB_STATUSES)[number];
const allowedTransitions: Record<JobStatus, readonly JobStatus[]> = {
  scheduled: ["in_progress", "cancelled"],
  in_progress: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

function sumApproved(extras: Array<{ status: string; priceCents: number }>) {
  return extras
    .filter((extra) => extra.status === "approved")
    .reduce((total, extra) => total + extra.priceCents, 0);
}

export async function registerJobRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/jobs",
    { preHandler: requireAuth },
    async (request) => {
      const user = currentUser(request);
      const { search, status } = parseWith(listQuerySchema, request.query);
      const jobs = await app.prisma.job.findMany({
        where: {
          ownerId: user.id,
          ...(status !== "all" ? { status } : {}),
          ...(search
            ? {
                OR: [
                  { title: { contains: search, mode: "insensitive" } },
                  { description: { contains: search, mode: "insensitive" } },
                  {
                    client: {
                      is: {
                        ownerId: user.id,
                        name: { contains: search, mode: "insensitive" },
                      },
                    },
                  },
                ],
              }
            : {}),
        },
        include: {
          client: { select: { name: true } },
          extras: { select: { status: true, priceCents: true } },
        },
        orderBy: { scheduledAt: "desc" },
      });

      return jobs.map(({ client, extras, ownerId: _ownerId, ...job }) => ({
        ...job,
        clientName: client.name,
        approvedTotalCents: sumApproved(extras),
        pendingExtrasCount: extras.filter((extra) => extra.status === "pending")
          .length,
      }));
    },
  );

  app.get(
    "/jobs/:id",
    { preHandler: requireAuth },
    async (request) => {
      const user = currentUser(request);
      const { id } = parseWith(idParamsSchema, request.params);
      const result = await app.prisma.job.findFirst({
        where: { id, ownerId: user.id },
        include: {
          client: true,
          extras: { orderBy: { createdAt: "asc" } },
          approvalLinks: {
            where: { revokedAt: null, expiresAt: { gt: new Date() } },
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { expiresAt: true },
          },
        },
      });

      if (!result) throw notFound("Atendimento não encontrado.");

      const {
        client,
        extras,
        approvalLinks,
        ownerId: _ownerId,
        ...job
      } = result;
      const { ownerId: _clientOwnerId, ...safeClient } = client;

      return {
        job,
        client: safeClient,
        extras,
        approvedTotalCents: sumApproved(extras),
        approvalLink: {
          active: approvalLinks.length > 0,
          expiresAt: approvalLinks[0]?.expiresAt ?? null,
        },
      };
    },
  );

  app.post(
    "/jobs",
    { preHandler: requireAuth },
    async (request, reply) => {
      const user = currentUser(request);
      const input = parseWith(createJobSchema, request.body);
      const client = await app.prisma.client.findFirst({
        where: { id: input.clientId, ownerId: user.id },
        select: { id: true },
      });

      if (!client) throw notFound("Cliente não encontrado.");

      const job = await app.prisma.job.create({
        data: {
          ownerId: user.id,
          clientId: input.clientId,
          title: input.title,
          description: input.description,
          scheduledAt: new Date(input.scheduledAt),
          status: "scheduled",
        },
      });
      const { ownerId: _ownerId, ...safeJob } = job;

      return reply.status(201).send(safeJob);
    },
  );

  app.patch(
    "/jobs/:id/status",
    { preHandler: requireAuth },
    async (request) => {
      const user = currentUser(request);
      const { id } = parseWith(idParamsSchema, request.params);
      const input = parseWith(updateStatusSchema, request.body);
      const current = await app.prisma.job.findFirst({
        where: { id, ownerId: user.id },
        select: { status: true },
      });

      if (!current) throw notFound("Atendimento não encontrado.");
      if (
        current.status !== input.status &&
        !allowedTransitions[current.status].includes(input.status)
      ) {
        throw conflict(
          "Esta mudança de status não é permitida para o atendimento.",
          "FORBIDDEN_OPERATION",
        );
      }

      const updated = await app.prisma.job.updateMany({
        where: { id, ownerId: user.id, status: current.status },
        data: { status: input.status },
      });

      if (updated.count === 0) {
        throw conflict("O atendimento foi atualizado por outra solicitação.");
      }

      const job = await app.prisma.job.findFirstOrThrow({
        where: { id, ownerId: user.id },
      });
      const { ownerId: _ownerId, ...safeJob } = job;
      return safeJob;
    },
  );
}
