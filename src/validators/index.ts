import { z } from 'zod';
import type { Request } from 'express';
import { services } from '../constants/index.js';
export const id = z.string().regex(/^[a-f\d]{24}$/i);
export const amount = z.number().int().positive().max(1_000_000_000);
export const password = z.string().min(12).max(128);
export const email = z.email().max(254).transform(s => s.toLowerCase());
export const person = z.object({ name: z.string().trim().min(2).max(100), email, phone: z.string().regex(/^\+?[1-9]\d{9,14}$/), password }).strict();
export const service = z.enum(services);
export const input = <T extends z.ZodType>(req: Request, schema: T): z.output<T> => schema.parse(req.body);
export const page = (req: Request) => z.object({
  page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.enum(['createdAt', 'name']).default('createdAt'), direction: z.enum(['asc', 'desc']).default('desc')
}).parse(req.query);
export const key = (req: Request) => z.string().min(8).max(128).regex(/^[\w.-]+$/).parse(req.get('Idempotency-Key'));
