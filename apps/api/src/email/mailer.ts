import { Inject, Injectable, Logger } from '@nestjs/common';
import { render } from '@react-email/render';
import type { ReactElement } from 'react';
import { Resend } from 'resend';
import { CONFIG, type AppConfig } from '../config';
import { nextId, write } from '../database/db';
import { emailSink } from '../database/schema';
import { ApiError } from '../http/api-error';
import { Infrastructure } from '../infrastructure';

export const emailFailed = (message: string) =>
  new ApiError(503, message, 'email_failed');

/**
 * Account emails (temporary passwords, sign-in codes, password resets). They are sent through
 * Resend when RESEND_API_KEY is set, otherwise written to the local email sink. They hold
 * secrets, so they are never stored in the delivery outbox; send them after the change commits.
 */
@Injectable()
export class Mailer {
  private readonly logger = new Logger('Mailer');
  private readonly resend: Resend | null;
  constructor(
    private readonly infrastructure: Infrastructure,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {
    this.resend = config.RESEND_API_KEY
      ? new Resend(config.RESEND_API_KEY)
      : null;
    if (!this.resend && config.NODE_ENV === 'production')
      this.logger.warn({ event: 'email.sink_only' });
  }

  /** A portal path as an absolute link. */
  link(path: string) {
    return new URL(path, this.config.PORTAL_URL).href;
  }

  /** Throws `email_failed` (503) with `failure` as the message when the email is not accepted. */
  async send(
    message: {
      to: string;
      subject: string;
      email: ReactElement;
      /** Stops a retried request from sending the same email twice. */
      idempotencyKey: string;
    },
    failure: string,
  ) {
    const [html, text] = await Promise.all([
      render(message.email),
      render(message.email, { plainText: true }),
    ]);
    if (!this.resend) {
      await write(this.infrastructure.database, async (tx, businessTime) => {
        await tx.insert(emailSink).values({
          id: await nextId(tx, 'mail'),
          to: message.to,
          subject: message.subject,
          body: text,
          deliveredAt: businessTime,
        });
      });
      return;
    }
    const result = await this.resend.emails
      .send(
        {
          from: this.config.EMAIL_FROM,
          to: message.to,
          subject: message.subject,
          html,
          text,
        },
        {
          idempotencyKey: message.idempotencyKey,
          signal: AbortSignal.timeout(10_000),
        },
      )
      .catch((error: unknown) => ({ error }));
    if (result.error) {
      // Never log the recipient, subject or body: the email carries a secret.
      this.logger.warn({
        event: 'email.send_failed',
        reason:
          result.error instanceof Error
            ? result.error.message
            : (result.error as { name?: string }).name,
      });
      throw emailFailed(failure);
    }
  }
}
