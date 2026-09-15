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

const optionalSetting = z.preprocess(
  (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
  z.string().trim().optional(),
);

function isEmailSender(value: string): boolean {
  if (/[\r\n]/.test(value)) return false;
  const match = /^(?:[^<>]+\s<([^<>]+)>|([^<>]+))$/.exec(value);
  return z.email().safeParse(match?.[1] ?? match?.[2]).success;
}

export const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]),
    DATABASE_URL: postgresUrlSchema,
    HOST: z.string().trim().min(1).default("0.0.0.0"),
    PORT: z.coerce.number().int().min(1).max(65_535).default(3333),
    WEB_ORIGIN: webOriginSchema,
    PASSWORD_PEPPER: z.string().min(32),
    PASSWORD_RESET_ENABLED: booleanFromEnvironment.default(false),
    PASSWORD_RESET_OTP_SECRET: optionalSetting,
    RESEND_API_KEY: optionalSetting,
    EMAIL_FROM: optionalSetting,
    BILLING_ENABLED: booleanFromEnvironment.default(false),
    MERCADOPAGO_ACCESS_TOKEN: optionalSetting,
    MERCADOPAGO_WEBHOOK_SECRET: optionalSetting,
    MERCADOPAGO_COLLECTOR_ID: optionalSetting,
    MERCADOPAGO_WEBHOOK_URL: optionalSetting,
    MERCADOPAGO_LIVE_MODE: booleanFromEnvironment.default(false),
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
    if (environment.BILLING_ENABLED) {
      for (const key of ["MERCADOPAGO_ACCESS_TOKEN", "MERCADOPAGO_WEBHOOK_SECRET"] as const) {
        if (!environment[key] || environment[key].length < 32) {
          context.addIssue({ code: "custom", path: [key], message: "Configure a credencial do Mercado Pago com pelo menos 32 caracteres." });
        }
      }
      if (!/^\d+$/.test(environment.MERCADOPAGO_COLLECTOR_ID ?? "")) {
        context.addIssue({ code: "custom", path: ["MERCADOPAGO_COLLECTOR_ID"], message: "Configure o ID da conta recebedora do Mercado Pago." });
      }
      try {
        const url = new URL(environment.MERCADOPAGO_WEBHOOK_URL ?? "");
        if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash ||
          url.pathname !== "/api/v1/billing/webhooks/mercadopago") throw new Error();
      } catch {
        context.addIssue({ code: "custom", path: ["MERCADOPAGO_WEBHOOK_URL"], message: "Configure a URL HTTPS pública terminando em /api/v1/billing/webhooks/mercadopago, sem parâmetros." });
      }
      if (environment.NODE_ENV === "production" && !environment.MERCADOPAGO_LIVE_MODE) {
        context.addIssue({ code: "custom", path: ["MERCADOPAGO_LIVE_MODE"], message: "Pagamentos em produção exigem MERCADOPAGO_LIVE_MODE=true." });
      }
    }
    if (environment.PASSWORD_RESET_ENABLED) {
      if (!environment.RESEND_API_KEY?.startsWith("re_") || environment.RESEND_API_KEY.length < 10) {
        context.addIssue({ code: "custom", path: ["RESEND_API_KEY"], message: "Configure uma chave de API do Resend para ativar a recuperação de senha." });
      }
      if (!environment.EMAIL_FROM || !isEmailSender(environment.EMAIL_FROM)) {
        context.addIssue({ code: "custom", path: ["EMAIL_FROM"], message: "Configure um remetente válido e verificado no Resend." });
      }
      if (!environment.PASSWORD_RESET_OTP_SECRET || environment.PASSWORD_RESET_OTP_SECRET.length < 32) {
        context.addIssue({ code: "custom", path: ["PASSWORD_RESET_OTP_SECRET"], message: "Configure um segredo de recuperação com pelo menos 32 caracteres." });
      } else if (environment.PASSWORD_RESET_OTP_SECRET === environment.PASSWORD_PEPPER) {
        context.addIssue({ code: "custom", path: ["PASSWORD_RESET_OTP_SECRET"], message: "O segredo de recuperação deve ser diferente de PASSWORD_PEPPER." });
      }
    }
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
