import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { ADMIN_SESSION_COOKIE_NAME } from "@/lib/auth/admin-session";
import { getServerEnv } from "@/lib/env/server";
import { postgresAdminAuthRepository } from "@/server/repositories/admin-auth-repository";
import { getAuthenticatedAdmin, type AdminIdentity } from "@/server/services/admin-auth";
import {
  CategoryConflictError,
  QuestionCategoryNotFoundError,
  QuestionInputError,
  QuestionInvalidStatusError,
  QuestionNotEditableError,
  QuestionNotFoundError,
  QuestionNotReadyError,
} from "@/server/services/question-library";

export const adminLibraryHeaders = { "Cache-Control": "no-store" };

export function unauthenticatedAdminLibraryResponse() {
  return NextResponse.json(
    {
      error: {
        code: "UNAUTHENTICATED",
        message: "La session administrateur n’est plus valide.",
      },
    },
    { status: 401, headers: adminLibraryHeaders },
  );
}

export async function authenticateAdminLibraryRequest(
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

export function adminLibraryErrorResponse(error: unknown) {
  if (error instanceof QuestionInputError) {
    return NextResponse.json(
      {
        error: {
          code: "INVALID_INPUT",
          message: "Vérifiez les informations saisies.",
          issues: error.issues,
        },
      },
      { status: 400, headers: adminLibraryHeaders },
    );
  }

  if (error instanceof QuestionNotFoundError) {
    return NextResponse.json(
      { error: { code: "QUESTION_NOT_FOUND", message: "Question introuvable." } },
      { status: 404, headers: adminLibraryHeaders },
    );
  }

  if (error instanceof QuestionCategoryNotFoundError) {
    return NextResponse.json(
      { error: { code: "CATEGORY_NOT_FOUND", message: "Catégorie introuvable." } },
      { status: 404, headers: adminLibraryHeaders },
    );
  }

  if (error instanceof CategoryConflictError) {
    return NextResponse.json(
      {
        error: {
          code: "CATEGORY_CONFLICT",
          message: "Une catégorie portant ce nom existe déjà.",
        },
      },
      { status: 409, headers: adminLibraryHeaders },
    );
  }

  if (error instanceof QuestionNotEditableError) {
    return NextResponse.json(
      {
        error: {
          code: "QUESTION_NOT_EDITABLE",
          message: "Une question validée ou archivée ne peut plus être modifiée.",
        },
      },
      { status: 409, headers: adminLibraryHeaders },
    );
  }

  if (error instanceof QuestionInvalidStatusError) {
    return NextResponse.json(
      {
        error: {
          code: "INVALID_STATUS",
          message: "L’état actuel de la question ne permet pas cette action.",
        },
      },
      { status: 409, headers: adminLibraryHeaders },
    );
  }

  if (error instanceof QuestionNotReadyError) {
    const message =
      error.reason === "category_inactive"
        ? "Activez la catégorie avant de valider cette question."
        : "Ajoutez deux réponses au minimum, une seule bonne réponse et une source.";

    return NextResponse.json(
      { error: { code: "QUESTION_NOT_READY", message } },
      { status: 409, headers: adminLibraryHeaders },
    );
  }

  return NextResponse.json(
    {
      error: {
        code: "INTERNAL_ERROR",
        message: "La bibliothèque n’a pas pu être mise à jour.",
      },
    },
    { status: 500, headers: adminLibraryHeaders },
  );
}

export async function readAdminLibraryJson(request: NextRequest) {
  try {
    return { ok: true as const, body: await request.json() as unknown };
  } catch {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: { code: "INVALID_JSON", message: "La requête est illisible." } },
        { status: 400, headers: adminLibraryHeaders },
      ),
    };
  }
}
