// Notification transport abstraction. Providers (email, web push) implement
// this; a Mock logs so the flow runs without external services.

export interface EmailMessage {
  to: string;
  subject: string;
  body: string;
}

export interface PushMessage {
  userId: string;
  title: string;
  body: string;
}

export interface Notifier {
  readonly name: string;
  sendEmail(msg: EmailMessage): Promise<void>;
  sendPush(msg: PushMessage): Promise<void>;
}
