import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
} from 'react';

import { classNames } from './class-names';
import styles from './primitives.module.css';

interface ControlLabelProps {
  description?: ReactNode;
  error?: ReactNode;
  id: string;
  label: ReactNode;
}

export type FieldProps = ControlLabelProps &
  Omit<
    InputHTMLAttributes<HTMLInputElement>,
    'children' | 'dangerouslySetInnerHTML' | 'id'
  >;

export type SelectProps = ControlLabelProps &
  Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id'>;

function getDescriptionIds(
  id: string,
  description: ReactNode,
  error: ReactNode,
  providedId: string | undefined,
) {
  return (
    [
      providedId,
      description ? `${id}-description` : undefined,
      error ? `${id}-error` : undefined,
    ]
      .filter(Boolean)
      .join(' ') || undefined
  );
}

function ControlMessages({
  description,
  error,
  id,
}: Pick<ControlLabelProps, 'description' | 'error' | 'id'>) {
  return (
    <>
      {description ? (
        <p className={styles.fieldDescription} id={`${id}-description`}>
          {description}
        </p>
      ) : null}
      {error ? (
        <p className={styles.fieldError} id={`${id}-error`} role="alert">
          {error}
        </p>
      ) : null}
    </>
  );
}

function withoutVoidElementContent(
  props: Omit<
    InputHTMLAttributes<HTMLInputElement>,
    'children' | 'dangerouslySetInnerHTML' | 'id'
  >,
) {
  const safeProps = { ...props } as InputHTMLAttributes<HTMLInputElement>;

  delete safeProps.children;
  delete safeProps.dangerouslySetInnerHTML;

  return safeProps;
}

export function Field({
  'aria-describedby': providedDescriptionId,
  'aria-invalid': providedInvalid,
  className,
  description,
  error,
  id,
  label,
  ...inputProps
}: FieldProps) {
  const hasError = Boolean(error);
  const safeInputProps = withoutVoidElementContent(inputProps);

  return (
    <div className={styles.field}>
      <label className={styles.fieldLabel} htmlFor={id}>
        {label}
      </label>
      <input
        {...safeInputProps}
        aria-describedby={getDescriptionIds(
          id,
          description,
          error,
          providedDescriptionId,
        )}
        aria-errormessage={hasError ? `${id}-error` : undefined}
        aria-invalid={hasError || providedInvalid || undefined}
        className={classNames(styles.control, className)}
        id={id}
      />
      <ControlMessages description={description} error={error} id={id} />
    </div>
  );
}

export function Select({
  'aria-describedby': providedDescriptionId,
  'aria-invalid': providedInvalid,
  children,
  className,
  description,
  error,
  id,
  label,
  ...selectProps
}: SelectProps) {
  const hasError = Boolean(error);

  return (
    <div className={styles.field}>
      <label className={styles.fieldLabel} htmlFor={id}>
        {label}
      </label>
      <select
        {...selectProps}
        aria-describedby={getDescriptionIds(
          id,
          description,
          error,
          providedDescriptionId,
        )}
        aria-errormessage={hasError ? `${id}-error` : undefined}
        aria-invalid={hasError || providedInvalid || undefined}
        className={classNames(styles.control, styles.select, className)}
        id={id}
      >
        {children}
      </select>
      <ControlMessages description={description} error={error} id={id} />
    </div>
  );
}
