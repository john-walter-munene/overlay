import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { Matches } from 'class-validator';
import { PayoutsService } from './payouts.service';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { RolesGuard, Roles } from '../../common/roles.guard';

class RunPayoutsDto {
  @Matches(/^\d{4}-\d{2}$/, { message: 'period must be YYYY-MM' })
  period!: string;
}

@Controller('payouts')
export class PayoutsController {
  constructor(private readonly payouts: PayoutsService) {}

  @Post('run')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  run(@Body() dto: RunPayoutsDto) {
    return this.payouts.runForPeriod(dto.period);
  }
}
