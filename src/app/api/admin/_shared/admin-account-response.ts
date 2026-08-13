import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { ADMIN_SESSION_COOKIE_NAME } from "@/lib/auth/admin-session";
import { getServerEnv } from "@/lib/env/server";
import { postgresAdminAuthRepository } from "@/server/repositories/admin-auth-repository";
import {
  AdminAccountAlreadyInStatusError,
  AdminAccountEmailConflictError,
  AdminAccountInputError,
  AdminAccountLastActiveError,
  AdminAccountNotFoundError,
} from "@/server/services/admin-account-management";
import { getAuthenticatedAdmin } from "@/server/services/admin-auth";

export const adminAccountHeaders = { "Cache-Control": "no-store" };

export async function authenticateAdminAccountRequest(request: NextRequest) {
  const env = getServerEnv();
  return getAuthenticatedAdmin(
    request.cookies.get(ADMIN_SESSION_COOKIE_NAME)?.value,
    {
      repository: postgresAdminAuthRepository,
      authSecret: env.ADMIN_AUTH_SECRET,
    },
  );
}

export function unauthenticatedAdminAccountResponse() {
  return NextResponse.json(
    {
      error: {
        code: "UNAUTHENTICATED",
        message: "La session administrateur n’est plus valide.",
      },
    },
    { status: 401, headers: adminAccountHeaders },
  );
}

export function adminAccountErrorResponse(error: unknown) {
  if (error instanceof AdminAccountInputError) {
    return NextResponse.json(
      {
        error: {
          code: "INVALID_INPUT",
          message: "Vérifiez les informations du compte administrateur.",
          issues: error.issues,
        },
      },
      { status: 400, headers: adminAccountHeaders },
    );
  }
  if (error instanceof AdminAccountEmailConflictError) {
    return NextResponse.json(
      {
        error: {
          code: "EMAIL_CONFLICT",
          message: "Un compte administrateur utilise déjà cette adresse.",
        },
      },
      { status: 409, headers: adminAccountHeaders },
    );
  }
  if (error instanceof AdminAccountNotFoundError) {
    return NextResponse.json(
      {
        error: {
          code: "ACCOUNT_NOT_FOUND",
          message: "Ce compte administrateur est introuvable.",
        },
      },
      { status: 404, headers: adminAccountHeaders },
    );
  }
  if (error instanceof AdminAccountAlreadyInStatusError) {
    return NextResponse.json(
      {
        error: {
          code: "ALREADY_IN_STATUS",
          message: "Ce compte possède déjà ce statut.",
        },
      },
      { status: 409, headers: adminAccountHeaders },
    );
  }
  if (error instanceof AdminAccountLastActiveError) {
    return NextResponse.json(
      {
        error: {
          code: "LAST_ACTIVE_ADMIN",
          message:
            "Le dernier compte administrateur actif ne peut pas être désactivé.",
        },
      },
      { status: 409, headers: adminAccountHeaders },
    );
  }

  return NextResponse.json(
    {
      error: {
        code: "INTERNAL_ERROR",
        message: "La gestion des administrateurs est momentanément indisponible.",
      },
    },
    { status: 500, headers: adminAccountHeaders },
  );
}

export async function readAdminAccountJson(request: NextRequest) {
  try {
    return { ok: true as const, body: (await request.json()) as unknown };
  } catch {
    return {
      ok: false as const,
      response: NextResponse.json(
        {
          error: {
            code: "INVALID_JSON",
            message: "La requête est illisible.",
          },
        },
        { status: 400, headers: adminAccountHeaders },
      ),
    };
  }
}
