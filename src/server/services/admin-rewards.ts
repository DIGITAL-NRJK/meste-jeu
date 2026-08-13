import { randomUUID } from "node:crypto";

import { z } from "zod";

export type RewardEvent = {
  id: string;
  slug: string;
  name: string;
  status: "DRAFT" | "READY" | "LIVE" | "FINISHED" | "CANCELED";
};

export type RewardAward = {
  id: string;
  playerId: string;
  publicCode: string;
  nickname: string;
  awardedAt: Date;
  deliveredAt: Date | null;
  deliveredByAdminName: string | null;
  notes: string | null;
};

export type AdminReward = {
  id: string;
  eventId: string;
  name: string;
  description: string | null;
  awardPosition: number | null;
  awardCondition: string | null;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
  awards: RewardAward[];
};

export type RewardWriteOutcome =
  | "written"
  | "not_found"
  | "player_not_found"
  | "duplicate"
  | "already_delivered";

export interface AdminRewardsRepository {
  listEvents(): Promise<RewardEvent[]>;
  listRewards(eventId: string): Promise<AdminReward[]>;
  createReward(input: {
    id: string;
    eventId: string;
    name: string;
    description: string | null;
    awardPosition: number | null;
    awardCondition: string | null;
    now: Date;
  }): Promise<AdminReward>;
  updateReward(input: {
    rewardId: string;
    name: string;
    description: string | null;
    awardPosition: number | null;
    awardCondition: string | null;
    active: boolean;
    now: Date;
  }): Promise<RewardWriteOutcome>;
  awardReward(input: {
    awardId: string;
    rewardId: string;
    playerId: string;
    notes: string | null;
    actorAdminId: string;
    now: Date;
  }): Promise<RewardWriteOutcome>;
  deliverAward(input: {
    awardId: string;
    notes: string | null;
    actorAdminId: string;
    now: Date;
  }): Promise<RewardWriteOutcome>;
}

export class AdminRewardInputError extends Error {
  constructor(readonly issues: z.core.$ZodIssue[] = []) {
    super("Invalid admin reward input");
    this.name = "AdminRewardInputError";
  }
}

export class AdminRewardEventNotFoundError extends Error {
  constructor() {
    super("Admin reward event not found");
    this.name = "AdminRewardEventNotFoundError";
  }
}

export class AdminRewardNotFoundError extends Error {
  constructor() {
    super("Admin reward not found");
    this.name = "AdminRewardNotFoundError";
  }
}

export class AdminRewardPlayerNotFoundError extends Error {
  constructor() {
    super("Admin reward player not found");
    this.name = "AdminRewardPlayerNotFoundError";
  }
}

export class AdminRewardDuplicateAwardError extends Error {
  constructor() {
    super("Admin reward already awarded to player");
    this.name = "AdminRewardDuplicateAwardError";
  }
}

export class AdminRewardAlreadyDeliveredError extends Error {
  constructor() {
    super("Admin reward award already delivered");
    this.name = "AdminRewardAlreadyDeliveredError";
  }
}

const eventSlugSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .optional();

const rewardFields = {
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).nullish().transform((value) => value || null),
  awardPosition: z.coerce.number().int().positive().nullish().transform((value) => value ?? null),
  awardCondition: z.string().trim().max(300).nullish().transform((value) => value || null),
};

const createRewardSchema = z
  .object({ eventId: z.uuid(), ...rewardFields })
  .strict()
  .refine((input) => input.awardPosition !== null || input.awardCondition !== null, {
    message: "Une position ou une condition d’attribution est obligatoire.",
  });

const updateRewardSchema = z
  .object({ ...rewardFields, active: z.boolean() })
  .strict()
  .refine((input) => input.awardPosition !== null || input.awardCondition !== null, {
    message: "Une position ou une condition d’attribution est obligatoire.",
  });

const awardRewardSchema = z
  .object({
    playerId: z.uuid(),
    notes: z.string().trim().max(500).nullish().transform((value) => value || null),
  })
  .strict();

const deliverAwardSchema = z
  .object({
    notes: z.string().trim().max(500).nullish().transform((value) => value || null),
  })
  .strict();

function parse<T>(result: { success: true; data: T } | { success: false; error: z.ZodError }): T {
  if (!result.success) throw new AdminRewardInputError(result.error.issues);
  return result.data;
}

export async function getAdminRewards(
  eventSlug: unknown,
  repository: AdminRewardsRepository,
): Promise<{ events: RewardEvent[]; event: RewardEvent | null; rewards: AdminReward[] }> {
  const slug = parse(eventSlugSchema.safeParse(eventSlug || undefined));
  const events = await repository.listEvents();
  const event = slug ? events.find((candidate) => candidate.slug === slug) : events[0];
  if (slug && !event) throw new AdminRewardEventNotFoundError();
  return { events, event: event ?? null, rewards: event ? await repository.listRewards(event.id) : [] };
}

export async function createAdminReward(
  input: unknown,
  dependencies: { repository: AdminRewardsRepository; createId?: () => string; now?: () => Date },
) {
  const reward = parse(createRewardSchema.safeParse(input));
  const events = await dependencies.repository.listEvents();
  if (!events.some((event) => event.id === reward.eventId)) {
    throw new AdminRewardEventNotFoundError();
  }
  return dependencies.repository.createReward({
    ...reward,
    id: dependencies.createId?.() ?? randomUUID(),
    now: dependencies.now?.() ?? new Date(),
  });
}

export async function updateAdminReward(
  rewardId: unknown,
  input: unknown,
  dependencies: { repository: AdminRewardsRepository; now?: () => Date },
) {
  const id = parse(z.uuid().safeParse(rewardId));
  const reward = parse(updateRewardSchema.safeParse(input));
  const outcome = await dependencies.repository.updateReward({
    rewardId: id,
    ...reward,
    now: dependencies.now?.() ?? new Date(),
  });
  if (outcome === "not_found") throw new AdminRewardNotFoundError();
}

export async function awardAdminReward(
  rewardId: unknown,
  input: unknown,
  actorAdminId: unknown,
  dependencies: { repository: AdminRewardsRepository; createId?: () => string; now?: () => Date },
) {
  const identifiers = parse(
    z.object({ rewardId: z.uuid(), actorAdminId: z.uuid() }).safeParse({ rewardId, actorAdminId }),
  );
  const award = parse(awardRewardSchema.safeParse(input));
  const outcome = await dependencies.repository.awardReward({
    awardId: dependencies.createId?.() ?? randomUUID(),
    rewardId: identifiers.rewardId,
    playerId: award.playerId,
    notes: award.notes,
    actorAdminId: identifiers.actorAdminId,
    now: dependencies.now?.() ?? new Date(),
  });
  if (outcome === "not_found") throw new AdminRewardNotFoundError();
  if (outcome === "player_not_found") throw new AdminRewardPlayerNotFoundError();
  if (outcome === "duplicate") throw new AdminRewardDuplicateAwardError();
}

export async function deliverAdminReward(
  awardId: unknown,
  input: unknown,
  actorAdminId: unknown,
  dependencies: { repository: AdminRewardsRepository; now?: () => Date },
) {
  const identifiers = parse(
    z.object({ awardId: z.uuid(), actorAdminId: z.uuid() }).safeParse({ awardId, actorAdminId }),
  );
  const delivery = parse(deliverAwardSchema.safeParse(input));
  const outcome = await dependencies.repository.deliverAward({
    awardId: identifiers.awardId,
    notes: delivery.notes,
    actorAdminId: identifiers.actorAdminId,
    now: dependencies.now?.() ?? new Date(),
  });
  if (outcome === "not_found") throw new AdminRewardNotFoundError();
  if (outcome === "already_delivered") throw new AdminRewardAlreadyDeliveredError();
}
