import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import type { FastifyInstance } from "fastify";

import type { Env } from "../config/env.js";
import { forbidden } from "../lib/errors.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export async function configureSecurity(
  app: FastifyInstance,
  env: Env,
): Promise<void> {
  await app.register(cookie);
  await app.register(helmet, {
    contentSecurityPolicy: false,
  });
  await app.register(cors, {
    credentials: true,
    origin(origin, callback) {
      if (!origin || origin === env.WEB_ORIGIN) {
        callback(null, true);
        return;
      }

      callback(null, false);
    },
    methods: ["GET", "HEAD", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Accept", "X-Requested-With"],
    maxAge: 600,
  });
  await app.register(rateLimit, {
    global: true,
    max: 300,
    timeWindow: "1 minute",
    errorResponseBuilder: () => ({
      statusCode: 429,
      error: {
        code: "RATE_LIMITED",
        message: "Muitas tentativas. Aguarde e tente novamente.",
      },
    }),
  });

  app.addHook("onRequest", async (request) => {
    if (SAFE_METHODS.has(request.method)) return;

    const origin = request.headers.origin;
    if (origin !== env.WEB_ORIGIN) {
      throw forbidden("Origem da solicitação não autorizada.");
    }
  });
}
