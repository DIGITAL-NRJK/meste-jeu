CREATE TYPE "public"."event_environment" AS ENUM('TEST', 'PRODUCTION');--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'EVENT_UPDATED';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'EVENT_RESET_DRAFT';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'EVENT_FINISHED';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'PLAYER_DELETED';--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "environment" "event_environment" DEFAULT 'PRODUCTION' NOT NULL;