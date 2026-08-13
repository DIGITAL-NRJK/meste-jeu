import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migrationsDirectory = resolve(process.cwd(), "db/migrations");
const migrationSql = readdirSync(migrationsDirectory)
  .filter((fileName) => fileName.endsWith(".sql"))
  .sort()
  .map((fileName) => readFileSync(resolve(migrationsDirectory, fileName), "utf8"))
  .join("\n");

const expectedTables = [
  "events",
  "players",
  "player_sessions",
  "categories",
  "questions",
  "question_options",
  "question_sources",
  "quiz_sessions",
  "session_questions",
  "answers",
  "score_events",
  "rewards",
  "reward_awards",
  "admin_users",
  "admin_sessions",
  "consents",
  "audit_logs",
];

describe("initial PostgreSQL migration", () => {
  it("creates every V1 table", () => {
    for (const tableName of expectedTables) {
      expect(migrationSql).toContain(`CREATE TABLE "${tableName}"`);
    }
  });

  it("stores instants with timezone information", () => {
    expect(migrationSql).toContain("timestamp with time zone");
    expect(migrationSql).not.toMatch(/timestamp without time zone/i);
  });

  it("enforces one answer per player and played question", () => {
    expect(migrationSql).toContain(
      'CREATE UNIQUE INDEX "answers_player_session_question_unique" ON "answers" USING btree ("player_id","session_question_id")',
    );
  });

  it("enforces case-insensitive nicknames per event", () => {
    expect(migrationSql).toContain(
      'CREATE UNIQUE INDEX "players_event_nickname_unique" ON "players" USING btree ("event_id",lower("nickname"))',
    );
  });

  it("limits a question to one correct option at database level", () => {
    expect(migrationSql).toContain(
      'CREATE UNIQUE INDEX "question_options_one_correct_per_question_unique"',
    );
    expect(migrationSql).toContain(
      'WHERE "question_options"."is_correct" = true',
    );
  });

  it("defines the auditable score ledger", () => {
    for (const eventType of [
      "ANSWER_CORRECT",
      "DIFFICULTY_BONUS",
      "SPEED_BONUS",
      "STREAK_BONUS",
      "ADMIN_ADJUSTMENT",
    ]) {
      expect(migrationSql).toContain(eventType);
    }

    expect(migrationSql).toContain("score_events_admin_adjustment_author_check");
    expect(migrationSql).toContain("score_events_active_leaderboard_idx");
  });

  it("sépare le contexte test du cycle de vie des événements", () => {
    expect(migrationSql).toContain(
      'CREATE TYPE "public"."event_environment" AS ENUM(\'TEST\', \'PRODUCTION\')',
    );
    expect(migrationSql).toContain(
      'ADD COLUMN "environment" "event_environment" DEFAULT \'PRODUCTION\' NOT NULL',
    );
    expect(migrationSql).toContain("EVENT_RESET_DRAFT");
    expect(migrationSql).toContain("PLAYER_DELETED");
  });

  it("journalise le cycle de vie des comptes administrateurs", () => {
    expect(migrationSql).toContain("ADMIN_USER_CREATED");
    expect(migrationSql).toContain("ADMIN_USER_DISABLED");
    expect(migrationSql).toContain("ADMIN_USER_REACTIVATED");
  });
});
