import { Request, Response } from 'express';

export function notFound(req: Request, res: Response): void {
  res.status(404).json({
    status:  'error',
    message: `Cannot ${req.method} ${req.url}`,
  });
}
