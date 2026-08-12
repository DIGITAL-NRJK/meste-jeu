import { z } from "zod";

import { createCsvDocument } from "@/lib/csv";
import { eventSlugSchema } from "@/lib/validation/player-registration";

export const adminExportKinds = ["players", "leaderboard", "answers"] as const;
export type AdminExportKind = (typeof adminExportKinds)[number];

export type ReportingEvent = {
  id: string;
  slug: string;
  name: string;
};

export type PlayerExportRow = {
  publicCode: string;
  nickname: string;
  status: "ACTIVE" | "DISABLED";
  currentStreak: number;
  createdAt: string;
  lastSeenAt: string;
};

export type LeaderboardExportRow = {
  position: number;
  publicCode: string;
  nickname: string;
  points: number;
};

export type AnswerExportRow = {
  sessionName: string;
  questionPosition: number;
  questionText: string;
  publicCode: string;
  nickname: string;
  selectedOptionLabel: string;
  selectedOptionText: string;
  correctOptionLabel: string | null;
  correctOptionText: string | null;
  isCorrect: boolean | null;
  responseTimeMs: number;
  receivedAt: string;
  questionStatus: "PENDING" | "OPEN" | "CLOSED" | "REVEALED" | "CANCELED";
};

export type AuditAction =
  | "QUESTION_CREATED"
  | "QUESTION_UPDATED"
  | "QUESTION_VALIDATED"
  | "SESSION_CREATED"
  | "SESSION_STARTED"
  | "SESSION_FINISHED"
  | "QUESTION_STARTED"
  | "QUESTION_CLOSED"
  | "QUESTION_REVEALED"
  | "QUESTION_CANCELED"
  | "SCORE_ADJUSTED"
  | "PLAYER_DISABLED"
  | "REWARD_AWARDED";

export type AdminAuditLogEntry = {
  id: string;
  action: AuditAction;
  entityType: string;
  entityId: string | null;
  adminDisplayName: string;
  createdAt: string;
};

export interface AdminReportingRepository {
  findEventBySlug(eventSlug: string): Promise<ReportingEvent | null>;
  listPlayers(eventId: string): Promise<PlayerExportRow[]>;
  listLeaderboard(eventId: string): Promise<LeaderboardExportRow[]>;
  listAnswers(eventId: string): Promise<AnswerExportRow[]>;
  listAuditLogs(limit: number): Promise<AdminAuditLogEntry[]>;
}

export class AdminReportingInputError extends Error {
  constructor() {
    super("Invalid admin reporting input");
    this.name = "AdminReportingInputError";
  }
}

export class AdminReportingEventNotFoundError extends Error {
  constructor() {
    super("Admin reporting event not found");
    this.name = "AdminReportingEventNotFoundError";
  }
}

const exportRequestSchema = z
  .object({
    kind: z.enum(adminExportKinds),
    eventSlug: eventSlugSchema,
  })
  .strict();

const auditLimitSchema = z.coerce.number().int().min(1).max(100).default(30);

function playerCsv(rows: PlayerExportRow[]): string {
  return createCsvDocument([
    [
      "code_public",
      "pseudo",
      "statut",
      "serie_actuelle",
      "inscrit_le",
      "derniere_activite",
    ],
    ...rows.map((row) => [
      row.publicCode,
      row.nickname,
      row.status,
      row.currentStreak,
      row.createdAt,
      row.lastSeenAt,
    ]),
  ]);
}

function leaderboardCsv(rows: LeaderboardExportRow[]): string {
  return createCsvDocument([
    ["position", "code_public", "pseudo", "points"],
    ...rows.map((row) => [row.position, row.publicCode, row.nickname, row.points]),
  ]);
}

function answerCsv(rows: AnswerExportRow[]): string {
  return createCsvDocument([
    [
      "session",
      "position_question",
      "question",
      "code_public",
      "pseudo",
      "reponse_label",
      "reponse_texte",
      "bonne_reponse_label",
      "bonne_reponse_texte",
      "est_correcte",
      "temps_reponse_ms",
      "recu_le",
      "statut_question",
    ],
    ...rows.map((row) => [
      row.sessionName,
      row.questionPosition,
      row.questionText,
      row.publicCode,
      row.nickname,
      row.selectedOptionLabel,
      row.selectedOptionText,
      row.correctOptionLabel,
      row.correctOptionText,
      row.isCorrect === null ? null : row.isCorrect ? "oui" : "non",
      row.responseTimeMs,
      row.receivedAt,
      row.questionStatus,
    ]),
  ]);
}

export async function createAdminExport(
  input: unknown,
  repository: AdminReportingRepository,
): Promise<{ filename: string; content: string }> {
  const parsed = exportRequestSchema.safeParse(input);
  if (!parsed.success) throw new AdminReportingInputError();

  const event = await repository.findEventBySlug(parsed.data.eventSlug);
  if (!event) throw new AdminReportingEventNotFoundError();

  let content: string;
  switch (parsed.data.kind) {
    case "players":
      content = playerCsv(await repository.listPlayers(event.id));
      break;
    case "leaderboard":
      content = leaderboardCsv(await repository.listLeaderboard(event.id));
      break;
    case "answers":
      content = answerCsv(await repository.listAnswers(event.id));
      break;
  }

  return {
    filename: `${event.slug}-${parsed.data.kind}.csv`,
    content,
  };
}

export async function getAdminAuditLogs(
  limit: unknown,
  repository: AdminReportingRepository,
): Promise<AdminAuditLogEntry[]> {
  const parsed = auditLimitSchema.safeParse(limit ?? undefined);
  if (!parsed.success) throw new AdminReportingInputError();

  return repository.listAuditLogs(parsed.data);
}
