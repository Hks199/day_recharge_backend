import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { pinoHttp } from 'pino-http';
import { rateLimit } from 'express-rate-limit';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { z } from 'zod';
import swaggerUi from 'swagger-ui-express';
import { config, list } from './config/index.js';
import { logger, AppError } from './utils/core.js';
import { wrap, resolveTenant, platformHost, authenticate } from './middleware/security.js';
import { TenantDomain, TenantSettings } from './models/index.js';
import { authRoutes } from './modules/auth/routes.js';
import { platformRoutes } from './modules/platform/routes.js';
import { userRoutes } from './modules/users/routes.js';
import { walletRoutes } from './modules/wallets/routes.js';
import { tenantRoutes } from './modules/tenants/routes.js';
import { rechargeRoutes } from './modules/recharges/routes.js';
import { billRoutes } from './modules/bill-payments/routes.js';
import { commissionRoutes } from './modules/commissions/routes.js';
import { notificationRoutes } from './modules/notifications/routes.js';
import { supportRoutes } from './modules/support/routes.js';
import { dashboard } from './modules/reports/service.js';
import { webhook } from './modules/recharges/webhook.js';
import { openapi } from './openapi.js';

export function createApp(readiness?: () => Promise<void>) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', list(config.TRUSTED_PROXIES));
  app.use((req, res, next) => { req.requestId = randomUUID(); res.setHeader('X-Request-ID', req.requestId); next(); });
  app.use(helmet());
  if (config.NODE_ENV !== 'test') app.use(pinoHttp({ logger, genReqId: req => (req as express.Request).requestId }));
  app.use(rateLimit({ windowMs: 60000, limit: 300, standardHeaders: 'draft-8', legacyHeaders: false, handler: (req, res) => { res.status(429).json({ error: { code: 'RATE_LIMITED' }, requestId: req.requestId }); } }));
  app.get('/health', (_req, res) => res.json({ status: 'ok' }));
  app.get('/ready', wrap(async (_req, res) => {
    if (mongoose.connection.readyState !== 1) throw new AppError(503, 'DATABASE_UNAVAILABLE');
    await mongoose.connection.db!.admin().ping();
    if (readiness) {
      let deadline: ReturnType<typeof setTimeout> | undefined;
      try { await Promise.race([readiness(), new Promise<never>((_resolve, reject) => { deadline = setTimeout(() => reject(new AppError(503, 'QUEUE_UNAVAILABLE')), 3000); })]); }
      catch { throw new AppError(503, 'QUEUE_UNAVAILABLE'); }
      finally { if (deadline) clearTimeout(deadline); }
    }
    res.json({ status: 'ready' });
  }));
  app.get('/api/openapi.json', (_req, res) => res.json(openapi));
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openapi));
  app.post('/api/webhooks/mock', express.raw({ type: 'application/json', limit: '32kb' }), wrap(webhook));
  app.use(express.json({ limit: '32kb' }), cookieParser());
  app.use('/api/platform', platformHost);
  app.use('/api/platform/auth', authRoutes());
  app.use('/api/platform', platformRoutes);
  app.use('/api', resolveTenant);
  app.get('/api/public/tenant-config', wrap(async (req, res) => {
    const tenant = req.tenant!, settings = await TenantSettings.findOne({ tenantId: tenant._id });
    const domain = await TenantDomain.findOne({ tenantId: tenant._id, primary: true, verifiedAt: { $exists: true } });
    res.json({ name: tenant.name, logo: tenant.branding?.logo, primaryColor: tenant.branding?.primaryColor, secondaryColor: tenant.branding?.secondaryColor, domain: domain?.hostname, features: settings?.publicFeatures ?? [], support: { email: settings?.supportEmail, phone: settings?.supportPhone } });
  }));
  app.use('/api/auth', authRoutes());
  app.use('/api', authenticate);
  app.use('/api/users', userRoutes);
  app.use('/api/wallet', walletRoutes);
  app.use('/api/tenant', tenantRoutes);
  app.use('/api/recharges', rechargeRoutes);
  app.use('/api/bill-payments', billRoutes);
  app.use('/api/commissions', commissionRoutes);
  app.use('/api/notifications', notificationRoutes);
  app.use('/api/support-tickets', supportRoutes);
  app.get('/api/reports/dashboard', wrap(async (req, res) => { res.json(await dashboard(req)); }));
  app.use((_req, _res, next) => next(new AppError(404, 'NOT_FOUND')));
  app.use((error: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const validation = error instanceof z.ZodError;
    const duplicate = typeof error === 'object' && error !== null && 'code' in error && error.code === 11000;
    const badJson = error instanceof SyntaxError && 'status' in error && error.status === 400;
    const tooLarge = typeof error === 'object' && error !== null && 'status' in error && error.status === 413;
    const status = error instanceof AppError ? error.status : validation || badJson ? 400 : tooLarge ? 413 : duplicate ? 409 : 500;
    if (status === 500) logger.error({ requestId: req.requestId, errorName: error instanceof Error ? error.name : 'Unknown' }, 'Unhandled request error');
    res.status(status).json({ error: { code: error instanceof AppError ? error.code : validation || badJson ? 'VALIDATION_ERROR' : tooLarge ? 'REQUEST_TOO_LARGE' : duplicate ? 'DUPLICATE_RECORD' : 'INTERNAL_ERROR', ...(validation ? { issues: error.issues.map(i => ({ path: i.path, message: i.message })) } : {}) }, requestId: req.requestId });
    void _next;
  });
  return app;
}
