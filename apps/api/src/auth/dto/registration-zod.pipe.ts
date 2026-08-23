import {
  BadRequestException,
  Injectable,
  type PipeTransform,
} from '@nestjs/common';
import { registrationCredentialsSchema } from '@hop-and-barley/auth-contract';
import type { RegisterDto } from './register.dto';

@Injectable()
export class RegistrationZodPipe implements PipeTransform<
  unknown,
  RegisterDto
> {
  transform(value: unknown): RegisterDto {
    const result = registrationCredentialsSchema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException('Invalid registration input.');
    }
    return result.data;
  }
}
