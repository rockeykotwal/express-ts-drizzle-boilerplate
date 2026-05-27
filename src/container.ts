import 'reflect-metadata';
import { container } from 'tsyringe';
import { db } from './database/client';
import { redisClient } from './cache/redis';
import { config } from './config';
import { SmtpProvider }  from './modules/email/providers/SmtpProvider';
import { ResendProvider } from './modules/email/providers/ResendProvider';
import { EmailService }  from './modules/email/services/EmailService';
import { TOKENS } from './tokens';

// Re-export so existing imports of TOKENS from this file continue to work
export { TOKENS } from './tokens';

// ── Infrastructure instances ──────────────────────────────────────────────────
container.registerInstance(TOKENS.DrizzleDb,   db);
container.registerInstance(TOKENS.RedisClient, redisClient);

// ── Email provider — chosen at startup from EMAIL_PROVIDER env var ─────────
if (config.email.provider === 'resend') {
  container.register(TOKENS.EmailProvider, { useClass: ResendProvider });
} else {
  container.register(TOKENS.EmailProvider, { useClass: SmtpProvider });
}
container.registerSingleton(TOKENS.EmailService, EmailService);

export { container };
