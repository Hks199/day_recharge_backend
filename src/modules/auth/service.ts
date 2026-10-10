import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import type { Request, Response } from 'express';
import type { ClientSession } from 'mongoose';
import { config } from '../../config/index.js';
import { User, Session, PasswordReset, Audit } from '../../models/index.js';
import { atomic, ensure, hash, opaqueToken, same } from '../../utils/core.js';
import { csrf } from '../../middleware/security.js';

export const passwordHash = (password: string) => argon2.hash(password, { type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 1 });
const cookieOptions = { httpOnly: true, secure: config.COOKIE_SECURE === 'true', sameSite: 'none' as const, path: '/api' };
function cookieConfig() { return { ...cookieOptions, sameSite: config.COOKIE_SECURE === 'true' ? 'none' as const : 'lax' as const }; }
async function issue(req: Request, res: Response, user: InstanceType<typeof User>, family = opaqueToken(), databaseSession?: ClientSession) {
  const refresh = opaqueToken(), csrfToken = opaqueToken();
  const [session] = await Session.create([{ tenantId: user.tenantId ?? undefined, userId: user._id, family, tokenHash: hash(refresh), csrfHash: hash(csrfToken), expiresAt: new Date(Date.now() + 30 * 86400000) }], databaseSession ? { session: databaseSession } : {});
  ensure(session, 500, 'SESSION_CREATION_FAILED');
  const accessToken = jwt.sign({ sid: String(session._id) }, config.JWT_SECRET, { subject: String(user._id), expiresIn: '10m', issuer: 'recharge', audience: 'recharge-api', algorithm: 'HS256' });
  res.cookie('refresh', refresh, { ...cookieConfig(), maxAge: 30 * 86400000 });
  return { accessToken, expiresIn: 600, csrfToken, user: { id: user._id, name: user.name, role: user.role, tenantId: user.tenantId }, requestId: req.requestId };
}
export async function login(req: Request, res: Response, email: string, password: string) {
  const user = await User.findOne({ tenantId: req.tenant?._id ?? null, email, status: 'ACTIVE' }).select('+passwordHash');
  // Always perform a costly hash on an unknown account to reduce timing enumeration.
  const valid = user ? await argon2.verify(user.passwordHash, password) : (await passwordHash(password), false);
  await Audit.create({ tenantId: req.tenant?._id, actorId: user?._id, action: valid ? 'LOGIN' : 'LOGIN_FAILURE', requestId: req.requestId });
  ensure(user && valid, 401, 'INVALID_CREDENTIALS');
  user.lastLoginAt = new Date(); await user.save();
  return issue(req, res, user);
}
export async function refresh(req: Request, res: Response) {
  const current = await csrf(req);
  ensure(same(current.tenantId, req.tenant?._id ?? null), 403, 'TENANT_MISMATCH');
  if (current.usedAt || current.revokedAt) {
    await Session.updateMany({ family: current.family }, { $set: { revokedAt: new Date() } });
    ensure(false, 401, 'REFRESH_REUSE');
  }
  ensure(current.expiresAt > new Date(), 401, 'SESSION_EXPIRED');
  const user = await User.findOne({ _id: current.userId, tenantId: current.tenantId, status: 'ACTIVE' });
  ensure(user, 401, 'USER_INACTIVE');
  // Single winner; reuse of a rotated token revokes the family.
  const result = await atomic(async session => {
    const claimed = await Session.findOneAndUpdate({ _id: current._id, usedAt: null, revokedAt: null }, { $set: { usedAt: new Date(), revokedAt: new Date() } }, { session });
    return claimed ? issue(req, res, user, current.family, session) : null;
  });
  if (!result) {
    await Session.updateMany({ family: current.family }, { $set: { revokedAt: new Date() } });
    ensure(false, 401, 'REFRESH_REUSE');
  }
  return result;
}
export async function logout(req: Request, res: Response) {
  const session = await csrf(req);
  ensure(same(session.tenantId, req.tenant?._id ?? null), 403, 'TENANT_MISMATCH');
  await Session.updateMany({ family: session.family }, { $set: { revokedAt: new Date() } });
  res.clearCookie('refresh', cookieConfig());
}
export async function changePassword(req: Request, oldPassword: string, newPassword: string) {
  const user = await User.findById(req.user!._id).select('+passwordHash');
  ensure(user && await argon2.verify(user.passwordHash, oldPassword), 400, 'WRONG_PASSWORD');
  const encrypted = await passwordHash(newPassword);
  await atomic(async session => {
    await User.updateOne({ _id: user._id }, { $set: { passwordHash: encrypted } }, { session });
    await Session.updateMany({ userId: user._id }, { $set: { revokedAt: new Date() } }, { session });
    await Audit.create([{ tenantId: user.tenantId, actorId: user._id, action: 'PASSWORD_CHANGED' }], { session });
  });
}
export async function requestReset(req: Request, email: string) {
  ensure(config.PASSWORD_RESET_DELIVERY_URL && config.PASSWORD_RESET_DELIVERY_SECRET, 503, 'RESET_DELIVERY_NOT_CONFIGURED');
  const user = await User.findOne({ tenantId: req.tenant?._id ?? null, email });
  if (!user) return;
  const token = opaqueToken();
  await PasswordReset.create({ tenantId: user.tenantId, userId: user._id, tokenHash: hash(token), expiresAt: new Date(Date.now() + 900000) });
  const result = await fetch(config.PASSWORD_RESET_DELIVERY_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.PASSWORD_RESET_DELIVERY_SECRET}` }, body: JSON.stringify({ to: user.email, token, tenantId: user.tenantId }), signal: AbortSignal.timeout(10000) });
  ensure(result.ok, 503, 'RESET_DELIVERY_FAILED');
}
export async function resetPassword(req: Request, token: string, newPassword: string) {
  const encrypted = await passwordHash(newPassword);
  await atomic(async session => {
    const reset = await PasswordReset.findOneAndUpdate({ tokenHash: hash(token), tenantId: req.tenant?._id ?? null, usedAt: null, expiresAt: { $gt: new Date() } }, { $set: { usedAt: new Date() } }, { session });
    ensure(reset, 400, 'INVALID_RESET_TOKEN');
    await User.updateOne({ _id: reset.userId, tenantId: reset.tenantId }, { $set: { passwordHash: encrypted } }, { session });
    await Session.updateMany({ userId: reset.userId }, { $set: { revokedAt: new Date() } }, { session });
    await Audit.create([{ tenantId: reset.tenantId, actorId: reset.userId, action: 'PASSWORD_RESET' }], { session });
  });
}
