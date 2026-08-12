export default function HomePage() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-6 py-12">
      <section className="w-full max-w-md rounded-3xl border border-white/10 bg-[var(--surface)] p-8 shadow-2xl shadow-black/20">
        <p className="text-sm font-semibold uppercase tracking-[0.28em] text-[var(--brand-accent)]">
          MESTE présente
        </p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight">
          Héritage Congo
        </h1>
        <p className="mt-4 text-base leading-7 text-[var(--text-secondary)]">
          Le quiz culturel consacré à la République du Congo.
        </p>
        <p className="mt-8 text-sm text-[var(--text-secondary)]">
          Fondations techniques prêtes. Le parcours joueur sera ajouté dans une
          tâche dédiée.
        </p>
      </section>
    </main>
  );
}
