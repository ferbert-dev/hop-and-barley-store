import {
  BadRequestException,
  Injectable,
  type PipeTransform,
} from '@nestjs/common';
import { loginCredentialsSchema } from '@hop-and-barley/auth-contract';
import type { LoginDto } from './login.dto';

@Injectable()
export class LoginZodPipe implements PipeTransform<unknown, LoginDto> {
  transform(value: unknown): LoginDto {
    const result = loginCredentialsSchema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException('Invalid login input.');
    }
    return result.data;
  }
}
