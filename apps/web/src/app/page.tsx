import { formatPrice } from '../lib/format-price';

type Product = {
  currency: string;
  description: string;
  id: string;
  name: string;
  priceMinor: number;
  slug: string;
};

export const dynamic = 'force-dynamic';

async function getProducts(): Promise<{
  connected: boolean;
  products: Product[];
}> {
  const apiUrl = process.env.API_INTERNAL_URL ?? 'http://127.0.0.1:3001/api/v1';

  try {
    const response = await fetch(`${apiUrl}/products`, { cache: 'no-store' });

    if (!response.ok) {
      throw new Error(`Catalog request failed with ${response.status}`);
    }

    return {
      connected: true,
      products: (await response.json()) as Product[],
    };
  } catch {
    return { connected: false, products: [] };
  }
}

export default async function Home() {
  const { connected, products } = await getProducts();

  return (
    <main>
      <header className="site-header">
        <a className="brand" href="#top" aria-label="Hop and Barley home">
          H<span>&</span>B
        </a>
        <p>Independent beer, thoughtfully selected.</p>
      </header>

      <section className="hero" id="top">
        <div>
          <p className="eyebrow">Local stack · first pour</p>
          <h1>Hop &amp; Barley Store</h1>
          <p className="lede">
            The storefront, API and PostgreSQL database are now sharing one
            dependable development environment.
          </p>
        </div>
        <div className={`status ${connected ? 'online' : 'offline'}`}>
          <span aria-hidden="true" />
          {connected ? 'API connected' : 'API unavailable'}
        </div>
      </section>

      <section className="catalog" aria-labelledby="catalog-title">
        <div className="section-heading">
          <p className="eyebrow">From the database</p>
          <h2 id="catalog-title">Current selection</h2>
        </div>

        {products.length > 0 ? (
          <div className="product-grid">
            {products.map((product, index) => (
              <article className="product-card" key={product.id}>
                <div className="can" aria-hidden="true">
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  <strong>H&amp;B</strong>
                </div>
                <div>
                  <h3>{product.name}</h3>
                  <p>{product.description}</p>
                  <strong className="price">
                    {formatPrice(product.priceMinor, product.currency)}
                  </strong>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="empty-state">
            Start the local stack to load products from PostgreSQL.
          </p>
        )}
      </section>

      <footer>Hop &amp; Barley · Platform foundation</footer>
    </main>
  );
}
