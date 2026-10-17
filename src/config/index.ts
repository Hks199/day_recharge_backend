import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).default(3000),
  MONGODB_URI: z.string().default('mongodb://127.0.0.1:27017/day_recharge?replicaSet=rs0'),
  REDIS_URL: z.string().default('redis://127.0.0.1:6379'),
  QUEUE_PREFIX: z.string().regex(/^[a-zA-Z0-9_-]+$/).default('recharge'),
  JWT_SECRET: z.string().min(32),
  WEBHOOK_SECRET: z.string().min(32),
  PLATFORM_HOSTS: z.string().default('localhost'),
  SHARED_API_HOSTS: z.string().default('api.localhost'),
  PLATFORM_ORIGINS: z.string().default('http://localhost:3000,http://localhost:5179,http://platform.localhost:5179'),
  TRUSTED_PROXIES: z.string().default(''),
  COOKIE_SECURE: z.enum(['true', 'false']).default('true'),
  LOG_LEVEL: z.string().default('info'),
  S3_REGION: z.string().default(''),
  S3_BUCKET: z.string().default(''),
  S3_PUBLIC_BASE_URL: z.string().default(''),
  MOCK_PROVIDER_ENABLED: z.enum(['true', 'false']).default('false'),
  PASSWORD_RESET_DELIVERY_URL: z.preprocess(v => v === '' ? undefined : v, z.url().optional()),
  PASSWORD_RESET_DELIVERY_SECRET: z.preprocess(v => v === '' ? undefined : v, z.string().min(32).optional())
});
export const config = schema.parse(process.env);
if (config.NODE_ENV === 'production' && config.COOKIE_SECURE !== 'true') throw new Error('Secure cookies required');
export const list = (value: string) => value.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
