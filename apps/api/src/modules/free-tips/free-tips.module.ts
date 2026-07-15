import { Module } from '@nestjs/common';
import { FreeTipsController } from './free-tips.controller';
import { FreeTipsService } from './free-tips.service';
import { PrismaService } from '../../prisma.service';

@Module({
  controllers: [FreeTipsController],
  providers: [FreeTipsService, PrismaService],
  exports: [FreeTipsService],
})
export class FreeTipsModule {}
