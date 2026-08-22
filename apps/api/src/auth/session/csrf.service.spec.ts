import { CsrfService } from './csrf.service';

const RAW_SESSION = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

describe('CsrfService', () => {
  const service = new CsrfService({
    get: (key: string) =>
      key === 'AUTH_CSRF_KEYRING'
        ? `v2:${'22'.repeat(32)},v1:${'11'.repeat(32)}`
        : undefined,
  } as never);

  it('issues a versioned session-bound HMAC with the active key', () => {
    const token = service.issue(RAW_SESSION);

    expect(token).toMatch(/^v2\.[A-Za-z0-9_-]{43}$/);
    expect(service.verify(token, RAW_SESSION)).toBe(true);
    expect(
      service.verify(token, 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB'),
    ).toBe(false);
  });

  it('accepts an overlap key while rejecting malformed and unknown versions', () => {
    const previous = new CsrfService({
      get: () => `v1:${'11'.repeat(32)}`,
    } as never).issue(RAW_SESSION);

    expect(service.verify(previous, RAW_SESSION)).toBe(true);
    expect(service.verify(`v0.${'A'.repeat(43)}`, RAW_SESSION)).toBe(false);
    expect(service.verify(`v2.${'A'.repeat(42)}`, RAW_SESSION)).toBe(false);
    expect(service.verify(`v2.${'A'.repeat(43)}=`, RAW_SESSION)).toBe(false);
  });
});
