import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { conflict, notFound } from "../../lib/errors.js";
import { parseWith } from "../../lib/validation.js";
import { currentUser, requireAuth } from "../../plugins/auth.js";

const idParamsSchema = z.object({ id: z.string().uuid() });
const listQuerySchema = z.object({
  search: z.string().trim().max(100).optional().default(""),
});
const clientInputSchema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(10).max(30),
  email: z.string().trim().toLowerCase().max(254).pipe(z.email()),
  notes: z.string().trim().max(500).optional().default(""),
});

function serializeClient<T extends { ownerId: string }>(client: T): Omit<T, "ownerId"> {
  const { ownerId: _ownerId, ...safeClient } = client;
  return safeClient;
}

export async function registerClientRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/clients",
    { preHandler: requireAuth },
    async (request) => {
      const user = currentUser(request);
      const { search } = parseWith(listQuerySchema, request.query);

      const clients = await app.prisma.client.findMany({
        where: {
          ownerId: user.id,
          ...(search
            ? {
                OR: [
                  { name: { contains: search, mode: "insensitive" } },
                  { phone: { contains: search } },
                  { email: { contains: search, mode: "insensitive" } },
                ],
              }
            : {}),
        },
        orderBy: { name: "asc" },
      });

      return clients.map(serializeClient);
    },
  );

  app.get(
    "/clients/:id",
    { preHandler: requireAuth },
    async (request) => {
      const user = currentUser(request);
      const { id } = parseWith(idParamsSchema, request.params);
      const client = await app.prisma.client.findFirst({
        where: { id, ownerId: user.id },
      });

      if (!client) throw notFound("Cliente não encontrado.");
      return serializeClient(client);
    },
  );

  app.post(
    "/clients",
    { preHandler: requireAuth },
    async (request, reply) => {
      const user = currentUser(request);
      const input = parseWith(clientInputSchema, request.body);
      const client = await app.prisma.client.create({
        data: { ...input, ownerId: user.id },
      });

      return reply.status(201).send(serializeClient(client));
    },
  );

  app.patch(
    "/clients/:id",
    { preHandler: requireAuth },
    async (request) => {
      const user = currentUser(request);
      const { id } = parseWith(idParamsSchema, request.params);
      const input = parseWith(clientInputSchema, request.body);
      const updated = await app.prisma.client.updateMany({
        where: { id, ownerId: user.id },
        data: input,
      });

      if (updated.count === 0) throw notFound("Cliente não encontrado.");

      const client = await app.prisma.client.findFirstOrThrow({
        where: { id, ownerId: user.id },
      });
      return serializeClient(client);
    },
  );

  app.delete(
    "/clients/:id",
    { preHandler: requireAuth },
    async (request, reply) => {
      const user = currentUser(request);
      const { id } = parseWith(idParamsSchema, request.params);
      const client = await app.prisma.client.findFirst({
        where: { id, ownerId: user.id },
        select: { id: true },
      });

      if (!client) throw notFound("Cliente não encontrado.");

      const relatedJobs = await app.prisma.job.count({
        where: { clientId: id, ownerId: user.id },
      });
      if (relatedJobs > 0) {
        throw conflict(
          "Este cliente possui atendimentos e não pode ser excluído.",
          "FORBIDDEN_OPERATION",
        );
      }

      await app.prisma.client.deleteMany({
        where: { id, ownerId: user.id },
      });
      return reply.status(204).send();
    },
  );
}
