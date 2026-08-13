"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";

import { AdminRegieShell } from "@/components/admin/admin-regie-shell";
import type { AdminAccount } from "@/server/services/admin-account-management";
import type { AdminIdentity } from "@/server/services/admin-auth";

export type AdminAccountView = Omit<
  AdminAccount,
  "createdAt" | "updatedAt" | "lastLoginAt"
> & {
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
};

type ApiErrorPayload = { error?: { message?: string } };

const emptyForm = {
  displayName: "",
  email: "",
  password: "",
  passwordConfirmation: "",
};

function formatDate(value: string | null) {
  if (!value) return "Jamais";
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function AdminAccountManagementView({
  admin,
  initialAccounts,
}: {
  admin: AdminIdentity;
  initialAccounts: AdminAccountView[];
}) {
  const router = useRouter();
  const [accounts, setAccounts] = useState(initialAccounts);
  const [form, setForm] = useState(emptyForm);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const activeCount = useMemo(
    () => accounts.filter((account) => account.status === "ACTIVE").length,
    [accounts],
  );

  async function apiFetch(input: string, init?: RequestInit) {
    const response = await fetch(input, { cache: "no-store", ...init });
    if (response.status === 401) {
      router.replace("/admin/login");
      router.refresh();
      throw new Error("La session administrateur n’est plus valide.");
    }
    return response;
  }

  async function responseError(response: Response) {
    const payload = (await response.json().catch(() => ({}))) as ApiErrorPayload;
    return payload.error?.message ?? "L’action n’a pas pu être effectuée.";
  }

  function replaceAccount(nextAccount: AdminAccountView) {
    setAccounts((current) =>
      current.map((account) =>
        account.id === nextAccount.id ? nextAccount : account,
      ),
    );
  }

  async function createAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage(null);

    try {
      const response = await apiFetch("/api/admin/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!response.ok) throw new Error(await responseError(response));
      const payload = (await response.json()) as { account: AdminAccountView };
      setAccounts((current) => [...current, payload.account]);
      setForm(emptyForm);
      setMessage(
        `Compte créé pour ${payload.account.email}. Transmettez le mot de passe par un canal sécurisé.`,
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Création du compte refusée.",
      );
    } finally {
      setPending(false);
    }
  }

  async function changeStatus(account: AdminAccountView) {
    const disabling = account.status === "ACTIVE";
    const isCurrentAccount = account.id === admin.id;
    const action = disabling ? "DISABLE" : "REACTIVATE";
    const warning = disabling
      ? `Désactiver ${account.displayName} ? Toutes ses sessions seront immédiatement révoquées.${isCurrentAccount ? " Vous serez déconnecté." : ""}`
      : `Réactiver ${account.displayName} ? Le compte pourra de nouveau se connecter.`;

    if (!window.confirm(warning)) return;

    setPending(true);
    setMessage(null);
    try {
      const response = await apiFetch(
        `/api/admin/accounts/${account.id}/actions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        },
      );
      if (!response.ok) throw new Error(await responseError(response));
      const payload = (await response.json()) as { account: AdminAccountView };
      replaceAccount(payload.account);

      if (disabling && isCurrentAccount) {
        router.replace("/admin/login");
        router.refresh();
        return;
      }

      setMessage(
        disabling
          ? `${account.displayName} est désactivé et ses sessions ont été révoquées.`
          : `${account.displayName} peut de nouveau se connecter.`,
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Changement de statut refusé.",
      );
    } finally {
      setPending(false);
    }
  }

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.replace("/admin/login");
    router.refresh();
  }

  return (
    <AdminRegieShell
      activePage="accounts"
      admin={admin}
      onLogout={logout}
      toolbarLabel="Sécurité de la régie"
    >
      <div className="admin-accounts-shell admin-subpage-shell" aria-busy={pending}>
        <section className="admin-accounts-hero">
          <div>
            <p className="eyebrow">Sécurité de la régie</p>
            <h1>Accès administrateurs</h1>
            <p>
              Créez les accès nominatifs et coupez immédiatement ceux qui ne
              doivent plus accéder à la régie.
            </p>
          </div>
          <div
            className="admin-accounts-count"
            aria-label={`${activeCount} compte${activeCount > 1 ? "s" : ""} actif${activeCount > 1 ? "s" : ""}`}
          >
            <strong>{activeCount}</strong>
            <span>actif{activeCount > 1 ? "s" : ""}</span>
          </div>
        </section>

        {message ? (
          <p className="admin-accounts-message" role="status">{message}</p>
        ) : null}

        <div className="admin-accounts-grid">
          <section className="admin-accounts-panel">
            <p className="eyebrow">Nouvel accès</p>
            <h2>Créer un compte</h2>
            <form className="admin-accounts-form" onSubmit={createAccount}>
              <label>
                <span>Nom affiché</span>
                <input
                  required
                  minLength={2}
                  maxLength={100}
                  autoComplete="name"
                  value={form.displayName}
                  onChange={(event) => setForm({ ...form, displayName: event.target.value })}
                />
              </label>
              <label>
                <span>Adresse e-mail</span>
                <input
                  required
                  type="email"
                  maxLength={320}
                  autoComplete="email"
                  value={form.email}
                  onChange={(event) => setForm({ ...form, email: event.target.value })}
                />
              </label>
              <label>
                <span>Mot de passe initial</span>
                <input
                  required
                  type="password"
                  minLength={12}
                  maxLength={200}
                  autoComplete="new-password"
                  value={form.password}
                  onChange={(event) => setForm({ ...form, password: event.target.value })}
                />
              </label>
              <label>
                <span>Confirmer le mot de passe</span>
                <input
                  required
                  type="password"
                  minLength={12}
                  maxLength={200}
                  autoComplete="new-password"
                  value={form.passwordConfirmation}
                  onChange={(event) => setForm({ ...form, passwordConfirmation: event.target.value })}
                />
              </label>
              <p className="admin-accounts-password-help">
                12 caractères minimum, avec une lettre, un chiffre et un caractère spécial.
              </p>
              <button type="submit" disabled={pending}>Créer l’administrateur</button>
            </form>
          </section>

          <section className="admin-accounts-panel">
            <p className="eyebrow">Accès existants</p>
            <h2>{accounts.length} compte{accounts.length > 1 ? "s" : ""}</h2>
            <div className="admin-accounts-list">
              {accounts.map((account) => {
                const isCurrentAccount = account.id === admin.id;
                const isLastActive = account.status === "ACTIVE" && activeCount <= 1;
                return (
                  <article key={account.id}>
                    <div className="admin-accounts-identity">
                      <div>
                        <strong>{account.displayName}</strong>
                        {isCurrentAccount ? <span>Vous</span> : null}
                      </div>
                      <a href={`mailto:${account.email}`}>{account.email}</a>
                      <small>Dernière connexion : {formatDate(account.lastLoginAt)}</small>
                      <small>Compte créé le {formatDate(account.createdAt)}</small>
                    </div>
                    <div className="admin-accounts-actions">
                      <span className={`admin-account-status admin-account-status--${account.status.toLowerCase()}`}>
                        {account.status === "ACTIVE" ? "Actif" : "Désactivé"}
                      </span>
                      <button
                        type="button"
                        disabled={pending || isLastActive}
                        onClick={() => void changeStatus(account)}
                      >
                        {account.status === "ACTIVE" ? "Désactiver" : "Réactiver"}
                      </button>
                      {isLastActive ? <small>Dernier compte actif protégé</small> : null}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        </div>
      </div>
    </AdminRegieShell>
  );
}
