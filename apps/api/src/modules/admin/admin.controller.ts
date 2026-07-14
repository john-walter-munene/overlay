import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { RolesGuard, Roles } from '../../common/roles.guard';
import { CurrentUser } from '../../common/current-user.decorator';
import type { AuthUser } from '../../common/crypto';

class SetRoleDto {
  @IsIn(['user', 'tipster', 'admin'])
  role!: 'user' | 'tipster' | 'admin';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

class SetTipsterStatusDto {
  @IsIn(['active', 'suspended'])
  status!: 'active' | 'suspended';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

/** All admin routes require an authenticated admin principal. */
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('dashboard')
  dashboard() {
    return this.admin.dashboard();
  }

  @Get('users')
  users(
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.admin.listUsers({ q, page, pageSize });
  }

  @Patch('users/:id/role')
  setRole(
    @Param('id') id: string,
    @Body() dto: SetRoleDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.admin.setUserRole(actor.userId, id, dto.role, dto.note);
  }

  @Patch('tipsters/:id/status')
  setTipsterStatus(
    @Param('id') id: string,
    @Body() dto: SetTipsterStatusDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.admin.setTipsterStatus(actor.userId, id, dto.status, dto.note);
  }

  @Get('audit-log')
  auditLog(
    @Query('entity') entity?: string,
    @Query('actor') actor?: string,
    @Query('action') action?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.admin.listAuditLog({
      entity,
      actor,
      action,
      from,
      to,
      page,
      pageSize,
    });
  }
}
