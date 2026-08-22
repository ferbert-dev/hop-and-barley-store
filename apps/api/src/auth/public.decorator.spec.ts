import { IS_PUBLIC_KEY, Public } from './public.decorator';

describe('@Public', () => {
  it('marks only explicitly reviewed handlers as public metadata', () => {
    class Example {
      @Public()
      publicHandler() {}

      protectedHandler() {}
    }

    const publicHandler = Object.getOwnPropertyDescriptor(
      Example.prototype,
      'publicHandler',
    )?.value as object;
    const protectedHandler = Object.getOwnPropertyDescriptor(
      Example.prototype,
      'protectedHandler',
    )?.value as object;

    expect(Reflect.getMetadata(IS_PUBLIC_KEY, publicHandler)).toBe(true);
    expect(
      Reflect.getMetadata(IS_PUBLIC_KEY, protectedHandler),
    ).toBeUndefined();
  });
});
