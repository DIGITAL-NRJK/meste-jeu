import { randomUUID } from "node:crypto";

import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  adminUsers,
  auditLogs,
  events,
  players,
  rewardAwards,
  rewards,
} from "../../db/schema";
import { getDb } from "../../src/lib/db/client";
import { postgresAdminRewardsRepository } from "../../src/server/repositories/admin-rewards-repository";
import {
  AdminRewardDuplicateAwardError,
  AdminRewardPlayerNotFoundError,
  awardAdminReward,
  createAdminReward,
  deliverAdminReward,
  getAdminRewards,
} from "../../src/server/services/admin-rewards";

if (
  process.env.DATABASE_INTEGRATION_TARGET !== "neon-preview" ||
  process.env.GITHUB_EVENT_NAME !== "pull_request"
) {
  throw new Error(
    "Database integration tests are restricted to Neon pull request branches.",
  );
}

const db = getDb();
const now = new Date("2026-08-13T12:00:00.000Z");
const deliveredAt = new Date("2026-08-13T12:30:00.000Z");
const adminId = randomUUID();
const eventIds = [randomUUID(), randomUUID()];
const playerIds = [randomUUID(), randomUUID()];
const rewardId = randomUUID();
const awardId = randomUUID();
const eventSlug = `integration-rewards-${randomUUID()}`;

describe("admin rewards with PostgreSQL", () => {
  beforeAll(async () => {
    await db.insert(adminUsers).values({
      id: adminId,
      email: `integration-rewards-${randomUUID()}@example.com`,
      passwordHash: "integration-test-only",
      displayName: "Régie lots intégration",
    });
    await db.insert(events).values([
      {
        id: eventIds[0],
        slug: eventSlug,
        name: "Tombola intégration République du Congo",
        startsAt: new Date("2026-08-15T16:00:00.000Z"),
        endsAt: new Date("2026-08-15T22:00:00.000Z"),
        timezone: "Africa/Accra",
        status: "READY",
      },
      {
        id: eventIds[1],
        slug: `${eventSlug}-autre`,
        name: "Autre événement intégration",
        startsAt: new Date("2026-08-16T16:00:00.000Z"),
        endsAt: new Date("2026-08-16T22:00:00.000Z"),
        timezone: "Africa/Accra",
        status: "DRAFT",
      },
    ]);
    await db.insert(players).values([
      {
        id: playerIds[0],
        eventId: eventIds[0],
        publicCode: `REWARD-${randomUUID()}`,
        nickname: "Makaya lots",
      },
      {
        id: playerIds[1],
        eventId: eventIds[1],
        publicCode: `REWARD-${randomUUID()}`,
        nickname: "Joueur événement étranger",
      },
    ]);
  });

  afterAll(async () => {
    await db.delete(auditLogs).where(eq(auditLogs.adminUserId, adminId));
    await db.delete(rewardAwards).where(eq(rewardAwards.id, awardId));
    await db.delete(rewards).where(eq(rewards.id, rewardId));
    await db.delete(players).where(inArray(players.id, playerIds));
    await db.delete(events).where(inArray(events.id, eventIds));
    await db.delete(adminUsers).where(eq(adminUsers.id, adminId));
  });

  it("crée un lot avec sa règle et le restitue pour son événement", async () => {
    await createAdminReward(
      {
        eventId: eventIds[0],
        name: "Premier prix intégration",
        description: "Lot réservé au premier du classement",
        awardPosition: 1,
        awardCondition: null,
      },
      {
        repository: postgresAdminRewardsRepository,
        createId: () => rewardId,
        now: () => now,
      },
    );

    const management = await getAdminRewards(
      eventSlug,
      postgresAdminRewardsRepository,
    );
    expect(management.rewards).toEqual([
      expect.objectContaining({
        id: rewardId,
        eventId: eventIds[0],
        awardPosition: 1,
        active: true,
      }),
    ]);
  });

  it("refuse un joueur d’un autre événement", async () => {
    await expect(
      awardAdminReward(
        rewardId,
        { playerId: playerIds[1], notes: null },
        adminId,
        {
          repository: postgresAdminRewardsRepository,
          createId: () => randomUUID(),
          now: () => now,
        },
      ),
    ).rejects.toBeInstanceOf(AdminRewardPlayerNotFoundError);
  });

  it("attribue une seule fois, audite, puis horodate la remise", async () => {
    await awardAdminReward(
      rewardId,
      { playerId: playerIds[0], notes: "Contrôle identité requis" },
      adminId,
      {
        repository: postgresAdminRewardsRepository,
        createId: () => awardId,
        now: () => now,
      },
    );

    await expect(
      awardAdminReward(
        rewardId,
        { playerId: playerIds[0], notes: null },
        adminId,
        {
          repository: postgresAdminRewardsRepository,
          createId: () => randomUUID(),
          now: () => now,
        },
      ),
    ).rejects.toBeInstanceOf(AdminRewardDuplicateAwardError);

    const [audit] = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.entityId, awardId));
    expect(audit).toMatchObject({
      adminUserId: adminId,
      action: "REWARD_AWARDED",
      entityType: "reward_award",
    });

    await deliverAdminReward(awardId, { notes: null }, adminId, {
      repository: postgresAdminRewardsRepository,
      now: () => deliveredAt,
    });
    const [award] = await db
      .select()
      .from(rewardAwards)
      .where(eq(rewardAwards.id, awardId));
    expect(award).toMatchObject({
      deliveredAt,
      deliveredByAdminId: adminId,
      notes: "Contrôle identité requis",
    });
  });
});
