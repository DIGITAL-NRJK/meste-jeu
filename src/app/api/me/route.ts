import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  getExpiredPlayerSessionCookieOptions,
  PLAYER_SESSION_COOKIE_NAME,
} from "@/lib/auth/player-session";
import { getServerEnv } from "@/lib/env/server";
import { postgresPlayerRepository } from "@/server/repositories/player-repository";
import { getCurrentPlayer } from "@/server/services/player-registration";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const noStoreHeaders = { "Cache-Control": "no-store" };

function unauthorizedResponse(clearCookie: boolean) {
  const response = NextResponse.json(
    {
      error: {
        code: "UNAUTHENTICATED",
        message: "Aucune session joueur valide.",
      },
    },
    { status: 401, headers: noStoreHeaders },
  );

  if (clearCookie) {
    response.cookies.set(
      PLAYER_SESSION_COOKIE_NAME,
      "",
      getExpiredPlayerSessionCookieOptions(
        process.env.NODE_ENV === "production",
      ),
    );
  }

  return response;
}

export async function GET(request: NextRequest) {
  const token = request.cookies.get(PLAYER_SESSION_COOKIE_NAME)?.value;

  if (!token) {
    return unauthorizedResponse(false);
  }

  try {
    const currentPlayer = await getCurrentPlayer(token, {
      repository: postgresPlayerRepository,
      sessionSecret: getServerEnv().SESSION_SECRET,
    });

    if (!currentPlayer) {
      return unauthorizedResponse(true);
    }

    return NextResponse.json(currentPlayer, { headers: noStoreHeaders });
  } catch {
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "La session joueur n’a pas pu être vérifiée.",
        },
      },
      { status: 500, headers: noStoreHeaders },
    );
  }
}
