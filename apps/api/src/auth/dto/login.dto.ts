import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class LoginDto {
  @ApiProperty({
    description: 'Registered email identifier.',
    example: 'brewer@example.com',
    maxLength: 320,
    type: String,
  })
  @IsString()
  email!: string;

  @ApiProperty({
    maxLength: 128,
    minLength: 1,
    type: String,
    writeOnly: true,
  })
  @IsString()
  password!: string;
}
