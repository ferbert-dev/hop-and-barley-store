import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsString } from 'class-validator';
import { Transform } from 'class-transformer';

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

  @ApiPropertyOptional({
    default: false,
    description:
      'Persists the cookie and extends the absolute session lifetime to 30 days only when true.',
    type: Boolean,
  })
  @Transform(({ value }) => value === true)
  @IsBoolean()
  rememberMe = false;
}
