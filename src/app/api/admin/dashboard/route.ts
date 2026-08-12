import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { ADMIN_SESSION_COOKIE_NAME } from "@/lib/auth/admin-session";
import { getServerEnv } from "@/lib/env/server";
import { postgresAdminAuthRepository } from "@/server/repositories/admin-auth-repository";
import { postgresAdminDashboardRepository } from "@/server/repositories/admin-dashboard-repository";
import { getAuthenticatedAdmin } from "@/server/services/admin-auth";
import {
  AdminDashboardEventNotFoundError,
  AdminDashboardInputError,
  getAdminDashboard,
} from "@/server/services/admin-dashboard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const noStoreHeaders = { "Cache-Control": "no-store" };

export async function GET(request: NextRequest) {
  const env = getServerEnv();
  const admin = await getAuthenticatedAdmin(
    request.cookies.get(ADMIN_SESSION_COOKIE_NAME)?.value,
    {
      repository: postgresAdminAuthRepository,
      authSecret: env.ADMIN_AUTH_SECRET,
    },
  );

  if (!admin) {
    return NextResponse.json(
      {
        error: {
          code: "UNAUTHENTICATED",
          message: "La session administrateur n’est plus valide.",
        },
      },
      { status: 401, headers: noStoreHeaders },
    );
  }

  try {
    const dashboard = await getAdminDashboard(
      request.nextUrl.searchParams.get("eventSlug") ?? undefined,
      { repository: postgresAdminDashboardRepository },
    );

    return NextResponse.json(dashboard, { headers: noStoreHeaders });
  } catch (error) {
    if (error instanceof AdminDashboardInputError) {
      return NextResponse.json(
        {
          error: {
            code: "INVALID_EVENT",
            message: "L’événement demandé est invalide.",
          },
        },
        { status: 400, headers: noStoreHeaders },
      );
    }

    if (error instanceof AdminDashboardEventNotFoundError) {
      return NextResponse.json(
        {
          error: {
            code: "EVENT_NOT_FOUND",
            message: "L’événement demandé est introuvable.",
          },
        },
        { status: 404, headers: noStoreHeaders },
      );
    }

    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Les données de régie n’ont pas pu être actualisées.",
        },
      },
      { status: 500, headers: noStoreHeaders },
    );
  }
}
