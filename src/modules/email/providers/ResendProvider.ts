import 'reflect-metadata';
import { injectable } from 'tsyringe';
import { Resend } from 'resend';
import { config } from '../../../config';
import { logger } from '../../../observability/logger';
import { AppError } from '../../../errors/AppError';
import type { EmailProvider, SendEmailOptions } from './EmailProvider';

@injectable()
export class ResendProvider implements EmailProvider {
  private readonly client: Resend;

  constructor() {
    this.client = new Resend(config.email.resendApiKey);
  }

  async send(options: SendEmailOptions): Promise<void> {
    const from = `${config.email.fromName} <${config.email.from}>`;

    const { error } = await this.client.emails.send({
      from,
      to:      options.to,
      subject: options.subject,
      html:    options.html,
      text:    options.text,
    });

    if (error) {
      logger.error('Failed to send email via Resend', { to: options.to, error: error.message });
      throw new AppError('Failed to send email via Resend', 500, false);
    }

    logger.info('Email sent via Resend', { to: options.to, subject: options.subject });
  }
}
