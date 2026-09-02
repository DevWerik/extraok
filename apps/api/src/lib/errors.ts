import type { ZodError } from "zod";

export type FieldErrors = Record<string, string[]>;

export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly fieldErrors?: FieldErrors;

  constructor(
    statusCode: number,
    code: string,
    message: string,
    fieldErrors?: FieldErrors,
  ) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
    this.fieldErrors = fieldErrors;
  }
}

export function badRequest(message: string, code = "VALIDATION") {
  return new AppError(400, code, message);
}

export function unauthorized(message = "Autenticação necessária.") {
  return new AppError(401, "UNAUTHORIZED", message);
}

export function forbidden(message = "Você não tem permissão para esta ação.") {
  return new AppError(403, "FORBIDDEN", message);
}

export function notFound(message = "Recurso não encontrado.") {
  return new AppError(404, "NOT_FOUND", message);
}

export function conflict(message: string, code = "CONFLICT") {
  return new AppError(409, code, message);
}

export function gone(message: string) {
  return new AppError(410, "GONE", message);
}

export function fromZodError(error: ZodError): AppError {
  const fieldErrors: FieldErrors = {};

  for (const issue of error.issues) {
    const path = issue.path.length ? issue.path.join(".") : "root";
    (fieldErrors[path] ??= []).push(issue.message);
  }

  return new AppError(
    400,
    "VALIDATION",
    "Revise os dados enviados.",
    fieldErrors,
  );
}

export function isPrismaErrorWithCode(
  error: unknown,
  code: string,
): error is Error & { code: string } {
  return (
    error instanceof Error &&
    "code" in error &&
    typeof error.code === "string" &&
    error.code === code
  );
}
