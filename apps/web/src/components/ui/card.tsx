import type { HTMLAttributes, ReactNode } from 'react';

import { classNames } from './class-names';
import styles from './primitives.module.css';

export type CardProps = HTMLAttributes<HTMLDivElement>;

export function Card({ className, ...props }: CardProps) {
  return <div {...props} className={classNames(styles.card, className)} />;
}

export interface ProductCardProps extends Omit<
  HTMLAttributes<HTMLElement>,
  'children'
> {
  badge?: ReactNode;
  description?: ReactNode;
  href: string;
  media: ReactNode;
  name: string;
  price: ReactNode;
}

export function ProductCard({
  badge,
  className,
  description,
  href,
  media,
  name,
  price,
  ...articleProps
}: ProductCardProps) {
  return (
    <article
      {...articleProps}
      className={classNames(styles.card, styles.productCard, className)}
    >
      <a
        aria-label={`View ${name} details`}
        className={styles.productMedia}
        href={href}
      >
        {media}
      </a>
      <div className={styles.productContent}>
        {badge ? <div>{badge}</div> : null}
        <h3 className={styles.productName}>
          <a className={styles.productLink} href={href}>
            {name}
          </a>
        </h3>
        <div className={styles.productPrice}>{price}</div>
        {description ? (
          <p className={styles.productDescription}>{description}</p>
        ) : null}
      </div>
    </article>
  );
}
