export function BrandHeader({ compact = false }: { compact?: boolean }) {
  return (
    <header className={`brand-header${compact ? " brand-header--compact" : ""}`}>
      <span className="brand-mark" aria-hidden="true">
        M
      </span>
      <span>
        <strong>MESTE</strong>
        <small>Héritage Congo</small>
      </span>
    </header>
  );
}
