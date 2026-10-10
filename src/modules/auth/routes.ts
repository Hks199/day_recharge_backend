import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { authenticate, wrap } from '../../middleware/security.js';
import { email, password, input } from '../../validators/index.js';
import { Session, User, Audit } from '../../models/index.js';
import * as auth from './service.js';
export function authRoutes() {
  const router = Router();
  const limiter = rateLimit({ windowMs: 15 * 60000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false, handler: (req, res) => { res.status(429).json({ error: { code: 'RATE_LIMITED' }, requestId: req.requestId }); } });
  router.post('/login', limiter, wrap(async (req, res) => { const b = input(req, z.object({ email, password: z.string().min(1).max(128) }).strict()); res.json(await auth.login(req, res, b.email, b.password)); }));
  router.post('/refresh', limiter, wrap(async (req, res) => { res.json(await auth.refresh(req, res)); }));
  router.post('/logout', wrap(async (req, res) => { await auth.logout(req, res); res.status(204).end(); }));
  router.post('/password-reset/request', limiter, wrap(async (req, res) => { const b = input(req, z.object({ email }).strict()); await auth.requestReset(req, b.email); res.status(202).json({ message: 'If the account exists, reset instructions will be delivered.' }); }));
  router.post('/password-reset/confirm', limiter, wrap(async (req, res) => { const b = input(req, z.object({ token: z.string().length(64), password }).strict()); await auth.resetPassword(req, b.token, b.password); res.status(204).end(); }));
  router.get('/me', authenticate, wrap(async (req, res) => { res.json(req.user); }));
  router.patch('/me', authenticate, wrap(async (req, res) => { const b = input(req, z.object({ name: z.string().min(2).max(100).optional(), phone: z.string().regex(/^\+?[1-9]\d{9,14}$/).optional() }).strict()); const user = await User.findOneAndUpdate({ _id: req.user!._id, tenantId: req.user!.tenantId }, { $set: b }, { returnDocument: 'after', runValidators: true }); await Audit.create({ tenantId: req.tenant?._id, actorId: req.user!._id, action: 'PROFILE_UPDATE' }); res.json(user); }));
  router.post('/change-password', authenticate, wrap(async (req, res) => { const b = input(req, z.object({ oldPassword: z.string().max(128), newPassword: password }).strict()); await auth.changePassword(req, b.oldPassword, b.newPassword); res.status(204).end(); }));
  router.delete('/sessions', authenticate, wrap(async (req, res) => { await Session.updateMany({ userId: req.user!._id, tenantId: req.user!.tenantId }, { $set: { revokedAt: new Date() } }); res.status(204).end(); }));
  return router;
}
