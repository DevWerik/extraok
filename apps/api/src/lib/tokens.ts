import { createHash, randomBytes } from "node:crypto";

const TOKEN_BYTES = 32;

export function createOpaqueToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

export function hashToken(token: string): string {
  if (!token) {
    throw new Error("Token nao pode ser vazio.");
  }

  return createHash("sha256").update(token, "utf8").digest("hex");
}
