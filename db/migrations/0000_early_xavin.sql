CREATE TYPE "public"."admin_user_status" AS ENUM('ACTIVE', 'DISABLED');--> statement-breakpoint
CREATE TYPE "public"."audit_action" AS ENUM('QUESTION_CREATED', 'QUESTION_UPDATED', 'QUESTION_VALIDATED', 'SESSION_CREATED', 'SESSION_STARTED', 'SESSION_FINISHED', 'QUESTION_STARTED', 'QUESTION_CLOSED', 'QUESTION_REVEALED', 'QUESTION_CANCELED', 'SCORE_ADJUSTED', 'PLAYER_DISABLED', 'REWARD_AWARDED');--> statement-breakpoint
CREATE TYPE "public"."event_status" AS ENUM('DRAFT', 'READY', 'LIVE', 'FINISHED', 'CANCELED');--> statement-breakpoint
CREATE TYPE "public"."player_status" AS ENUM('ACTIVE', 'DISABLED');--> statement-breakpoint
CREATE TYPE "public"."question_media_type" AS ENUM('TEXT', 'IMAGE');--> statement-breakpoint
CREATE TYPE "public"."question_status" AS ENUM('DRAFT', 'REVIEW', 'VALIDATED', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "public"."quiz_mode" AS ENUM('DISCOVERY', 'LIVE');--> statement-breakpoint
CREATE TYPE "public"."quiz_session_status" AS ENUM('DRAFT', 'READY', 'LIVE', 'FINISHED', 'CANCELED');--> statement-breakpoint
CREATE TYPE "public"."score_event_type" AS ENUM('ANSWER_CORRECT', 'DIFFICULTY_BONUS', 'SPEED_BONUS', 'STREAK_BONUS', 'ADMIN_ADJUSTMENT');--> statement-breakpoint
CREATE TYPE "public"."session_question_status" AS ENUM('PENDING', 'OPEN', 'CLOSED', 'REVEALED', 'CANCELED');--> statement-breakpoint
CREATE TABLE "admin_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "admin_sessions_expiration_check" CHECK ("admin_sessions"."expires_at" > "admin_sessions"."created_at")
);
--> statement-breakpoint
CREATE TABLE "admin_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"display_name" text NOT NULL,
	"status" "admin_user_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_login_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "answers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" uuid NOT NULL,
	"session_question_id" uuid NOT NULL,
	"question_option_id" uuid NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	"response_time_ms" integer NOT NULL,
	"is_correct" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "answers_response_time_nonnegative_check" CHECK ("answers"."response_time_ms" >= 0)
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_user_id" uuid,
	"action" "audit_action" NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" uuid NOT NULL,
	"purpose" text NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"withdrawn_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"timezone" text NOT NULL,
	"status" "event_status" DEFAULT 'DRAFT' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "events_dates_order_check" CHECK ("events"."ends_at" > "events"."starts_at")
);
--> statement-breakpoint
CREATE TABLE "player_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "player_sessions_expiration_check" CHECK ("player_sessions"."expires_at" > "player_sessions"."created_at")
);
--> statement-breakpoint
CREATE TABLE "players" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"public_code" text NOT NULL,
	"nickname" text NOT NULL,
	"status" "player_status" DEFAULT 'ACTIVE' NOT NULL,
	"current_streak" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "players_current_streak_nonnegative_check" CHECK ("players"."current_streak" >= 0)
);
--> statement-breakpoint
CREATE TABLE "question_options" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question_id" uuid NOT NULL,
	"label" text NOT NULL,
	"text" text NOT NULL,
	"is_correct" boolean DEFAULT false NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "question_options_position_range_check" CHECK ("question_options"."position" between 1 and 4)
);
--> statement-breakpoint
CREATE TABLE "question_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question_id" uuid NOT NULL,
	"publisher" text NOT NULL,
	"title" text NOT NULL,
	"url" text NOT NULL,
	"verified_at" timestamp with time zone NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category_id" uuid NOT NULL,
	"question_text" text NOT NULL,
	"explanation" text NOT NULL,
	"difficulty" integer NOT NULL,
	"status" "question_status" DEFAULT 'DRAFT' NOT NULL,
	"media_type" "question_media_type" DEFAULT 'TEXT' NOT NULL,
	"media_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"validated_at" timestamp with time zone,
	"validated_by" uuid,
	CONSTRAINT "questions_difficulty_range_check" CHECK ("questions"."difficulty" between 1 and 4),
	CONSTRAINT "questions_image_url_check" CHECK ("questions"."media_type" <> 'IMAGE' OR "questions"."media_url" IS NOT NULL),
	CONSTRAINT "questions_validation_metadata_check" CHECK ("questions"."status" <> 'VALIDATED' OR ("questions"."validated_at" IS NOT NULL AND "questions"."validated_by" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "quiz_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"mode" "quiz_mode" NOT NULL,
	"status" "quiz_session_status" DEFAULT 'DRAFT' NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"reset_score" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quiz_sessions_dates_order_check" CHECK ("quiz_sessions"."starts_at" IS NULL OR "quiz_sessions"."ends_at" IS NULL OR "quiz_sessions"."ends_at" > "quiz_sessions"."starts_at")
);
--> statement-breakpoint
CREATE TABLE "reward_awards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reward_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"awarded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"delivered_at" timestamp with time zone,
	"delivered_by_admin_id" uuid,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "rewards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"award_position" integer,
	"award_condition" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rewards_attribution_rule_check" CHECK ("rewards"."award_position" IS NOT NULL OR "rewards"."award_condition" IS NOT NULL),
	CONSTRAINT "rewards_position_positive_check" CHECK ("rewards"."award_position" IS NULL OR "rewards"."award_position" > 0)
);
--> statement-breakpoint
CREATE TABLE "score_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" uuid NOT NULL,
	"quiz_session_id" uuid NOT NULL,
	"session_question_id" uuid,
	"type" "score_event_type" NOT NULL,
	"points" integer NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"voided_at" timestamp with time zone,
	"created_by_admin_id" uuid,
	CONSTRAINT "score_events_points_check" CHECK ("score_events"."type" = 'ADMIN_ADJUSTMENT' OR "score_events"."points" >= 0),
	CONSTRAINT "score_events_admin_adjustment_author_check" CHECK ("score_events"."type" <> 'ADMIN_ADJUSTMENT' OR "score_events"."created_by_admin_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "session_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quiz_session_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"duration_seconds" integer NOT NULL,
	"status" "session_question_status" DEFAULT 'PENDING' NOT NULL,
	"opens_at" timestamp with time zone,
	"closes_at" timestamp with time zone,
	"revealed_at" timestamp with time zone,
	"canceled_at" timestamp with time zone,
	CONSTRAINT "session_questions_position_positive_check" CHECK ("session_questions"."position" > 0),
	CONSTRAINT "session_questions_duration_positive_check" CHECK ("session_questions"."duration_seconds" > 0),
	CONSTRAINT "session_questions_dates_order_check" CHECK ("session_questions"."opens_at" IS NULL OR "session_questions"."closes_at" IS NULL OR "session_questions"."closes_at" > "session_questions"."opens_at"),
	CONSTRAINT "session_questions_reveal_order_check" CHECK ("session_questions"."revealed_at" IS NULL OR "session_questions"."closes_at" IS NULL OR "session_questions"."revealed_at" >= "session_questions"."closes_at")
);
--> statement-breakpoint
ALTER TABLE "admin_sessions" ADD CONSTRAINT "admin_sessions_admin_user_id_admin_users_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."admin_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "answers" ADD CONSTRAINT "answers_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "answers" ADD CONSTRAINT "answers_session_question_id_session_questions_id_fk" FOREIGN KEY ("session_question_id") REFERENCES "public"."session_questions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "answers" ADD CONSTRAINT "answers_question_option_id_question_options_id_fk" FOREIGN KEY ("question_option_id") REFERENCES "public"."question_options"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_admin_user_id_admin_users_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."admin_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consents" ADD CONSTRAINT "consents_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_sessions" ADD CONSTRAINT "player_sessions_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "players" ADD CONSTRAINT "players_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_options" ADD CONSTRAINT "question_options_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_sources" ADD CONSTRAINT "question_sources_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_validated_by_admin_users_id_fk" FOREIGN KEY ("validated_by") REFERENCES "public"."admin_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_sessions" ADD CONSTRAINT "quiz_sessions_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_awards" ADD CONSTRAINT "reward_awards_reward_id_rewards_id_fk" FOREIGN KEY ("reward_id") REFERENCES "public"."rewards"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_awards" ADD CONSTRAINT "reward_awards_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_awards" ADD CONSTRAINT "reward_awards_delivered_by_admin_id_admin_users_id_fk" FOREIGN KEY ("delivered_by_admin_id") REFERENCES "public"."admin_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rewards" ADD CONSTRAINT "rewards_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "score_events" ADD CONSTRAINT "score_events_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "score_events" ADD CONSTRAINT "score_events_quiz_session_id_quiz_sessions_id_fk" FOREIGN KEY ("quiz_session_id") REFERENCES "public"."quiz_sessions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "score_events" ADD CONSTRAINT "score_events_session_question_id_session_questions_id_fk" FOREIGN KEY ("session_question_id") REFERENCES "public"."session_questions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "score_events" ADD CONSTRAINT "score_events_created_by_admin_id_admin_users_id_fk" FOREIGN KEY ("created_by_admin_id") REFERENCES "public"."admin_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_questions" ADD CONSTRAINT "session_questions_quiz_session_id_quiz_sessions_id_fk" FOREIGN KEY ("quiz_session_id") REFERENCES "public"."quiz_sessions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_questions" ADD CONSTRAINT "session_questions_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "admin_sessions_token_hash_unique" ON "admin_sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "admin_sessions_user_idx" ON "admin_sessions" USING btree ("admin_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "admin_users_email_unique" ON "admin_users" USING btree (lower("email"));--> statement-breakpoint
CREATE UNIQUE INDEX "answers_player_session_question_unique" ON "answers" USING btree ("player_id","session_question_id");--> statement-breakpoint
CREATE INDEX "answers_session_question_idx" ON "answers" USING btree ("session_question_id");--> statement-breakpoint
CREATE INDEX "audit_logs_entity_idx" ON "audit_logs" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "categories_slug_unique" ON "categories" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "consents_active_player_purpose_unique" ON "consents" USING btree ("player_id","purpose") WHERE "consents"."withdrawn_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "events_slug_unique" ON "events" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "player_sessions_token_hash_unique" ON "player_sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "player_sessions_player_idx" ON "player_sessions" USING btree ("player_id");--> statement-breakpoint
CREATE UNIQUE INDEX "players_public_code_unique" ON "players" USING btree ("public_code");--> statement-breakpoint
CREATE UNIQUE INDEX "players_event_nickname_unique" ON "players" USING btree ("event_id",lower("nickname"));--> statement-breakpoint
CREATE INDEX "players_event_status_idx" ON "players" USING btree ("event_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "question_options_question_label_unique" ON "question_options" USING btree ("question_id","label");--> statement-breakpoint
CREATE UNIQUE INDEX "question_options_question_position_unique" ON "question_options" USING btree ("question_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "question_options_one_correct_per_question_unique" ON "question_options" USING btree ("question_id") WHERE "question_options"."is_correct" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "question_sources_question_url_unique" ON "question_sources" USING btree ("question_id","url");--> statement-breakpoint
CREATE INDEX "questions_category_status_idx" ON "questions" USING btree ("category_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "quiz_sessions_event_slug_unique" ON "quiz_sessions" USING btree ("event_id","slug");--> statement-breakpoint
CREATE INDEX "quiz_sessions_event_status_idx" ON "quiz_sessions" USING btree ("event_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "reward_awards_reward_player_unique" ON "reward_awards" USING btree ("reward_id","player_id");--> statement-breakpoint
CREATE INDEX "reward_awards_player_idx" ON "reward_awards" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "rewards_event_active_idx" ON "rewards" USING btree ("event_id","active");--> statement-breakpoint
CREATE INDEX "score_events_active_leaderboard_idx" ON "score_events" USING btree ("quiz_session_id","player_id") WHERE "score_events"."voided_at" IS NULL;--> statement-breakpoint
CREATE INDEX "score_events_session_question_idx" ON "score_events" USING btree ("session_question_id");--> statement-breakpoint
CREATE UNIQUE INDEX "session_questions_session_position_unique" ON "session_questions" USING btree ("quiz_session_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "session_questions_session_question_unique" ON "session_questions" USING btree ("quiz_session_id","question_id");--> statement-breakpoint
CREATE INDEX "session_questions_session_status_idx" ON "session_questions" USING btree ("quiz_session_id","status");