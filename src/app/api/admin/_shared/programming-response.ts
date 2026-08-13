import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { ADMIN_SESSION_COOKIE_NAME } from "@/lib/auth/admin-session";
import { getServerEnv } from "@/lib/env/server";
import { postgresAdminAuthRepository } from "@/server/repositories/admin-auth-repository";
import { getAuthenticatedAdmin, type AdminIdentity } from "@/server/services/admin-auth";
import {
  AdminProgrammingInputError,
  EventInvalidStatusError,
  EventHasActiveSessionError,
  EventNotFoundError,
  EventNotReadyError,
  EventSlugConflictError,
} from "@/server/services/admin-programming";
import {
  SessionEventNotFoundError,
  SessionInputError,
  SessionInvalidStatusError,
  SessionLineupError,
  SessionNotFoundError,
  SessionSlugConflictError,
  SessionTransitionError,
} from "@/server/services/session-engine";

export const adminProgrammingHeaders = { "Cache-Control": "no-store" };

export async function authenticateAdminProgrammingRequest(
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

export function unauthenticatedAdminProgrammingResponse() {
  return NextResponse.json(
    {
      error: {
        code: "UNAUTHENTICATED",
        message: "La session administrateur n’est plus valide.",
      },
    },
    { status: 401, headers: adminProgrammingHeaders },
  );
}

export async function readAdminProgrammingJson(request: NextRequest) {
  try {
    return { ok: true as const, body: (await request.json()) as unknown };
  } catch {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: { code: "INVALID_JSON", message: "La requête est illisible." } },
        { status: 400, headers: adminProgrammingHeaders },
      ),
    };
  }
}

export function adminProgrammingErrorResponse(error: unknown) {
  if (
    error instanceof AdminProgrammingInputError ||
    error instanceof SessionInputError
  ) {
    return NextResponse.json(
      {
        error: {
          code: "INVALID_INPUT",
          message: "Vérifiez les informations saisies.",
          issues: error.issues,
        },
      },
      { status: 400, headers: adminProgrammingHeaders },
    );
  }

  if (
    error instanceof EventNotFoundError ||
    error instanceof SessionEventNotFoundError
  ) {
    return NextResponse.json(
      { error: { code: "EVENT_NOT_FOUND", message: "Événement introuvable." } },
      { status: 404, headers: adminProgrammingHeaders },
    );
  }

  if (error instanceof SessionNotFoundError) {
    return NextResponse.json(
      { error: { code: "SESSION_NOT_FOUND", message: "Session introuvable." } },
      { status: 404, headers: adminProgrammingHeaders },
    );
  }

  if (error instanceof EventSlugConflictError) {
    return NextResponse.json(
      {
        error: {
          code: "EVENT_CONFLICT",
          message: "Un événement portant ce nom existe déjà.",
        },
      },
      { status: 409, headers: adminProgrammingHeaders },
    );
  }

  if (error instanceof SessionSlugConflictError) {
    return NextResponse.json(
      {
        error: {
          code: "SESSION_CONFLICT",
          message: "Une session portant ce nom existe déjà dans cet événement.",
        },
      },
      { status: 409, headers: adminProgrammingHeaders },
    );
  }

  if (error instanceof EventNotReadyError) {
    return NextResponse.json(
      {
        error: {
          code: "EVENT_NOT_READY",
          message: "Préparez au moins une session avant d’ouvrir les inscriptions.",
        },
      },
      { status: 409, headers: adminProgrammingHeaders },
    );
  }

  if (error instanceof EventHasActiveSessionError) {
    return NextResponse.json(
      {
        error: {
          code: "EVENT_HAS_ACTIVE_SESSION",
          message: "Terminez la session en direct avant de clôturer l’événement.",
        },
      },
      { status: 409, headers: adminProgrammingHeaders },
    );
  }

  if (error instanceof SessionLineupError) {
    return NextResponse.json(
      {
        error: {
          code: "INVALID_LINEUP",
          message: "Le conducteur contient une question absente ou non validée.",
        },
      },
      { status: 409, headers: adminProgrammingHeaders },
    );
  }

  if (error instanceof SessionTransitionError) {
    const message =
      error.reason === "no_questions"
        ? "Ajoutez au moins une question avant de préparer la session."
        : "La session ne peut pas changer d’état avec sa configuration actuelle.";

    return NextResponse.json(
      { error: { code: "TRANSITION_REFUSED", message } },
      { status: 409, headers: adminProgrammingHeaders },
    );
  }

  if (
    error instanceof EventInvalidStatusError ||
    error instanceof SessionInvalidStatusError
  ) {
    return NextResponse.json(
      {
        error: {
          code: "INVALID_STATUS",
          message: "L’état actuel ne permet plus cette modification.",
        },
      },
      { status: 409, headers: adminProgrammingHeaders },
    );
  }

  return NextResponse.json(
    {
      error: {
        code: "INTERNAL_ERROR",
        message: "La programmation n’a pas pu être mise à jour.",
      },
    },
    { status: 500, headers: adminProgrammingHeaders },
  );
}
