import { NextResponse } from "next/server";

import {
  getPlayerSessionCookieOptions,
  PLAYER_SESSION_COOKIE_NAME,
} from "@/lib/auth/player-session";
import { getServerEnv } from "@/lib/env/server";
import { playerRegistrationSchema } from "@/lib/validation/player-registration";
import { postgresPlayerRepository } from "@/server/repositories/player-repository";
import {
  EventNotFoundError,
  NicknameAlreadyUsedError,
  PublicCodeGenerationError,
  RegistrationUnavailableError,
  registerPlayer,
} from "@/server/services/player-registration";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const noStoreHeaders = { "Cache-Control": "no-store" };

function errorResponse(status: number, code: string, message: string) {
  return NextResponse.json(
    { error: { code, message } },
    { status, headers: noStoreHeaders },
  );
}

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return errorResponse(400, "INVALID_JSON", "Le corps JSON est invalide.");
  }

  const validation = playerRegistrationSchema.safeParse(body);

  if (!validation.success) {
    return NextResponse.json(
      {
        error: {
          code: "INVALID_REGISTRATION",
          message: "Les informations d’inscription sont invalides.",
          fields: validation.error.issues.map((issue) => ({
            field: issue.path.join("."),
            message: issue.message,
          })),
        },
      },
      { status: 400, headers: noStoreHeaders },
    );
  }

  const env = getServerEnv();

  try {
    const registration = await registerPlayer(validation.data, {
      repository: postgresPlayerRepository,
      sessionSecret: env.SESSION_SECRET,
    });
    const response = NextResponse.json(
      {
        player: registration.player,
        event: registration.event,
      },
      { status: 201, headers: noStoreHeaders },
    );

    response.cookies.set(
      PLAYER_SESSION_COOKIE_NAME,
      registration.session.token,
      getPlayerSessionCookieOptions(
        registration.session.expiresAt,
        process.env.NODE_ENV === "production",
      ),
    );

    return response;
  } catch (error) {
    if (error instanceof EventNotFoundError) {
      return errorResponse(404, "EVENT_NOT_FOUND", "Événement introuvable.");
    }

    if (error instanceof NicknameAlreadyUsedError) {
      return errorResponse(
        409,
        "NICKNAME_ALREADY_USED",
        "Ce pseudo est déjà utilisé pour cet événement.",
      );
    }

    if (error instanceof RegistrationUnavailableError) {
      return errorResponse(
        409,
        "REGISTRATION_UNAVAILABLE",
        "Les inscriptions ne sont pas ouvertes pour cet événement.",
      );
    }

    if (error instanceof PublicCodeGenerationError) {
      return errorResponse(
        503,
        "REGISTRATION_TEMPORARILY_UNAVAILABLE",
        "L’inscription est temporairement indisponible.",
      );
    }

    return errorResponse(
      500,
      "INTERNAL_ERROR",
      "L’inscription n’a pas pu être finalisée.",
    );
  }
}
