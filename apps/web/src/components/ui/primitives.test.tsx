import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  LoadingState,
  Price,
  ProductCard,
  Select,
  type FieldProps,
  type SelectProps,
} from './index';
import { designTokenCssVariables } from '../../design-system/tokens';

afterEach(cleanup);

type Assert<T extends true> = T;
type FieldOmitsChildren = Assert<
  'children' extends keyof FieldProps ? false : true
>;
type FieldOmitsRawHtml = Assert<
  'dangerouslySetInnerHTML' extends keyof FieldProps ? false : true
>;
type SelectKeepsChildren = Assert<
  'children' extends keyof SelectProps ? true : false
>;

const fieldTypeContract: [
  FieldOmitsChildren,
  FieldOmitsRawHtml,
  SelectKeepsChildren,
] = [true, true, true];

describe('Button', () => {
  it('preserves native button and link semantics', () => {
    const { rerender } = render(<Button type="submit">Add to cart</Button>);

    expect(screen.getByRole('button', { name: 'Add to cart' })).toHaveAttribute(
      'type',
      'submit',
    );

    rerender(<Button href="/checkout">Review order</Button>);

    expect(screen.getByRole('link', { name: 'Review order' })).toHaveAttribute(
      'href',
      '/checkout',
    );
  });

  it('makes a pending native button unavailable and announces its state', () => {
    render(
      <Button pending pendingLabel="Saving order">
        Save order
      </Button>,
    );

    expect(screen.getByRole('button', { name: 'Saving order' })).toBeDisabled();
    expect(screen.getByRole('button')).toHaveAttribute('aria-busy', 'true');
  });

  it('forwards the native disabled state', () => {
    render(<Button disabled>Save</Button>);

    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });
});

describe('Field and Select', () => {
  it('keeps void input content out of the public type contract', () => {
    expect(fieldTypeContract).toEqual([true, true, true]);
  });

  it('drops unsafe void input content from untyped runtime callers', () => {
    const unsafeProps = {
      children: 'Unsafe child',
      dangerouslySetInnerHTML: { __html: '<span>Unsafe HTML</span>' },
      id: 'runtime-safe',
      label: 'Runtime safe',
    } as unknown as FieldProps;

    render(<Field {...unsafeProps} />);

    expect(screen.getByLabelText('Runtime safe')).toBeEmptyDOMElement();
    expect(screen.queryByText('Unsafe child')).not.toBeInTheDocument();
    expect(screen.queryByText('Unsafe HTML')).not.toBeInTheDocument();
  });

  it('connects a visible input label, description and error', () => {
    render(
      <Field
        description="Use the address for order updates."
        error="Enter a valid email address."
        id="email"
        label="Email address"
        type="email"
      />,
    );

    const input = screen.getByLabelText('Email address');
    expect(input).toHaveAccessibleDescription(
      'Use the address for order updates. Enter a valid email address.',
    );
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAttribute('aria-errormessage', 'email-error');
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Enter a valid email address.',
    );
  });

  it('connects a visible select label and description without a false error', () => {
    render(
      <Select
        description="Choose the package used for this order."
        id="package"
        label="Package"
      >
        <option value="pouch">Pouch</option>
      </Select>,
    );

    const select = screen.getByLabelText('Package');
    expect(select).toHaveAccessibleDescription(
      'Choose the package used for this order.',
    );
    expect(select).not.toHaveAttribute('aria-invalid', 'true');
  });

  it('connects a select error through the same fail-closed contract', () => {
    render(
      <Select error="Choose a package." id="invalid-package" label="Package">
        <option value="">Choose one</option>
      </Select>,
    );

    const select = screen.getByLabelText('Package');
    expect(select).toHaveAttribute('aria-invalid', 'true');
    expect(select).toHaveAttribute(
      'aria-errormessage',
      'invalid-package-error',
    );
    expect(select).toHaveAccessibleDescription('Choose a package.');
  });
});

describe('content surfaces', () => {
  it('renders a generic card and a data-free linked product surface', () => {
    render(
      <>
        <Card>Order summary</Card>
        <ProductCard
          badge={<Badge tone="success">In stock</Badge>}
          description="Bright citrus aroma"
          href="/product/citra-hops"
          media={<div aria-label="Citra hops pouch" role="img" />}
          name="Citra Hops"
          price={<Price currency="EUR" minorUnits={599} />}
        />
      </>,
    );

    expect(screen.getByText('Order summary')).toBeInTheDocument();
    expect(screen.getByRole('article')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Citra Hops' })).toHaveAttribute(
      'href',
      '/product/citra-hops',
    );
    expect(
      screen.getByRole('link', { name: 'View Citra Hops details' }),
    ).toHaveAttribute('href', '/product/citra-hops');
    expect(screen.getByText('€5.99')).toBeInTheDocument();
  });
});

describe('status patterns', () => {
  it('uses polite status semantics for loading and empty states', () => {
    const { rerender } = render(<LoadingState title="Loading products" />);

    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true');

    rerender(
      <EmptyState title="No products found">
        Try changing the filters.
      </EmptyState>,
    );

    expect(screen.getByRole('status')).not.toHaveAttribute('aria-busy');
    expect(screen.getByRole('status')).toHaveTextContent(
      'No products foundTry changing the filters.',
    );
  });

  it('uses an assertive alert for errors', () => {
    render(
      <ErrorState title="Products unavailable">Try again later.</ErrorState>,
    );

    expect(screen.getByRole('alert')).toHaveAttribute('aria-live', 'assertive');
  });
});

describe('Q1 visual contracts', () => {
  it('pins pointer target, focus and reduced-motion rules in primitive CSS', () => {
    const css = readFileSync(
      resolve(process.cwd(), 'src/components/ui/primitives.module.css'),
      'utf8',
    );

    expect(css).toMatch(/min-block-size:\s*2\.75rem/);
    expect(css).toMatch(/outline:\s*3px solid/);
    expect(css).toMatch(
      /\.productLink\s*{[\s\S]*?min-block-size:\s*2\.75rem[\s\S]*?min-inline-size:\s*2\.75rem[\s\S]*?}/,
    );
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
  });

  it('resolves every primitive token and derives the backdrop from D1', () => {
    const css = readFileSync(
      resolve(process.cwd(), 'src/components/ui/primitives.module.css'),
      'utf8',
    );
    const usedTokens = [...css.matchAll(/var\((--hb-[a-z0-9-]+)\)/g)].map(
      (match) => match[1],
    );
    const unknownTokens = [...new Set(usedTokens)].filter(
      (token) =>
        !designTokenCssVariables.includes(
          token as (typeof designTokenCssVariables)[number],
        ),
    );
    const backdrop = css.match(/\.dialog::backdrop\s*{([^}]*)}/)?.[1];

    expect(unknownTokens).toEqual([]);
    expect(backdrop).toContain('var(--hb-color-ink)');
    expect(backdrop).not.toMatch(/#[0-9a-f]{3,8}\b|\brgb\(/i);
  });
});
