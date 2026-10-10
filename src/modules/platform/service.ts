import mongoose from 'mongoose';
import type { Request } from 'express';
import { z } from 'zod';
import { Tenant, User, Wallet, TenantSettings, Subscription, Plan, Audit } from '../../models/index.js';
import { atomic, ensure, oid } from '../../utils/core.js';
import { passwordHash } from '../auth/service.js';
import { person, id } from '../../validators/index.js';

export const provisionInput = z.object({ name: z.string().min(2).max(100), slug: z.string().regex(/^[a-z0-9-]{3,64}$/), planId: id, owner: person }).strict();
export async function provision(req: Request, data: z.infer<typeof provisionInput>) {
  const encrypted = await passwordHash(data.owner.password);
  return atomic(async session => {
    const plan = await Plan.findOne({ _id: oid(data.planId), active: true }).session(session); ensure(plan, 400, 'PLAN_NOT_FOUND');
    const tenantId = new mongoose.Types.ObjectId(), ownerId = new mongoose.Types.ObjectId(), subscriptionId = new mongoose.Types.ObjectId();
    const [tenant] = await Tenant.create([{ _id: tenantId, name: data.name, slug: data.slug, ownerId, subscriptionId }], { session });
    await User.create([{ _id: ownerId, tenantId, name: data.owner.name, email: data.owner.email, phone: data.owner.phone, passwordHash: encrypted, role: 'SUPER_ADMIN', createdBy: req.user!._id }], { session });
    await Wallet.create([{ tenantId, userId: ownerId }], { session });
    await TenantSettings.create([{ tenantId, publicFeatures: plan.features, supportEmail: data.owner.email }], { session });
    await Subscription.create([{ _id: subscriptionId, tenantId, planId: plan._id, startAt: new Date(), endAt: new Date(Date.now() + plan.durationDays * 86400000), status: 'ACTIVE' }], { session });
    await Audit.create([{ actorId: req.user!._id, tenantId, action: 'TENANT_PROVISION', targetId: String(tenantId) }], { session });
    return tenant;
  });
}
export async function assignSubscription(req: Request, tenantId: string, planId: string, startAt: Date, endAt: Date) {
  ensure(endAt > startAt, 400, 'INVALID_SUBSCRIPTION_DATES');
  return atomic(async session => {
    const plan = await Plan.findOne({ _id: oid(planId), active: true }).session(session); ensure(plan, 404, 'PLAN_NOT_FOUND');
    const tenant = await Tenant.findById(oid(tenantId)).session(session); ensure(tenant, 404, 'TENANT_NOT_FOUND');
    await Subscription.updateMany({ tenantId: tenant._id, status: 'ACTIVE' }, { $set: { status: 'CANCELLED' } }, { session });
    const [subscription] = await Subscription.create([{ tenantId: tenant._id, planId: plan._id, startAt, endAt, status: 'ACTIVE' }], { session }); ensure(subscription, 500, 'SUBSCRIPTION_FAILED');
    tenant.subscriptionId = subscription._id; tenant.status = 'ACTIVE'; await tenant.save({ session });
    await TenantSettings.updateOne({ tenantId: tenant._id }, { $set: { publicFeatures: plan.features } }, { session });
    await Audit.create([{ tenantId: tenant._id, actorId: req.user!._id, action: 'SUBSCRIPTION_ASSIGN', targetId: String(subscription._id) }], { session });
    return subscription;
  });
}
export async function expireSubscriptions() {
  const expired = await Subscription.find({ status: 'ACTIVE', endAt: { $lte: new Date() } }).limit(500);
  for (const subscription of expired) await atomic(async session => {
    await Subscription.updateOne({ _id: subscription._id, status: 'ACTIVE', endAt: { $lte: new Date() } }, { $set: { status: 'EXPIRED' } }, { session });
    await Tenant.updateOne({ _id: subscription.tenantId, subscriptionId: subscription._id }, { $set: { status: 'SUSPENDED' } }, { session });
  });
}
