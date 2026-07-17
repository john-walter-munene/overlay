import { Module } from '@nestjs/common';
import { FollowController } from './follow.controller';
import { FollowService } from './follow.service';
import { PrismaService } from '../../prisma.service';

@Module({
  controllers: [FollowController],
  providers: [FollowService, PrismaService],
  exports: [FollowService],
})
export class FollowModule {}
