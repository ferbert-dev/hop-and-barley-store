import { ConfigService } from '@nestjs/config';
import { CartCsrfService } from './cart-csrf.service';

describe('CartCsrfService', () => {
  const service = new CartCsrfService(
    new ConfigService({ CART_CSRF_KEYRING: `v2:${'22'.repeat(32)}` }),
  );

  it('issues a cart-bound HMAC and rejects cross-cart reuse', () => {
    const first = 'A'.repeat(43);
    const second = 'B'.repeat(43);
    const token = service.issue(first);

    expect(token).toMatch(/^v2\.[A-Za-z0-9_-]{43}$/);
    expect(service.verify(token, first)).toBe(true);
    expect(service.verify(token, second)).toBe(false);
    expect(service.verify('malformed', first)).toBe(false);
  });
});
