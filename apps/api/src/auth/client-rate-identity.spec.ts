import { clientRateIdentity } from './client-rate-identity';
import { LoginRateLimiter } from './login-rate-limiter';
import { RegistrationRateLimiter } from './registration-rate-limiter';

describe('clientRateIdentity', () => {
  it('isolates observed sockets and ignores spoofed forwarding headers', () => {
    const clientA = {
      headers: { 'x-forwarded-for': '198.51.100.1' },
      socket: { remoteAddress: '203.0.113.10' },
    };
    const clientB = {
      headers: { 'x-forwarded-for': '203.0.113.10' },
      socket: { remoteAddress: '203.0.113.11' },
    };
    expect(clientRateIdentity(clientA)).toBe('203.0.113.10');
    expect(clientRateIdentity(clientB)).toBe('203.0.113.11');
  });

  it('keeps a second observed client usable after the first exhausts each IP bucket', () => {
    const firstClient = { socket: { remoteAddress: '203.0.113.10' } };
    const secondClient = { socket: { remoteAddress: '203.0.113.11' } };
    const firstIdentity = clientRateIdentity(firstClient);
    const secondIdentity = clientRateIdentity(secondClient);
    const registration = new RegistrationRateLimiter();
    const login = new LoginRateLimiter();

    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect(registration.consume(firstIdentity, attempt)).toBe(true);
    }
    expect(registration.consume(firstIdentity, 5)).toBe(false);
    expect(registration.consume(secondIdentity, 5)).toBe(true);

    for (let attempt = 0; attempt < 10; attempt += 1) {
      expect(login.consumeIp(firstIdentity, attempt)).toBe(true);
    }
    expect(login.consumeIp(firstIdentity, 10)).toBe(false);
    expect(login.consumeIp(secondIdentity, 10)).toBe(true);
  });
});
