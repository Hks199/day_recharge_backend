import type { Request, Response, RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { config, list } from '../config/index.js';
import { Tenant, TenantDomain, Subscription, User, Session } from '../models/index.js';
import { AppError, ensure, hash, same, oid } from '../utils/core.js';
import type { Role } from '../constants/index.js';

export const wrap = (handler: (req: Request, res: Response) => Promise<unknown>): RequestHandler => (req, res, next) => { void handler(req, res).catch(next); };
function originHost(origin: string) {
  let url: URL;
  try { url = new URL(origin); } catch { throw new AppError(403, 'INVALID_ORIGIN'); }
  ensure(['https:', ...(config.NODE_ENV !== 'production' ? ['http:'] : [])].includes(url.protocol) && url.origin === origin, 403, 'INVALID_ORIGIN');
  return url.hostname;
}
export const resolveTenant: RequestHandler = (req, res, next) => {
  void (async () => {
    const host = req.hostname?.toLowerCase() ?? '';
    let selected = host;
    if (list(config.SHARED_API_HOSTS).includes(host)) {
      const origin = req.get('Origin');
      // Header is only a selector, never authority. Authentication must match this verified mapping.
      selected = origin ? originHost(origin) : req.get('X-Tenant-Domain')?.toLowerCase() ?? '';
      ensure(selected, 400, 'TENANT_DOMAIN_REQUIRED');
    }
    const domain = await TenantDomain.findOne({ hostname: selected, verifiedAt: { $exists: true } });
    ensure(domain, 404, 'UNKNOWN_OR_UNVERIFIED_DOMAIN');
    const tenant = await Tenant.findById(domain.tenantId);
    ensure(tenant && tenant.status === 'ACTIVE', 403, 'TENANT_SUSPENDED');
    const subscription = await Subscription.findOne({ _id: tenant.subscriptionId, tenantId: tenant._id, status: 'ACTIVE', startAt: { $lte: new Date() }, endAt: { $gt: new Date() } });
    ensure(subscription, 403, 'SUBSCRIPTION_INACTIVE');
    req.tenant = tenant;
    const origin = req.get('Origin');
    if (origin) {
      const allowed = await TenantDomain.exists({ tenantId: tenant._id, hostname: originHost(origin), verifiedAt: { $exists: true } });
      ensure(allowed, 403, 'ORIGIN_NOT_ALLOWED');
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.vary('Origin');
    }
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,Idempotency-Key,X-CSRF-Token,X-Tenant-Domain');
      res.status(204).end(); return;
    }
    next();
  })().catch(next);
};
export const platformHost: RequestHandler = (req, res, next) => {
  try {
    ensure(list(config.PLATFORM_HOSTS).includes(req.hostname?.toLowerCase() ?? ''), 404, 'UNKNOWN_PLATFORM_HOST');
    const origin = req.get('Origin');
    if (origin) {
      ensure(list(config.PLATFORM_ORIGINS).includes(origin.toLowerCase()), 403, 'ORIGIN_NOT_ALLOWED');
      res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Access-Control-Allow-Credentials', 'true'); res.vary('Origin');
    }
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-CSRF-Token');
      res.status(204).end(); return;
    }
    next();
  } catch (error) { next(error); }
};
export const authenticate: RequestHandler = (req, _res, next) => {
  void (async () => {
    const token = req.get('Authorization')?.match(/^Bearer (.+)$/)?.[1];
    ensure(token, 401, 'AUTH_REQUIRED');
    let decoded: jwt.JwtPayload;
    try {
      const value = jwt.verify(token, config.JWT_SECRET, { algorithms: ['HS256'], issuer: 'recharge', audience: 'recharge-api' });
      ensure(typeof value !== 'string', 401, 'INVALID_TOKEN'); decoded = value;
    } catch { ensure(false, 401, 'INVALID_TOKEN'); }
    ensure(typeof decoded.sub === 'string' && typeof decoded.sid === 'string', 401, 'INVALID_TOKEN');
    const session = await Session.findOne({ _id: oid(decoded.sid), userId: oid(decoded.sub), revokedAt: null, expiresAt: { $gt: new Date() } });
    ensure(session, 401, 'SESSION_REVOKED');
    const user = await User.findOne({ _id: decoded.sub, status: 'ACTIVE' });
    ensure(user, 401, 'USER_INACTIVE');
    ensure(req.tenant ? same(user.tenantId, req.tenant._id) && user.role !== 'DEVELOPER' : user.tenantId === null && user.role === 'DEVELOPER', 403, 'TENANT_MISMATCH');
    req.user = user; req.sessionId = String(session._id); next();
  })().catch(next);
};
export const permit = (...allowed: Role[]): RequestHandler => (req, _res, next) => {
  try { ensure(req.user && allowed.includes(req.user.role), 403, 'FORBIDDEN'); next(); } catch (error) { next(error); }
};
export async function csrf(req: Request) {
  const token = req.cookies?.refresh as unknown;
  const provided = req.get('X-CSRF-Token');
  ensure(typeof token === 'string' && provided, 403, 'CSRF_REQUIRED');
  const session = await Session.findOne({ tokenHash: hash(token) }).select('+csrfHash');
  ensure(session && session.csrfHash === hash(provided), 403, 'CSRF_INVALID');
  return session;
}
