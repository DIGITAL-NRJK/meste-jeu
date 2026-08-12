import { NextResponse } from "next/server";

import { postgresSessionEngineRepository } from "@/server/repositories/session-engine-repository";
import {
  getPublicSessionState,
  SessionInputError,
  SessionNotFoundError,
} from "@/server/services/session-engine";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const noStoreHeaders = { "Cache-Control": "no-store" };

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const state = await getPublicSessionState(id, {
      repository: postgresSessionEngineRepository,
    });

    return NextResponse.json(state, { headers: noStoreHeaders });
  } catch (error) {
    if (error instanceof SessionInputError) {
      return NextResponse.json(
        { error: { code: "INVALID_SESSION", message: "Session invalide." } },
        { status: 400, headers: noStoreHeaders },
      );
    }

    if (error instanceof SessionNotFoundError) {
      return NextResponse.json(
        { error: { code: "SESSION_NOT_FOUND", message: "Session introuvable." } },
        { status: 404, headers: noStoreHeaders },
      );
    }

    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "La question n’a pas pu être récupérée.",
        },
      },
      { status: 500, headers: noStoreHeaders },
    );
  }
}
