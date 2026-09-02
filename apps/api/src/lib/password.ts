import {
  createHmac,
  randomBytes,
  scrypt as nodeScrypt,
  timingSafeEqual,
} from "node:crypto";

const VERSION = 1;
const COST = 32_768;
const BLOCK_SIZE = 8;
const PARALLELIZATION = 3;
const SALT_BYTES = 16;
const KEY_BYTES = 64;
const MAX_MEMORY_BYTES = 128 * 1024 * 1024;
const ENCODED_PREFIX = `$scrypt$v=${VERSION}$N=${COST},r=${BLOCK_SIZE},p=${PARALLELIZATION}$`;

function assertPepper(pepper: string): void {
  if (pepper.length < 32) {
    throw new Error("PASSWORD_PEPPER deve ter no minimo 32 caracteres.");
  }
}

function pepperedPassword(password: string, pepper: string): Buffer {
  return createHmac("sha256", pepper).update(password, "utf8").digest();
}

function deriveKey(password: string, salt: Buffer, pepper: string): Promise<Buffer> {
  const secret = pepperedPassword(password, pepper);

  return new Promise((resolve, reject) => {
    nodeScrypt(
      secret,
      salt,
      KEY_BYTES,
      {
        N: COST,
        r: BLOCK_SIZE,
        p: PARALLELIZATION,
        maxmem: MAX_MEMORY_BYTES,
      },
      (error, derivedKey) => {
        secret.fill(0);

        if (error) {
          reject(error);
          return;
        }

        resolve(derivedKey);
      },
    );
  });
}

export async function hashPassword(
  password: string,
  pepper: string,
): Promise<string> {
  assertPepper(pepper);

  const salt = randomBytes(SALT_BYTES);
  const derivedKey = await deriveKey(password, salt, pepper);

  return `${ENCODED_PREFIX}${salt.toString("base64url")}$${derivedKey.toString("base64url")}`;
}

export async function verifyPassword(
  password: string,
  encoded: string,
  pepper: string,
): Promise<boolean> {
  assertPepper(pepper);

  if (!encoded.startsWith(ENCODED_PREFIX)) {
    return false;
  }

  const encodedParts = encoded.slice(ENCODED_PREFIX.length).split("$");

  if (encodedParts.length !== 2) {
    return false;
  }

  const [encodedSalt, encodedKey] = encodedParts;

  if (!encodedSalt || !encodedKey) {
    return false;
  }

  try {
    const salt = Buffer.from(encodedSalt, "base64url");
    const storedKey = Buffer.from(encodedKey, "base64url");

    if (salt.length !== SALT_BYTES || storedKey.length !== KEY_BYTES) {
      return false;
    }

    const candidateKey = await deriveKey(password, salt, pepper);
    return timingSafeEqual(storedKey, candidateKey);
  } catch {
    return false;
  }
}
