import { render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { expect, it, vi } from 'vitest';

import { StorefrontShell } from './storefront-shell';

vi.mock('server-only', () => ({}));
vi.mock('../../features/auth/read-current-session', () => ({
  readCurrentSession: vi.fn(async () => ({ kind: 'anonymous' })),
}));
vi.mock('./site-header-server', () => ({
  SiteHeaderServer: () => (
    <header aria-label="Hop and Barley storefront">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        alt="Hop and Barley logo"
        src="/assets/brand/hop-and-barley-mark.svg"
      />
      <nav aria-label="Storefront">Products</nav>
    </header>
  ),
}));
vi.mock('next/navigation', () => ({
  usePathname: () => '/',
}));

vi.mock('next/image', () => ({
  default: ({ alt, ...props }: ComponentProps<'img'>) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt} {...props} />
  ),
}));

it('provides one labelled storefront landmark structure around page content', () => {
  const { container } = render(
    <StorefrontShell>
      <h1>Page content</h1>
    </StorefrontShell>,
  );

  expect(
    screen.getByRole('link', { name: 'Skip to main content' }),
  ).toHaveAttribute('href', '#main-content');
  expect(
    screen.getByRole('banner', { name: 'Hop and Barley storefront' }),
  ).toBeInTheDocument();
  expect(screen.getByRole('navigation', { name: 'Storefront' })).toBeVisible();
  expect(screen.getByRole('main')).toHaveAttribute('id', 'main-content');
  expect(screen.getByRole('main')).toContainElement(
    screen.getByRole('heading', { name: 'Page content' }),
  );
  expect(
    screen.getByRole('contentinfo', { name: 'Store information' }),
  ).toBeVisible();
  expect(container.querySelectorAll('main')).toHaveLength(1);
  expect(
    screen.getByRole('img', { name: 'Hop and Barley logo' }),
  ).toHaveAttribute(
    'src',
    expect.stringContaining('/assets/brand/hop-and-barley-mark.svg'),
  );
  expect(
    screen.getByRole('img', { name: 'Hop and Barley hop illustration' }),
  ).toHaveAttribute(
    'src',
    expect.stringContaining('/assets/brand/footer-hops.svg'),
  );
});
