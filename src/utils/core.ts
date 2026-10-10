import { createHash, randomBytes } from 'node:crypto';
import mongoose, { type ClientSession } from 'mongoose';
import pino from 'pino';
import { config } from '../config/index.js';

export const logger = pino({ level: config.LOG_LEVEL, redact: {
  paths: ['req.headers.authorization', 'req.headers.cookie', 'req.body', 'res.headers.set-cookie', 'password', 'passwordHash', 'token', 'secret'], censor: '[REDACTED]'
} });
export class AppError extends Error {
  constructor(public status: number, public code: string, message = code) { super(message); }
}
export function ensure(condition: unknown, status: number, code: string): asserts condition {
  if (!condition) throw new AppError(status, code);
}
export const opaqueToken = () => randomBytes(32).toString('hex');
export const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export const same = (a: unknown, b: unknown) => String(a) === String(b);
export const oid = (value: string) => { ensure(/^[a-f\d]{24}$/i.test(value), 400, 'INVALID_ID'); return new mongoose.Types.ObjectId(value); };
export async function atomic<T>(work: (session: ClientSession) => Promise<T>): Promise<T> {
  const session = await mongoose.startSession();
  try { return await session.withTransaction(() => work(session)); } finally { await session.endSession(); }
}
export function percentage(amount: number, basisPoints: number) {
  return Number(BigInt(amount) * BigInt(basisPoints) / 10000n);
}
