import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const utcTimestamp = (name: string) =>
  timestamp(name, { mode: "date", withTimezone: true });

export const eventStatusEnum = pgEnum("event_status", [
  "DRAFT",
  "READY",
  "LIVE",
  "FINISHED",
  "CANCELED",
]);

export const playerStatusEnum = pgEnum("player_status", [
  "ACTIVE",
  "DISABLED",
]);

export const adminUserStatusEnum = pgEnum("admin_user_status", [
  "ACTIVE",
  "DISABLED",
]);

export const questionStatusEnum = pgEnum("question_status", [
  "DRAFT",
  "REVIEW",
  "VALIDATED",
  "ARCHIVED",
]);

export const questionMediaTypeEnum = pgEnum("question_media_type", [
  "TEXT",
  "IMAGE",
]);

export const quizModeEnum = pgEnum("quiz_mode", ["DISCOVERY", "LIVE"]);

export const quizSessionStatusEnum = pgEnum("quiz_session_status", [
  "DRAFT",
  "READY",
  "LIVE",
  "FINISHED",
  "CANCELED",
]);

export const sessionQuestionStatusEnum = pgEnum("session_question_status", [
  "PENDING",
  "OPEN",
  "CLOSED",
  "REVEALED",
  "CANCELED",
]);

export const scoreEventTypeEnum = pgEnum("score_event_type", [
  "ANSWER_CORRECT",
  "DIFFICULTY_BONUS",
  "SPEED_BONUS",
  "STREAK_BONUS",
  "ADMIN_ADJUSTMENT",
]);

export const auditActionEnum = pgEnum("audit_action", [
  "QUESTION_CREATED",
  "QUESTION_UPDATED",
  "QUESTION_VALIDATED",
  "SESSION_CREATED",
  "SESSION_STARTED",
  "SESSION_FINISHED",
  "QUESTION_STARTED",
  "QUESTION_CLOSED",
  "QUESTION_REVEALED",
  "QUESTION_CANCELED",
  "SCORE_ADJUSTED",
  "PLAYER_DISABLED",
  "REWARD_AWARDED",
]);

export const adminUsers = pgTable(
  "admin_users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    displayName: text("display_name").notNull(),
    status: adminUserStatusEnum("status").default("ACTIVE").notNull(),
    createdAt: utcTimestamp("created_at").defaultNow().notNull(),
    updatedAt: utcTimestamp("updated_at").defaultNow().notNull(),
    lastLoginAt: utcTimestamp("last_login_at"),
    failedLoginCount: integer("failed_login_count").default(0).notNull(),
    lockedUntil: utcTimestamp("locked_until"),
  },
  (table) => [
    uniqueIndex("admin_users_email_unique").on(sql`lower(${table.email})`),
    check(
      "admin_users_failed_login_count_nonnegative_check",
      sql`${table.failedLoginCount} >= 0`,
    ),
  ],
);

export const events = pgTable(
  "events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    startsAt: utcTimestamp("starts_at").notNull(),
    endsAt: utcTimestamp("ends_at").notNull(),
    timezone: text("timezone").notNull(),
    status: eventStatusEnum("status").default("DRAFT").notNull(),
    createdAt: utcTimestamp("created_at").defaultNow().notNull(),
    updatedAt: utcTimestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("events_slug_unique").on(table.slug),
    check("events_dates_order_check", sql`${table.endsAt} > ${table.startsAt}`),
  ],
);

export const players = pgTable(
  "players",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "restrict" }),
    publicCode: text("public_code").notNull(),
    nickname: text("nickname").notNull(),
    status: playerStatusEnum("status").default("ACTIVE").notNull(),
    currentStreak: integer("current_streak").default(0).notNull(),
    createdAt: utcTimestamp("created_at").defaultNow().notNull(),
    updatedAt: utcTimestamp("updated_at").defaultNow().notNull(),
    lastSeenAt: utcTimestamp("last_seen_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("players_public_code_unique").on(table.publicCode),
    uniqueIndex("players_event_nickname_unique").on(
      table.eventId,
      sql`lower(${table.nickname})`,
    ),
    index("players_event_status_idx").on(table.eventId, table.status),
    check(
      "players_current_streak_nonnegative_check",
      sql`${table.currentStreak} >= 0`,
    ),
  ],
);

export const playerSessions = pgTable(
  "player_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    playerId: uuid("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "restrict" }),
    tokenHash: text("token_hash").notNull(),
    createdAt: utcTimestamp("created_at").defaultNow().notNull(),
    expiresAt: utcTimestamp("expires_at").notNull(),
    lastSeenAt: utcTimestamp("last_seen_at").defaultNow().notNull(),
    revokedAt: utcTimestamp("revoked_at"),
  },
  (table) => [
    uniqueIndex("player_sessions_token_hash_unique").on(table.tokenHash),
    index("player_sessions_player_idx").on(table.playerId),
    check(
      "player_sessions_expiration_check",
      sql`${table.expiresAt} > ${table.createdAt}`,
    ),
  ],
);

export const categories = pgTable(
  "categories",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    active: boolean("active").default(true).notNull(),
  },
  (table) => [uniqueIndex("categories_slug_unique").on(table.slug)],
);

export const questions = pgTable(
  "questions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "restrict" }),
    questionText: text("question_text").notNull(),
    explanation: text("explanation").notNull(),
    difficulty: integer("difficulty").notNull(),
    status: questionStatusEnum("status").default("DRAFT").notNull(),
    mediaType: questionMediaTypeEnum("media_type").default("TEXT").notNull(),
    mediaUrl: text("media_url"),
    createdAt: utcTimestamp("created_at").defaultNow().notNull(),
    updatedAt: utcTimestamp("updated_at").defaultNow().notNull(),
    validatedAt: utcTimestamp("validated_at"),
    validatedBy: uuid("validated_by").references(() => adminUsers.id, {
      onDelete: "restrict",
    }),
  },
  (table) => [
    index("questions_category_status_idx").on(table.categoryId, table.status),
    check(
      "questions_difficulty_range_check",
      sql`${table.difficulty} between 1 and 4`,
    ),
    check(
      "questions_image_url_check",
      sql`${table.mediaType} <> 'IMAGE' OR ${table.mediaUrl} IS NOT NULL`,
    ),
    check(
      "questions_validation_metadata_check",
      sql`${table.status} <> 'VALIDATED' OR (${table.validatedAt} IS NOT NULL AND ${table.validatedBy} IS NOT NULL)`,
    ),
  ],
);

export const questionOptions = pgTable(
  "question_options",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    questionId: uuid("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "restrict" }),
    label: text("label").notNull(),
    text: text("text").notNull(),
    isCorrect: boolean("is_correct").default(false).notNull(),
    position: integer("position").notNull(),
  },
  (table) => [
    uniqueIndex("question_options_question_label_unique").on(
      table.questionId,
      table.label,
    ),
    uniqueIndex("question_options_question_position_unique").on(
      table.questionId,
      table.position,
    ),
    uniqueIndex("question_options_one_correct_per_question_unique")
      .on(table.questionId)
      .where(sql`${table.isCorrect} = true`),
    check(
      "question_options_position_range_check",
      sql`${table.position} between 1 and 4`,
    ),
  ],
);

export const questionSources = pgTable(
  "question_sources",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    questionId: uuid("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "restrict" }),
    publisher: text("publisher").notNull(),
    title: text("title").notNull(),
    url: text("url").notNull(),
    verifiedAt: utcTimestamp("verified_at").notNull(),
    notes: text("notes"),
  },
  (table) => [
    uniqueIndex("question_sources_question_url_unique").on(
      table.questionId,
      table.url,
    ),
  ],
);

export const quizSessions = pgTable(
  "quiz_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    mode: quizModeEnum("mode").notNull(),
    status: quizSessionStatusEnum("status").default("DRAFT").notNull(),
    startsAt: utcTimestamp("starts_at"),
    endsAt: utcTimestamp("ends_at"),
    resetScore: boolean("reset_score").default(false).notNull(),
    createdAt: utcTimestamp("created_at").defaultNow().notNull(),
    updatedAt: utcTimestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("quiz_sessions_event_slug_unique").on(
      table.eventId,
      table.slug,
    ),
    index("quiz_sessions_event_status_idx").on(table.eventId, table.status),
    check(
      "quiz_sessions_dates_order_check",
      sql`${table.startsAt} IS NULL OR ${table.endsAt} IS NULL OR ${table.endsAt} > ${table.startsAt}`,
    ),
  ],
);

export const sessionQuestions = pgTable(
  "session_questions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    quizSessionId: uuid("quiz_session_id")
      .notNull()
      .references(() => quizSessions.id, { onDelete: "restrict" }),
    questionId: uuid("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "restrict" }),
    position: integer("position").notNull(),
    durationSeconds: integer("duration_seconds").notNull(),
    status: sessionQuestionStatusEnum("status").default("PENDING").notNull(),
    opensAt: utcTimestamp("opens_at"),
    closesAt: utcTimestamp("closes_at"),
    revealedAt: utcTimestamp("revealed_at"),
    canceledAt: utcTimestamp("canceled_at"),
  },
  (table) => [
    uniqueIndex("session_questions_session_position_unique").on(
      table.quizSessionId,
      table.position,
    ),
    uniqueIndex("session_questions_session_question_unique").on(
      table.quizSessionId,
      table.questionId,
    ),
    uniqueIndex("session_questions_one_open_per_session_unique")
      .on(table.quizSessionId)
      .where(sql`${table.status} = 'OPEN'`),
    index("session_questions_session_status_idx").on(
      table.quizSessionId,
      table.status,
    ),
    check(
      "session_questions_position_positive_check",
      sql`${table.position} > 0`,
    ),
    check(
      "session_questions_duration_positive_check",
      sql`${table.durationSeconds} > 0`,
    ),
    check(
      "session_questions_dates_order_check",
      sql`${table.opensAt} IS NULL OR ${table.closesAt} IS NULL OR ${table.closesAt} > ${table.opensAt}`,
    ),
    check(
      "session_questions_reveal_order_check",
      sql`${table.revealedAt} IS NULL OR ${table.closesAt} IS NULL OR ${table.revealedAt} >= ${table.closesAt}`,
    ),
  ],
);

export const answers = pgTable(
  "answers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    playerId: uuid("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "restrict" }),
    sessionQuestionId: uuid("session_question_id")
      .notNull()
      .references(() => sessionQuestions.id, { onDelete: "restrict" }),
    questionOptionId: uuid("question_option_id")
      .notNull()
      .references(() => questionOptions.id, { onDelete: "restrict" }),
    receivedAt: utcTimestamp("received_at").notNull(),
    responseTimeMs: integer("response_time_ms").notNull(),
    isCorrect: boolean("is_correct").notNull(),
    createdAt: utcTimestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("answers_player_session_question_unique").on(
      table.playerId,
      table.sessionQuestionId,
    ),
    index("answers_session_question_idx").on(table.sessionQuestionId),
    check(
      "answers_response_time_nonnegative_check",
      sql`${table.responseTimeMs} >= 0`,
    ),
  ],
);

export const scoreEvents = pgTable(
  "score_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    playerId: uuid("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "restrict" }),
    quizSessionId: uuid("quiz_session_id")
      .notNull()
      .references(() => quizSessions.id, { onDelete: "restrict" }),
    sessionQuestionId: uuid("session_question_id").references(
      () => sessionQuestions.id,
      { onDelete: "restrict" },
    ),
    type: scoreEventTypeEnum("type").notNull(),
    points: integer("points").notNull(),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .default(sql`'{}'::jsonb`)
      .notNull(),
    createdAt: utcTimestamp("created_at").defaultNow().notNull(),
    voidedAt: utcTimestamp("voided_at"),
    createdByAdminId: uuid("created_by_admin_id").references(
      () => adminUsers.id,
      { onDelete: "restrict" },
    ),
  },
  (table) => [
    index("score_events_active_leaderboard_idx")
      .on(table.quizSessionId, table.playerId)
      .where(sql`${table.voidedAt} IS NULL`),
    index("score_events_session_question_idx").on(table.sessionQuestionId),
    check(
      "score_events_points_check",
      sql`${table.type} = 'ADMIN_ADJUSTMENT' OR ${table.points} >= 0`,
    ),
    check(
      "score_events_admin_adjustment_author_check",
      sql`${table.type} <> 'ADMIN_ADJUSTMENT' OR ${table.createdByAdminId} IS NOT NULL`,
    ),
  ],
);

export const rewards = pgTable(
  "rewards",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    description: text("description"),
    awardPosition: integer("award_position"),
    awardCondition: text("award_condition"),
    active: boolean("active").default(true).notNull(),
    createdAt: utcTimestamp("created_at").defaultNow().notNull(),
    updatedAt: utcTimestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("rewards_event_active_idx").on(table.eventId, table.active),
    check(
      "rewards_attribution_rule_check",
      sql`${table.awardPosition} IS NOT NULL OR ${table.awardCondition} IS NOT NULL`,
    ),
    check(
      "rewards_position_positive_check",
      sql`${table.awardPosition} IS NULL OR ${table.awardPosition} > 0`,
    ),
  ],
);

export const rewardAwards = pgTable(
  "reward_awards",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    rewardId: uuid("reward_id")
      .notNull()
      .references(() => rewards.id, { onDelete: "restrict" }),
    playerId: uuid("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "restrict" }),
    awardedAt: utcTimestamp("awarded_at").defaultNow().notNull(),
    deliveredAt: utcTimestamp("delivered_at"),
    deliveredByAdminId: uuid("delivered_by_admin_id").references(
      () => adminUsers.id,
      { onDelete: "restrict" },
    ),
    notes: text("notes"),
  },
  (table) => [
    uniqueIndex("reward_awards_reward_player_unique").on(
      table.rewardId,
      table.playerId,
    ),
    index("reward_awards_player_idx").on(table.playerId),
  ],
);

export const adminSessions = pgTable(
  "admin_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    adminUserId: uuid("admin_user_id")
      .notNull()
      .references(() => adminUsers.id, { onDelete: "restrict" }),
    tokenHash: text("token_hash").notNull(),
    createdAt: utcTimestamp("created_at").defaultNow().notNull(),
    expiresAt: utcTimestamp("expires_at").notNull(),
    lastSeenAt: utcTimestamp("last_seen_at").defaultNow().notNull(),
    revokedAt: utcTimestamp("revoked_at"),
  },
  (table) => [
    uniqueIndex("admin_sessions_token_hash_unique").on(table.tokenHash),
    index("admin_sessions_user_idx").on(table.adminUserId),
    check(
      "admin_sessions_expiration_check",
      sql`${table.expiresAt} > ${table.createdAt}`,
    ),
  ],
);

export const consents = pgTable(
  "consents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    playerId: uuid("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "restrict" }),
    purpose: text("purpose").notNull(),
    grantedAt: utcTimestamp("granted_at").defaultNow().notNull(),
    withdrawnAt: utcTimestamp("withdrawn_at"),
    createdAt: utcTimestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("consents_active_player_purpose_unique")
      .on(table.playerId, table.purpose)
      .where(sql`${table.withdrawnAt} IS NULL`),
  ],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    adminUserId: uuid("admin_user_id").references(() => adminUsers.id, {
      onDelete: "restrict",
    }),
    action: auditActionEnum("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id"),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .default(sql`'{}'::jsonb`)
      .notNull(),
    createdAt: utcTimestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("audit_logs_entity_idx").on(table.entityType, table.entityId),
    index("audit_logs_created_at_idx").on(table.createdAt),
  ],
);
