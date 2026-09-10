import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from "node:crypto";

function context(userId: string, challengeId: string): string {
  return JSON.stringify(["extraok/password-reset/v1", userId, challengeId]);
}

export function generatePasswordResetCode(): string {
  return randomInt(0, 100_000_000).toString().padStart(8, "0");
}

export function hashPasswordResetCode(
  secret: string,
  userId: string,
  challengeId: string,
  code: string,
): string {
  return createHmac("sha256", secret)
    .update(JSON.stringify(["otp", context(userId, challengeId), code]))
    .digest("hex");
}

export function passwordResetCodeMatches(stored: string, candidate: string): boolean {
  if (!/^[a-f0-9]{64}$/.test(stored) || !/^[a-f0-9]{64}$/.test(candidate)) {
    return false;
  }
  return timingSafeEqual(Buffer.from(stored, "hex"), Buffer.from(candidate, "hex"));
}

function deliveryKey(secret: string): Buffer {
  return createHmac("sha256", secret)
    .update("extraok/password-reset/v1/outbox-aes-256-gcm")
    .digest();
}

export function encryptPasswordResetCode(
  secret: string,
  userId: string,
  challengeId: string,
  code: string,
): string {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deliveryKey(secret), nonce);
  cipher.setAAD(Buffer.from(context(userId, challengeId)));
  const encrypted = Buffer.concat([cipher.update(code, "utf8"), cipher.final()]);
  return ["v1", nonce, cipher.getAuthTag(), encrypted]
    .map((part) => typeof part === "string" ? part : part.toString("base64url"))
    .join(".");
}

export function decryptPasswordResetCode(
  secret: string,
  userId: string,
  challengeId: string,
  ciphertext: string,
): string {
  const [version, encodedNonce, encodedTag, encodedContent, extra] = ciphertext.split(".");
  if (version !== "v1" || !encodedNonce || !encodedTag || !encodedContent || extra) {
    throw new Error("Invalid password reset delivery payload");
  }
  const nonce = Buffer.from(encodedNonce, "base64url");
  const tag = Buffer.from(encodedTag, "base64url");
  if (nonce.length !== 12 || tag.length !== 16) {
    throw new Error("Invalid password reset delivery payload");
  }
  const decipher = createDecipheriv("aes-256-gcm", deliveryKey(secret), nonce);
  decipher.setAAD(Buffer.from(context(userId, challengeId)));
  decipher.setAuthTag(tag);
  const code = Buffer.concat([
    decipher.update(Buffer.from(encodedContent, "base64url")),
    decipher.final(),
  ]).toString("utf8");
  if (!/^\d{8}$/.test(code)) throw new Error("Invalid password reset delivery payload");
  return code;
}
