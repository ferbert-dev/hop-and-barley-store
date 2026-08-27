import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { QuantityForm } from './quantity-form';

const metadata = {
  amountUnit: 'MILLIGRAM' as const,
  kitYieldVolumeMl: null,
  maximumOrderAmount: 100_000_000,
  minimumOrderAmount: 100_000,
  orderStepAmount: 100_000,
  packageNetWeightMg: null,
  priceBasisAmount: 100_000,
  saleKind: 'WEIGHT' as const,
  stockAmount: 100_000_000,
};

describe('QuantityForm', () => {
  it('uses one kilogram input and submits a 100g-aligned amount as milligrams', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <QuantityForm
        amount={100_000}
        currency="USD"
        metadata={metadata}
        onSubmit={onSubmit}
        priceMinor={599}
        submitLabel="Add to Cart"
      />,
    );

    const input = screen.getByLabelText('Quantity');
    expect(input).toHaveValue('0.1');
    expect(screen.queryByRole('combobox')).toBeNull();
    await user.clear(input);
    await user.type(input, '0.9');
    expect(screen.getByText('900g selected')).toBeVisible();
    expect(screen.getByText('Selection price')).toHaveTextContent('US$53.91');
    await user.click(screen.getByRole('button', { name: 'Add to Cart' }));
    expect(onSubmit).toHaveBeenCalledWith(900_000);
  });

  it('uses 100g +/- steps and exposes invalid increments as an accessible error', async () => {
    const user = userEvent.setup();
    render(
      <QuantityForm
        amount={100_000}
        currency="USD"
        metadata={metadata}
        onSubmit={vi.fn()}
        priceMinor={599}
        submitLabel="Update cart"
      />,
    );

    await user.click(
      screen.getByRole('button', { name: 'Increase weight amount' }),
    );
    expect(screen.getByText('200g selected')).toBeVisible();
    await user.clear(screen.getByLabelText('Quantity'));
    await user.type(screen.getByLabelText('Quantity'), '0.15');
    await user.click(screen.getByRole('button', { name: 'Update cart' }));
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Choose increments of 100g.',
    );
  });

  it('uses distinct input IDs when multiple weight controls render together', () => {
    render(
      <>
        <QuantityForm
          amount={100_000}
          currency="USD"
          metadata={metadata}
          onSubmit={vi.fn()}
          priceMinor={599}
          submitLabel="Add first"
        />
        <QuantityForm
          amount={100_000}
          currency="USD"
          metadata={metadata}
          onSubmit={vi.fn()}
          priceMinor={599}
          submitLabel="Add second"
        />
      </>,
    );

    const inputs = screen.getAllByLabelText('Quantity');
    expect(inputs[0]?.id).not.toBe(inputs[1]?.id);
  });

  it('replaces an edited value when the canonical server amount changes', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <QuantityForm
        amount={100_000}
        currency="USD"
        metadata={metadata}
        onSubmit={vi.fn()}
        priceMinor={599}
        submitLabel="Update cart"
      />,
    );
    const input = screen.getByLabelText('Quantity');
    await user.clear(input);
    await user.type(input, '0.9');
    rerender(
      <QuantityForm
        amount={200_000}
        currency="USD"
        metadata={metadata}
        onSubmit={vi.fn()}
        priceMinor={599}
        submitLabel="Update cart"
      />,
    );

    expect(screen.getByLabelText('Quantity')).toHaveValue('0.2');
    expect(screen.getByText('200g selected')).toBeVisible();
  });

  it('auto-commits step buttons and valid direct entry without redundant summary UI', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <QuantityForm
        amount={100_000}
        ariaLabel="Citra Hops quantity"
        currency="USD"
        metadata={metadata}
        mode="auto"
        onSubmit={onSubmit}
        priceMinor={599}
      />,
    );

    const increase = screen.getByRole('button', {
      name: 'Increase weight amount',
    });
    await user.click(increase);
    expect(onSubmit).toHaveBeenLastCalledWith(200_000);
    expect(screen.getByRole('button', { name: 'Increase weight amount' })).toBe(
      increase,
    );

    const input = screen.getByLabelText('Quantity');
    await user.clear(input);
    await user.type(input, '0.9');
    await user.keyboard('{Enter}');
    expect(onSubmit).toHaveBeenLastCalledWith(900_000);
    expect(onSubmit).toHaveBeenCalledTimes(2);

    await user.clear(input);
    await user.type(input, '1.1');
    await user.tab();
    expect(onSubmit).toHaveBeenLastCalledWith(1_100_000);
    expect(onSubmit).toHaveBeenCalledTimes(3);
    expect(screen.queryByText(/selected$/i)).not.toBeInTheDocument();
    expect(screen.queryByText('Selection price')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /update/i }),
    ).not.toBeInTheDocument();
  });

  it('allows an automatic amount to be retried after the canonical value rolls back', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const renderForm = (amount: number) => (
      <QuantityForm
        amount={amount}
        ariaLabel="Citra Hops quantity"
        currency="USD"
        metadata={metadata}
        mode="auto"
        onSubmit={onSubmit}
        priceMinor={599}
      />
    );
    const { rerender } = render(renderForm(100_000));

    await user.click(
      screen.getByRole('button', { name: 'Increase weight amount' }),
    );
    expect(onSubmit).toHaveBeenLastCalledWith(200_000);

    rerender(renderForm(200_000));
    rerender(renderForm(100_000));
    await user.click(
      screen.getByRole('button', { name: 'Increase weight amount' }),
    );

    expect(onSubmit).toHaveBeenCalledTimes(2);
    expect(onSubmit).toHaveBeenLastCalledWith(200_000);
  });
});
