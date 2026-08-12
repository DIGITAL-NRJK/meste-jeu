import Link from "next/link";

export default function HomePage() {
  return (
    <main className="landing-page">
      <div className="landing-river" aria-hidden="true" />
      <section className="landing-content">
        <div className="landing-brand">
          <span className="brand-mark" aria-hidden="true">M</span>
          <span>MESTE présente</span>
        </div>
        <div className="landing-title">
          <p className="eyebrow">15 août 2026 · Ghana</p>
          <h1>Héritage<br />Congo</h1>
          <p>
            Un voyage vivant à travers l’histoire, les arts et les saveurs de la
            République du Congo.
          </p>
        </div>
        <Link className="primary-button landing-button" href="/play/heritage-congo-2026">
          Participer au quiz
          <span aria-hidden="true">→</span>
        </Link>
        <p className="landing-footnote">Pensé pour votre téléphone · Aucun compte requis</p>
      </section>
    </main>
  );
}
