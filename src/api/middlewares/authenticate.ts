import 'reflect-metadata';
import type { RequestHandler } from 'express';
import { container } from '../../container';
import { AuthService } from '../services/AuthService';

const authService = container.resolve(AuthService);

export const authenticate: RequestHandler = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ status: 401, message: 'Unauthorized' });
      return;
    }

    const token = authHeader.slice(7);
    const payload = await authService.verifyAccessToken(token);

    res.locals.user = { userId: payload.sub, email: payload['email'] };
    next();
  } catch {
    res.status(401).json({ status: 401, message: 'Unauthorized' });
  }
};
