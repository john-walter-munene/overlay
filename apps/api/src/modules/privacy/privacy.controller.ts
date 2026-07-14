import { Controller, Delete, Get, UseGuards } from '@nestjs/common';
import { PrivacyService } from './privacy.service';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { CurrentUser } from '../../common/current-user.decorator';
import type { AuthUser } from '../../common/crypto';

/**
 * GDPR data-subject-request endpoints (OB-085). Both routes act on the
 * authenticated caller only — a user can export or erase their own data.
 */
@Controller('privacy')
@UseGuards(JwtAuthGuard)
export class PrivacyController {
  constructor(private readonly privacy: PrivacyService) {}

  /** Right of access / portability: download all personal data we hold. */
  @Get('export')
  export(@CurrentUser() user: AuthUser) {
    return this.privacy.exportUser(user.userId);
  }

  /** Right to erasure: anonymize PII (append-only picks are preserved). */
  @Delete('me')
  erase(@CurrentUser() user: AuthUser) {
    return this.privacy.eraseUser(user.userId);
  }
}
