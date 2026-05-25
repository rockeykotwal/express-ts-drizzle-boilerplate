import 'reflect-metadata';
import type { RequestHandler, Request, Response, NextFunction } from 'express';
import { container } from '../../../container';
import { RbacService } from '../services/RbacService';

// IMPORTANT: authorize() must be used AFTER the authenticate middleware.
// authenticate populates res.locals.user; authorize reads it.
// Applying authorize without authenticate will always produce a 401.

export function authorize(...requiredPermissions: string[]): RequestHandler {
  const rbacService = container.resolve(RbacService);

  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = res.locals['user'] as { userId: string } | undefined;

      if (!user?.userId) {
        res.status(401).json({ status: 401, message: 'Unauthorized' });
        return;
      }

      const allowed = await rbacService.hasAnyPermission(user.userId, requiredPermissions);

      if (allowed) {
        next();
        return;
      }

      res.status(403).json({ status: 403, message: 'Forbidden', required: requiredPermissions });
    } catch (err) {
      next(err);
    }
  };
}
