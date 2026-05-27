import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EmailService } from '../../../src/modules/email/services/EmailService';
import type { EmailProvider } from '../../../src/modules/email/providers/EmailProvider';

// ── Mock config ───────────────────────────────────────────────────────────────
vi.mock('../../../src/config', () => ({
  config: {
    app:   { name: 'TestApp' },
    email: { provider: 'smtp', from: 'test@example.com', fromName: 'TestApp' },
  },
}));

// ── Mock logger ───────────────────────────────────────────────────────────────
vi.mock('../../../src/observability/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

// ── Mock renderTemplate ───────────────────────────────────────────────────────
vi.mock('../../../src/modules/email/utils/renderTemplate', () => ({
  renderTemplate: vi.fn().mockReturnValue('<html>mocked</html>'),
}));

import { renderTemplate } from '../../../src/modules/email/utils/renderTemplate';
import { logger } from '../../../src/observability/logger';

// ── Build service with mock provider ─────────────────────────────────────────
function buildEmailService() {
  const mockProvider: EmailProvider = { send: vi.fn().mockResolvedValue(undefined) };
  const service = new EmailService(mockProvider);
  return { service, mockProvider };
}

describe('EmailService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('sendVerificationEmail', () => {
    it('renders the verify-email template and delegates to provider', async () => {
      const { service, mockProvider } = buildEmailService();

      await service.sendVerificationEmail({
        to:              'user@example.com',
        firstName:       'Jane',
        verificationUrl: 'https://example.com/verify/abc123',
      });

      expect(renderTemplate).toHaveBeenCalledWith('verify-email', {
        appName:         'TestApp',
        firstName:       'Jane',
        verificationUrl: 'https://example.com/verify/abc123',
      });

      expect(mockProvider.send).toHaveBeenCalledWith({
        to:      'user@example.com',
        subject: 'Verify your email — TestApp',
        html:    '<html>mocked</html>',
      });

      expect(logger.info).toHaveBeenCalledWith('Verification email sent', { to: 'user@example.com' });
    });
  });

  describe('sendPasswordResetEmail', () => {
    it('renders the reset-password template and delegates to provider', async () => {
      const { service, mockProvider } = buildEmailService();

      await service.sendPasswordResetEmail({
        to:        'user@example.com',
        firstName: 'John',
        resetUrl:  'https://example.com/reset/xyz789',
      });

      expect(renderTemplate).toHaveBeenCalledWith('reset-password', {
        appName:   'TestApp',
        firstName: 'John',
        resetUrl:  'https://example.com/reset/xyz789',
      });

      expect(mockProvider.send).toHaveBeenCalledWith({
        to:      'user@example.com',
        subject: 'Reset your password — TestApp',
        html:    '<html>mocked</html>',
      });

      expect(logger.info).toHaveBeenCalledWith('Password reset email sent', { to: 'user@example.com' });
    });
  });

  describe('sendWelcomeEmail', () => {
    it('renders the welcome template and delegates to provider', async () => {
      const { service, mockProvider } = buildEmailService();

      await service.sendWelcomeEmail({
        to:        'newuser@example.com',
        firstName: 'Alice',
        appUrl:    'https://example.com',
      });

      expect(renderTemplate).toHaveBeenCalledWith('welcome', {
        appName:   'TestApp',
        firstName: 'Alice',
        appUrl:    'https://example.com',
      });

      expect(mockProvider.send).toHaveBeenCalledWith({
        to:      'newuser@example.com',
        subject: 'Welcome to TestApp!',
        html:    '<html>mocked</html>',
      });

      expect(logger.info).toHaveBeenCalledWith('Welcome email sent', { to: 'newuser@example.com' });
    });
  });

  describe('provider isolation', () => {
    it('does NOT expose provider type — service calls send() without knowing which provider', async () => {
      const { service, mockProvider } = buildEmailService();

      await service.sendWelcomeEmail({
        to:        'a@b.com',
        firstName: 'X',
        appUrl:    'https://x.com',
      });

      // Service only calls provider.send — it doesn't call any SMTP/Resend-specific methods
      expect(mockProvider.send).toHaveBeenCalledTimes(1);
      expect(mockProvider.send).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'a@b.com' }),
      );
    });

    it('propagates provider errors to the caller', async () => {
      const { service, mockProvider } = buildEmailService();
      vi.mocked(mockProvider.send).mockRejectedValueOnce(new Error('SMTP connection refused'));

      await expect(
        service.sendVerificationEmail({
          to:              'fail@example.com',
          firstName:       'Fail',
          verificationUrl: 'https://x.com/verify',
        }),
      ).rejects.toThrow('SMTP connection refused');
    });
  });
});
