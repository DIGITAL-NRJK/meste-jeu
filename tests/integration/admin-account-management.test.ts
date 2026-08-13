import { randomUUID } from "node:crypto";

import { eq, inArray, or } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { adminSessions, adminUsers, auditLogs } from "../../db/schema";
import { getDb } from "../../src/lib/db/client";
import { verifyAdminPassword } from "../../src/lib/auth/admin-password";
import { postgresAdminAccountManagementRepository } from "../../src/server/repositories/admin-account-management-repository";
import {
  AdminAccountLastActiveError,
  changeAdminAccountStatus,
  createAdminAccount,
  getAdminAccounts,
} from "../../src/server/services/admin-account-management";

if (
  process.env.DATABASE_INTEGRATION_TARGET !== "neon-preview" ||
  process.env.GITHUB_EVENT_NAME !== "pull_request"
) {
  throw new Error(
    "Database integration tests are restricted to Neon pull request branches.",
  );
}

const db = getDb();
const actorId = randomUUID();
const accountId = randomUUID();
const sessionId = randomUUID();
const now = new Date("2026-08-13T12:00:00.000Z");
const later = new Date("2026-08-13T12:30:00.000Z");
const email = `integration-admin-${randomUUID()}@example.com`;

describe("admin account management with PostgreSQL", () => {
  beforeAll(async () => {
    await db.insert(adminUsers).values({
      id: actorId,
      email: `integration-admin-actor-${randomUUID()}@example.com`,
      passwordHash: "integration-test-only",
      displayName: "Régie comptes intégration",
    });
  });

  afterAll(async () => {
    await db
      .delete(auditLogs)
      .where(
        or(
          eq(auditLogs.adminUserId, actorId),
          eq(auditLogs.adminUserId, accountId),
          eq(auditLogs.entityId, accountId),
        ),
      );
    await db
      .delete(adminSessions)
      .where(inArray(adminSessions.adminUserId, [actorId, accountId]));
    await db
      .delete(adminUsers)
      .where(inArray(adminUsers.id, [actorId, accountId]));
  });

  it("crée un compte haché sans exposer le hash dans le DTO", async () => {
    const created = await createAdminAccount(
      {
        displayName: "Seconde régie intégration",
        email,
        password: "MotDePasse!2026",
        passwordConfirmation: "MotDePasse!2026",
      },
      actorId,
      {
        repository: postgresAdminAccountManagementRepository,
        createId: () => accountId,
        now: () => now,
      },
    );

    expect(created).toMatchObject({
      id: accountId,
      email,
      status: "ACTIVE",
    });
    expect(JSON.stringify(created)).not.toContain("password");

    const [stored] = await db
      .select({ passwordHash: adminUsers.passwordHash })
      .from(adminUsers)
      .where(eq(adminUsers.id, accountId));
    expect(stored?.passwordHash).toMatch(/^scrypt\$/);
    await expect(
      verifyAdminPassword("MotDePasse!2026", stored?.passwordHash ?? ""),
    ).resolves.toBe(true);

    const [audit] = await db
      .select({ action: auditLogs.action })
      .from(auditLogs)
      .where(eq(auditLogs.entityId, accountId));
    expect(audit?.action).toBe("ADMIN_USER_CREATED");
  });

  it("révoque les sessions à la désactivation puis permet la réactivation", async () => {
    await db.insert(adminSessions).values({
      id: sessionId,
      adminUserId: accountId,
      tokenHash: `integration-admin-session-${randomUUID()}`,
      createdAt: now,
      lastSeenAt: now,
      expiresAt: new Date("2026-08-14T12:00:00.000Z"),
    });

    const disabled = await changeAdminAccountStatus(
      accountId,
      { action: "DISABLE" },
      actorId,
      { repository: postgresAdminAccountManagementRepository, now: () => later },
    );
    expect(disabled.status).toBe("DISABLED");

    const [session] = await db
      .select({ revokedAt: adminSessions.revokedAt })
      .from(adminSessions)
      .where(eq(adminSessions.id, sessionId));
    expect(session?.revokedAt).toEqual(later);

    const reactivated = await changeAdminAccountStatus(
      accountId,
      { action: "REACTIVATE" },
      actorId,
      {
        repository: postgresAdminAccountManagementRepository,
        now: () => new Date("2026-08-13T13:00:00.000Z"),
      },
    );
    expect(reactivated.status).toBe("ACTIVE");

    const actions = await db
      .select({ action: auditLogs.action })
      .from(auditLogs)
      .where(eq(auditLogs.entityId, accountId));
    expect(actions.map(({ action }) => action)).toEqual(
      expect.arrayContaining([
        "ADMIN_USER_CREATED",
        "ADMIN_USER_DISABLED",
        "ADMIN_USER_REACTIVATED",
      ]),
    );
  });

  it("refuse atomiquement la désactivation du dernier compte actif", async () => {
    await changeAdminAccountStatus(
      accountId,
      { action: "DISABLE" },
      actorId,
      {
        repository: postgresAdminAccountManagementRepository,
        now: () => new Date("2026-08-13T13:30:00.000Z"),
      },
    );

    await expect(
      changeAdminAccountStatus(actorId, { action: "DISABLE" }, actorId, {
        repository: postgresAdminAccountManagementRepository,
        now: () => new Date("2026-08-13T14:00:00.000Z"),
      }),
    ).rejects.toBeInstanceOf(AdminAccountLastActiveError);

    const accounts = await getAdminAccounts(
      postgresAdminAccountManagementRepository,
    );
    expect(accounts.find((account) => account.id === actorId)?.status).toBe(
      "ACTIVE",
    );
  });
});
