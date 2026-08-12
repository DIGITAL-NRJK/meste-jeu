import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { ADMIN_SESSION_COOKIE_NAME } from "@/lib/auth/admin-session";
import { getServerEnv } from "@/lib/env/server";
import { postgresAdminAuthRepository } from "@/server/repositories/admin-auth-repository";
import { postgresAdminReportingRepository } from "@/server/repositories/admin-reporting-repository";
import { getAuthenticatedAdmin } from "@/server/services/admin-auth";
import {
  AdminReportingInputError,
  getAdminAuditLogs,
} from "@/server/services/admin-reporting";

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
    const auditLogs = await getAdminAuditLogs(
      request.nextUrl.searchParams.get("limit") ?? undefined,
      postgresAdminReportingRepository,
    );
    return NextResponse.json({ auditLogs }, { headers: noStoreHeaders });
  } catch (error) {
    if (error instanceof AdminReportingInputError) {
      return NextResponse.json(
        {
          error: {
            code: "INVALID_LIMIT",
            message: "La limite demandée est invalide.",
          },
        },
        { status: 400, headers: noStoreHeaders },
      );
    }

    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Le journal d’audit n’a pas pu être chargé.",
        },
      },
      { status: 500, headers: noStoreHeaders },
    );
  }
}
