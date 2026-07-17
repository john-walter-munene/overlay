import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { ReportsService } from './reports.service';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { CurrentUser } from '../../common/current-user.decorator';
import type { AuthUser } from '../../common/crypto';
import { writeThrottle } from '../../common/throttling';

class CreateReportDto {
  @IsString()
  tipsterId!: string;

  @IsIn(['positive', 'negative'])
  sentiment!: string;

  @IsIn([
    // negative
    'fake_record',
    'scam',
    'impersonation',
    'spam',
    // positive
    'accurate',
    'communication',
    'value',
    'recommend',
    // shared
    'other',
  ])
  reason!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  details?: string;
}

/** User-facing: leave feedback (praise or a complaint) about a subscribed tipster. */
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Post()
  @Throttle(writeThrottle())
  @UseGuards(JwtAuthGuard)
  create(@Body() dto: CreateReportDto, @CurrentUser() user: AuthUser) {
    return this.reports.create(
      user.userId,
      dto.tipsterId,
      dto.sentiment,
      dto.reason,
      dto.details,
    );
  }
}
