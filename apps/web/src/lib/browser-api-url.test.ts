import { describe, expect, it } from 'vitest';
import { resolveBrowserApiUrl } from './browser-api-url';

describe('resolveBrowserApiUrl', () => {
  it.each([
    ['http://localhost:3000', 'http://localhost:3001'],
    ['http://127.0.0.1:3000', 'http://127.0.0.1:3001'],
  ])('uses the current loopback hostname for %s', (origin, expected) => {
    expect(
      resolveBrowserApiUrl(
        'http://localhost:3001',
        origin,
        'localhost,127.0.0.1',
      ),
    ).toBe(expected);
  });

  it('does not rewrite a non-loopback API host', () => {
    expect(
      resolveBrowserApiUrl(
        'https://api.example.com',
        'https://shop.example.com',
        'localhost,127.0.0.1',
      ),
    ).toBe('https://api.example.com');
  });

  it('does not rewrite a hostname absent from the configured alias list', () => {
    expect(
      resolveBrowserApiUrl(
        'http://localhost:3001',
        'http://127.0.0.1:3000',
        'localhost',
      ),
    ).toBe('http://localhost:3001');
  });
});
