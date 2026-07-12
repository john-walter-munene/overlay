import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { IsArray, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { TipstersService } from './tipsters.service';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { RolesGuard, Roles } from '../../common/roles.guard';
import { CurrentUser } from '../../common/current-user.decorator';
import type { AuthUser } from '../../common/crypto';

class UpdateTipsterDto {
  @IsOptional() @IsString() bio?: string;
  @IsOptional() @IsArray() sports?: string[];
  @IsOptional() @IsInt() @Min(0) subscriptionPriceCents?: number;
}

@Controller('tipsters')
export class TipstersController {
  constructor(private readonly tipsters: TipstersService) {}

  @Get(':id')
  getProfile(@Param('id') id: string) {
    return this.tipsters.getProfile(id);
  }

  @Patch('me')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('tipster')
  updateMe(@Body() dto: UpdateTipsterDto, @CurrentUser() user: AuthUser) {
    if (!user.tipsterId) throw new ForbiddenException('Not a tipster account');
    return this.tipsters.updateProfile(user.tipsterId, dto);
  }
}
