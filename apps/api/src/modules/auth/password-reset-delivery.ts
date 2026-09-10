import type { FastifyInstance } from "fastify";

import { MailDeliveryError, type PasswordResetMailer } from "../../lib/password-reset-mailer.js";
import { decryptPasswordResetCode } from "./password-reset-crypto.js";
import { lockPasswordResetAccount, passwordResetPolicy } from "./password-reset-service.js";

const DAY_MS = 24 * 60 * 60 * 1000;

export async function drainPasswordResetDeliveries(
  app: FastifyInstance,
  mailer: PasswordResetMailer,
  shouldContinue: () => boolean = () => true,
): Promise<void> {
  const deliveries = await app.prisma.passwordResetDelivery.findMany({
    where: { finishedAt: null, availableAt: { lte: new Date() } },
    orderBy: { availableAt: "asc" },
    take: 10,
    select: { id: true, userId: true },
  });
  for (const candidate of deliveries) {
    if (!shouldContinue()) break;
    await app.prisma.$transaction(async (transaction) => {
      if (!await lockPasswordResetAccount(transaction, candidate.userId, false)) return;
      const delivery = await transaction.passwordResetDelivery.findUnique({
        where: { id: candidate.id },
        include: { user: { select: { email: true } }, challenge: true },
      });
      const now = new Date();
      if (!delivery || delivery.finishedAt || delivery.availableAt > now) return;
      const finish = async () => {
        await transaction.passwordResetDelivery.update({
          where: { id: delivery.id },
          data: { finishedAt: new Date(), ciphertext: null },
        });
      };
      if (delivery.expiresAt <= now || delivery.attempts >= 8) {
        await finish();
        return;
      }
      if (delivery.kind === "code" && (
        !delivery.challenge || delivery.challenge.invalidatedAt || delivery.challenge.verifiedAt ||
        delivery.challenge.expiresAt <= now || delivery.challenge.attempts >= passwordResetPolicy.maxAttempts
      )) {
        await finish();
        return;
      }

      try {
        // The provider has an aborting 8-second timeout. Holding the account lock
        // until it returns prevents a superseded code being submitted afterward.
        // The idempotency key AND email payload remain identical on every retry.
        if (delivery.kind === "code") {
          if (!delivery.ciphertext || !delivery.challengeId || !app.env.PASSWORD_RESET_OTP_SECRET) {
            await finish();
            return;
          }
          const code = decryptPasswordResetCode(
            app.env.PASSWORD_RESET_OTP_SECRET, delivery.userId, delivery.challengeId, delivery.ciphertext,
          );
          await mailer.sendCode({
            email: delivery.user.email,
            code,
            expiresInMinutes: passwordResetPolicy.expiresInSeconds / 60,
            idempotencyKey: `password-reset/${delivery.id}`,
          });
        } else {
          await mailer.sendPasswordChanged({
            email: delivery.user.email,
            idempotencyKey: `password-reset/${delivery.id}`,
          });
        }
        await finish();
      } catch (error) {
        const attempts = delivery.attempts + 1;
        const exhausted = attempts >= 8 || (error instanceof MailDeliveryError && !error.retryable);
        await transaction.passwordResetDelivery.update({
          where: { id: delivery.id },
          data: {
            attempts,
            availableAt: new Date(Date.now() + Math.min(300, 15 * 2 ** (attempts - 1)) * 1000),
            ...(exhausted ? { finishedAt: new Date(), ciphertext: null } : {}),
          },
        });
        app.log.warn({ deliveryId: delivery.id, retryScheduled: !exhausted }, "Password reset email delivery failed");
      }
    }, { timeout: 15_000, maxWait: 5_000 });
  }
}

export async function cleanupPasswordResetRecords(app: FastifyInstance): Promise<void> {
  const now = new Date();
  // Remove secrets as soon as they expire; retain challenge timestamps for 24h
  // so cleaning never resets the rolling one-hour send budget.
  await app.prisma.passwordResetDelivery.updateMany({
    where: { finishedAt: null, expiresAt: { lte: now } },
    data: { finishedAt: now, ciphertext: null },
  });
  await app.prisma.passwordResetChallenge.deleteMany({
    where: { expiresAt: { lt: new Date(now.getTime() - DAY_MS) } },
  });
  await app.prisma.passwordResetDelivery.deleteMany({
    where: { finishedAt: { lt: new Date(now.getTime() - DAY_MS) } },
  });
  // State is bounded to one row per user. Reset its failure budget only after
  // the window expires in the account transaction, never on resend/cleanup.
}

export function startPasswordResetDelivery(app: FastifyInstance, mailer: PasswordResetMailer): void {
  let stopped = false;
  let running: Promise<void> | undefined;
  let lastCleanup = 0;
  let timer: NodeJS.Timeout | undefined;
  const tick = () => {
    if (stopped || running) return;
    running = (async () => {
      if (Date.now() - lastCleanup >= 60_000) {
        await cleanupPasswordResetRecords(app);
        lastCleanup = Date.now();
      }
      await drainPasswordResetDeliveries(app, mailer, () => !stopped);
    })().catch(() => {
      app.log.error("Password reset delivery worker failed; it will retry on the next cycle");
    }).finally(() => { running = undefined; });
  };
  app.addHook("onReady", async () => {
    timer = setInterval(tick, 5_000);
    timer.unref();
    tick();
  });
  app.addHook("onClose", async () => {
    stopped = true;
    if (timer) clearInterval(timer);
    await running;
  });
}
