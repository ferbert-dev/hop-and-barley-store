import { ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { originIsAllowed } from '../config/origin-list';

@Injectable()
export class AuthOriginService {
  constructor(private readonly config: ConfigService) {}

  assertExact(origin: string | undefined): void {
    if (
      !originIsAllowed(this.config.getOrThrow<string>('AUTH_ORIGIN'), origin)
    ) {
      throw new ForbiddenException({ status: 'forbidden' });
    }
  }
}
