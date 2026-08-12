import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  ADMIN_SESSION_COOKIE_NAME,
  adminSessionCookieOptions,
} from "@/lib/auth/admin-session";
import { getServerEnv } from "@/lib/env/server";
import { postgresAdminAuthRepository } from "@/server/repositories/admin-auth-repository";
import {
  AdminInvalidCredentialsError,
  AdminLoginInputError,
  loginAdmin,
} from "@/server/services/admin-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const noStoreHeaders = { "Cache-Control": "no-store" };

export async function POST(request: NextRequest) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        error: {
          code: "INVALID_JSON",
          message: "La demande de connexion est illisible.",
        },
      },
      { status: 400, headers: noStoreHeaders },
    );
  }

  try {
    const env = getServerEnv();
    const result = await loginAdmin(body, {
      repository: postgresAdminAuthRepository,
      authSecret: env.ADMIN_AUTH_SECRET,
    });
    const response = NextResponse.json(
      { admin: result.admin },
      { headers: noStoreHeaders },
    );

    response.cookies.set(
      ADMIN_SESSION_COOKIE_NAME,
      result.session.token,
      adminSessionCookieOptions(result.session.expiresAt),
    );

    return response;
  } catch (error) {
    if (error instanceof AdminLoginInputError) {
      return NextResponse.json(
        {
          error: {
            code: "INVALID_LOGIN",
            message: "Vérifiez l’adresse email et le mot de passe.",
          },
        },
        { status: 400, headers: noStoreHeaders },
      );
    }

    if (error instanceof AdminInvalidCredentialsError) {
      return NextResponse.json(
        {
          error: {
            code: "INVALID_CREDENTIALS",
            message: "Identifiants incorrects.",
          },
        },
        { status: 401, headers: noStoreHeaders },
      );
    }

    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "La connexion est temporairement indisponible.",
        },
      },
      { status: 500, headers: noStoreHeaders },
    );
  }
}
