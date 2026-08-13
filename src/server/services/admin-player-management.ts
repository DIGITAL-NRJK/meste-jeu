import { z } from "zod";

export type AdminPlayerEvent = {
  id: string;
  slug: string;
  name: string;
  status: "DRAFT" | "READY" | "LIVE" | "FINISHED" | "CANCELED";
};

export type AdminPlayerStatus = "ACTIVE" | "DISABLED";

export type AdminPlayerSummary = {
  id: string;
  publicCode: string;
  nickname: string;
  status: AdminPlayerStatus;
  currentStreak: number;
  totalPoints: number;
  answerCount: number;
  createdAt: Date;
  lastSeenAt: Date;
};

export type AdminPlayerAnswer = {
  id: string;
  sessionName: string;
  questionPosition: number;
  questionText: string;
  selectedOptionLabel: string;
  selectedOptionText: string;
  isCorrect: boolean | null;
  responseTimeMs: number;
  receivedAt: Date;
  questionStatus: "PENDING" | "OPEN" | "CLOSED" | "REVEALED" | "CANCELED";
};

export type AdminPlayerDetail = AdminPlayerSummary & {
  event: AdminPlayerEvent;
  answers: AdminPlayerAnswer[];
};

export type AdminPlayerFilters = {
  eventId: string;
  search?: string;
  status?: AdminPlayerStatus;
  limit: number;
};

export type DisablePlayerOutcome =
  | "disabled"
  | "not_found"
  | "already_disabled";

export interface AdminPlayerManagementRepository {
  listEvents(): Promise<AdminPlayerEvent[]>;
  listPlayers(filters: AdminPlayerFilters): Promise<AdminPlayerSummary[]>;
  getPlayer(playerId: string): Promise<AdminPlayerDetail | null>;
  disablePlayer(input: {
    playerId: string;
    actorAdminId: string;
    now: Date;
  }): Promise<DisablePlayerOutcome>;
}

export class AdminPlayerInputError extends Error {
  constructor(readonly issues: z.core.$ZodIssue[] = []) {
    super("Invalid admin player input");
    this.name = "AdminPlayerInputError";
  }
}

export class AdminPlayerEventNotFoundError extends Error {
  constructor() {
    super("Admin player event not found");
    this.name = "AdminPlayerEventNotFoundError";
  }
}

export class AdminPlayerNotFoundError extends Error {
  constructor() {
    super("Admin player not found");
    this.name = "AdminPlayerNotFoundError";
  }
}

export class AdminPlayerAlreadyDisabledError extends Error {
  constructor() {
    super("Admin player already disabled");
    this.name = "AdminPlayerAlreadyDisabledError";
  }
}

const eventSlugSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .optional();

const playerListFiltersSchema = z
  .object({
    eventSlug: eventSlugSchema,
    search: z.string().trim().max(80).optional(),
    status: z.enum(["ACTIVE", "DISABLED"]).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(100),
  })
  .strict();

const playerIdSchema = z.uuid();

export async function getAdminPlayerManagement(
  input: unknown,
  repository: AdminPlayerManagementRepository,
): Promise<{
  events: AdminPlayerEvent[];
  event: AdminPlayerEvent | null;
  players: AdminPlayerSummary[];
}> {
  const parsed = playerListFiltersSchema.safeParse(input);
  if (!parsed.success) throw new AdminPlayerInputError(parsed.error.issues);

  const events = await repository.listEvents();
  const event = parsed.data.eventSlug
    ? events.find((candidate) => candidate.slug === parsed.data.eventSlug)
    : events[0];

  if (parsed.data.eventSlug && !event) {
    throw new AdminPlayerEventNotFoundError();
  }

  if (!event) return { events, event: null, players: [] };

  const players = await repository.listPlayers({
    eventId: event.id,
    search: parsed.data.search || undefined,
    status: parsed.data.status,
    limit: parsed.data.limit,
  });

  return { events, event, players };
}

export async function getAdminPlayer(
  playerId: unknown,
  repository: AdminPlayerManagementRepository,
): Promise<AdminPlayerDetail> {
  const parsed = playerIdSchema.safeParse(playerId);
  if (!parsed.success) throw new AdminPlayerInputError(parsed.error.issues);

  const player = await repository.getPlayer(parsed.data);
  if (!player) throw new AdminPlayerNotFoundError();

  return player;
}

export async function disableAdminPlayer(
  playerId: unknown,
  actorAdminId: unknown,
  dependencies: {
    repository: AdminPlayerManagementRepository;
    now?: () => Date;
  },
): Promise<AdminPlayerDetail> {
  const parsed = z
    .object({ playerId: playerIdSchema, actorAdminId: z.uuid() })
    .safeParse({ playerId, actorAdminId });
  if (!parsed.success) throw new AdminPlayerInputError(parsed.error.issues);

  const outcome = await dependencies.repository.disablePlayer({
    ...parsed.data,
    now: dependencies.now?.() ?? new Date(),
  });

  if (outcome === "not_found") throw new AdminPlayerNotFoundError();
  if (outcome === "already_disabled") {
    throw new AdminPlayerAlreadyDisabledError();
  }

  return getAdminPlayer(parsed.data.playerId, dependencies.repository);
}
