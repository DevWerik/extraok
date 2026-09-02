import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import type { LightMyRequestResponse } from "fastify";

import { buildApp } from "../src/app.js";
import { loadEnv } from "../src/config/env.js";
import { createPrismaClient } from "../src/db/prisma.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
const webOrigin = "https://app.extraok.test";

function json<T>(response: LightMyRequestResponse): T {
  return response.json() as T;
}

function cookieFrom(response: LightMyRequestResponse): string {
  const header = response.headers["set-cookie"];
  const setCookie = Array.isArray(header) ? header[0] : header;

  assert.ok(setCookie, "A resposta deve criar o cookie de sessao.");
  return setCookie.split(";", 1)[0] ?? "";
}

test(
  "fluxo real persiste dados, protege sessoes e isola contas",
  { skip: databaseUrl ? false : "TEST_DATABASE_URL nao definida" },
  async (context) => {
    if (!databaseUrl) return;

    const suffix = randomUUID();
    const firstEmail = `owner-${suffix}@example.test`;
    const secondEmail = `other-${suffix}@example.test`;
    const password = "Senha real e segura 123!";
    const prisma = createPrismaClient(databaseUrl);
    const env = loadEnv({
      NODE_ENV: "production",
      DATABASE_URL: databaseUrl,
      WEB_ORIGIN: webOrigin,
      PASSWORD_PEPPER: "pepper-de-integracao-com-mais-de-32-caracteres",
      SESSION_TTL_DAYS: "7",
      SESSION_IDLE_HOURS: "12",
      APPROVAL_LINK_TTL_DAYS: "7",
      TERMS_VERSION: "integration-test",
      LOG_LEVEL: "silent",
      TRUST_PROXY: "false",
    });
    const app = await buildApp({ env, prisma, logger: false });
    const headers = (cookie?: string) => ({
      ...(cookie ? { cookie } : {}),
      origin: webOrigin,
      "x-requested-with": "ExtraOK-Web",
    });

    context.after(async () => {
      await prisma.user.deleteMany({
        where: { email: { in: [firstEmail, secondEmail] } },
      });
      await app.close();
      await prisma.$disconnect();
    });

    const health = await app.inject({ method: "GET", url: "/health" });
    assert.equal(health.statusCode, 200);
    assert.deepEqual(json(health), { status: "ok" });

    const ready = await app.inject({ method: "GET", url: "/ready" });
    assert.equal(ready.statusCode, 200);
    assert.deepEqual(json(ready), { status: "ready" });

    const rejectedOrigin = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: {},
    });
    assert.equal(rejectedOrigin.statusCode, 403);

    const register = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      headers: headers(),
      payload: {
        name: "Profissional ExtraOK",
        businessName: "ExtraOK Servicos",
        email: firstEmail,
        phone: "11999999999",
        password,
        acceptTerms: true,
      },
    });
    assert.equal(register.statusCode, 201, register.body);
    const registration = json<{
      user: { id: string; email: string };
      issuedAt: string;
      expiresAt: string;
    }>(register);
    assert.equal(registration.user.email, firstEmail);
    assert.ok(registration.issuedAt);
    assert.ok(registration.expiresAt);
    assert.equal(register.body.includes("password"), false);

    const rawSetCookie = String(register.headers["set-cookie"]);
    assert.match(rawSetCookie, /^__Host-extraok_session=/);
    assert.match(rawSetCookie, /HttpOnly/i);
    assert.match(rawSetCookie, /Secure/i);
    assert.match(rawSetCookie, /SameSite=Strict/i);
    const firstCookie = cookieFrom(register);

    const session = await app.inject({
      method: "GET",
      url: "/api/v1/auth/session",
      headers: { cookie: firstCookie },
    });
    assert.equal(session.statusCode, 200, session.body);

    const clientResponse = await app.inject({
      method: "POST",
      url: "/api/v1/clients",
      headers: headers(firstCookie),
      payload: {
        name: "Cliente Persistido",
        phone: "11988887777",
        email: `client-${suffix}@example.test`,
        notes: "Criado pelo teste integrado",
      },
    });
    assert.equal(clientResponse.statusCode, 201, clientResponse.body);
    const client = json<{ id: string }>(clientResponse);

    const jobResponse = await app.inject({
      method: "POST",
      url: "/api/v1/jobs",
      headers: headers(firstCookie),
      payload: {
        clientId: client.id,
        title: "Instalacao eletrica",
        description: "Atendimento real criado pelo teste integrado.",
        scheduledAt: new Date(Date.now() + 86_400_000).toISOString(),
      },
    });
    assert.equal(jobResponse.statusCode, 201, jobResponse.body);
    const job = json<{ id: string }>(jobResponse);

    const extraResponse = await app.inject({
      method: "POST",
      url: `/api/v1/jobs/${job.id}/extras`,
      headers: headers(firstCookie),
      payload: {
        title: "Material adicional",
        description: "Material identificado durante o atendimento.",
        priceCents: 12_500,
      },
    });
    assert.equal(extraResponse.statusCode, 201, extraResponse.body);
    const extra = json<{ id: string }>(extraResponse);

    const approvalLinkResponse = await app.inject({
      method: "POST",
      url: `/api/v1/jobs/${job.id}/approval-links`,
      headers: headers(firstCookie),
    });
    assert.equal(approvalLinkResponse.statusCode, 201, approvalLinkResponse.body);
    const approvalLink = json<{ token: string; expiresAt: string }>(
      approvalLinkResponse,
    );
    assert.ok(approvalLink.token.length >= 32);
    assert.ok(approvalLink.expiresAt);

    const publicApproval = await app.inject({
      method: "GET",
      url: `/api/v1/public/approvals/${approvalLink.token}`,
    });
    assert.equal(publicApproval.statusCode, 200, publicApproval.body);
    assert.match(String(publicApproval.headers["cache-control"]), /no-store/);
    assert.equal(publicApproval.body.includes(firstEmail), false);
    assert.equal(publicApproval.body.includes("11999999999"), false);

    const approve = await app.inject({
      method: "POST",
      url: `/api/v1/public/approvals/${approvalLink.token}/extras/${extra.id}/decision`,
      headers: headers(),
      payload: { decision: "approved" },
    });
    assert.equal(approve.statusCode, 200, approve.body);
    assert.equal(
      json<{ extras: Array<{ id: string; status: string }> }>(approve).extras.find(
        (item) => item.id === extra.id,
      )?.status,
      "approved",
    );

    const sameDecision = await app.inject({
      method: "POST",
      url: `/api/v1/public/approvals/${approvalLink.token}/extras/${extra.id}/decision`,
      headers: headers(),
      payload: { decision: "approved" },
    });
    assert.equal(sameDecision.statusCode, 200, sameDecision.body);

    const oppositeDecision = await app.inject({
      method: "POST",
      url: `/api/v1/public/approvals/${approvalLink.token}/extras/${extra.id}/decision`,
      headers: headers(),
      payload: { decision: "rejected" },
    });
    assert.equal(oppositeDecision.statusCode, 409, oppositeDecision.body);

    const dashboard = await app.inject({
      method: "GET",
      url: "/api/v1/dashboard/summary",
      headers: { cookie: firstCookie },
    });
    assert.equal(dashboard.statusCode, 200, dashboard.body);
    const summary = json<{
      additionalRevenueCents: number;
      approvedExtrasCount: number;
    }>(dashboard);
    assert.equal(summary.additionalRevenueCents, 12_500);
    assert.equal(summary.approvedExtrasCount, 1);

    const rotations = await Promise.all([
      app.inject({
        method: "POST",
        url: `/api/v1/jobs/${job.id}/approval-links`,
        headers: headers(firstCookie),
      }),
      app.inject({
        method: "POST",
        url: `/api/v1/jobs/${job.id}/approval-links`,
        headers: headers(firstCookie),
      }),
    ]);
    assert.deepEqual(
      rotations.map((response) => response.statusCode),
      [201, 201],
      rotations.map((response) => response.body).join("\n"),
    );
    const rotatedChecks = await Promise.all(
      rotations.map((response) =>
        app.inject({
          method: "GET",
          url: `/api/v1/public/approvals/${json<{ token: string }>(response).token}`,
        }),
      ),
    );
    assert.deepEqual(
      rotatedChecks.map((response) => response.statusCode).sort(),
      [200, 404],
    );

    const logout = await app.inject({
      method: "POST",
      url: "/api/v1/auth/logout",
      headers: headers(firstCookie),
    });
    assert.equal(logout.statusCode, 204, logout.body);

    const revokedSession = await app.inject({
      method: "GET",
      url: "/api/v1/auth/session",
      headers: { cookie: firstCookie },
    });
    assert.equal(revokedSession.statusCode, 401, revokedSession.body);

    const login = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      headers: headers(),
      payload: { email: firstEmail, password },
    });
    assert.equal(login.statusCode, 200, login.body);
    const freshCookie = cookieFrom(login);

    const persistedClients = await app.inject({
      method: "GET",
      url: "/api/v1/clients",
      headers: { cookie: freshCookie },
    });
    assert.equal(persistedClients.statusCode, 200, persistedClients.body);
    assert.ok(
      json<Array<{ id: string }>>(persistedClients).some(
        (item) => item.id === client.id,
      ),
    );

    const registerSecond = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      headers: headers(),
      payload: {
        name: "Outra Pessoa",
        businessName: "Outro Negocio",
        email: secondEmail,
        phone: "11977776666",
        password,
        acceptTerms: true,
      },
    });
    assert.equal(registerSecond.statusCode, 201, registerSecond.body);
    const secondCookie = cookieFrom(registerSecond);

    const isolatedClient = await app.inject({
      method: "GET",
      url: `/api/v1/clients/${client.id}`,
      headers: { cookie: secondCookie },
    });
    assert.equal(isolatedClient.statusCode, 404, isolatedClient.body);
  },
);
