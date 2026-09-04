import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const storefrontDirectory = join(
  process.cwd(),
  'src',
  'components',
  'storefront',
);

function readStorefrontFile(filename: string) {
  return readFileSync(join(storefrontDirectory, filename), 'utf8');
}

describe('storefront shell architecture', () => {
  it('keeps only the pathname-aware header in the client bundle', () => {
    expect(readStorefrontFile('site-header.tsx')).toMatch(/^'use client';/);
    expect(readStorefrontFile('site-footer.tsx')).not.toContain("'use client'");
    expect(readStorefrontFile('storefront-shell.tsx')).not.toContain(
      "'use client'",
    );
  });

  it('pins the collision-safe disclosure boundary and target-size gate', () => {
    const css = readFileSync(
      join(process.cwd(), 'src/app/globals.css'),
      'utf8',
    );

    expect(css).toContain('@media (max-width: 63.999rem)');
    expect(css).toContain('@media (min-width: 80rem)');
    expect(css).toMatch(/\.brand\s*{[\s\S]*?min-block-size:\s*44px;/);
    expect(css).toMatch(/\.menu-trigger\s*{[\s\S]*?min-block-size:\s*44px;/);
    expect(css).toMatch(/\.menu-trigger\s*{[\s\S]*?min-inline-size:\s*44px;/);
  });

  it('keeps the route page free of duplicate shell landmarks', () => {
    const page = readFileSync(
      join(process.cwd(), 'src/app/(catalog)/page.tsx'),
      'utf8',
    );
    const transport = readFileSync(
      join(process.cwd(), 'src/lib/catalog.ts'),
      'utf8',
    );

    expect(page).not.toMatch(/<(?:main|header|footer)\b/);
    expect(page).not.toContain('fetch(');
    expect(page).toContain('loadCatalog');
    expect(page).not.toContain("export const dynamic = 'force-dynamic'");
    expect(transport).toContain("from '@hop-and-barley/api-client'");
    expect(transport).toContain('requestInitExt');
    expect(transport).toContain('revalidate: 60');
    expect(transport).toContain('AbortSignal.timeout');
    expect(transport).not.toContain("cache: 'no-store'");
    expect(transport).not.toContain(' as Product');
    expect(page).toContain('CatalogScreen');
  });

  it('keeps clean-order and Docker builds independent from warm dist output', () => {
    const repositoryRoot = join(process.cwd(), '..', '..');
    const dockerIgnore = readFileSync(
      join(repositoryRoot, '.dockerignore'),
      'utf8',
    );
    const dockerfile = readFileSync(join(process.cwd(), 'Dockerfile'), 'utf8');
    const clientPackage = JSON.parse(
      readFileSync(
        join(repositoryRoot, 'packages/api-client/package.json'),
        'utf8',
      ),
    ) as { exports: { '.': { default: string; types: string } } };
    const turbo = JSON.parse(
      readFileSync(join(repositoryRoot, 'turbo.json'), 'utf8'),
    ) as { tasks: { dev: { dependsOn: string[] } } };

    expect(dockerIgnore).toContain('**/dist');
    expect(clientPackage.exports['.']).toEqual({
      default: './dist/index.js',
      types: './src/index.ts',
    });
    expect(turbo.tasks.dev.dependsOn).toContain('^build');
    expect(dockerfile).toMatch(
      /--filter @hop-and-barley\/auth-contract build && \\\s+pnpm --filter @hop-and-barley\/api-client build && \\\s+pnpm --filter @hop-and-barley\/web build/,
    );
  });
});
