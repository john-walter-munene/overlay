import { Injectable, Logger } from '@nestjs/common';
import type {
  EmailMessage,
  Notifier,
  PushMessage,
} from './notifier.interface';

/** Logs notifications instead of sending. Used for local dev and tests. */
@Injectable()
export class MockNotifier implements Notifier {
  readonly name = 'mock';
  private readonly log = new Logger(MockNotifier.name);

  async sendEmail(msg: EmailMessage): Promise<void> {
    this.log.log(`[email] to=${msg.to} subject="${msg.subject}"`);
  }

  async sendPush(msg: PushMessage): Promise<void> {
    this.log.log(`[push] user=${msg.userId} title="${msg.title}"`);
  }
}
