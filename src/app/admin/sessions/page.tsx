import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  AdminProgrammingView,
  type AdminEventView,
  type AdminProgrammingQuestionView,
  type AdminSessionView,
} from "@/components/admin/admin-programming-view";
import { ADMIN_SESSION_COOKIE_NAME } from "@/lib/auth/admin-session";
import { getServerEnv } from "@/lib/env/server";
import { postgresAdminAuthRepository } from "@/server/repositories/admin-auth-repository";
import { postgresAdminProgrammingRepository } from "@/server/repositories/admin-programming-repository";
import { postgresQuestionLibraryRepository } from "@/server/repositories/question-library-repository";
import { getAuthenticatedAdmin } from "@/server/services/admin-auth";
import {
  EventNotFoundError,
  getAdminProgramming,
} from "@/server/services/admin-programming";
import { listQuestions } from "@/server/services/question-library";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Programmation — Régie MESTE",
  robots: { index: false, follow: false },
};

function serializeEvent(
  event: Awaited<ReturnType<typeof getAdminProgramming>>["events"][number],
): AdminEventView {
  return {
    ...event,
    startsAt: event.startsAt.toISOString(),
    endsAt: event.endsAt.toISOString(),
    createdAt: event.createdAt.toISOString(),
    updatedAt: event.updatedAt.toISOString(),
  };
}

function serializeSession(
  session: Awaited<ReturnType<typeof getAdminProgramming>>["sessions"][number],
): AdminSessionView {
  return {
    ...session,
    startsAt: session.startsAt?.toISOString() ?? null,
    endsAt: session.endsAt?.toISOString() ?? null,
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString(),
    questions: session.questions.map((question) => ({
      ...question,
      opensAt: question.opensAt?.toISOString() ?? null,
      closesAt: question.closesAt?.toISOString() ?? null,
      revealedAt: question.revealedAt?.toISOString() ?? null,
      canceledAt: question.canceledAt?.toISOString() ?? null,
    })),
  };
}

export default async function AdminSessionsPage({
  searchParams,
}: {
  searchParams: Promise<{ event?: string | string[] }>;
}) {
  const cookieStore = await cookies();
  const env = getServerEnv();
  const admin = await getAuthenticatedAdmin(
    cookieStore.get(ADMIN_SESSION_COOKIE_NAME)?.value,
    {
      repository: postgresAdminAuthRepository,
      authSecret: env.ADMIN_AUTH_SECRET,
    },
  );

  if (!admin) redirect("/admin/login");

  const rawEvent = (await searchParams).event;
  const eventSlug = Array.isArray(rawEvent) ? rawEvent[0] : rawEvent;
  let programming;

  try {
    programming = await getAdminProgramming(
      eventSlug,
      postgresAdminProgrammingRepository,
    );
  } catch (error) {
    if (error instanceof EventNotFoundError) redirect("/admin/sessions");
    throw error;
  }

  const validatedQuestions = await listQuestions(
    { status: "VALIDATED", limit: 100 },
    postgresQuestionLibraryRepository,
  );
  const questions: AdminProgrammingQuestionView[] = validatedQuestions.map(
    (question) => ({
      id: question.id,
      questionText: question.questionText,
      difficulty: question.difficulty,
      category: {
        id: question.category.id,
        name: question.category.name,
      },
    }),
  );

  return (
    <AdminProgrammingView
      key={programming.event?.id ?? "empty-programming"}
      admin={admin}
      initialEvents={programming.events.map(serializeEvent)}
      initialEvent={programming.event ? serializeEvent(programming.event) : null}
      initialSessions={programming.sessions.map(serializeSession)}
      validatedQuestions={questions}
    />
  );
}
