import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction) { const candidate=String(req.header('x-request-id')||'').trim(); req.requestId=/^[A-Za-z0-9._:-]{8,100}$/.test(candidate)?candidate:randomUUID(); res.setHeader('x-request-id', req.requestId); next(); }
