import {
  Controller,
  ForbiddenException,
  Get,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { IsIn, IsOptional } from 'class-validator';
import { ExportsService } from './exports.service';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { RolesGuard, Roles } from '../../common/roles.guard';
import { CurrentUser } from '../../common/current-user.decorator';
import type { AuthUser } from '../../common/crypto';

class ExportQuery {
  @IsOptional()
  @IsIn(['xlsx', 'csv', 'pdf'])
  format?: 'xlsx' | 'csv' | 'pdf';
}

@Controller('exports')
@UseGuards(JwtAuthGuard)
export class ExportsController {
  constructor(private readonly exports: ExportsService) {}

  // ───────────────────────────────────
  // USER exports
  // ───────────────────────────────────

  @Get('users/subscriptions')
  @UseGuards(RolesGuard)
  @Roles('user', 'tipster')
  async userSubscriptions(
    @CurrentUser() user: AuthUser,
    @Query() query: ExportQuery,
    @Res() res: Response,
  ) {
    const { buffer, contentType, filename } =
      await this.exports.exportUserSubscriptions(user.userId, query.format ?? 'xlsx');
    res.set({ 'Content-Type': contentType, 'Content-Disposition': `attachment; filename="${filename}"` });
    res.send(buffer);
  }

  @Get('users/feed')
  @UseGuards(RolesGuard)
  @Roles('user', 'tipster')
  async userFeed(
    @CurrentUser() user: AuthUser,
    @Query() query: ExportQuery,
    @Res() res: Response,
  ) {
    const { buffer, contentType, filename } =
      await this.exports.exportUserFeed(user.userId, query.format ?? 'xlsx');
    res.set({ 'Content-Type': contentType, 'Content-Disposition': `attachment; filename="${filename}"` });
    res.send(buffer);
  }

  // ───────────────────────────────────
  // TIPSTER exports
  // ───────────────────────────────────

  @Get('tipsters/picks')
  @UseGuards(RolesGuard)
  @Roles('tipster')
  async tipsterPicks(
    @CurrentUser() user: AuthUser,
    @Query() query: ExportQuery,
    @Res() res: Response,
  ) {
    if (!user.tipsterId) throw new ForbiddenException('Not a tipster account');
    const { buffer, contentType, filename } =
      await this.exports.exportTipsterPicks(user.tipsterId, query.format ?? 'xlsx');
    res.set({ 'Content-Type': contentType, 'Content-Disposition': `attachment; filename="${filename}"` });
    res.send(buffer);
  }

  @Get('tipsters/earnings')
  @UseGuards(RolesGuard)
  @Roles('tipster')
  async tipsterEarnings(
    @CurrentUser() user: AuthUser,
    @Query() query: ExportQuery,
    @Res() res: Response,
  ) {
    if (!user.tipsterId) throw new ForbiddenException('Not a tipster account');
    const { buffer, contentType, filename } =
      await this.exports.exportTipsterEarnings(user.tipsterId, query.format ?? 'xlsx');
    res.set({ 'Content-Type': contentType, 'Content-Disposition': `attachment; filename="${filename}"` });
    res.send(buffer);
  }

  // ───────────────────────────────────
  // ADMIN exports
  // ───────────────────────────────────

  @Get('admin/users')
  @UseGuards(RolesGuard)
  @Roles('admin')
  async adminUsers(
    @Query() query: ExportQuery,
    @Res() res: Response,
  ) {
    const { buffer, contentType, filename } =
      await this.exports.exportAdminUsers(query.format ?? 'xlsx');
    res.set({ 'Content-Type': contentType, 'Content-Disposition': `attachment; filename="${filename}"` });
    res.send(buffer);
  }

  @Get('admin/audit-log')
  @UseGuards(RolesGuard)
  @Roles('admin')
  async adminAuditLog(
    @Query() query: ExportQuery,
    @Res() res: Response,
  ) {
    const { buffer, contentType, filename } =
      await this.exports.exportAdminAuditLog(query.format ?? 'xlsx');
    res.set({ 'Content-Type': contentType, 'Content-Disposition': `attachment; filename="${filename}"` });
    res.send(buffer);
  }

  @Get('admin/settlements')
  @UseGuards(RolesGuard)
  @Roles('admin')
  async adminSettlements(
    @Query() query: ExportQuery,
    @Res() res: Response,
  ) {
    const { buffer, contentType, filename } =
      await this.exports.exportAdminSettlements(query.format ?? 'xlsx');
    res.set({ 'Content-Type': contentType, 'Content-Disposition': `attachment; filename="${filename}"` });
    res.send(buffer);
  }

  @Get('admin/reports')
  @UseGuards(RolesGuard)
  @Roles('admin')
  async adminReports(
    @Query() query: ExportQuery,
    @Res() res: Response,
  ) {
    const { buffer, contentType, filename } =
      await this.exports.exportAdminReports(query.format ?? 'xlsx');
    res.set({ 'Content-Type': contentType, 'Content-Disposition': `attachment; filename="${filename}"` });
    res.send(buffer);
  }

  @Get('admin/payouts')
  @UseGuards(RolesGuard)
  @Roles('admin')
  async adminPayouts(
    @Query() query: ExportQuery,
    @Res() res: Response,
  ) {
    const { buffer, contentType, filename } =
      await this.exports.exportAdminPayouts(query.format ?? 'xlsx');
    res.set({ 'Content-Type': contentType, 'Content-Disposition': `attachment; filename="${filename}"` });
    res.send(buffer);
  }
}