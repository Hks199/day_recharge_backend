import type { Request } from 'express';
import { z } from 'zod';
import { User, Wallet, Audit, Session } from '../../models/index.js';
import { ensure, atomic, oid, same } from '../../utils/core.js';
import { passwordHash } from '../auth/service.js';
import { person, page } from '../../validators/index.js';

export async function accessible(req: Request, userId: string, manage = false) {
  const actor = req.user!;
  const target = await User.findOne({ _id: oid(userId), tenantId: actor.tenantId });
  ensure(target, 404, 'USER_NOT_FOUND');
  ensure(actor.role === 'SUPER_ADMIN' || same(target._id, actor._id) && !manage || actor.role === 'DISTRIBUTOR' && same(target.parentId, actor._id), 403, 'DOWNLINE_FORBIDDEN');
  if (manage) ensure(target.role !== 'SUPER_ADMIN' && !same(target._id, actor._id), 403, 'OWNER_OR_SELF_MANAGEMENT_FORBIDDEN');
  return target;
}
export async function createUser(req: Request, data: z.infer<typeof person>, role: 'DISTRIBUTOR' | 'RETAILER') {
  const creator = req.user!;
  ensure(creator.role === 'SUPER_ADMIN' || creator.role === 'DISTRIBUTOR' && role === 'RETAILER', 403, 'CREATION_FORBIDDEN');
  const encrypted = await passwordHash(data.password);
  return atomic(async session => {
    const [user] = await User.create([{ tenantId: creator.tenantId, name: data.name, email: data.email, phone: data.phone, passwordHash: encrypted, role, parentId: creator._id, createdBy: creator._id }], { session });
    ensure(user, 500, 'USER_CREATION_FAILED');
    await Wallet.create([{ tenantId: creator.tenantId, userId: user._id }], { session });
    await Audit.create([{ tenantId: creator.tenantId, actorId: creator._id, action: 'USER_CREATE', targetId: String(user._id) }], { session });
    return User.findById(user._id).session(session);
  });
}
export async function userList(req: Request, parentId?: string) {
  const actor = req.user!, p = page(req);
  if (parentId) await accessible(req, parentId);
  const filter = { tenantId: actor.tenantId, ...(parentId ? { parentId: oid(parentId) } : actor.role === 'DISTRIBUTOR' ? { parentId: actor._id } : actor.role === 'RETAILER' ? { _id: actor._id } : {}), ...(typeof req.query.role === 'string' ? { role: z.enum(['SUPER_ADMIN', 'DISTRIBUTOR', 'RETAILER']).parse(req.query.role) } : {}), ...(typeof req.query.status === 'string' ? { status: z.enum(['ACTIVE', 'BLOCKED']).parse(req.query.status) } : {}) };
  return { data: await User.find(filter).sort({ [p.sort]: p.direction === 'asc' ? 1 : -1, _id: 1 }).skip((p.page - 1) * p.limit).limit(p.limit), total: await User.countDocuments(filter), ...p };
}
export async function updateUser(req: Request, userId: string, update: { name?: string; phone?: string; status?: 'ACTIVE' | 'BLOCKED' }) {
  const target = await accessible(req, userId, true);
  return atomic(async session => {
    const updated = await User.findOneAndUpdate({ _id: target._id, tenantId: req.user!.tenantId }, { $set: update }, { session, returnDocument: 'after', runValidators: true });
    if (update.status === 'BLOCKED') await Session.updateMany({ userId: target._id }, { $set: { revokedAt: new Date() } }, { session });
    await Audit.create([{ tenantId: target.tenantId, actorId: req.user!._id, action: 'USER_UPDATE', targetId: userId }], { session });
    return updated;
  });
}
