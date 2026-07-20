import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { IsBoolean, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { AdminService } from './admin.service';
import { ReportsService } from '../reports/reports.service';
import { PayoutsService } from '../payouts/payouts.service';
import { FeedbackService } from '../feedback/feedback.service';
import { NewsletterService } from '../newsletter/newsletter.service';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { PermissionsGuard, Permissions } from '../../common/roles.guard';
import { CurrentUser } from '../../common/current-user.decorator';
import type { AuthUser } from '../../common/crypto';
import { ROLES } from '@overlay/shared';
import type { Role } from '@overlay/shared';

class SetRoleDto {
  @IsIn(ROLES)
  role!: Role;

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

class VoidPickDto {
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason!: string;
}

class ReviewReportDto {
  @IsIn(['open', 'reviewing', 'resolved', 'dismissed'])
  status!: 'open' | 'reviewing' | 'resolved' | 'dismissed';

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

class FeedbackStatusDto {
  @IsIn(['new', 'reviewed', 'archived'])
  status!: 'new' | 'reviewed' | 'archived';
}

class GraduationReviewDto {
  @IsIn(['verify', 'reject'])
  decision!: 'verify' | 'reject';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

class SetGatingDto {
  @IsBoolean()
  enabled!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

/**
 * All admin routes require an authenticated principal AND a per-route
 * permission (PermissionsGuard is fail-closed: a route without a
 * `@Permissions(...)` declaration is denied). `staff` holds every permission
 * except `finance:manage`; `admin` holds all.
 */
@Controller('admin')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly reports: ReportsService,
    private readonly payouts: PayoutsService,
    private readonly feedback: FeedbackService,
    private readonly newsletter: NewsletterService,
  ) {}

  @Get('dashboard')
  @Permissions('audit:read')
  dashboard() {
    return this.admin.dashboard();
  }

  @Get('users')
  @Permissions('user:manage')
  users(
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.admin.listUsers({ q, page, pageSize });
  }

  @Patch('users/:id/role')
  @Permissions('user:manage')
  setRole(
    @Param('id') id: string,
    @Body() dto: SetRoleDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.admin.setUserRole(actor, id, dto.role, dto.note);
  }

  @Patch('tipsters/:id/status')
  @Permissions('tipster:manage')
  setTipsterStatus(
    @Param('id') id: string,
    @Body() dto: SetTipsterStatusDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.admin.setTipsterStatus(actor.userId, id, dto.status, dto.note);
  }

  /** Short-lived signed URL for a tipster's uploaded identity document. */
  @Get('tipsters/:id/identity-document')
  @Permissions('tipster:manage')
  identityDocument(@Param('id') id: string) {
    return this.admin.getTipsterIdentityDocument(id);
  }

  /** Rising-tipster graduation review queue (OB-153). */
  @Get('graduations')
  @Permissions('tipster:manage')
  graduations() {
    return this.admin.listGraduationReviews();
  }

  @Patch('tipsters/:id/graduation')
  @Permissions('tipster:manage')
  reviewGraduation(
    @Param('id') id: string,
    @Body() dto: GraduationReviewDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.admin.reviewTipsterGraduation(
      actor.userId,
      id,
      dto.decision,
      dto.note,
    );
  }

  @Patch('tipsters/:id/gating')
  @Permissions('tipster:manage')
  setGating(
    @Param('id') id: string,
    @Body() dto: SetGatingDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.admin.setTipsterGating(actor.userId, id, dto.enabled, dto.note);
  }

  @Get('audit-log')
  @Permissions('audit:read')
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

  @Get('settlements')
  @Permissions('finance:manage')
  settlements(
    @Query('status') status?: string,
    @Query('take') take?: string,
    @Query('skip') skip?: string,
  ) {
    return this.admin.listRecentSettlements({ status, take, skip });
  }

  @Post('settlements/rerun')
  @Permissions('finance:manage')
  rerunSettlement(@CurrentUser() actor: AuthUser) {
    return this.admin.rerunSettlement(actor.userId);
  }

  @Post('settlements/:id/void')
  @Permissions('tipster:manage')
  voidPick(
    @Param('id') id: string,
    @Body() dto: VoidPickDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.admin.voidPick(actor.userId, id, dto.reason);
  }

  /** Reports raised by subscribers about tipsters (OB-161). */
  @Get('reports')
  @Permissions('content:moderate')
  reportsList(@Query('status') status?: string) {
    return this.reports.listForAdmin(status);
  }

  @Patch('reports/:id')
  @Permissions('content:moderate')
  reviewReport(@Param('id') id: string, @Body() dto: ReviewReportDto) {
    return this.reports.updateStatus(id, dto.status, dto.note);
  }

  /** On-demand payout requests awaiting approval (OB-04x). */
  @Get('payouts')
  @Permissions('finance:manage')
  payoutsAwaiting() {
    return this.payouts.listAwaitingApproval();
  }

  @Post('payouts/:id/approve')
  @Permissions('finance:manage')
  approvePayout(@Param('id') id: string) {
    return this.payouts.approve(id);
  }

  @Post('payouts/:id/reject')
  @Permissions('finance:manage')
  rejectPayout(@Param('id') id: string) {
    return this.payouts.reject(id);
  }

  /** Support-center feedback (OB-162). */
  @Get('feedback')
  @Permissions('content:moderate')
  feedbackList(@Query('status') status?: string) {
    return this.feedback.listForAdmin(status);
  }

  /** Newsletter subscribers (OB-072). */
  @Get('newsletter')
  @Permissions('content:moderate')
  newsletterList(@Query('status') status?: string) {
    return this.newsletter.listForAdmin(status);
  }

  /** Manually compose + send the weekly "Picks of the Week" digest (OB-157). */
  @Post('newsletter/digest')
  @Permissions('content:moderate')
  sendNewsletterDigest() {
    return this.newsletter.sendWeeklyDigest();
  }

  @Patch('feedback/:id')
  @Permissions('content:moderate')
  reviewFeedback(@Param('id') id: string, @Body() dto: FeedbackStatusDto) {
    return this.feedback.updateStatus(id, dto.status);
  }
}
