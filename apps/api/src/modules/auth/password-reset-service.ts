import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";

import type { Prisma } from "../../generated/prisma/client.js";
import { AppError } from "../../lib/errors.js";
import { hashPassword, verifyPassword } from "../../lib/password.js";
import { newPasswordSchema } from "../../lib/new-password-schema.js";
import { parseWith } from "../../lib/validation.js";
import { createOpaqueToken, hashToken } from "../../lib/tokens.js";
import {
  encryptPasswordResetCode,
  generatePasswordResetCode,
  hashPasswordResetCode,
  passwordResetCodeMatches,
} from "./password-reset-crypto.js";

export const passwordResetPolicy = {
  codeLength: 8,
  expiresInSeconds: 600,
  retryAfterSeconds: 60,
  grantExpiresInSeconds: 300,
  maxAttempts: 5,
  maxRequestsPerHour: 3,
} as const;

const HOUR_MS = 60 * 60 * 1000;

// Every reset operation and delivery uses the same database lock, including
// across API replicas. Requests skip busy accounts to preserve generic timing.
export async function lockPasswordResetAccount(
  transaction: Prisma.TransactionClient,
  userId: string,
  wait = true,
): Promise<boolean> {
  if (wait) {
    await transaction.$queryRaw`
      SELECT pg_advisory_xact_lock(hashtextextended(${userId}, 0))::text
    `;
    return true;
  }
  const rows = await transaction.$queryRaw<Array<{ locked: boolean }>>`
    SELECT pg_try_advisory_xact_lock(hashtextextended(${userId}, 0)) AS locked
  `;
  return rows[0]?.locked === true;
}

function secret(app: FastifyInstance): string {
  const value = app.env.PASSWORD_RESET_OTP_SECRET;
  if (!value) throw new Error("Password reset secret is not configured");
  return value;
}

async function activeFailureBudget(
  transaction: Prisma.TransactionClient,
  userId: string,
  now: Date,
): Promise<number> {
  const state = await transaction.passwordResetState.upsert({
    where: { userId },
    create: { userId },
    update: {},
  });
  if (state.failureWindowStart && state.failureWindowStart.getTime() > now.getTime() - HOUR_MS) {
    return state.failedAttempts;
  }
  if (state.failedAttempts > 0) {
    await transaction.passwordResetState.update({
      where: { userId },
      data: { failedAttempts: 0, failureWindowStart: null },
    });
  }
  return 0;
}

async function invalidateRecoveries(
  transaction: Prisma.TransactionClient,
  userId: string,
  now: Date,
): Promise<void> {
  await transaction.passwordResetChallenge.updateMany({
    where: { userId, invalidatedAt: null },
    data: { invalidatedAt: now },
  });
  await transaction.passwordResetGrant.updateMany({
    where: { userId, usedAt: null },
    data: { usedAt: now },
  });
  await transaction.passwordResetDelivery.updateMany({
    where: { userId, kind: "code", finishedAt: null },
    data: { finishedAt: now, ciphertext: null },
  });
}

export async function requestPasswordReset(app: FastifyInstance, email: string): Promise<void> {
  const user = await app.prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (!user) return;

  await app.prisma.$transaction(async (transaction) => {
    if (!await lockPasswordResetAccount(transaction, user.id, false)) return;
    const now = new Date();
    if (await activeFailureBudget(transaction, user.id, now) >= passwordResetPolicy.maxAttempts) return;

    const recent = await transaction.passwordResetChallenge.findMany({
      where: { userId: user.id, createdAt: { gt: new Date(now.getTime() - HOUR_MS) } },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
      take: passwordResetPolicy.maxRequestsPerHour,
    });
    if (recent.length >= passwordResetPolicy.maxRequestsPerHour) return;
    if (recent[0] && now.getTime() - recent[0].createdAt.getTime() < passwordResetPolicy.retryAfterSeconds * 1000) return;

    await invalidateRecoveries(transaction, user.id, now);
    const id = randomUUID();
    const code = generatePasswordResetCode();
    const expiresAt = new Date(now.getTime() + passwordResetPolicy.expiresInSeconds * 1000);
    await transaction.passwordResetChallenge.create({
      data: {
        id,
        userId: user.id,
        codeHash: hashPasswordResetCode(secret(app), user.id, id, code),
        expiresAt,
        delivery: {
          create: {
            userId: user.id,
            kind: "code",
            expiresAt,
            ciphertext: encryptPasswordResetCode(secret(app), user.id, id, code),
          },
        },
      },
    });
  });
}

export async function verifyPasswordReset(
  app: FastifyInstance,
  email: string,
  code: string,
): Promise<{ token: string; expiresAt: Date } | null> {
  const user = await app.prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (!user) return null;

  return app.prisma.$transaction(async (transaction) => {
    if (!await lockPasswordResetAccount(transaction, user.id, false)) return null;
    const now = new Date();
    const failures = await activeFailureBudget(transaction, user.id, now);
    if (failures >= passwordResetPolicy.maxAttempts) return null;
    const challenge = await transaction.passwordResetChallenge.findFirst({
      where: { userId: user.id, invalidatedAt: null, verifiedAt: null, expiresAt: { gt: now } },
      orderBy: { createdAt: "desc" },
    });
    if (!challenge || challenge.attempts >= passwordResetPolicy.maxAttempts) return null;

    const candidate = hashPasswordResetCode(secret(app), user.id, challenge.id, code);
    if (!passwordResetCodeMatches(challenge.codeHash, candidate)) {
      await transaction.passwordResetChallenge.update({
        where: { id: challenge.id },
        data: { attempts: { increment: 1 } },
      });
      await transaction.passwordResetState.update({
        where: { userId: user.id },
        data: {
          failedAttempts: { increment: 1 },
          ...(failures === 0 ? { failureWindowStart: now } : {}),
        },
      });
      // Return instead of throwing here so failed attempts are committed.
      return null;
    }

    const consumed = await transaction.passwordResetChallenge.updateMany({
      where: { id: challenge.id, verifiedAt: null, invalidatedAt: null, expiresAt: { gt: now } },
      data: { verifiedAt: now },
    });
    if (consumed.count !== 1) return null;
    await transaction.passwordResetDelivery.updateMany({
      where: { challengeId: challenge.id, finishedAt: null },
      data: { finishedAt: now, ciphertext: null },
    });
    const token = createOpaqueToken();
    const expiresAt = new Date(now.getTime() + passwordResetPolicy.grantExpiresInSeconds * 1000);
    await transaction.passwordResetGrant.create({
      data: { userId: user.id, challengeId: challenge.id, tokenHash: hashToken(token), expiresAt },
    });
    return { token, expiresAt };
  }, { timeout: 15_000 });
}

export async function confirmPasswordReset(
  app: FastifyInstance,
  token: string,
  password: string,
): Promise<boolean> {
  const tokenHash = hashToken(token);
  const initial = await app.prisma.passwordResetGrant.findUnique({ where: { tokenHash } });
  if (!initial || initial.usedAt || initial.expiresAt.getTime() <= Date.now()) return false;
  parseWith(newPasswordSchema, password);
  const user = await app.prisma.user.findUnique({
    where: { id: initial.userId },
    select: { passwordHash: true, passwordHistory: { select: { passwordHash: true } } },
  });
  if (!user) return false;

  // Scrypt comparisons run sequentially, outside the transaction, to bound
  // memory use and avoid holding database locks throughout a long history.
  let reused = false;
  for (const previous of [user, ...user.passwordHistory]) {
    if (await verifyPassword(password, previous.passwordHash, app.env.PASSWORD_PEPPER)) {
      reused = true;
      break;
    }
  }
  const passwordHash = reused ? null : await hashPassword(password, app.env.PASSWORD_PEPPER);

  return app.prisma.$transaction(async (transaction) => {
    await lockPasswordResetAccount(transaction, initial.userId);
    // Login locks this same row and checks the password hash before issuing a
    // session, so an in-flight login with the old password cannot survive reset.
    const lockedUsers = await transaction.$queryRaw<Array<{ password_hash: string }>>`
      SELECT password_hash FROM users WHERE id = ${initial.userId}::uuid FOR UPDATE
    `;
    // A concurrent reset invalidates the snapshot checked above and its grant.
    if (lockedUsers[0]?.password_hash !== user.passwordHash) return false;
    const now = new Date();
    const consumed = await transaction.passwordResetGrant.updateMany({
      where: { id: initial.id, tokenHash, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (consumed.count !== 1) return false;
    if (reused || !passwordHash) {
      const message = "Você já usou esta senha nesta conta. Escolha uma senha diferente das anteriores.";
      // Throwing rolls back grant consumption, allowing another password with
      // the same verified authorization until its original expiration.
      throw new AppError(400, "PASSWORD_REUSED", message, { password: [message] });
    }
    await transaction.passwordHistory.create({
      data: { userId: initial.userId, passwordHash: user.passwordHash },
    });
    await transaction.user.update({ where: { id: initial.userId }, data: { passwordHash } });
    await transaction.session.updateMany({
      where: { userId: initial.userId, revokedAt: null },
      data: { revokedAt: now },
    });
    await invalidateRecoveries(transaction, initial.userId, now);
    await transaction.passwordResetDelivery.create({
      data: { userId: initial.userId, kind: "changed", expiresAt: new Date(now.getTime() + 24 * HOUR_MS) },
    });
    return true;
  }, { timeout: 15_000 });
}
