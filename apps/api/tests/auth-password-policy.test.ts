import assert from "node:assert/strict";
import test from "node:test";

import { buildApp } from "../src/app.js";
import { loadEnv } from "../src/config/env.js";
import type { PrismaClient } from "../src/generated/prisma/client.js";

const origin = "https://app.extraok.test";

test("cadastro e recuperação aceitam senhas de 8 a 12 caracteres na validação HTTP", async (context) => {
  let userLookups = 0;
  const prisma = {
    user: {
      async findUnique() {
        userLookups++;
        return { id: "existing-user" };
      },
    },
  } as unknown as PrismaClient;
  const env = loadEnv({
    NODE_ENV: "test",
    DATABASE_URL: "postgresql://test:test@127.0.0.1:1/unused",
    WEB_ORIGIN: origin,
    PASSWORD_PEPPER: "password-policy-test-pepper-at-least-32-characters",
    PASSWORD_RESET_ENABLED: "true",
    PASSWORD_RESET_OTP_SECRET: "password-policy-test-otp-secret-at-least-32-characters",
    RESEND_API_KEY: "re_unit_test_placeholder",
    EMAIL_FROM: "ExtraOK <seguranca@example.test>",
  });
  const app = await buildApp({ env, prisma, logger: false, passwordResetDeliveryEnabled: false });
  context.after(() => app.close());

  for (const length of [0, 7, 8, 11, 12, 13, 128, 129]) {
    const password = "a".repeat(length);
    const validLength = length >= 8 && length <= 12;
    const registration = await app.inject({
      method: "POST", url: "/api/v1/auth/register", headers: { origin },
      payload: {
        name: "Pessoa Teste", businessName: "Negócio Teste", email: "pessoa@example.test",
        phone: "11999999999", acceptTerms: true, password,
      },
    });
    // Valid passwords reach the duplicate-account check without writing to a database.
    assert.equal(registration.statusCode, validLength ? 409 : 400, registration.body);
    if (!validLength) assert.ok(registration.json().error.fields.password);

    const reset = await app.inject({
      method: "POST", url: "/api/v1/auth/password-reset/confirm", headers: { origin },
      payload: { password, confirmPassword: password },
    });
    assert.equal(reset.statusCode, 400, reset.body);
    if (validLength) {
      // Passing password validation must still require a valid reset authorization.
      assert.equal(reset.json().error.message, "Autorização inválida ou expirada. Solicite um novo código.");
      assert.equal(reset.json().error.fields, undefined);
    } else {
      assert.ok(reset.json().error.fields.password);
    }
  }
  assert.equal(userLookups, 3);
});
