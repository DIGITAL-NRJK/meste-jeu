import { z } from "zod";

import { eventSlugSchema } from "@/lib/validation/player-registration";

export const leaderboardQuerySchema = z
  .object({
    eventSlug: eventSlugSchema,
    sessionId: z.uuid("L’identifiant de session est invalide.").optional(),
  })
  .strict();

export type LeaderboardQuery = z.infer<typeof leaderboardQuerySchema>;
