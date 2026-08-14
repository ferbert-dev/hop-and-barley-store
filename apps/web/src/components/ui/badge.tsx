import type { HTMLAttributes } from 'react';

import { classNames } from './class-names';
import styles from './primitives.module.css';

export type BadgeTone = 'danger' | 'neutral' | 'success' | 'warning';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
}

const toneClasses: Record<BadgeTone, string> = {
  danger: styles.badgeDanger,
  neutral: styles.badgeNeutral,
  success: styles.badgeSuccess,
  warning: styles.badgeWarning,
};

export function Badge({ className, tone = 'neutral', ...props }: BadgeProps) {
  return (
    <span
      {...props}
      className={classNames(styles.badge, toneClasses[tone], className)}
    />
  );
}
