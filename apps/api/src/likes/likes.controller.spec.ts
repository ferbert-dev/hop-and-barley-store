import { validate } from 'class-validator';
import { CreatePurchaseLikeDto } from './dto/create-purchase-like.dto';
import { LikesController } from './likes.controller';
import { LikesService } from './likes.service';

jest.mock('../database/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

describe('LikesController', () => {
  let controller: LikesController;
  const count = jest.fn();
  const create = jest.fn();

  beforeEach(() => {
    controller = new LikesController(
      { count, create } as unknown as LikesService,
      { getOrThrow: jest.fn().mockReturnValue('local-http') } as never,
    );
    jest.clearAllMocks();
    count.mockResolvedValue({ count: 137 });
    create.mockResolvedValue({ count: 138, liked: true });
  });

  it('serves the public aggregate', async () => {
    await expect(controller.count()).resolves.toEqual({ count: 137 });
    expect(count).toHaveBeenCalledWith();
  });

  it('accepts a UUID DTO and creates through the API controller', async () => {
    const dto = new CreatePurchaseLikeDto();
    dto.paymentAttemptId = '11111111-1111-4111-8111-111111111111';
    expect(await validate(dto)).toEqual([]);

    const request = {
      activeCart: {
        cartId: 'cart-id',
        kind: 'account' as const,
        rawToken: 'session',
        userId: 'user-id',
      },
      get: jest.fn().mockReturnValue(undefined),
    };
    const response = { setHeader: jest.fn() };
    await expect(
      controller.create(dto, request as never, response as never),
    ).resolves.toEqual({ count: 138, liked: true });
    expect(create).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111',
      request.activeCart,
      null,
    );

    const invalid = new CreatePurchaseLikeDto();
    invalid.paymentAttemptId = 'not-a-uuid';
    expect(await validate(invalid)).toHaveLength(1);
    expect(create).toHaveBeenCalledTimes(1);
  });
});
