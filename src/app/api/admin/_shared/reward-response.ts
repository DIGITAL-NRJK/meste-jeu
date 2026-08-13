import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { ADMIN_SESSION_COOKIE_NAME } from "@/lib/auth/admin-session";
import { getServerEnv } from "@/lib/env/server";
import { postgresAdminAuthRepository } from "@/server/repositories/admin-auth-repository";
import { getAuthenticatedAdmin } from "@/server/services/admin-auth";
import {
  AdminRewardAlreadyDeliveredError,
  AdminRewardDuplicateAwardError,
  AdminRewardEventNotFoundError,
  AdminRewardInputError,
  AdminRewardNotFoundError,
  AdminRewardPlayerNotFoundError,
} from "@/server/services/admin-rewards";

export const rewardHeaders = { "Cache-Control": "no-store" };

export async function authenticateRewardRequest(request: NextRequest) {
  const env = getServerEnv();
  return getAuthenticatedAdmin(request.cookies.get(ADMIN_SESSION_COOKIE_NAME)?.value, {
    repository: postgresAdminAuthRepository,
    authSecret: env.ADMIN_AUTH_SECRET,
  });
}

export function unauthenticatedRewardResponse() {
  return NextResponse.json(
    { error: { code: "UNAUTHENTICATED", message: "La session administrateur n’est plus valide." } },
    { status: 401, headers: rewardHeaders },
  );
}

export function rewardErrorResponse(error: unknown) {
  if (error instanceof AdminRewardInputError) {
    return NextResponse.json(
      { error: { code: "INVALID_INPUT", message: "Vérifiez les informations du lot.", issues: error.issues } },
      { status: 400, headers: rewardHeaders },
    );
  }
  if (error instanceof AdminRewardEventNotFoundError) {
    return NextResponse.json({ error: { code: "EVENT_NOT_FOUND", message: "Événement introuvable." } }, { status: 404, headers: rewardHeaders });
  }
  if (error instanceof AdminRewardNotFoundError) {
    return NextResponse.json({ error: { code: "REWARD_NOT_FOUND", message: "Lot ou attribution introuvable." } }, { status: 404, headers: rewardHeaders });
  }
  if (error instanceof AdminRewardPlayerNotFoundError) {
    return NextResponse.json({ error: { code: "PLAYER_NOT_FOUND", message: "Ce joueur n’appartient pas à l’événement." } }, { status: 404, headers: rewardHeaders });
  }
  if (error instanceof AdminRewardDuplicateAwardError) {
    return NextResponse.json({ error: { code: "DUPLICATE_AWARD", message: "Ce lot est déjà attribué à ce joueur." } }, { status: 409, headers: rewardHeaders });
  }
  if (error instanceof AdminRewardAlreadyDeliveredError) {
    return NextResponse.json({ error: { code: "ALREADY_DELIVERED", message: "Ce lot a déjà été remis." } }, { status: 409, headers: rewardHeaders });
  }
  return NextResponse.json(
    { error: { code: "INTERNAL_ERROR", message: "La gestion des lots est momentanément indisponible." } },
    { status: 500, headers: rewardHeaders },
  );
}

export async function readRewardJson(request: NextRequest) {
  try {
    return { ok: true as const, body: await request.json() as unknown };
  } catch {
    return { ok: false as const, response: NextResponse.json({ error: { code: "INVALID_JSON", message: "La requête est illisible." } }, { status: 400, headers: rewardHeaders }) };
  }
}
