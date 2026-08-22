import { ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AuthOriginService {
  constructor(private readonly config: ConfigService) {}

  assertExact(origin: string | undefined): void {
    if (origin !== this.config.get<string>('AUTH_ORIGIN')) {
      throw new ForbiddenException({ status: 'forbidden' });
    }
  }
}
