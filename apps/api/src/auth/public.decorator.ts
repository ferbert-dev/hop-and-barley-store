import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'hop-and-barley.auth.public';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
