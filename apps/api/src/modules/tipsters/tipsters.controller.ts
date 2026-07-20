import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { TipstersService } from './tipsters.service';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { RolesGuard, Roles } from '../../common/roles.guard';
import { CurrentUser } from '../../common/current-user.decorator';
import type { AuthUser } from '../../common/crypto';
import type { RawMarketplaceQuery } from './marketplace';
import {
  InvalidDocumentError,
  MAX_DOC_BYTES,
  storeIdentityDocument,
  type UploadedDoc,
} from './uploads';

class UpdateTipsterDto {
  @IsOptional() @IsString() @MaxLength(80) displayName?: string;
  @IsOptional() @IsString() @MaxLength(80) country?: string;
  @IsOptional() @IsIn(['phone', 'telegram', 'whatsapp']) contactMethod?:
    | 'phone'
    | 'telegram'
    | 'whatsapp';
  @IsOptional() @IsString() @MaxLength(120) contactValue?: string;
  @IsOptional() @IsString() @MaxLength(2000) bio?: string;
  @IsOptional() @IsArray() sports?: string[];
  @IsOptional() @IsInt() @Min(0) subscriptionPriceCents?: number;
  @IsOptional() @IsIn(['weekly', 'monthly']) billingInterval?:
    | 'weekly'
    | 'monthly';
  @IsOptional() @IsString() @MaxLength(120) socialX?: string;
  @IsOptional() @IsString() @MaxLength(120) socialInstagram?: string;
  @IsOptional() @IsString() @MaxLength(120) socialTelegram?: string;
  @IsOptional() @IsIn(['stripe', 'crypto', 'mobile_money']) payoutMethod?:
    | 'stripe'
    | 'crypto'
    | 'mobile_money';
  @IsOptional() @IsString() @MaxLength(120) payoutWalletAddress?: string;
  @IsOptional() @IsString() @MaxLength(40) payoutWalletChain?: string;
  @IsOptional() @IsString() @MaxLength(40) payoutMobileNumber?: string;
  @IsOptional() @IsString() @MaxLength(40) payoutMobileNetwork?: string;
}

class SubmitVerificationDto {
  @IsOptional() @IsString() @MaxLength(120) socialX?: string;
  @IsOptional() @IsString() @MaxLength(120) socialInstagram?: string;
  @IsOptional() @IsString() @MaxLength(120) socialTelegram?: string;
}

@Controller('tipsters')
export class TipstersController {
  constructor(private readonly tipsters: TipstersService) {}

  /** Marketplace / discovery listing (OB-010). */
  @Get('marketplace')
  marketplace(@Query() query: RawMarketplaceQuery) {
    return this.tipsters.listMarketplace(query);
  }

  /** Active tipster ids for sitemap / ISR static generation (OB-131). */
  @Get('sitemap')
  sitemap() {
    return this.tipsters.listPublicTipsterIds();
  }

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

  /** The caller's own editable profile (prefills the onboarding wizard). */
  @Get('me/profile')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('tipster')
  myProfile(@CurrentUser() user: AuthUser) {
    if (!user.tipsterId) throw new ForbiddenException('Not a tipster account');
    return this.tipsters.getEditableProfile(user.tipsterId);
  }

  /** Active-subscriber count for the caller's own dashboard (OB-020). */
  @Get('me/subscribers')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('tipster')
  subscribers(@CurrentUser() user: AuthUser) {
    if (!user.tipsterId) throw new ForbiddenException('Not a tipster account');
    return this.tipsters.getSubscriberCount(user.tipsterId);
  }

  /** Onboarding wizard status for the calling tipster (OB-020). */
  @Get('me/onboarding')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('tipster')
  onboarding(@CurrentUser() user: AuthUser) {
    if (!user.tipsterId) throw new ForbiddenException('Not a tipster account');
    return this.tipsters.getOnboarding(user.tipsterId);
  }

  /** Complete the Stripe Connect onboarding step (OB-020). */
  @Post('me/onboarding/stripe')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('tipster')
  completeStripe(@CurrentUser() user: AuthUser) {
    if (!user.tipsterId) throw new ForbiddenException('Not a tipster account');
    return this.tipsters.completeStripeOnboarding(user.tipsterId);
  }

  /**
   * Complete the optional identity-verification step (OB-020): upload an
   * official document (multipart field `document`) and optionally attach social
   * handles, unlocking the verified badge.
   */
  @Post('me/onboarding/verification')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('tipster')
  @UseInterceptors(
    FileInterceptor('document', { limits: { fileSize: MAX_DOC_BYTES } }),
  )
  async submitVerification(
    @UploadedFile() document: UploadedDoc | undefined,
    @Body() dto: SubmitVerificationDto,
    @CurrentUser() user: AuthUser,
  ) {
    if (!user.tipsterId) throw new ForbiddenException('Not a tipster account');
    try {
      const stored = await storeIdentityDocument(document);
      return await this.tipsters.submitVerification(user.tipsterId, {
        docPath: stored.path,
        docName: stored.name,
        socialX: dto.socialX,
        socialInstagram: dto.socialInstagram,
        socialTelegram: dto.socialTelegram,
      });
    } catch (err) {
      if (err instanceof InvalidDocumentError) {
        throw new BadRequestException(err.message);
      }
      throw err;
    }
  }
}
