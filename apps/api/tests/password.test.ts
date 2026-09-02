import assert from "node:assert/strict";
import test from "node:test";

import { hashPassword, verifyPassword } from "../src/lib/password.js";

const pepper = "pepper-de-testes-com-mais-de-32-caracteres";

test("hashPassword usa o formato scrypt versionado esperado", async () => {
  const encoded = await hashPassword("uma senha segura", pepper);

  assert.match(encoded, /^\$scrypt\$v=1\$N=32768,r=8,p=3\$/);
  assert.equal(await verifyPassword("uma senha segura", encoded, pepper), true);
});

test("verifyPassword rejeita senha, pepper e formato incorretos", async () => {
  const encoded = await hashPassword("senha correta", pepper);

  assert.equal(await verifyPassword("senha incorreta", encoded, pepper), false);
  assert.equal(
    await verifyPassword("senha correta", encoded, "x".repeat(32)),
    false,
  );
  assert.equal(await verifyPassword("senha correta", "hash-invalido", pepper), false);
});
