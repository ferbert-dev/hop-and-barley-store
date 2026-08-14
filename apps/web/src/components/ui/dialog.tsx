'use client';

import type { ReactNode } from 'react';
import { useCallback, useEffect, useRef } from 'react';

import { Button } from './button';
import { classNames } from './class-names';
import styles from './primitives.module.css';

export interface DialogProps {
  children: ReactNode;
  className?: string;
  closeLabel?: string;
  description?: string;
  id: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  title: ReactNode;
}

export function Dialog({
  children,
  className,
  closeLabel = 'Close dialog',
  description,
  id,
  onOpenChange,
  open,
  title,
}: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const titleId = `${id}-title`;
  const descriptionId = description ? `${id}-description` : undefined;

  const restoreFocus = useCallback(() => {
    const previousFocus = previousFocusRef.current;

    if (previousFocus?.isConnected) {
      previousFocus.focus();
    }

    previousFocusRef.current = null;
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;

    if (!dialog) {
      return;
    }

    if (open) {
      if (!dialog.open) {
        previousFocusRef.current =
          document.activeElement instanceof HTMLElement
            ? document.activeElement
            : null;
        dialog.showModal();
      }

      return;
    }

    if (dialog.open) {
      dialog.close();
    }

    restoreFocus();
  }, [open, restoreFocus]);

  useEffect(
    () => () => {
      if (dialogRef.current?.open) {
        dialogRef.current.close();
      }

      restoreFocus();
    },
    [restoreFocus],
  );

  return (
    <dialog
      aria-describedby={descriptionId}
      aria-labelledby={titleId}
      aria-modal="true"
      className={classNames(styles.dialog, className)}
      id={id}
      onCancel={(event) => {
        event.preventDefault();
        onOpenChange(false);
      }}
      onClose={(event) => {
        if (event.currentTarget.open) {
          return;
        }

        restoreFocus();

        if (open) {
          onOpenChange(false);
        }
      }}
      ref={dialogRef}
    >
      <div className={styles.dialogHeader}>
        <h2 className={styles.dialogTitle} id={titleId}>
          {title}
        </h2>
        <Button
          aria-label={closeLabel}
          className={styles.dialogClose}
          onClick={() => onOpenChange(false)}
          type="button"
          variant="secondary"
        >
          <span aria-hidden="true">×</span>
        </Button>
      </div>
      {description ? (
        <p className={styles.dialogDescription} id={descriptionId}>
          {description}
        </p>
      ) : null}
      <div className={styles.dialogBody}>{children}</div>
    </dialog>
  );
}
