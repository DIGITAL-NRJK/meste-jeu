import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { ADMIN_SESSION_COOKIE_NAME } from "../../src/lib/auth/admin-session";

const verifyPassword = vi.hoisted(() => vi.fn());
const authRepository = vi.hoisted(() => ({
  findUserByEmail: vi.fn(),
  recordFailedLogin: vi.fn(),
  createSession: vi.fn(),
  findActiveSession: vi.fn(),
  revokeSession: vi.fn(),
}));
const dashboardRepository = vi.hoisted(() => ({
  listEvents: vi.fn(),
  getDashboard: vi.fn(),
}));

vi.mock("@/lib/auth/admin-password", () => ({
  DUMMY_ADMIN_PASSWORD_HASH: "dummy-hash",
  verifyAdminPassword: verifyPassword,
}));

vi.mock("@/lib/env/server", () => ({
  getServerEnv: () => ({
    DATABASE_URL: "postgresql://user:password@example.neon.tech/database",
    APP_URL: "http://localhost:3000",
    SESSION_SECRET: "session-secret-with-at-least-32-characters",
    ADMIN_AUTH_SECRET: "admin-secret-with-at-least-32-characters",
  }),
}));

vi.mock("@/server/repositories/admin-auth-repository", () => ({
  postgresAdminAuthRepository: authRepository,
}));

vi.mock("@/server/repositories/admin-dashboard-repository", () => ({
  postgresAdminDashboardRepository: dashboardRepository,
}));

import { GET as getDashboard } from "../../src/app/api/admin/dashboard/route";
import { POST as login } from "../../src/app/api/admin/login/route";
import { POST as logout } from "../../src/app/api/admin/logout/route";

const admin = {
  id: "00000000-0000-4000-8000-000000000001",
  email: "regie@meste.example",
  displayName: "Régie MESTE",
};
const event = {
  id: "00000000-0000-4000-8000-000000000002",
  slug: "heritage-congo-2026",
  name: "Héritage Congo 2026",
  status: "LIVE",
};

describe("admin API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    verifyPassword.mockResolvedValue(true);
    authRepository.findUserByEmail.mockResolvedValue({
      ...admin,
      passwordHash: "encoded-password",
      status: "ACTIVE",
      lockedUntil: null,
    });
    authRepository.createSession.mockResolvedValue(undefined);
    authRepository.findActiveSession.mockResolvedValue(admin);
    authRepository.revokeSession.mockResolvedValue(undefined);
    dashboardRepository.listEvents.mockResolvedValue([event]);
    dashboardRepository.getDashboard.mockResolvedValue({
      serverNow: "2026-08-13T12:00:00.000Z",
      event,
      participants: { registered: 12, activeRecently: 7 },
      session: null,
      currentQuestion: null,
      leaderboard: [],
      questionLibrary: { total: 10, drafts: 2, inReview: 1, validated: 7 },
    });
  });

  it("pose un cookie HttpOnly sans exposer le token ni le hash", async () => {
    const response = await login(
      new NextRequest("http://localhost/api/admin/login", {
        method: "POST",
        body: JSON.stringify({
          email: "regie@meste.example",
          password: "mot-de-passe",
        }),
        headers: { "Content-Type": "application/json" },
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("set-cookie")).toContain(
      `${ADMIN_SESSION_COOKIE_NAME}=`,
    );
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    const payload = await response.json();
    expect(payload).toEqual({ admin });
    expect(JSON.stringify(payload)).not.toContain("password");
  });

  it("retourne une erreur générique pour des identifiants incorrects", async () => {
    verifyPassword.mockResolvedValueOnce(false);
    const response = await login(
      new NextRequest("http://localhost/api/admin/login", {
        method: "POST",
        body: JSON.stringify({
          email: "regie@meste.example",
          password: "incorrect",
        }),
      }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "INVALID_CREDENTIALS" },
    });
  });

  it("protège le dashboard avant toute lecture métier", async () => {
    authRepository.findActiveSession.mockResolvedValueOnce(null);
    const response = await getDashboard(
      new NextRequest("http://localhost/api/admin/dashboard", {
        headers: { cookie: `${ADMIN_SESSION_COOKIE_NAME}=invalid-token` },
      }),
    );

    expect(response.status).toBe(401);
    expect(dashboardRepository.listEvents).not.toHaveBeenCalled();
  });

  it("retourne le dashboard authentifié sans mise en cache", async () => {
    const response = await getDashboard(
      new NextRequest(
        "http://localhost/api/admin/dashboard?eventSlug=heritage-congo-2026",
        { headers: { cookie: `${ADMIN_SESSION_COOKIE_NAME}=raw-admin-token` } },
      ),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({
      event: { slug: "heritage-congo-2026" },
      participants: { registered: 12, activeRecently: 7 },
    });
  });

  it("révoque la session et supprime le cookie", async () => {
    const response = await logout(
      new NextRequest("http://localhost/api/admin/logout", {
        method: "POST",
        headers: { cookie: `${ADMIN_SESSION_COOKIE_NAME}=raw-admin-token` },
      }),
    );

    expect(response.status).toBe(204);
    expect(authRepository.revokeSession).toHaveBeenCalled();
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });
});
