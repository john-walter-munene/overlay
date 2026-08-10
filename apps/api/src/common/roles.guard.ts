import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { permissionsForRole, type Permission } from '@overlay/shared';
import type { AuthUser } from './crypto';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: AuthUser['role'][]) =>
  SetMetadata(ROLES_KEY, roles);

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<AuthUser['role'][]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0) return true;
    const user: AuthUser | undefined = context
      .switchToHttp()
      .getRequest().user;
    if (!user || !required.includes(user.role)) {
      throw new ForbiddenException('Insufficient role');
    }
    return true;
  }
}

export const PERMISSIONS_KEY = 'permissions';

/**
 * Declare the permission(s) a route requires. The caller must hold ALL listed
 * permissions (via their role's grant set). See {@link PermissionsGuard}.
 */
export const Permissions = (...permissions: Permission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

/**
 * Fail-closed permission gate. On any controller/route it guards, a
 * `@Permissions(...)` declaration is REQUIRED — a route with none is denied, so
 * a forgotten annotation can never accidentally expose an endpoint.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Permission[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0) {
      throw new ForbiddenException('Route missing permission declaration');
    }
    const user: AuthUser | undefined = context
      .switchToHttp()
      .getRequest().user;
    if (!user) throw new ForbiddenException('Unauthenticated');
    const granted = permissionsForRole(user.role);
    if (!required.every((p) => granted.includes(p))) {
      throw new ForbiddenException('Insufficient permission');
    }
    return true;
  }
}
