import { z } from "zod";

const postgresUrlSchema = z
  .string()
  .trim()
  .url("DATABASE_URL deve ser uma URL PostgreSQL valida.")
  .refine((value) => {
    const protocol = new URL(value).protocol;
    return protocol === "postgres:" || protocol === "postgresql:";
  }, "DATABASE_URL deve usar o protocolo postgres:// ou postgresql://.");

const webOriginSchema = z
  .string()
  .trim()
  .url("WEB_ORIGIN deve ser uma URL absoluta valida.")
  .refine((value) => {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  }, "WEB_ORIGIN deve usar HTTP ou HTTPS.")
  .transform((value) => new URL(value).origin);

const booleanFromEnvironment = z.preprocess((value) => {
  if (typeof value !== "string") {
    return value;
  }

  const normalized = value.trim().toLowerCase();

  if (normalized === "true" || normalized === "1") {
    return true;
  }

  if (normalized === "false" || normalized === "0") {
    return false;
  }

  return value;
}, z.boolean());

const DEVELOPMENT_ONLY_PEPPERS = new Set([
  "extraok-local-development-pepper-do-not-use-in-production",
]);

export const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]),
    DATABASE_URL: postgresUrlSchema,
    HOST: z.string().trim().min(1).default("0.0.0.0"),
    PORT: z.coerce.number().int().min(1).max(65_535).default(3333),
    WEB_ORIGIN: webOriginSchema,
    PASSWORD_PEPPER: z.string().min(32),
    SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
    SESSION_IDLE_HOURS: z.coerce.number().int().min(1).max(168).default(12),
    APPROVAL_LINK_TTL_DAYS: z.coerce
      .number()
      .int()
      .min(1)
      .max(90)
      .default(30),
    TERMS_VERSION: z.string().trim().min(1).max(32).default("2026-09-01"),
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
      .default("info"),
    TRUST_PROXY: booleanFromEnvironment.default(false),
  })
  .superRefine((environment, context) => {
    if (environment.NODE_ENV !== "production") return;

    const origin = new URL(environment.WEB_ORIGIN);
    const localHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);
    if (origin.protocol !== "https:" && !localHosts.has(origin.hostname)) {
      context.addIssue({
        code: "custom",
        path: ["WEB_ORIGIN"],
        message: "WEB_ORIGIN deve usar HTTPS em producao.",
      });
    }

    if (DEVELOPMENT_ONLY_PEPPERS.has(environment.PASSWORD_PEPPER)) {
      context.addIssue({
        code: "custom",
        path: ["PASSWORD_PEPPER"],
        message: "PASSWORD_PEPPER de desenvolvimento nao pode ser usado em producao.",
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  return envSchema.parse(source);
}
