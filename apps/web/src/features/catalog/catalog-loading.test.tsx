import { render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';

import CatalogLoading from '../../app/(catalog)/loading';

vi.mock('next/image', () => ({
  default: ({ alt, ...props }: ComponentProps<'img'>) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt} {...props} />
  ),
}));

describe('catalog route loading UI', () => {
  it('keeps the hero shape and announces initial loading once', () => {
    render(<CatalogLoading />);

    expect(
      screen.getByRole('img', { name: 'Close-up hop cones and green leaves' }),
    ).toHaveAttribute('quality', '60');
    expect(screen.getByRole('region', { name: 'Catalog' })).toHaveAttribute(
      'aria-busy',
      'true',
    );
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(screen.getByRole('status')).toHaveTextContent('Loading products');
    expect(screen.getAllByTestId('catalog-product-skeleton')).toHaveLength(8);
  });
});
