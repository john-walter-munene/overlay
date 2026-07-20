import { createHmac } from 'node:crypto';
import type { Role } from '@overlay/shared';

/** Authenticated principal attached to requests by JwtAuthGuard. */
export interface AuthUser {
  userId: string;
  role: Role;
  /** Present when role === 'tipster'. */
  tipsterId?: string;
}

// Convenience HMAC helper (used elsewhere for webhook signature checks).
export function hmac(secret: string, payload: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}
