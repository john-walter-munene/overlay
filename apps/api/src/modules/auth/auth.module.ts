import { Global, Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { PrismaService } from '../../prisma.service';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { RolesGuard } from '../../common/roles.guard';

// Global so the auth guards + Supabase provisioning are available everywhere.
// AuthService MUST be exported: JwtAuthGuard depends on it and is used (via
// @UseGuards) in many modules, which resolve the guard in their own context.
@Global()
@Module({
  controllers: [AuthController],
  providers: [AuthService, PrismaService, JwtAuthGuard, RolesGuard],
  exports: [AuthService, JwtAuthGuard, RolesGuard],
})
export class AuthModule {}
