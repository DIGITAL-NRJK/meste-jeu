import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { ADMIN_SESSION_COOKIE_NAME } from "@/lib/auth/admin-session";
import { getServerEnv } from "@/lib/env/server";
import { postgresAdminAuthRepository } from "@/server/repositories/admin-auth-repository";
import { getAuthenticatedAdmin, type AdminIdentity } from "@/server/services/admin-auth";
import {
  AdminPlayerAlreadyDisabledError,
  AdminPlayerEventNotFoundError,
  AdminPlayerInputError,
  AdminPlayerNotFoundError,
  AdminPlayerSessionNotFoundError,
} from "@/server/services/admin-player-management";

export const adminPlayerHeaders = { "Cache-Control": "no-store" };

export function unauthenticatedAdminPlayerResponse() {
  return NextResponse.json(
    {
      error: {
        code: "UNAUTHENTICATED",
        message: "La session administrateur n’est plus valide.",
      },
    },
    { status: 401, headers: adminPlayerHeaders },
  );
}

export async function authenticateAdminPlayerRequest(
  request: NextRequest,
): Promise<AdminIdentity | null> {
  const env = getServerEnv();

  return getAuthenticatedAdmin(
    request.cookies.get(ADMIN_SESSION_COOKIE_NAME)?.value,
    {
      repository: postgresAdminAuthRepository,
      authSecret: env.ADMIN_AUTH_SECRET,
    },
  );
}

export function adminPlayerErrorResponse(error: unknown) {
  if (error instanceof AdminPlayerInputError) {
    return NextResponse.json(
      {
        error: {
          code: "INVALID_INPUT",
          message: "Vérifiez les critères demandés.",
          issues: error.issues,
        },
      },
      { status: 400, headers: adminPlayerHeaders },
    );
  }

  if (error instanceof AdminPlayerEventNotFoundError) {
    return NextResponse.json(
      { error: { code: "EVENT_NOT_FOUND", message: "Événement introuvable." } },
      { status: 404, headers: adminPlayerHeaders },
    );
  }

  if (error instanceof AdminPlayerNotFoundError) {
    return NextResponse.json(
      { error: { code: "PLAYER_NOT_FOUND", message: "Joueur introuvable." } },
      { status: 404, headers: adminPlayerHeaders },
    );
  }

  if (error instanceof AdminPlayerSessionNotFoundError) {
    return NextResponse.json(
      {
        error: {
          code: "SCORE_SESSION_NOT_FOUND",
          message: "La session choisie n’appartient pas à l’événement du joueur.",
        },
      },
      { status: 404, headers: adminPlayerHeaders },
    );
  }

  if (error instanceof AdminPlayerAlreadyDisabledError) {
    return NextResponse.json(
      {
        error: {
          code: "PLAYER_ALREADY_DISABLED",
          message: "Ce joueur est déjà désactivé.",
        },
      },
      { status: 409, headers: adminPlayerHeaders },
    );
  }

  return NextResponse.json(
    {
      error: {
        code: "INTERNAL_ERROR",
        message: "La gestion des joueurs est momentanément indisponible.",
      },
    },
    { status: 500, headers: adminPlayerHeaders },
  );
}

export async function readAdminPlayerJson(request: NextRequest) {
  try {
    return { ok: true as const, body: await request.json() as unknown };
  } catch {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: { code: "INVALID_JSON", message: "La requête est illisible." } },
        { status: 400, headers: adminPlayerHeaders },
      ),
    };
  }
}
