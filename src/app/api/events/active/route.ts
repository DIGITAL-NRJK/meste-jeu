import { NextResponse } from "next/server";

import { postgresPublicEventEntryRepository } from "@/server/repositories/public-event-entry-repository";
import { getPublicEventEntry } from "@/server/services/public-event-entry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStoreHeaders = { "Cache-Control": "no-store" };

export async function GET() {
  try {
    const event = await getPublicEventEntry(postgresPublicEventEntryRepository);
    return NextResponse.json({ event }, { headers: noStoreHeaders });
  } catch {
    return NextResponse.json(
      {
        error: {
          code: "PUBLIC_EVENT_UNAVAILABLE",
          message: "L’événement est temporairement inaccessible.",
        },
      },
      { status: 503, headers: noStoreHeaders },
    );
  }
}
