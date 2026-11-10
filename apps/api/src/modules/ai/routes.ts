import type { FastifyInstance } from "fastify";

import { AppError } from "../../lib/errors.js";
import { parseWith } from "../../lib/validation.js";
import { currentUser, requireAuth } from "../../plugins/auth.js";
import { aiUnavailable, descriptionInputSchema, descriptionOutputSchema, type DescriptionGenerator } from "./gemini.js";

export async function registerAiRoutes(app: FastifyInstance, generator: DescriptionGenerator): Promise<void> {
  const dailyLimit = app.createRateLimit({
    max: app.env.AI_DAILY_LIMIT,
    timeWindow: "24 hours",
    keyGenerator: (request) => `ai-description:${currentUser(request).id}`,
  });

  app.get("/ai/capabilities", { preHandler: requireAuth }, async (_request, reply) => {
    reply.header("Cache-Control", "no-store");
    return { descriptionsEnabled: app.env.AI_ENABLED };
  });

  app.post("/ai/extra-description", {
    preHandler: requireAuth,
    bodyLimit: 16 * 1024,
    config: { rateLimit: { max: 5, timeWindow: "1 minute" } },
  }, async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    if (!app.env.AI_ENABLED) throw aiUnavailable();
    const input = parseWith(descriptionInputSchema, request.body);
    // This limiter runs after authentication and validation, independently of the IP limiter.
    const limit = await dailyLimit(request);
    if (!limit.isAllowed && limit.isExceeded) {
      reply.header("Retry-After", limit.ttlInSeconds);
      throw new AppError(429, "RATE_LIMITED", "Você atingiu o limite de gerações de IA nas últimas 24 horas. Tente novamente mais tarde.");
    }
    const description = descriptionOutputSchema.safeParse(await generator.generate(input));
    if (!description.success) throw aiUnavailable();
    return { description: description.data };
  });
}
