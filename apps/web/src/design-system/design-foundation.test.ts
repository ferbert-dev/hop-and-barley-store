import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { assetManifest } from './assets';
import { breakpoints, designTokenCssVariables } from './tokens';

const publicRoot = resolve(process.cwd(), 'public');
const tokenCssPath = resolve(process.cwd(), 'src/styles/design-tokens.css');
const globalCssPath = resolve(process.cwd(), 'src/app/globals.css');
const checksumPath = resolve(
  process.cwd(),
  'src/design-system/assets.sha256.json',
);

const typographyCssVariables = [
  '--hb-font-size-xs',
  '--hb-font-size-sm',
  '--hb-font-size-base',
  '--hb-font-size-lg',
  '--hb-font-size-xl',
  '--hb-font-size-display',
  '--hb-line-height-tight',
  '--hb-line-height-normal',
  '--hb-line-height-relaxed',
] as const;

function readWebpDimensions(buffer: Buffer): { height: number; width: number } {
  expect(buffer.toString('ascii', 0, 4)).toBe('RIFF');
  expect(buffer.toString('ascii', 8, 12)).toBe('WEBP');

  let offset = 12;

  while (offset + 8 <= buffer.length) {
    const chunk = buffer.toString('ascii', offset, offset + 4);
    const length = buffer.readUInt32LE(offset + 4);
    const dataOffset = offset + 8;

    if (chunk === 'VP8X') {
      return {
        height: buffer.readUIntLE(dataOffset + 7, 3) + 1,
        width: buffer.readUIntLE(dataOffset + 4, 3) + 1,
      };
    }

    if (chunk === 'VP8 ') {
      return {
        height: buffer.readUInt16LE(dataOffset + 8) & 0x3fff,
        width: buffer.readUInt16LE(dataOffset + 6) & 0x3fff,
      };
    }

    if (chunk === 'VP8L') {
      const first = buffer[dataOffset + 1] ?? 0;
      const second = buffer[dataOffset + 2] ?? 0;
      const third = buffer[dataOffset + 3] ?? 0;
      const fourth = buffer[dataOffset + 4] ?? 0;

      return {
        height: 1 + ((fourth & 0x0f) << 10) + (third << 2) + (second >> 6),
        width: 1 + ((second & 0x3f) << 8) + first,
      };
    }

    offset = dataOffset + length + (length % 2);
  }

  throw new Error('Unsupported WebP container');
}

function readSvgDimensions(buffer: Buffer): { height: number; width: number } {
  const svg = buffer.toString('utf8').match(/<svg\b[\s\S]*?>/)?.[0];

  if (!svg) {
    throw new Error('Missing SVG root element');
  }

  const width = svg.match(/\bwidth="([\d.]+)"/)?.[1];
  const height = svg.match(/\bheight="([\d.]+)"/)?.[1];

  if (width && height) {
    return {
      height: Math.round(Number(height)),
      width: Math.round(Number(width)),
    };
  }

  const viewBox = svg.match(/\bviewBox="([\d.\s-]+)"/)?.[1];
  const values = viewBox?.trim().split(/\s+/).map(Number);

  if (!values || values.length !== 4) {
    throw new Error('Missing SVG dimensions');
  }

  return {
    height: Math.round(values[3] ?? 0),
    width: Math.round(values[2] ?? 0),
  };
}

describe('design foundation', () => {
  it('ships a unique, valid and accessible production asset manifest', () => {
    const paths = new Set<string>();

    for (const asset of assetManifest) {
      expect(asset.src).toMatch(
        /^\/assets\/(avatars|backgrounds|brand|icons|products)\/[a-z0-9-]+\.(svg|webp)$/,
      );
      expect(paths.has(asset.src)).toBe(false);
      paths.add(asset.src);

      expect(asset.width).toBeGreaterThan(0);
      expect(asset.height).toBeGreaterThan(0);
      expect(asset.sizes.length).toBeGreaterThan(0);

      if (asset.role === 'decorative') {
        expect(asset.alt).toBe('');
      } else {
        expect(asset.alt.trim().length).toBeGreaterThan(0);
      }

      const absolutePath = resolve(publicRoot, asset.src.slice(1));
      expect(existsSync(absolutePath)).toBe(true);
      expect(statSync(absolutePath).size).toBeGreaterThan(0);

      const buffer = readFileSync(absolutePath);
      const dimensions = asset.src.endsWith('.webp')
        ? readWebpDimensions(buffer)
        : readSvgDimensions(buffer);

      expect(dimensions).toEqual({ height: asset.height, width: asset.width });

      if (asset.src.endsWith('.svg')) {
        const svg = buffer.toString('utf8');

        expect(svg).not.toMatch(/<script\b|javascript:|\bon[a-z]+\s*=/i);
        expect(svg).not.toMatch(
          /\b(?:href|xlink:href)=["'](?:https?:|\/\/|data:)/i,
        );
      }
    }
  });

  it('pins the checksum of every production asset', () => {
    const checksums = JSON.parse(readFileSync(checksumPath, 'utf8')) as Record<
      string,
      string
    >;
    const manifestPaths = assetManifest.map(({ src }) => src).sort();

    expect(Object.keys(checksums).sort()).toEqual(manifestPaths);

    for (const asset of assetManifest) {
      const buffer = readFileSync(resolve(publicRoot, asset.src.slice(1)));
      const actual = createHash('sha256').update(buffer).digest('hex');

      expect(checksums[asset.src]).toBe(actual);
    }
  });

  it('keeps CSS and TypeScript breakpoint contracts aligned', () => {
    const css = readFileSync(tokenCssPath, 'utf8');

    for (const variable of designTokenCssVariables) {
      expect(css).toContain(`${variable}:`);
    }

    expect(css).toContain(
      `--hb-breakpoint-compact: ${breakpoints.compact / 16}rem`,
    );
    expect(css).toContain(
      `--hb-breakpoint-medium: ${breakpoints.medium / 16}rem`,
    );
    expect(css).toContain(`--hb-breakpoint-wide: ${breakpoints.wide / 16}rem`);
    expect(css).toContain(
      `--hb-breakpoint-canvas: ${breakpoints.canvas / 16}rem`,
    );
  });

  it('keeps the complete typography contract typed and in CSS', () => {
    const css = readFileSync(tokenCssPath, 'utf8');

    for (const variable of typographyCssVariables) {
      expect(designTokenCssVariables).toContain(variable);
      expect(css).toContain(`${variable}:`);
    }
  });

  it('disables smooth scrolling when reduced motion is requested', () => {
    const css = readFileSync(tokenCssPath, 'utf8');

    expect(css).toMatch(/html\s*{\s*scroll-behavior: smooth;/);
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\)\s*{[\s\S]*?html\s*{\s*scroll-behavior: auto;/,
    );
  });

  it('keeps hero-bound header movement on the compositor', () => {
    const css = readFileSync(globalCssPath, 'utf8');

    expect(css).toMatch(
      /\.site-header\[data-scroll-mode='hero-bound'\]\s*{[\s\S]*?transform:\s*translate3d\(0, var\(--site-header-exit-offset, 0\), 0\);/,
    );
    expect(css).toMatch(
      /\.site-header\[data-scroll-mode='hero-bound'\]\s*{[\s\S]*?will-change:\s*transform;/,
    );
  });

  it('does not introduce runtime font or icon CDNs', () => {
    const sources = [
      tokenCssPath,
      globalCssPath,
      resolve(process.cwd(), 'src/app/layout.tsx'),
      resolve(process.cwd(), 'src/design-system/assets.ts'),
    ]
      .map((file) => readFileSync(file, 'utf8'))
      .join('\n');

    expect(sources).not.toMatch(
      /fonts\.googleapis\.com|fonts\.gstatic\.com|cdnjs\.cloudflare\.com|font[ -]?awesome/i,
    );
  });
});
