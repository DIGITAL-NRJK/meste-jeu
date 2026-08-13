import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { ADMIN_SESSION_COOKIE_NAME } from "../../src/lib/auth/admin-session";

const authRepository = vi.hoisted(() => ({ findActiveSession: vi.fn() }));
const accountRepository = vi.hoisted(() => ({
  listAccounts: vi.fn(),
  findAccountById: vi.fn(),
  createAccount: vi.fn(),
  setAccountStatus: vi.fn(),
}));

vi.mock("@/lib/env/server", () => ({
  getServerEnv: () => ({
    ADMIN_AUTH_SECRET: "admin-secret-with-at-least-32-characters",
  }),
}));
vi.mock("@/server/repositories/admin-auth-repository", () => ({
  postgresAdminAuthRepository: authRepository,
}));
vi.mock("@/server/repositories/admin-account-management-repository", () => ({
  postgresAdminAccountManagementRepository: accountRepository,
}));

import { POST as changeStatus } from "../../src/app/api/admin/accounts/[id]/actions/route";
import {
  GET as listAccounts,
  POST as createAccount,
} from "../../src/app/api/admin/accounts/route";

const actorId = "00000000-0000-4000-8000-000000000001";
const accountId = "00000000-0000-4000-8000-000000000002";
const cookie = `${ADMIN_SESSION_COOKIE_NAME}=raw-admin-token`;
const now = new Date("2026-08-13T12:00:00.000Z");
const account = {
  id: accountId,
  email: "second@example.com",
  displayName: "Seconde régie",
  status: "ACTIVE" as const,
  createdAt: now,
  updatedAt: now,
  lastLoginAt: null,
};

function request(url: string, body?: unknown) {
  const headers = new Headers({ cookie });
  if (body !== undefined) headers.set("Content-Type", "application/json");
  return new NextRequest(url, {
    method: body === undefined ? "GET" : "POST",
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("admin account management API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authRepository.findActiveSession.mockResolvedValue({
      id: actorId,
      email: "admin@example.com",
      displayName: "Régie principale",
    });
    accountRepository.listAccounts.mockResolvedValue([account]);
    accountRepository.findAccountById.mockResolvedValue(account);
    accountRepository.createAccount.mockResolvedValue("written");
    accountRepository.setAccountStatus.mockResolvedValue("written");
  });

  it("protège la liste avant tout accès aux comptes", async () => {
    const response = await listAccounts(
      new NextRequest("http://localhost/api/admin/accounts"),
    );
    expect(response.status).toBe(401);
    expect(accountRepository.listAccounts).not.toHaveBeenCalled();
  });

  it("retourne une liste non mise en cache et sans hash", async () => {
    const response = await listAccounts(
      request("http://localhost/api/admin/accounts"),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const payload = await response.text();
    expect(payload).toContain("second@example.com");
    expect(payload).not.toContain("passwordHash");
  });

  it("crée un compte avec l’identité de l’admin authentifié", async () => {
    const response = await createAccount(
      request("http://localhost/api/admin/accounts", {
        displayName: "Seconde régie",
        email: "second@example.com",
        password: "MotDePasse!2026",
        passwordConfirmation: "MotDePasse!2026",
      }),
    );
    expect(response.status).toBe(201);
    expect(accountRepository.createAccount).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "second@example.com",
        actorAdminId: actorId,
        passwordHash: expect.stringMatching(/^scrypt\$/),
      }),
    );
    const payload = await response.text();
    expect(payload).not.toContain("MotDePasse!2026");
    expect(payload).not.toContain("passwordHash");
  });

  it("désactive un compte et traduit la protection du dernier actif", async () => {
    const context = { params: Promise.resolve({ id: accountId }) };
    const success = await changeStatus(
      request(`http://localhost/api/admin/accounts/${accountId}/actions`, {
        action: "DISABLE",
      }),
      context,
    );
    expect(success.status).toBe(200);
    expect(accountRepository.setAccountStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId,
        actorAdminId: actorId,
        status: "DISABLED",
      }),
    );

    accountRepository.setAccountStatus.mockResolvedValue("last_active");
    const refused = await changeStatus(
      request(`http://localhost/api/admin/accounts/${accountId}/actions`, {
        action: "DISABLE",
      }),
      context,
    );
    expect(refused.status).toBe(409);
    await expect(refused.json()).resolves.toMatchObject({
      error: { code: "LAST_ACTIVE_ADMIN" },
    });
  });
});
