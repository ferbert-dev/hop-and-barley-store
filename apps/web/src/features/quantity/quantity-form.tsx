'use client';

import { useEffect, useId, useRef, useState } from 'react';

import { Button } from '../../components/ui/button';
import { Price } from '../../components/ui/price';
import {
  estimateLineTotalMinor,
  formatAmount,
  formatPackageNetWeight,
  formatWeightInput,
  parseWeightInput,
  type QuantityMetadata,
  validateOrderAmount,
} from './quantity-model';
import styles from './quantity.module.css';

type QuantityFormBaseProps = Readonly<{
  amount: number;
  ariaLabel?: string;
  busy?: boolean;
  currency: string;
  disabled?: boolean;
  onSubmit: (amount: number) => void | Promise<void>;
  priceMinor: number | null;
  metadata: QuantityMetadata;
}>;

type QuantityFormProps = QuantityFormBaseProps &
  (
    | Readonly<{ mode: 'auto'; submitLabel?: never }>
    | Readonly<{ mode?: 'submit'; submitLabel: string }>
  );

type QuantityEditorState = Readonly<{
  amount: number;
  error: string | null;
  input: string;
}>;

export function QuantityForm({
  amount,
  metadata,
  ...props
}: QuantityFormProps) {
  return <QuantityFormEditor {...props} amount={amount} metadata={metadata} />;
}

function QuantityFormEditor({
  amount,
  ariaLabel,
  busy = false,
  currency,
  disabled = false,
  metadata,
  mode = 'submit',
  onSubmit,
  priceMinor,
  submitLabel,
}: QuantityFormProps) {
  const formId = useId();
  const canonicalEditor: QuantityEditorState = {
    amount,
    error: null,
    input: formatInput(amount, metadata),
  };
  const [editor, setEditor] = useState(canonicalEditor);
  const lastAutoSubmittedAmount = useRef(amount);
  useEffect(() => {
    lastAutoSubmittedAmount.current = amount;
  }, [amount]);
  if (editor.amount !== amount) setEditor(canonicalEditor);

  const currentEditor = editor.amount === amount ? editor : canonicalEditor;
  const { error, input } = currentEditor;
  const isWeight = metadata.saleKind === 'WEIGHT';
  const parsedAmount = isWeight
    ? parseWeightInput(input)
    : parseCountInput(input);
  const validation =
    parsedAmount === null
      ? isWeight
        ? 'Enter a weight in kilograms.'
        : `Enter a whole number of ${metadata.saleKind === 'PACKAGE' ? 'packs' : 'kits'}.`
      : validateOrderAmount(parsedAmount, metadata);
  const selectedAmount = parsedAmount ?? amount;
  const estimatedPrice =
    validation === null && priceMinor !== null
      ? estimateLineTotalMinor(priceMinor, selectedAmount, metadata)
      : null;
  const inputId = `quantity-${formId}`;
  const errorId = `${inputId}-error`;

  const submitAmount = (nextAmount: number, nextValidation: string | null) => {
    setEditor((current) => ({ ...current, error: nextValidation }));
    if (nextValidation !== null) return;

    if (mode === 'auto') {
      if (lastAutoSubmittedAmount.current === nextAmount) return;
      lastAutoSubmittedAmount.current = nextAmount;
    }
    void onSubmit(nextAmount);
  };

  const commitInput = () => {
    if (validation === null && parsedAmount !== null) {
      submitAmount(parsedAmount, validation);
    } else {
      setEditor((current) => ({ ...current, error: validation }));
    }
  };

  const setPhysicalAmount = (nextAmount: number) => {
    const nextValidation = validateOrderAmount(nextAmount, metadata);
    setEditor({
      amount,
      error: nextValidation,
      input: formatInput(nextAmount, metadata),
    });
    if (mode === 'auto') submitAmount(nextAmount, nextValidation);
  };

  const stepAmount =
    metadata.saleKind === 'WEIGHT' ? 100_000 : metadata.orderStepAmount;
  const decrement = () => {
    const nextAmount = Math.max(
      metadata.minimumOrderAmount,
      selectedAmount - stepAmount,
    );
    setPhysicalAmount(nextAmount);
  };
  const increment = () => {
    const ceiling = metadata.maximumOrderAmount ?? metadata.stockAmount;
    const nextAmount = Math.min(ceiling, selectedAmount + stepAmount);
    setPhysicalAmount(nextAmount);
  };
  const canDecrement =
    !disabled && selectedAmount > metadata.minimumOrderAmount;
  const canIncrement =
    !disabled &&
    selectedAmount + stepAmount <=
      Math.min(metadata.maximumOrderAmount ?? Infinity, metadata.stockAmount);

  return (
    <form
      aria-label={ariaLabel}
      aria-busy={busy || undefined}
      className={styles.form}
      onSubmit={(event) => {
        event.preventDefault();
        commitInput();
      }}
    >
      <div className={styles.control}>
        <Button
          aria-label={`Decrease ${metadata.saleKind.toLowerCase()} amount`}
          disabled={!canDecrement}
          onClick={decrement}
          type="button"
          variant="secondary"
        >
          −
        </Button>
        <label className={styles.inputLabel} htmlFor={inputId}>
          <span>
            {isWeight
              ? 'Quantity'
              : metadata.saleKind === 'PACKAGE'
                ? 'Packs'
                : 'Kits'}
          </span>
          <input
            aria-describedby={error ? errorId : undefined}
            aria-invalid={error ? true : undefined}
            disabled={disabled}
            id={inputId}
            inputMode={isWeight ? 'decimal' : 'numeric'}
            min={
              isWeight
                ? formatWeightInput(metadata.minimumOrderAmount)
                : metadata.minimumOrderAmount
            }
            onChange={(event) => {
              setEditor({
                amount,
                error: null,
                input: event.target.value,
              });
            }}
            onBlur={() => {
              if (mode !== 'auto') return;
              commitInput();
            }}
            onKeyDown={(event) => {
              if (mode !== 'auto' || event.key !== 'Enter') return;
              event.preventDefault();
              commitInput();
            }}
            step={
              isWeight
                ? formatWeightInput(metadata.orderStepAmount)
                : metadata.orderStepAmount
            }
            value={input}
          />
        </label>
        {isWeight ? (
          <span className={styles.unitLabel} aria-hidden="true">
            kg
          </span>
        ) : null}
        <Button
          aria-label={`Increase ${metadata.saleKind.toLowerCase()} amount`}
          disabled={!canIncrement}
          onClick={increment}
          type="button"
          variant="secondary"
        >
          +
        </Button>
      </div>
      {mode === 'submit' ? (
        <>
          <p className={styles.selectedAmount} aria-live="polite">
            {formatAmount(selectedAmount, metadata)} selected
          </p>
          {formatPackageNetWeight(metadata) ? (
            <p className={styles.supportingText}>
              {formatPackageNetWeight(metadata)}
            </p>
          ) : null}
          {estimatedPrice !== null ? (
            <p className={styles.estimate}>
              Selection price{' '}
              <Price currency={currency} minorUnits={estimatedPrice} />
            </p>
          ) : null}
        </>
      ) : null}
      {error ? (
        <p className={styles.error} id={errorId} role="alert">
          {error}
        </p>
      ) : null}
      {mode === 'submit' ? (
        <Button disabled={disabled} type="submit">
          {submitLabel}
        </Button>
      ) : null}
    </form>
  );
}

function formatInput(amount: number, metadata: QuantityMetadata) {
  return metadata.saleKind === 'WEIGHT'
    ? formatWeightInput(amount)
    : String(amount);
}

function parseCountInput(input: string): number | null {
  return /^\d+$/u.test(input) && Number.isSafeInteger(Number(input))
    ? Number(input)
    : null;
}
