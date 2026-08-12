import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { ADMIN_SESSION_COOKIE_NAME } from "@/lib/auth/admin-session";
import { getServerEnv } from "@/lib/env/server";
import { postgresAdminAuthRepository } from "@/server/repositories/admin-auth-repository";
import { logoutAdmin } from "@/server/services/admin-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const token = request.cookies.get(ADMIN_SESSION_COOKIE_NAME)?.value;

  try {
    await logoutAdmin(token, {
      repository: postgresAdminAuthRepository,
      authSecret: getServerEnv().ADMIN_AUTH_SECRET,
    });
  } catch {
    // Le cookie local doit être supprimé même si la révocation distante échoue.
  }

  const response = new NextResponse(null, {
    status: 204,
    headers: { "Cache-Control": "no-store" },
  });
  response.cookies.set(ADMIN_SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });

  return response;
}
