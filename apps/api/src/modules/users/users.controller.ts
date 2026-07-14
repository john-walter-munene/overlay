import {
  Body,
  Controller,
  Get,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { CurrentUser } from '../../common/current-user.decorator';
import type { AuthUser } from '../../common/crypto';

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

  /** Live availability check while the user types a handle. */
  @Get('username-available')
  available(@CurrentUser() user: AuthUser, @Query('u') username: string) {
    return this.users.checkUsername(username ?? '', user.userId);
  }
}
