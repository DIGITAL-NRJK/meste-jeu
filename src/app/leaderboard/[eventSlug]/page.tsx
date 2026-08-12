import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";

import { LeaderboardView } from "@/components/player/leaderboard-view";
import { eventSlugSchema } from "@/lib/validation/player-registration";

export const metadata: Metadata = {
  title: "Classement — Héritage Congo",
  description: "Le classement du quiz culturel Héritage Congo par MESTE.",
};

export default async function LeaderboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ eventSlug: string }>;
  searchParams: Promise<{ sessionId?: string }>;
}) {
  const [{ eventSlug }, query] = await Promise.all([params, searchParams]);
  const slugValidation = eventSlugSchema.safeParse(eventSlug);
  const sessionValidation = z.uuid().optional().safeParse(query.sessionId);

  if (!slugValidation.success || !sessionValidation.success) {
    notFound();
  }

  return (
    <LeaderboardView
      eventSlug={slugValidation.data}
      initialSessionId={sessionValidation.data ?? null}
    />
  );
}
