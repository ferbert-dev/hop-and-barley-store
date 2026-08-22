import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class RegisterDto {
  @ApiProperty({
    description:
      'Email with an ASCII dot-atom local part and an IDNA-compatible domain.',
    example: 'brewer@example.com',
    maxLength: 320,
    type: String,
  })
  @IsString()
  email!: string;

  @ApiProperty({
    description:
      'NFC password, 15–128 Unicode code points, at most 512 UTF-8 bytes.',
    maxLength: 128,
    minLength: 15,
    type: String,
    writeOnly: true,
  })
  @IsString()
  password!: string;
}
