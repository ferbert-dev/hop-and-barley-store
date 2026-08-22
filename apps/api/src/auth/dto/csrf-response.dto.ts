import { ApiProperty } from '@nestjs/swagger';

export class CsrfResponseDto {
  @ApiProperty({
    description: 'Versioned session-bound CSRF value for unsafe requests.',
    example: `v1.${'A'.repeat(43)}`,
    pattern: '^[A-Za-z0-9_-]{1,16}\\.[A-Za-z0-9_-]{43}$',
    type: String,
  })
  csrfToken!: string;
}
