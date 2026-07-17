import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UsersService } from './users.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { CurrentUser } from '../../common/current-user.decorator';
import type { AuthUser } from '../../common/crypto';
import {
  InvalidAvatarError,
  MAX_AVATAR_BYTES,
  storeAvatar,
  type UploadedImage,
} from './avatar-upload';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  /** Enriched self-profile for the account page. */
  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.users.getProfile(user.userId);
  }

  /** Update self-profile (currently: username). */
  @Patch('me')
  update(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfileDto) {
    return this.users.updateProfile(user.userId, dto);
  }

  /** Upload / replace the caller's avatar. Optional — the UI falls back to a
   * generated avatar when none is set. */
  @Post('me/avatar')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_AVATAR_BYTES } }),
  )
  async uploadAvatar(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file?: UploadedImage,
  ) {
    try {
      const url = await storeAvatar(file);
      return this.users.setAvatar(user.userId, url);
    } catch (err) {
      if (err instanceof InvalidAvatarError) {
        throw new BadRequestException(err.message);
      }
      throw err;
    }
  }

  /** Remove the caller's avatar (revert to the generated fallback). */
  @Delete('me/avatar')
  removeAvatar(@CurrentUser() user: AuthUser) {
    return this.users.clearAvatar(user.userId);
  }

  /** Live availability check while the user types a handle. */
  @Get('username-available')
  available(@CurrentUser() user: AuthUser, @Query('u') username: string) {
    return this.users.checkUsername(username ?? '', user.userId);
  }
}
