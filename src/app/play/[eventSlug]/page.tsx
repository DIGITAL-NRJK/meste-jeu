import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PlayerGame } from "@/components/player/player-game";
import { eventSlugSchema } from "@/lib/validation/player-registration";

export const metadata: Metadata = {
  title: "Jouer — Héritage Congo",
  description: "Rejoignez le quiz culturel Héritage Congo par MESTE.",
};

export default async function PlayPage({
  params,
}: {
  params: Promise<{ eventSlug: string }>;
}) {
  const { eventSlug } = await params;
  const validation = eventSlugSchema.safeParse(eventSlug);

  if (!validation.success) {
    notFound();
  }

  return <PlayerGame eventSlug={validation.data} />;
}
