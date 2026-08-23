import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class RegisterDto {
  @ApiProperty({
    description:
      'Email with an ASCII dot-atom local part and an IDNA-compatible domain.',
    example: 'brewer@example.com',
    format: 'email',
    maxLength: 320,
    type: String,
  })
  @IsString()
  email!: string;

  @ApiProperty({
    description:
      'At least 12 total characters containing lowercase, uppercase, digit, and special characters.',
    minLength: 12,
    type: String,
    writeOnly: true,
  })
  @IsString()
  password!: string;
}
