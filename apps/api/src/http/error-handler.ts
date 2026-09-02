import type { FastifyInstance } from "fastify";

import { AppError, isPrismaErrorWithCode } from "../lib/errors.js";

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message,
          ...(error.fieldErrors ? { fields: error.fieldErrors } : {}),
          requestId: request.id,
        },
      });
    }

    if (isPrismaErrorWithCode(error, "P2002")) {
      return reply.status(409).send({
        error: {
          code: "CONFLICT",
          message: "Já existe um registro com estes dados.",
          requestId: request.id,
        },
      });
    }

    if (isPrismaErrorWithCode(error, "P2003")) {
      return reply.status(409).send({
        error: {
          code: "RELATION_CONFLICT",
          message: "O registro ainda possui dados relacionados.",
          requestId: request.id,
        },
      });
    }

    if (isPrismaErrorWithCode(error, "P2025")) {
      return reply.status(404).send({
        error: {
          code: "NOT_FOUND",
          message: "Recurso não encontrado.",
          requestId: request.id,
        },
      });
    }

    const candidateStatus =
      typeof error === "object" &&
      error !== null &&
      "statusCode" in error &&
      typeof error.statusCode === "number"
        ? error.statusCode
        : 500;
    const statusCode = candidateStatus >= 400 ? candidateStatus : 500;

    if (statusCode >= 500) {
      request.log.error({ err: error }, "Unhandled request error");
    }

    const fallback =
      statusCode === 400
        ? { code: "VALIDATION", message: "Solicitação inválida." }
        : statusCode === 401
          ? { code: "UNAUTHORIZED", message: "Autenticação necessária." }
          : statusCode === 403
            ? { code: "FORBIDDEN", message: "Acesso não autorizado." }
            : statusCode === 404
              ? { code: "NOT_FOUND", message: "Rota não encontrada." }
              : statusCode === 429
                ? {
                    code: "RATE_LIMITED",
                    message: "Muitas tentativas. Aguarde e tente novamente.",
                  }
                : {
                    code: "INTERNAL_ERROR",
                    message: "Não foi possível concluir a solicitação.",
                  };

    return reply.status(statusCode).send({
      error: {
        ...fallback,
        requestId: request.id,
      },
    });
  });
}
