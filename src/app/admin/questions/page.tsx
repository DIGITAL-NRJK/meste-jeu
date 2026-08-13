import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  AdminQuestionLibraryView,
  type AdminQuestionSummaryView,
} from "@/components/admin/admin-question-library-view";
import { ADMIN_SESSION_COOKIE_NAME } from "@/lib/auth/admin-session";
import { getServerEnv } from "@/lib/env/server";
import { postgresAdminAuthRepository } from "@/server/repositories/admin-auth-repository";
import { postgresQuestionLibraryRepository } from "@/server/repositories/question-library-repository";
import { getAuthenticatedAdmin } from "@/server/services/admin-auth";
import { listCategories, listQuestions } from "@/server/services/question-library";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Questions et catégories — Régie MESTE",
  robots: { index: false, follow: false },
};

export default async function AdminQuestionsPage() {
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

  const [categories, questions] = await Promise.all([
    listCategories(postgresQuestionLibraryRepository),
    listQuestions({ limit: 100 }, postgresQuestionLibraryRepository),
  ]);
  const serializedQuestions: AdminQuestionSummaryView[] = questions.map(
    (question) => ({
      ...question,
      createdAt: question.createdAt.toISOString(),
      updatedAt: question.updatedAt.toISOString(),
      validatedAt: question.validatedAt?.toISOString() ?? null,
    }),
  );

  return (
    <AdminQuestionLibraryView
      admin={admin}
      initialCategories={categories}
      initialQuestions={serializedQuestions}
    />
  );
}
