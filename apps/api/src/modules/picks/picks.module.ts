import { Module } from '@nestjs/common';
import { PicksController } from './picks.controller';
import { PicksService } from './picks.service';
import { PrismaService } from '../../prisma.service';

@Module({
  controllers: [PicksController],
  providers: [PicksService, PrismaService],
  exports: [PicksService],
})
export class PicksModule {}
