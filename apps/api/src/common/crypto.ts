import { createHmac } from 'node:crypto';

/** Authenticated principal attached to requests by JwtAuthGuard. */
export interface AuthUser {
  userId: string;
  role: 'user' | 'tipster' | 'admin';
  /** Present when role === 'tipster'. */
  tipsterId?: string;
}

// Convenience HMAC helper (used elsewhere for webhook signature checks).
export function hmac(secret: string, payload: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}
