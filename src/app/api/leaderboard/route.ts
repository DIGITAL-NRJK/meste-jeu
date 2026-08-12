import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { PLAYER_SESSION_COOKIE_NAME } from "@/lib/auth/player-session";
import { getServerEnv } from "@/lib/env/server";
import { postgresLeaderboardRepository } from "@/server/repositories/leaderboard-repository";
import {
  getLeaderboard,
  LeaderboardInputError,
  LeaderboardNotFoundError,
} from "@/server/services/leaderboard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const noStoreHeaders = { "Cache-Control": "no-store" };

export async function GET(request: NextRequest) {
  const eventSlug = request.nextUrl.searchParams.get("eventSlug");
  const sessionId = request.nextUrl.searchParams.get("sessionId") ?? undefined;
  const playerToken = request.cookies.get(PLAYER_SESSION_COOKIE_NAME)?.value;

  try {
    const leaderboard = await getLeaderboard(
      { eventSlug, sessionId },
      playerToken,
      {
        repository: postgresLeaderboardRepository,
        sessionSecret: getServerEnv().SESSION_SECRET,
      },
    );

    return NextResponse.json(leaderboard, { headers: noStoreHeaders });
  } catch (error) {
    if (error instanceof LeaderboardInputError) {
      return NextResponse.json(
        {
          error: {
            code: "INVALID_LEADERBOARD_QUERY",
            message: "Les paramètres du classement sont invalides.",
          },
        },
        { status: 400, headers: noStoreHeaders },
      );
    }

    if (error instanceof LeaderboardNotFoundError) {
      return NextResponse.json(
        {
          error: {
            code: "LEADERBOARD_NOT_FOUND",
            message: "Ce classement est introuvable.",
          },
        },
        { status: 404, headers: noStoreHeaders },
      );
    }

    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Le classement n’a pas pu être récupéré.",
        },
      },
      { status: 500, headers: noStoreHeaders },
    );
  }
}
