import { Module } from '@nestjs/common';
import { CsrfService } from './csrf.service';
import { SessionService } from './session.service';

@Module({
  exports: [CsrfService, SessionService],
  providers: [CsrfService, SessionService],
})
export class SessionModule {}
