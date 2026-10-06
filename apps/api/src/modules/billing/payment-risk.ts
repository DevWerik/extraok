import { AppError } from "../../lib/errors.js";

// ExtraOK policy, not a provider promise about when a risk block ends.
export const PAYMENT_RETRY_DELAY_MS = 10 * 60_000;
export const deviceIdPattern = /^[A-Za-z0-9_-]{1,256}$/;

export function isHighRisk(detail: string | undefined) {
  return detail === "high_risk" || detail === "rejected_high_risk";
}

export function paymentRetryAvailableAt(rejectedAt: Date | null | undefined) {
  return rejectedAt ? new Date(rejectedAt.getTime() + PAYMENT_RETRY_DELAY_MS) : null;
}

export class PaymentRetryLaterError extends AppError {
  readonly retryAfterSeconds: number;

  constructor(retryAvailableAt: Date, now: Date) {
    const seconds = Math.max(1, Math.ceil((retryAvailableAt.getTime() - now.getTime()) / 1000));
    const minutes = Math.ceil(seconds / 60);
    super(429, "PAYMENT_RETRY_LATER", `Uma cobrança desta conta foi recusada recentemente. Aguarde ${minutes} ${minutes === 1 ? "minuto" : "minutos"} antes de gerar outro Pix e confira os dados do pagador.`);
    this.retryAfterSeconds = seconds;
  }
}
