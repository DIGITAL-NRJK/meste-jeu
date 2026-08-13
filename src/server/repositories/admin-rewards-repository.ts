import "server-only";

import { asc, eq, sql } from "drizzle-orm";

import {
  adminUsers,
  auditLogs,
  events,
  players,
  rewardAwards,
  rewards,
} from "../../../db/schema";
import { getDb } from "@/lib/db/client";
import type {
  AdminReward,
  AdminRewardsRepository,
  RewardAward,
  RewardEvent,
  RewardWriteOutcome,
} from "@/server/services/admin-rewards";

async function listEvents(): Promise<RewardEvent[]> {
  const result = await getDb().execute<RewardEvent>(sql`
    SELECT event.id, event.slug, event.name, event.status::text AS status
    FROM ${events} AS event
    ORDER BY
      CASE event.status::text
        WHEN 'LIVE' THEN 0 WHEN 'READY' THEN 1 WHEN 'DRAFT' THEN 2
        WHEN 'FINISHED' THEN 3 ELSE 4
      END,
      event.starts_at DESC
  `);
  return [...result.rows];
}

type RewardRow = Omit<AdminReward, "awards">;
type AwardRow = RewardAward & { rewardId: string };

async function listRewards(eventId: string): Promise<AdminReward[]> {
  const db = getDb();
  const [rewardRows, awardRows] = await db.batch([
    db
      .select()
      .from(rewards)
      .where(eq(rewards.eventId, eventId))
      .orderBy(asc(rewards.awardPosition), asc(rewards.name)),
    db
      .select({
        id: rewardAwards.id,
        rewardId: rewardAwards.rewardId,
        playerId: players.id,
        publicCode: players.publicCode,
        nickname: players.nickname,
        awardedAt: rewardAwards.awardedAt,
        deliveredAt: rewardAwards.deliveredAt,
        deliveredByAdminName: adminUsers.displayName,
        notes: rewardAwards.notes,
      })
      .from(rewardAwards)
      .innerJoin(rewards, eq(rewards.id, rewardAwards.rewardId))
      .innerJoin(players, eq(players.id, rewardAwards.playerId))
      .leftJoin(adminUsers, eq(adminUsers.id, rewardAwards.deliveredByAdminId))
      .where(eq(rewards.eventId, eventId))
      .orderBy(asc(rewardAwards.awardedAt)),
  ]);
  const awardsByReward = new Map<string, RewardAward[]>();
  for (const award of awardRows as AwardRow[]) {
    const current = awardsByReward.get(award.rewardId) ?? [];
    current.push({
      id: award.id,
      playerId: award.playerId,
      publicCode: award.publicCode,
      nickname: award.nickname,
      awardedAt: award.awardedAt,
      deliveredAt: award.deliveredAt,
      deliveredByAdminName: award.deliveredByAdminName,
      notes: award.notes,
    });
    awardsByReward.set(award.rewardId, current);
  }
  return (rewardRows as RewardRow[]).map((reward) => ({
    ...reward,
    awards: awardsByReward.get(reward.id) ?? [],
  }));
}

async function createReward(input: {
  id: string;
  eventId: string;
  name: string;
  description: string | null;
  awardPosition: number | null;
  awardCondition: string | null;
  now: Date;
}): Promise<AdminReward> {
  const [reward] = await getDb()
    .insert(rewards)
    .values({
      ...input,
      createdAt: input.now,
      updatedAt: input.now,
    })
    .returning();
  if (!reward) throw new Error("Reward insertion returned no row");
  return { ...reward, awards: [] };
}

async function updateReward(input: {
  rewardId: string;
  name: string;
  description: string | null;
  awardPosition: number | null;
  awardCondition: string | null;
  active: boolean;
  now: Date;
}): Promise<RewardWriteOutcome> {
  const [reward] = await getDb()
    .update(rewards)
    .set({
      name: input.name,
      description: input.description,
      awardPosition: input.awardPosition,
      awardCondition: input.awardCondition,
      active: input.active,
      updatedAt: input.now,
    })
    .where(eq(rewards.id, input.rewardId))
    .returning({ id: rewards.id });
  return reward ? "written" : "not_found";
}

type WriteOutcomeRow = {
  outcome: "WRITTEN" | "NOT_FOUND" | "PLAYER_NOT_FOUND" | "DUPLICATE" | "ALREADY_DELIVERED";
};

async function awardReward(input: {
  awardId: string;
  rewardId: string;
  playerId: string;
  notes: string | null;
  actorAdminId: string;
  now: Date;
}): Promise<RewardWriteOutcome> {
  const result = await getDb().execute<WriteOutcomeRow>(sql`
    WITH candidate_reward AS (
      SELECT reward.id, reward.event_id, reward.name, reward.active
      FROM ${rewards} AS reward
      WHERE reward.id = ${input.rewardId}::uuid
    ), candidate_player AS (
      SELECT player.id, player.event_id, player.public_code
      FROM ${players} AS player
      WHERE player.id = ${input.playerId}::uuid
    ), eligible AS (
      SELECT
        candidate_reward.id AS reward_id,
        candidate_reward.event_id,
        candidate_reward.name AS reward_name,
        candidate_player.id AS player_id,
        candidate_player.public_code
      FROM candidate_reward
      INNER JOIN candidate_player
        ON candidate_player.event_id = candidate_reward.event_id
      WHERE candidate_reward.active = true
    ), inserted AS (
      INSERT INTO ${rewardAwards} (
        id, reward_id, player_id, awarded_at, notes
      )
      SELECT
        ${input.awardId}::uuid,
        eligible.reward_id,
        eligible.player_id,
        ${input.now},
        ${input.notes}::text
      FROM eligible
      ON CONFLICT (reward_id, player_id) DO NOTHING
      RETURNING id, reward_id, player_id
    ), audit AS (
      INSERT INTO ${auditLogs} (
        admin_user_id, action, entity_type, entity_id, metadata, created_at
      )
      SELECT
        ${input.actorAdminId}::uuid,
        'REWARD_AWARDED',
        'reward_award',
        inserted.id,
        jsonb_build_object(
          'rewardId', eligible.reward_id,
          'rewardName', eligible.reward_name,
          'playerId', eligible.player_id,
          'publicCode', eligible.public_code,
          'eventId', eligible.event_id
        ),
        ${input.now}
      FROM inserted
      INNER JOIN eligible
        ON eligible.reward_id = inserted.reward_id
        AND eligible.player_id = inserted.player_id
      RETURNING id
    )
    SELECT CASE
      WHEN NOT EXISTS (
        SELECT 1 FROM candidate_reward WHERE candidate_reward.active = true
      ) THEN 'NOT_FOUND'
      WHEN NOT EXISTS (SELECT 1 FROM candidate_player) THEN 'PLAYER_NOT_FOUND'
      WHEN NOT EXISTS (SELECT 1 FROM eligible) THEN 'PLAYER_NOT_FOUND'
      WHEN NOT EXISTS (SELECT 1 FROM inserted) THEN 'DUPLICATE'
      ELSE 'WRITTEN'
    END::text AS outcome
  `);
  return mapOutcome(result.rows[0]?.outcome);
}

async function deliverAward(input: {
  awardId: string;
  notes: string | null;
  actorAdminId: string;
  now: Date;
}): Promise<RewardWriteOutcome> {
  const result = await getDb().execute<WriteOutcomeRow>(sql`
    WITH candidate AS (
      SELECT award.id, award.delivered_at
      FROM ${rewardAwards} AS award
      WHERE award.id = ${input.awardId}::uuid
    ), delivered AS (
      UPDATE ${rewardAwards} AS award
      SET
        delivered_at = ${input.now},
        delivered_by_admin_id = ${input.actorAdminId}::uuid,
        notes = COALESCE(${input.notes}::text, award.notes)
      WHERE award.id = ${input.awardId}::uuid
        AND award.delivered_at IS NULL
      RETURNING award.id
    )
    SELECT CASE
      WHEN NOT EXISTS (SELECT 1 FROM candidate) THEN 'NOT_FOUND'
      WHEN NOT EXISTS (SELECT 1 FROM delivered) THEN 'ALREADY_DELIVERED'
      ELSE 'WRITTEN'
    END::text AS outcome
  `);
  return mapOutcome(result.rows[0]?.outcome);
}

function mapOutcome(outcome: WriteOutcomeRow["outcome"] | undefined): RewardWriteOutcome {
  if (outcome === "WRITTEN") return "written";
  if (outcome === "PLAYER_NOT_FOUND") return "player_not_found";
  if (outcome === "DUPLICATE") return "duplicate";
  if (outcome === "ALREADY_DELIVERED") return "already_delivered";
  return "not_found";
}

export const postgresAdminRewardsRepository: AdminRewardsRepository = {
  listEvents,
  listRewards,
  createReward,
  updateReward,
  awardReward,
  deliverAward,
};
