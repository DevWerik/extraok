import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";

import { buildApp } from "../src/app.js";
import { loadEnv } from "../src/config/env.js";
import type { PrismaClient } from "../src/generated/prisma/client.js";

const origin = "https://app.extraok.test";

async function setup(context: TestContext) {
  const env = loadEnv({
    NODE_ENV: "test",
    DATABASE_URL: "postgresql://test:test@127.0.0.1:1/unused",
    WEB_ORIGIN: origin,
    PASSWORD_PEPPER: "rate-limit-test-pepper-at-least-32-characters",
  });
  const prisma = { user: { findUnique: async () => null } } as unknown as PrismaClient;
  const app = await buildApp({ env, prisma, logger: false, passwordResetDeliveryEnabled: false });
  context.after(() => app.close());
  return app;
}

test("repeated invalid credentials remain limited and expose the actual manual retry delay", async (context) => {
  const app = await setup(context);
  const login = () => app.inject({
    method: "POST", url: "/api/v1/auth/login", headers: { origin },
    payload: { email: "person@example.test", password: "incorrect-password" },
  });
  // Background reads must never consume the tighter credential-attempt counter.
  for (let attempt = 0; attempt < 15; attempt++) {
    assert.equal((await app.inject({ url: "/api/v1/billing/plans" })).statusCode, 200);
    assert.equal((await app.inject({ url: "/api/v1/auth/session" })).statusCode, 401);
  }
  for (let attempt = 0; attempt < 10; attempt++) {
    assert.equal((await login()).statusCode, 401);
  }
  const limited = await login();
  assert.equal(limited.statusCode, 429, limited.body);
  assert.equal(limited.json().error.code, "RATE_LIMITED");
  assert.equal(limited.headers["access-control-allow-origin"], origin);
  assert.ok(String(limited.headers["access-control-expose-headers"]).toLowerCase().split(",").includes("retry-after"));
  const retryAfter = Number(limited.headers["retry-after"]);
  assert.ok(retryAfter > 0 && retryAfter <= 900);
  assert.equal((await app.inject({ url: "/api/v1/billing/plans" })).statusCode, 200);
  assert.equal((await app.inject({ url: "/api/v1/auth/session" })).statusCode, 401);
});
