import nodemailer from 'nodemailer';
import type { Config } from './config.ts';

/**
 * Outbound mail (TRD 3, 8.6). One interface; SMTP is the only transport. Locally it reaches the
 * Mailpit inbox at 127.0.0.1:1025 without authentication; production points the same settings
 * at a provider's SMTP relay with TLS (selected by configuration only). Messages carry no
 * amounts, invoice numbers or contractor or owner names (CLAUDE.md, TRD 8.10): callers pass
 * fixed wording and a link only.
 */
export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  /** Correlation id, sent as a header so a provider message can be traced (TRD 8.6). */
  correlationId?: string;
}

export interface Mailer {
  send(msg: MailMessage): Promise<{ messageId: string }>;
}

export function createSmtpMailer(config: Pick<Config, 'SMTP_HOST' | 'SMTP_PORT' | 'SMTP_SECURE' | 'SMTP_REQUIRE_TLS' | 'SMTP_USER' | 'SMTP_PASSWORD' | 'MAIL_FROM'>): Mailer {
  const transport = nodemailer.createTransport({
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    secure: config.SMTP_SECURE === 'true',
    requireTLS: config.SMTP_REQUIRE_TLS === 'true',
    auth: config.SMTP_USER ? { user: config.SMTP_USER, pass: config.SMTP_PASSWORD ?? '' } : undefined,
    connectionTimeout: 10_000,
    socketTimeout: 10_000,
  });
  return {
    async send(msg) {
      const info = await transport.sendMail({
        from: config.MAIL_FROM,
        to: msg.to,
        subject: msg.subject,
        text: msg.text,
        headers: msg.correlationId ? { 'X-Correlation-Id': msg.correlationId } : {},
      });
      return { messageId: String(info.messageId) };
    },
  };
}

/** In-memory mailer for unit tests. */
export class MemoryMailer implements Mailer {
  readonly sent: MailMessage[] = [];
  async send(msg: MailMessage): Promise<{ messageId: string }> {
    this.sent.push(msg);
    return { messageId: `memory-${this.sent.length}` };
  }
}
