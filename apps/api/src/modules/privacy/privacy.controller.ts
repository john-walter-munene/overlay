import { Controller, Get, UseGuards } from '@nestjs/common';
import { PrivacyService } from './privacy.service';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { CurrentUser } from '../../common/current-user.decorator';
import type { AuthUser } from '../../common/crypto';

/**
 * GDPR data-subject-request endpoint (OB-085). Acts on the authenticated
 * caller only — a user can export their own data.
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
}
