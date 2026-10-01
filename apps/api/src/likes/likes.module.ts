import { Module } from '@nestjs/common';
import { SessionModule } from '../auth/session/session.module';
import { CartModule } from '../cart/cart.module';
import { LikesController } from './likes.controller';
import { LikesService } from './likes.service';

@Module({
  imports: [CartModule, SessionModule],
  controllers: [LikesController],
  providers: [LikesService],
})
export class LikesModule {}
