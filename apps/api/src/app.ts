import Fastify, { type FastifyInstance } from "fastify";

import { loadEnv, type Env } from "./config/env.js";
import { createPrismaClient } from "./db/prisma.js";
import { registerErrorHandler } from "./http/error-handler.js";
import { registerApprovalRoutes } from "./modules/approvals/routes.js";
import { registerAuthRoutes } from "./modules/auth/routes.js";
import { registerPasswordResetRoutes } from "./modules/auth/password-reset-routes.js";
import { createPasswordResetMailer, type PasswordResetMailer } from "./lib/password-reset-mailer.js";
import { registerClientRoutes } from "./modules/clients/routes.js";
import { registerDashboardRoutes } from "./modules/dashboard/routes.js";
import { registerExtraRoutes } from "./modules/extras/routes.js";
import { registerJobRoutes } from "./modules/jobs/routes.js";
import { createPixGateway, type PixGateway } from "./modules/billing/mercadopago.js";
import { registerBillingRoutes } from "./modules/billing/routes.js";
import { registerReportRoutes } from "./modules/reports/routes.js";
import { configureSecurity } from "./plugins/security.js";
import type { PrismaClient } from "./generated/prisma/client.js";

export interface BuildAppOptions {
  env?: Env;
  prisma?: PrismaClient;
  logger?: boolean;
  passwordResetMailer?: PasswordResetMailer;
  passwordResetDeliveryEnabled?: boolean;
  pixGateway?: PixGateway;
  billingReconciliationEnabled?: boolean;
}

export async function buildApp(
  options: BuildAppOptions = {},
): Promise<FastifyInstance> {
  const env = options.env ?? loadEnv();
  const prisma = options.prisma ?? createPrismaClient(env.DATABASE_URL);
  const ownsPrisma = options.prisma === undefined;
  const app = Fastify({
    bodyLimit: 256 * 1024,
    connectionTimeout: 10_000,
    requestTimeout: 30_000,
    trustProxy: env.TRUST_PROXY
      ? (_address: string, hop: number) => hop === 0
      : false,
    logger:
      options.logger ?? {
        level: env.LOG_LEVEL,
        redact: {
          paths: [
            "req.headers.authorization",
            "req.headers.cookie",
            "res.headers.set-cookie",
            "req.body.password",
            "req.body.confirmPassword",
            "req.body.newPassword",
            "req.body.code",
            "req.body.otp",
            "req.body.resetToken",
            "req.body.cpf",
            'req.headers["x-signature"]',
            "req.params.token",
          ],
          censor: "[REDACTED]",
        },
        serializers: {
          req(request: { method?: string; url?: string }) {
            const safeUrl = (request.url ?? "")
              .replace(
                /(\/api\/v1\/public\/approvals\/)[^/?]+/g,
                "$1[REDACTED]",
              )
              .replace(/\?.*$/, "?[REDACTED]");

            return { method: request.method, url: safeUrl };
          },
        },
      },
  });

  app.decorate("env", env);
  app.decorate("prisma", prisma);
  app.decorateRequest("authUser", null);
  app.decorateRequest("authSession", null);

  registerErrorHandler(app);
  await configureSecurity(app, env);

  app.get("/health", async () => ({ status: "ok" }));
  app.get("/ready", async (_request, reply) => {
    try {
      await prisma.$queryRawUnsafe("SELECT 1");
      return { status: "ready" };
    } catch (error) {
      app.log.warn({ err: error }, "Database readiness check failed");
      return reply.status(503).send({ status: "unavailable" });
    }
  });

  // Close hooks run in reverse registration order. The delivery worker must
  // finish before its Prisma connection is disconnected.
  if (ownsPrisma) {
    app.addHook("onClose", async () => {
      await prisma.$disconnect();
    });
  }

  await app.register(
    async (api) => {
      await registerAuthRoutes(api);
      await registerPasswordResetRoutes(
        api,
        options.passwordResetMailer ?? createPasswordResetMailer(env),
        { deliveryEnabled: options.passwordResetDeliveryEnabled },
      );
      await registerClientRoutes(api);
      await registerJobRoutes(api);
      await registerExtraRoutes(api);
      await registerDashboardRoutes(api);
      await registerReportRoutes(api);
      await registerApprovalRoutes(api);
      await registerBillingRoutes(api, options.pixGateway ?? createPixGateway(env), {
        reconciliationEnabled: options.billingReconciliationEnabled,
      });
    },
    { prefix: "/api/v1" },
  );

  return app;
}
