import { NextResponse } from "next/server";

import { postgresPlayerGameRepository } from "@/server/repositories/player-game-repository";
import {
  getPlayerGameEventState,
  PlayerGameEventNotFoundError,
  PlayerGameInputError,
} from "@/server/services/player-game";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const noStoreHeaders = { "Cache-Control": "no-store" };

export async function GET(
  _request: Request,
  context: { params: Promise<{ eventSlug: string }> },
) {
  try {
    const { eventSlug } = await context.params;
    const state = await getPlayerGameEventState(
      eventSlug,
      postgresPlayerGameRepository,
    );

    return NextResponse.json(state, { headers: noStoreHeaders });
  } catch (error) {
    if (error instanceof PlayerGameInputError) {
      return NextResponse.json(
        { error: { code: "INVALID_EVENT", message: "Événement invalide." } },
        { status: 400, headers: noStoreHeaders },
      );
    }

    if (error instanceof PlayerGameEventNotFoundError) {
      return NextResponse.json(
        { error: { code: "EVENT_NOT_FOUND", message: "Événement introuvable." } },
        { status: 404, headers: noStoreHeaders },
      );
    }

    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "L’état du jeu n’a pas pu être récupéré.",
        },
      },
      { status: 500, headers: noStoreHeaders },
    );
  }
}
