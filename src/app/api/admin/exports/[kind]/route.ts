import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { ADMIN_SESSION_COOKIE_NAME } from "@/lib/auth/admin-session";
import { getServerEnv } from "@/lib/env/server";
import { postgresAdminAuthRepository } from "@/server/repositories/admin-auth-repository";
import { postgresAdminReportingRepository } from "@/server/repositories/admin-reporting-repository";
import { getAuthenticatedAdmin } from "@/server/services/admin-auth";
import {
  AdminReportingEventNotFoundError,
  AdminReportingInputError,
  createAdminExport,
} from "@/server/services/admin-reporting";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const noStoreHeaders = { "Cache-Control": "no-store" };

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ kind: string }> },
) {
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
    const { kind } = await context.params;
    const report = await createAdminExport(
      {
        kind,
        eventSlug: request.nextUrl.searchParams.get("eventSlug"),
      },
      postgresAdminReportingRepository,
    );

    return new Response(report.content, {
      headers: {
        ...noStoreHeaders,
        "Content-Disposition": `attachment; filename="${report.filename}"`,
        "Content-Type": "text/csv; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof AdminReportingInputError) {
      return NextResponse.json(
        {
          error: {
            code: "INVALID_EXPORT",
            message: "L’export demandé est invalide.",
          },
        },
        { status: 400, headers: noStoreHeaders },
      );
    }

    if (error instanceof AdminReportingEventNotFoundError) {
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
          message: "L’export n’a pas pu être généré.",
        },
      },
      { status: 500, headers: noStoreHeaders },
    );
  }
}
