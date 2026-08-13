import "server-only";

import { and, desc, eq, inArray, sql } from "drizzle-orm";

import { events } from "../../../db/schema";
import { getDb } from "@/lib/db/client";
import type {
  PublicEventEntry,
  PublicEventEntryRepository,
} from "@/server/services/public-event-entry";

async function findOpenProductionEvent(): Promise<PublicEventEntry | null> {
  const [event] = await getDb()
    .select({
      slug: events.slug,
      name: events.name,
      status: events.status,
    })
    .from(events)
    .where(
      and(
        eq(events.environment, "PRODUCTION"),
        inArray(events.status, ["READY", "LIVE"]),
      ),
    )
    .orderBy(
      sql`CASE ${events.status}::text WHEN 'LIVE' THEN 0 ELSE 1 END`,
      desc(events.startsAt),
    )
    .limit(1);

  if (!event || (event.status !== "READY" && event.status !== "LIVE")) {
    return null;
  }

  return {
    slug: event.slug,
    name: event.name,
    status: event.status,
  };
}

export const postgresPublicEventEntryRepository: PublicEventEntryRepository = {
  findOpenProductionEvent,
};
