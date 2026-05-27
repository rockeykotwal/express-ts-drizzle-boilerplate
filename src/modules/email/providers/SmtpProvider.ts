import 'reflect-metadata';
import { injectable } from 'tsyringe';
import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { config } from '../../../config';
import { logger } from '../../../observability/logger';
import { AppError } from '../../../errors/AppError';
import type { EmailProvider, SendEmailOptions } from './EmailProvider';

@injectable()
export class SmtpProvider implements EmailProvider {
  private readonly transporter: Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host:   config.email.smtp.host,
      port:   config.email.smtp.port,
      secure: config.email.smtp.secure,
      auth:   config.email.smtp.user
        ? { user: config.email.smtp.user, pass: config.email.smtp.pass }
        : undefined,
    });
  }

  async send(options: SendEmailOptions): Promise<void> {
    const from = `"${config.email.fromName}" <${config.email.from}>`;

    try {
      await this.transporter.sendMail({
        from,
        to:      options.to,
        subject: options.subject,
        html:    options.html,
        text:    options.text,
      });

      logger.info('Email sent via SMTP', { to: options.to, subject: options.subject });
    } catch (err) {
      logger.error('Failed to send email via SMTP', {
        to:    options.to,
        error: err instanceof Error ? err.message : String(err),
      });
      throw new AppError('Failed to send email', 500, false);
    }
  }
}
