import { ADMIN_ONLY_KEY } from './admin-authorization.guard';
import { AdminOnly } from './admin-only.decorator';

describe('@AdminOnly', () => {
  it('marks a controller as explicitly administrator-only', () => {
    @AdminOnly()
    class ExampleAdminController {}

    expect(Reflect.getMetadata(ADMIN_ONLY_KEY, ExampleAdminController)).toBe(
      true,
    );
  });
});
