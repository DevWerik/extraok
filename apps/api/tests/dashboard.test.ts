import assert from "node:assert/strict";
import test from "node:test";

import { businessMonthKey } from "../src/modules/dashboard/routes.js";

test("faturamento mensal respeita o fuso de Sao Paulo", () => {
  assert.equal(
    businessMonthKey(new Date("2026-09-01T01:30:00.000Z")),
    "2026-08",
  );
  assert.equal(
    businessMonthKey(new Date("2026-09-01T03:00:00.000Z")),
    "2026-09",
  );
});
