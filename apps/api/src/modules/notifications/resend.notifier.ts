import { Injectable, Logger } from '@nestjs/common';
import type {
  EmailMessage,
  Notifier,
  PushMessage,
} from './notifier.interface';

/**
 * Resend adapter for transactional email (verify, reset, receipts, new-pick
 * digests). The SDK is loaded lazily so the app builds/runs without a key until
 * Resend is provisioned. Enable in prod with NOTIFIER_PROVIDER=resend.
 * Env: RESEND_API_KEY, EMAIL_FROM.
 */
@Injectable()
export class ResendNotifier implements Notifier {
  readonly name = 'resend';
  private readonly log = new Logger(ResendNotifier.name);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private client: any;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async resend(): Promise<any> {
    if (!this.client) {
      const key = process.env.RESEND_API_KEY;
      if (!key) throw new Error('RESEND_API_KEY is not set');
      const mod = await import('resend');
      const Resend = mod.Resend;
      this.client = new Resend(key);
    }
    return this.client;
  }

  async sendEmail(msg: EmailMessage): Promise<void> {
    const resend = await this.resend();
    const from =
      process.env.EMAIL_FROM ?? 'Overlay Picks <no-reply@overlaypicks.com>';
    const { error } = await resend.emails.send({
      from,
      to: msg.to,
      subject: msg.subject,
      text: msg.body,
    });
    if (error) {
      throw new Error(`Resend email failed: ${error.message ?? error}`);
    }
  }

  async sendPush(msg: PushMessage): Promise<void> {
    // Resend is email-only; web push is handled by a dedicated provider (OB-031).
    this.log.debug(`push not supported by Resend (user=${msg.userId})`);
  }
}
