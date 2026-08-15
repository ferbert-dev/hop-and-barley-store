export type CatalogApiStatus = 'connected' | 'not-contacted' | 'unavailable';

const statusCopy: Record<
  CatalogApiStatus,
  { className: string; label: string }
> = {
  connected: { className: 'online', label: 'API connected' },
  'not-contacted': { className: 'offline', label: 'API not contacted' },
  unavailable: { className: 'offline', label: 'API unavailable' },
};

export function CatalogHero({
  announce = true,
  status,
}: {
  announce?: boolean;
  status: CatalogApiStatus;
}) {
  const copy = statusCopy[status];

  return (
    <section className="hero" id="top">
      <div>
        <p className="eyebrow">Independent brewing · dependable supply</p>
        <h1>Hop &amp; Barley Store</h1>
        <p className="lede">
          Hops, malt, yeast and brewing kits selected for better batches at
          home.
        </p>
      </div>
      <p
        className={`status ${copy.className}`}
        role={announce ? 'status' : undefined}
      >
        <span aria-hidden="true" />
        {copy.label}
      </p>
    </section>
  );
}
