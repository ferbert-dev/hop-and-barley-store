'use client';

import { useId, useState } from 'react';

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

type QuantityFormProps = Readonly<{
  amount: number;
  currency: string;
  disabled?: boolean;
  onSubmit: (amount: number) => void | Promise<void>;
  priceMinor: number | null;
  submitLabel: string;
  metadata: QuantityMetadata;
}>;

export function QuantityForm({
  amount,
  metadata,
  ...props
}: QuantityFormProps) {
  return (
    <QuantityFormEditor
      {...props}
      amount={amount}
      key={`${metadata.saleKind}:${String(amount)}`}
      metadata={metadata}
    />
  );
}

function QuantityFormEditor({
  amount,
  currency,
  disabled = false,
  metadata,
  onSubmit,
  priceMinor,
  submitLabel,
}: QuantityFormProps) {
  const formId = useId();
  const [input, setInput] = useState(() => formatInput(amount, metadata));
  const [error, setError] = useState<string | null>(null);
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

  const setPhysicalAmount = (nextAmount: number) => {
    setInput(formatInput(nextAmount, metadata));
    setError(validateOrderAmount(nextAmount, metadata));
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
      className={styles.form}
      onSubmit={(event) => {
        event.preventDefault();
        setError(validation);
        if (validation === null && parsedAmount !== null) {
          void onSubmit(parsedAmount);
        }
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
              setInput(event.target.value);
              setError(null);
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
      {error ? (
        <p className={styles.error} id={errorId} role="alert">
          {error}
        </p>
      ) : null}
      <Button disabled={disabled} type="submit">
        {submitLabel}
      </Button>
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
