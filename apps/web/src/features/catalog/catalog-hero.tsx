import Image from 'next/image';

import { assets } from '../../design-system/assets';
import styles from './catalog.module.css';

export type CatalogApiStatus = 'connected' | 'not-contacted' | 'unavailable';

const statusCopy: Record<CatalogApiStatus, { label: string }> = {
  connected: { label: 'API connected' },
  'not-contacted': { label: 'API not contacted' },
  unavailable: { label: 'API unavailable' },
};

export function CatalogHero({
  announce = true,
  status,
}: {
  announce?: boolean;
  status: CatalogApiStatus;
}) {
  const copy = statusCopy[status];
  const hero = assets.hopsFieldHero;

  return (
    <section
      aria-label="Product catalog"
      className={styles.hero}
      data-catalog-hero
      id="top"
    >
      <h1 className="visually-hidden">Hop &amp; Barley Store</h1>
      <Image
        alt={hero.alt}
        className={styles.heroImage}
        height={hero.height}
        preload
        sizes={hero.sizes}
        src={hero.src}
        width={hero.width}
      />
      <p className="visually-hidden" role={announce ? 'status' : undefined}>
        {copy.label}
      </p>
    </section>
  );
}
