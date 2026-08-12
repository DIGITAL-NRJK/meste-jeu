import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { AdminLoginForm } from "@/components/admin/admin-login-form";
import { ADMIN_SESSION_COOKIE_NAME } from "@/lib/auth/admin-session";
import { getServerEnv } from "@/lib/env/server";
import { postgresAdminAuthRepository } from "@/server/repositories/admin-auth-repository";
import { getAuthenticatedAdmin } from "@/server/services/admin-auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Connexion régie — Héritage Congo",
  robots: { index: false, follow: false },
};

export default async function AdminLoginPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE_NAME)?.value;
  const admin = token
    ? await getAuthenticatedAdmin(token, {
        repository: postgresAdminAuthRepository,
        authSecret: getServerEnv().ADMIN_AUTH_SECRET,
      })
    : null;

  if (admin) redirect("/admin");

  return <AdminLoginForm />;
}
