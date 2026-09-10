import type { Env } from "../config/env.js";

export interface PasswordResetMailer {
  sendCode(input: {
    email: string;
    code: string;
    expiresInMinutes: number;
    idempotencyKey: string;
  }): Promise<void>;
  sendPasswordChanged(input: {
    email: string;
    idempotencyKey: string;
  }): Promise<void>;
}

export const MAIL_REQUEST_TIMEOUT_MS = 8_000;

// Only these safe fields may leave the transport layer. Provider responses can
// contain email addresses or message bodies and must never reach application logs.
export class MailDeliveryError extends Error {
  constructor(readonly retryable: boolean, readonly statusCode?: number) {
    super("Não foi possível entregar a mensagem ao serviço de e-mail.");
    this.name = "MailDeliveryError";
  }
}

export function createPasswordResetMailer(
  env: Env,
  sendRequest: typeof fetch = fetch,
): PasswordResetMailer {
  async function send(email: string, subject: string, text: string, idempotencyKey: string): Promise<void> {
    if (!env.PASSWORD_RESET_ENABLED || !env.RESEND_API_KEY || !env.EMAIL_FROM) {
      throw new MailDeliveryError(false);
    }

    try {
      const response = await sendRequest("https://api.resend.com/emails", {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(MAIL_REQUEST_TIMEOUT_MS),
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({ from: env.EMAIL_FROM, to: [email], subject, text }),
      });

      if (!response.ok) {
        await response.body?.cancel();
        throw new MailDeliveryError(response.status === 408 || response.status === 409 || response.status === 429 || response.status >= 500, response.status);
      }

      const result: unknown = await response.json();
      if (!result || typeof result !== "object" || !("id" in result) || typeof result.id !== "string" || !result.id) {
        throw new MailDeliveryError(true);
      }
    } catch (error) {
      if (error instanceof MailDeliveryError) throw error;
      throw new MailDeliveryError(true);
    }
  }

  return {
    async sendCode({ email, code, expiresInMinutes, idempotencyKey }) {
      if (!/^\d{8}$/.test(code) || !Number.isInteger(expiresInMinutes) || expiresInMinutes < 1 || expiresInMinutes > 10) {
        throw new MailDeliveryError(false);
      }
      await send(
        email,
        "Seu código de recuperação de senha — ExtraOK",
        [
          "Você solicitou a recuperação de senha da sua conta ExtraOK.",
          "",
          `Seu código é: ${code}`,
          `Ele expira ${expiresInMinutes} minutos após a solicitação e pode ser usado apenas uma vez.`,
          "",
          "Informe o código na tela de recuperação do ExtraOK. Não compartilhe este código.",
          "Se você não solicitou a recuperação, ignore esta mensagem. Sua senha permanece a mesma.",
        ].join("\n"),
        idempotencyKey,
      );
    },
    async sendPasswordChanged({ email, idempotencyKey }) {
      await send(
        email,
        "Sua senha foi alterada — ExtraOK",
        [
          "A senha da sua conta ExtraOK foi alterada.",
          "As sessões anteriores foram encerradas. Entre novamente com a nova senha.",
          "",
          "Se você não reconhece esta alteração, acesse o ExtraOK pelo endereço que você já utiliza e solicite a recuperação de senha. Verifique também a segurança da sua conta de e-mail.",
        ].join("\n"),
        idempotencyKey,
      );
    },
  };
}
