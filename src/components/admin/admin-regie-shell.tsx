import type { ReactNode } from "react";

import type { AdminIdentity } from "@/server/services/admin-auth";

type AdminPage =
  | "dashboard"
  | "sessions"
  | "questions"
  | "players"
  | "rewards"
  | "accounts";

const navigation: Array<{
  key: AdminPage;
  label: string;
  href: string;
  index: string;
}> = [
  { key: "dashboard", label: "Vue de la salle", href: "/admin", index: "01" },
  { key: "sessions", label: "Conducteur", href: "/admin/sessions", index: "02" },
  { key: "questions", label: "Questions", href: "/admin/questions", index: "03" },
  { key: "players", label: "Joueurs", href: "/admin/players", index: "04" },
  { key: "rewards", label: "Lots", href: "/admin/rewards", index: "05" },
  { key: "accounts", label: "Accès", href: "/admin/accounts", index: "06" },
];

export function AdminRegieShell({
  activePage,
  admin,
  children,
  eventName,
  eventSlug,
  onLogout,
  toolbar,
  toolbarLabel = "Régie MESTE",
}: {
  activePage: AdminPage;
  admin: AdminIdentity;
  children: ReactNode;
  eventName?: string | null;
  eventSlug?: string | null;
  onLogout: () => void | Promise<void>;
  toolbar?: ReactNode;
  toolbarLabel?: string;
}) {
  const eventQuery = eventSlug ? `?event=${encodeURIComponent(eventSlug)}` : "";

  return (
    <main className="regie-shell regie-shell--subpage">
      <a className="regie-skip-link" href="#regie-content">
        Aller au contenu
      </a>

      <aside className="regie-sidebar">
        <a className="regie-brand" href="/admin" aria-label="Régie MESTE — accueil">
          <span className="regie-brand-mark" aria-hidden="true">M</span>
          <span>
            <strong>RÉGIE MESTE</strong>
            <small>Héritage Congo</small>
          </span>
        </a>

        <nav className="regie-navigation" aria-label="Navigation de la régie">
          {navigation.map((item) => {
            const href = item.key === "players" || item.key === "rewards"
              ? `${item.href}${eventQuery}`
              : item.href;
            const active = item.key === activePage;

            return (
              <a
                className={active ? "is-active" : undefined}
                href={href}
                aria-current={active ? "page" : undefined}
                key={item.key}
              >
                <span aria-hidden="true">{item.index}</span>
                {item.label}
              </a>
            );
          })}
          {eventSlug ? (
            <a
              className="regie-player-entry"
              href={`/play/${encodeURIComponent(eventSlug)}`}
              target="_blank"
              rel="noreferrer"
            >
              <span aria-hidden="true">↗</span>
              Espace joueur
            </a>
          ) : null}
        </nav>

        <div className="regie-sidebar-live">
          <div>
            <span aria-hidden="true" />
            <p>{eventName ? "Événement supervisé" : "Régie disponible"}</p>
          </div>
          <strong>{eventName ?? "Héritage Congo"}</strong>
          <small>
            {eventSlug
              ? "Retrouvez la conduite live depuis la vue de la salle."
              : "Sélectionnez un événement depuis la page concernée."}
          </small>
        </div>
      </aside>

      <section className="regie-workspace">
        <header className="regie-toolbar">
          {toolbar ?? <p className="regie-toolbar-label">{toolbarLabel}</p>}

          <div className="regie-account">
            <span className="regie-account-avatar" aria-hidden="true">
              {admin.displayName.slice(0, 2).toUpperCase()}
            </span>
            <span>
              <strong>{admin.displayName}</strong>
              <a href="/admin/accounts">Gérer les accès</a>
            </span>
            <button type="button" onClick={onLogout}>Se déconnecter</button>
          </div>
        </header>

        <div className="regie-admin-content" id="regie-content">
          {children}
        </div>
      </section>
    </main>
  );
}
