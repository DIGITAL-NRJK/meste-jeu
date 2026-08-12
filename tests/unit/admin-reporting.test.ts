import { describe, expect, it, vi } from "vitest";

import { createCsvDocument } from "../../src/lib/csv";
import {
  AdminReportingEventNotFoundError,
  AdminReportingInputError,
  createAdminExport,
  getAdminAuditLogs,
  type AdminReportingRepository,
} from "../../src/server/services/admin-reporting";

function repository(): AdminReportingRepository {
  return {
    findEventBySlug: vi.fn(async () => ({
      id: "00000000-0000-4000-8000-000000000001",
      slug: "heritage-congo-2026",
      name: "Héritage Congo",
    })),
    listPlayers: vi.fn(async () => [
      {
        publicCode: "HC-001",
        nickname: '=HYPERLINK("https://example.com")',
        status: "ACTIVE" as const,
        currentStreak: 2,
        createdAt: "2026-08-13T10:00:00.000Z",
        lastSeenAt: "2026-08-13T11:00:00.000Z",
      },
    ]),
    listLeaderboard: vi.fn(async () => []),
    listAnswers: vi.fn(async () => []),
    listAuditLogs: vi.fn(async () => []),
  };
}

describe("admin reporting", () => {
  it("génère un CSV UTF-8 compatible tableur et neutralise les formules", async () => {
    const report = await createAdminExport(
      { kind: "players", eventSlug: "heritage-congo-2026" },
      repository(),
    );

    expect(report.filename).toBe("heritage-congo-2026-players.csv");
    expect(report.content.startsWith("\uFEFFcode_public;pseudo;")).toBe(true);
    expect(report.content).toContain("'=" + "HYPERLINK");
    expect(report.content.endsWith("\r\n")).toBe(true);
  });

  it("échappe les séparateurs, guillemets et retours à la ligne", () => {
    expect(createCsvDocument([["a;b", 'c"d', "e\nf"]])).toBe(
      '\uFEFF"a;b";"c""d";"e\nf"\r\n',
    );
  });

  it("refuse un type d’export inconnu et un événement absent", async () => {
    await expect(
      createAdminExport(
        { kind: "secrets", eventSlug: "heritage-congo-2026" },
        repository(),
      ),
    ).rejects.toBeInstanceOf(AdminReportingInputError);

    const missing = repository();
    vi.mocked(missing.findEventBySlug).mockResolvedValueOnce(null);
    await expect(
      createAdminExport(
        { kind: "answers", eventSlug: "heritage-congo-2026" },
        missing,
      ),
    ).rejects.toBeInstanceOf(AdminReportingEventNotFoundError);
  });

  it("borne le journal d’audit à cent lignes", async () => {
    const repo = repository();
    await getAdminAuditLogs(undefined, repo);
    expect(repo.listAuditLogs).toHaveBeenCalledWith(30);

    await expect(getAdminAuditLogs(101, repo)).rejects.toBeInstanceOf(
      AdminReportingInputError,
    );
  });
});
