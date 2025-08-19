import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

declare module 'express-serve-static-core' {
  interface Request { instructorId?: string }
}

export function requireInstructor(req: Request, res: Response, next: NextFunction) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'No autenticado' });
  try {
    const token = auth.slice(7);
    const payload = jwt.verify(token, env.JWT_SECRET) as { sub: string };
    req.instructorId = payload.sub;
    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido' });
  }
}