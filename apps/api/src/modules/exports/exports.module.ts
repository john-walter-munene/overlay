import { Module } from '@nestjs/common';
import { ExportsController } from './exports.controller';
import { ExportsService } from './exports.service';
import { PrismaService } from '../../prisma.service';

@Module({
  controllers: [ExportsController],
  providers: [ExportsService, PrismaService],
})
export class ExportsModule {}
