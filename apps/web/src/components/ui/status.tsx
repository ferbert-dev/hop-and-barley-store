import type { HTMLAttributes, ReactNode } from 'react';

import { classNames } from './class-names';
import styles from './primitives.module.css';

export interface StatusStateProps extends Omit<
  HTMLAttributes<HTMLElement>,
  'title'
> {
  action?: ReactNode;
  title: ReactNode;
}

function StatusContent({
  action,
  children,
  title,
}: Pick<StatusStateProps, 'action' | 'children' | 'title'>) {
  return (
    <>
      <h2 className={styles.statusTitle}>{title}</h2>
      {children ? <div className={styles.statusBody}>{children}</div> : null}
      {action ? <div className={styles.statusAction}>{action}</div> : null}
    </>
  );
}

export function LoadingState({
  action,
  children,
  className,
  title,
  ...sectionProps
}: StatusStateProps) {
  return (
    <section
      {...sectionProps}
      aria-busy="true"
      aria-live="polite"
      className={classNames(
        styles.statusPanel,
        styles.statusLoading,
        className,
      )}
      role="status"
    >
      <StatusContent action={action} title={title}>
        {children}
      </StatusContent>
    </section>
  );
}

export function EmptyState({
  action,
  children,
  className,
  title,
  ...sectionProps
}: StatusStateProps) {
  return (
    <section
      {...sectionProps}
      aria-live="polite"
      className={classNames(styles.statusPanel, className)}
      role="status"
    >
      <StatusContent action={action} title={title}>
        {children}
      </StatusContent>
    </section>
  );
}

export function ErrorState({
  action,
  children,
  className,
  title,
  ...sectionProps
}: StatusStateProps) {
  return (
    <section
      {...sectionProps}
      aria-live="assertive"
      className={classNames(styles.statusPanel, styles.statusError, className)}
      role="alert"
    >
      <StatusContent action={action} title={title}>
        {children}
      </StatusContent>
    </section>
  );
}
