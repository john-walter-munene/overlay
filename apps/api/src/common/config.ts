import { Logger } from '@nestjs/common';

/**
 * Fail-fast environment validation. Called once at boot. In production, missing
 * or insecure secrets abort startup; in development we warn and fall back to
 * safe-ish defaults so the app still runs with zero config.
 */
export function validateEnv(): void {
  const log = new Logger('Config');
  const isProd = process.env.NODE_ENV === 'production';

  // key -> insecure default value that must NOT be used in production
  const secrets: Record<string, string> = {
    JWT_SECRET: 'change-me-in-prod',
    PICK_HASH_PEPPER: 'change-me',
  };

  const required = ['DATABASE_URL', 'SUPABASE_URL'];
  const problems: string[] = [];

  for (const key of required) {
    if (!process.env[key]) problems.push(`${key} is required`);
  }

  for (const [key, insecure] of Object.entries(secrets)) {
    const val = process.env[key];
    if (!val || val === insecure) {
      problems.push(`${key} must be set to a strong, non-default value`);
    }
  }

  if (process.env.PAYMENTS_PROVIDER === 'stripe') {
    for (const key of ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET']) {
      if (!process.env[key]) {
        problems.push(`${key} is required when PAYMENTS_PROVIDER=stripe`);
      }
    }
  }

  if (problems.length === 0) return;

  const message = `Environment validation failed:\n  - ${problems.join('\n  - ')}`;
  if (isProd) {
    log.error(message);
    throw new Error('Refusing to start with an insecure configuration');
  }
  log.warn(`${message}\n(continuing in non-production mode)`);
}
