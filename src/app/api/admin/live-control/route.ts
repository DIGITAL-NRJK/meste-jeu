import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { ADMIN_SESSION_COOKIE_NAME } from "@/lib/auth/admin-session";
import { getServerEnv } from "@/lib/env/server";
import { postgresAdminAuthRepository } from "@/server/repositories/admin-auth-repository";
import { postgresSessionEngineRepository } from "@/server/repositories/session-engine-repository";
import { getAuthenticatedAdmin } from "@/server/services/admin-auth";
import {
  AdminLiveControlInputError,
  executeAdminLiveControl,
} from "@/server/services/admin-live-control";
import {
  SessionInputError,
  SessionInvalidStatusError,
  SessionNotFoundError,
  SessionTransitionError,
} from "@/server/services/session-engine";

export const runtime = "nodejs";
const headers = { "Cache-Control": "no-store" };

export async function POST(request: NextRequest) {
  const env = getServerEnv();
  const admin = await getAuthenticatedAdmin(request.cookies.get(ADMIN_SESSION_COOKIE_NAME)?.value, {
    repository: postgresAdminAuthRepository,
    authSecret: env.ADMIN_AUTH_SECRET,
  });
  if (!admin) {
    return NextResponse.json(
      {
        error: {
          code: "UNAUTHENTICATED",
          message: "La session administrateur n’est plus valide.",
        },
      },
      { status: 401, headers },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: "INVALID_JSON", message: "La commande est illisible." } },
      { status: 400, headers },
    );
  }

  try {
    const session = await executeAdminLiveControl(body, admin.id, postgresSessionEngineRepository);
    return NextResponse.json({ session }, { headers });
  } catch (error) {
    if (error instanceof AdminLiveControlInputError || error instanceof SessionInputError) {
      return NextResponse.json(
        {
          error: {
            code: "INVALID_COMMAND",
            message: "Cette commande live est invalide.",
          },
        },
        { status: 400, headers },
      );
    }
    if (error instanceof SessionNotFoundError) {
      return NextResponse.json(
        {
          error: {
            code: "SESSION_NOT_FOUND",
            message: "La session est introuvable.",
          },
        },
        { status: 404, headers },
      );
    }
    if (error instanceof SessionTransitionError && error.reason === "already_played") {
      return NextResponse.json(
        {
          error: {
            code: "SESSION_ALREADY_PLAYED",
            message:
              "Cette session a déjà été jouée : son conducteur reste verrouillé pour préserver les réponses et les scores.",
          },
        },
        { status: 409, headers },
      );
    }
    if (error instanceof SessionInvalidStatusError || error instanceof SessionTransitionError) {
      return NextResponse.json(
        {
          error: {
            code: "TRANSITION_REFUSED",
            message: "L’état actuel ne permet pas cette action. Actualisez la régie.",
          },
        },
        { status: 409, headers },
      );
    }
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "La commande n’a pas pu être exécutée.",
        },
      },
      { status: 500, headers },
    );
  }
}
