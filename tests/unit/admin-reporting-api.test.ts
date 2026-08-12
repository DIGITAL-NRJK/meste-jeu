import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { ADMIN_SESSION_COOKIE_NAME } from "../../src/lib/auth/admin-session";

const authRepository = vi.hoisted(() => ({ findActiveSession: vi.fn() }));
const reportingRepository = vi.hoisted(() => ({
  findEventBySlug: vi.fn(),
  listPlayers: vi.fn(),
  listLeaderboard: vi.fn(),
  listAnswers: vi.fn(),
  listAuditLogs: vi.fn(),
}));

vi.mock("@/lib/env/server", () => ({
  getServerEnv: () => ({
    ADMIN_AUTH_SECRET: "admin-secret-with-at-least-32-characters",
  }),
}));
vi.mock("@/server/repositories/admin-auth-repository", () => ({
  postgresAdminAuthRepository: authRepository,
}));
vi.mock("@/server/repositories/admin-reporting-repository", () => ({
  postgresAdminReportingRepository: reportingRepository,
}));

import { GET as getAuditLogs } from "../../src/app/api/admin/audit-logs/route";
import { GET as getExport } from "../../src/app/api/admin/exports/[kind]/route";

const cookie = `${ADMIN_SESSION_COOKIE_NAME}=raw-admin-token`;

describe("admin reporting API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authRepository.findActiveSession.mockResolvedValue({
      id: "00000000-0000-4000-8000-000000000001",
      email: "admin@example.com",
      displayName: "Régie",
    });
    reportingRepository.findEventBySlug.mockResolvedValue({
      id: "00000000-0000-4000-8000-000000000002",
      slug: "heritage-congo-2026",
      name: "Héritage Congo",
    });
    reportingRepository.listPlayers.mockResolvedValue([]);
    reportingRepository.listAuditLogs.mockResolvedValue([]);
  });

  it("protège l’export avant toute lecture métier", async () => {
    const response = await getExport(
      new NextRequest(
        "http://localhost/api/admin/exports/players?eventSlug=heritage-congo-2026",
      ),
      { params: Promise.resolve({ kind: "players" }) },
    );

    expect(response.status).toBe(401);
    expect(reportingRepository.findEventBySlug).not.toHaveBeenCalled();
  });

  it("retourne une pièce jointe CSV sans cache", async () => {
    const response = await getExport(
      new NextRequest(
        "http://localhost/api/admin/exports/players?eventSlug=heritage-congo-2026",
        { headers: { cookie } },
      ),
      { params: Promise.resolve({ kind: "players" }) },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(response.headers.get("content-disposition")).toContain(
      'filename="heritage-congo-2026-players.csv"',
    );
    expect((await response.text()).startsWith("code_public;")).toBe(true);
  });

  it("retourne le journal borné et refuse une limite excessive", async () => {
    const response = await getAuditLogs(
      new NextRequest("http://localhost/api/admin/audit-logs?limit=20", {
        headers: { cookie },
      }),
    );
    expect(response.status).toBe(200);
    expect(reportingRepository.listAuditLogs).toHaveBeenCalledWith(20);

    const invalid = await getAuditLogs(
      new NextRequest("http://localhost/api/admin/audit-logs?limit=101", {
        headers: { cookie },
      }),
    );
    expect(invalid.status).toBe(400);
  });

  it("protège aussi la lecture du journal d’audit", async () => {
    authRepository.findActiveSession.mockResolvedValueOnce(null);
    const response = await getAuditLogs(
      new NextRequest("http://localhost/api/admin/audit-logs"),
    );

    expect(response.status).toBe(401);
    expect(reportingRepository.listAuditLogs).not.toHaveBeenCalled();
  });
});
