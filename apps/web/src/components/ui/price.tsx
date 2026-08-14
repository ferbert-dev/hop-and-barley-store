import type { ComponentPropsWithoutRef } from 'react';

import { formatPrice, type PriceValue } from '../../lib/format-price';
import { classNames } from './class-names';
import styles from './primitives.module.css';

export type PriceProps = PriceValue &
  Omit<ComponentPropsWithoutRef<'data'>, 'children' | 'value'>;

export function Price({
  className,
  currency,
  locale,
  minorUnits,
  ...dataProps
}: PriceProps) {
  return (
    <data
      {...dataProps}
      className={classNames(styles.price, className)}
      value={`${minorUnits} ${currency}`}
    >
      {formatPrice({ currency, locale, minorUnits })}
    </data>
  );
}
