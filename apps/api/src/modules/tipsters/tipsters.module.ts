import { Module } from '@nestjs/common';
import { TipstersController } from './tipsters.controller';
import { TipstersService } from './tipsters.service';
import { PrismaService } from '../../prisma.service';

@Module({
  controllers: [TipstersController],
  providers: [TipstersService, PrismaService],
  exports: [TipstersService],
})
export class TipstersModule {}
