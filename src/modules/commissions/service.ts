import type { ClientSession, Types } from 'mongoose';
import { CommissionRule, Commission, User, RechargeOrder, Tenant, Transaction, Operator, Audit } from '../../models/index.js';
import { ensure, percentage, atomic, oid } from '../../utils/core.js';
import { moveMoney } from '../wallets/service.js';
import type { Request } from 'express';
import type { z } from 'zod';
import type { ruleInput } from './validation.js';

export async function commissionSnapshot(tenantId: Types.ObjectId, userId: Types.ObjectId, operatorId: Types.ObjectId, amountMinor: number, budgetMinor: number, session: ClientSession) {
  const snapshot: { beneficiaryUserId: Types.ObjectId; amountMinor: number }[] = [];
  let user = await User.findOne({ _id: userId, tenantId }).session(session);
  const seen = new Set<string>();
  while (user) {
    ensure(user.role !== 'DEVELOPER', 500, 'INVALID_HIERARCHY');
    ensure(!seen.has(String(user._id)) && seen.size < 3, 500, 'INVALID_HIERARCHY'); seen.add(String(user._id));
    const rule = await CommissionRule.findOne({ tenantId, operatorId, beneficiaryRole: user.role, status: 'ACTIVE', effectiveFrom: { $lte: new Date() }, $or: [{ effectiveTo: null }, { effectiveTo: { $gt: new Date() } }] }).sort({ effectiveFrom: -1, _id: -1 }).session(session);
    const commission = rule ? rule.calculationType === 'FIXED' ? rule.commissionValue : percentage(amountMinor, rule.commissionValue) : 0;
    if (commission > 0) snapshot.push({ beneficiaryUserId: user._id, amountMinor: commission });
    user = user.parentId ? await User.findOne({ _id: user.parentId, tenantId }).session(session) : null;
  }
  const total = snapshot.reduce((sum, item) => sum + item.amountMinor, 0);
  ensure(Number.isSafeInteger(total) && total <= budgetMinor, 409, 'COMMISSION_BUDGET_EXCEEDED');
  return { snapshot, total };
}
export async function settleCommission(transaction: InstanceType<typeof Transaction>, session: ClientSession) {
  const order = await RechargeOrder.findOne({ transactionId: transaction._id, tenantId: transaction.tenantId }).session(session); ensure(order, 500, 'ORDER_MISSING');
  for (const item of order.commissionSnapshot) {
    if (await Commission.exists({ tenantId: transaction.tenantId, transactionId: transaction._id, beneficiaryUserId: item.beneficiaryUserId }).session(session)) continue;
    await moveMoney(session, transaction.tenantId, item.beneficiaryUserId, item.amountMinor, 'COMMISSION', 'Direct commission payout', `commission-${transaction._id}-${item.beneficiaryUserId}`, { transactionId: transaction._id }, true);
    await Commission.create([{ tenantId: transaction.tenantId, transactionId: transaction._id, beneficiaryUserId: item.beneficiaryUserId, sourceUserId: transaction.userId, amountMinor: item.amountMinor, status: 'PAID' }], { session });
  }
}
export async function reverseCommission(transaction: InstanceType<typeof Transaction>, session: ClientSession) {
  const records = await Commission.find({ tenantId: transaction.tenantId, transactionId: transaction._id, status: 'PAID' }).session(session);
  for (const record of records) {
    await moveMoney(session, transaction.tenantId, record.beneficiaryUserId, -record.amountMinor, 'COMMISSION_REVERSAL', 'Commission reversal', `commission-reverse-${record._id}`, { transactionId: transaction._id }, true);
    record.status = 'REVERSED'; await record.save({ session });
  }
}
export async function createRule(req: Request, data: z.infer<typeof ruleInput>) {
  return atomic(async session => {
    // Serialize changes to the same tenant, and validate maximum simultaneous direct payouts.
    await Tenant.updateOne({ _id: req.user!.tenantId }, { $set: { updatedAt: new Date() } }, { session });
    const operator = await Operator.findById(data.operatorId).session(session); ensure(operator && operator.serviceType === data.serviceType, 400, 'INVALID_OPERATOR');
    ensure(!data.effectiveTo || data.effectiveTo > data.effectiveFrom, 400, 'INVALID_EFFECTIVE_DATES');
    const existing = await CommissionRule.find({ tenantId: req.user!.tenantId, operatorId: oid(data.operatorId), status: 'ACTIVE' }).session(session);
    const maxPayout: Record<string, number> = {};
    for (const rule of [...existing, data]) {
      const payout = rule.calculationType === 'FIXED' ? rule.commissionValue : percentage(operator.minMinor, rule.commissionValue);
      maxPayout[rule.beneficiaryRole] = Math.max(maxPayout[rule.beneficiaryRole] ?? 0, payout);
    }
    ensure(Object.values(maxPayout).reduce((a, b) => a + b, 0) <= percentage(operator.minMinor, operator.commissionBudgetBps), 400, 'COMMISSION_BUDGET_EXCEEDED');
    const [rule] = await CommissionRule.create([{ tenantId: req.user!.tenantId, ...data }], { session });
    await Audit.create([{ tenantId: req.user!.tenantId, actorId: req.user!._id, action: 'COMMISSION_RULE_CREATE', targetId: String(rule?._id) }], { session });
    return rule;
  });
}
