import { setAuthPrivateHeaders } from './auth-private-headers';

describe('setAuthPrivateHeaders', () => {
  it('makes every auth/private success or error non-cacheable and origin/cookie variant', () => {
    const response = { setHeader: jest.fn() };

    setAuthPrivateHeaders(response as never);

    expect(response.setHeader).toHaveBeenCalledWith(
      'Cache-Control',
      'private, no-store',
    );
    expect(response.setHeader).toHaveBeenCalledWith('Vary', 'Cookie, Origin');
  });
});
