import type { Request } from 'express';
import type { ClientSession } from 'mongoose';
import { z } from 'zod';
import { Transaction, RechargeOrder, Provider, Operator, Wallet, TenantSettings, Outbox, Tenant, Notification, Reconciliation, Bill, Audit, PlatformSettings } from '../../models/index.js';
import { ensure, oid, atomic, hash, percentage, opaqueToken } from '../../utils/core.js';
import { transitions, type TransactionStatus } from '../../constants/index.js';
import { idempotent, moveMoney } from '../wallets/service.js';
import { commissionSnapshot, settleCommission, reverseCommission } from '../commissions/service.js';
import { adapter } from '../../providers/index.js';
import { type ProviderResult, type ProviderRequest } from '../../providers/interfaces/index.js';
import { rechargeInput } from './validation.js';

export async function createRecharge(req: Request, data: z.infer<typeof rechargeInput>, key: string) {
  const actor = req.user!; ensure(actor.role === 'RETAILER', 403, 'RETAILER_REQUIRED');
  return idempotent(actor.tenantId!, actor._id, 'recharge', key, data, async session => {
    const platform = await PlatformSettings.findOne({ key: 'GLOBAL' }).session(session);
    ensure(!platform || platform.enabledServices.includes(data.serviceType) && data.amountMinor <= platform.maxRechargeMinor, 403, 'PLATFORM_SERVICE_RESTRICTED');
    const operator = await Operator.findOne({ _id: oid(data.operatorId), serviceType: data.serviceType, enabled: true }).session(session);
    ensure(operator && data.amountMinor >= operator.minMinor && data.amountMinor <= operator.maxMinor, 400, 'INVALID_OPERATOR_OR_AMOUNT');
    const provider = await Provider.findOne({ _id: operator.providerId, enabled: true }).session(session); ensure(provider, 503, 'PROVIDER_UNAVAILABLE'); adapter(provider.code);
    const settings = await TenantSettings.findOne({ tenantId: actor.tenantId }).session(session);
    ensure(settings?.enabledServices.includes(data.serviceType), 403, 'SERVICE_DISABLED');
    let billReference: string | undefined;
    if (['POSTPAID', 'ELECTRICITY', 'BBPS'].includes(data.serviceType)) {
      ensure(data.billId, 400, 'BILL_INQUIRY_REQUIRED');
      const bill = await Bill.findOneAndUpdate({ _id: oid(data.billId), tenantId: actor.tenantId, userId: actor._id, operatorId: operator._id, accountHash: hash(data.account), expiresAt: { $gt: new Date() }, consumedAt: null, amountMinor: data.amountMinor }, { $set: { consumedAt: new Date() } }, { session });
      ensure(bill, 400, 'INVALID_OR_EXPIRED_BILL'); billReference = bill.providerReference;
    }
    const wallet = await Wallet.findOne({ tenantId: actor.tenantId, userId: actor._id }).session(session); ensure(wallet, 404, 'WALLET_NOT_FOUND');
    const { snapshot, total } = await commissionSnapshot(actor.tenantId!, actor._id, operator._id, data.amountMinor, percentage(data.amountMinor, operator.commissionBudgetBps), session);
    const [transaction] = await Transaction.create([{ tenantId: actor.tenantId, userId: actor._id, walletId: wallet._id, serviceType: data.serviceType, operatorId: operator._id, amountMinor: data.amountMinor, providerId: provider._id, idempotencyKey: key, commissionBudgetMinor: total }], { session });
    ensure(transaction, 500, 'TRANSACTION_CREATION_FAILED');
    await moveMoney(session, actor.tenantId!, actor._id, -data.amountMinor, 'DEBIT', 'Recharge reservation', `recharge-${transaction._id}`, { transactionId: transaction._id });
    if (total > 0) {
      const tenant = await Tenant.findById(actor.tenantId).session(session); ensure(tenant, 500, 'TENANT_MISSING');
      await moveMoney(session, actor.tenantId!, tenant.ownerId, -total, 'DEBIT', 'Commission reserve', `commission-reserve-${transaction._id}`, { transactionId: transaction._id });
    }
    await RechargeOrder.create([{ tenantId: actor.tenantId, transactionId: transaction._id, account: data.account, billReference, commissionSnapshot: snapshot }], { session });
    await Outbox.create([{ tenantId: actor.tenantId, transactionId: transaction._id }], { session });
    return { resourceId: transaction._id, result: transaction };
  }, async resourceId => { const transaction = await Transaction.findOne({ _id: resourceId, tenantId: actor.tenantId, userId: actor._id }); ensure(transaction, 404, 'TRANSACTION_NOT_FOUND'); return transaction; });
}
async function transition(transaction: InstanceType<typeof Transaction>, next: TransactionStatus, session: ClientSession) {
  ensure(transitions[transaction.status].includes(next), 409, 'INVALID_TRANSACTION_TRANSITION');
  transaction.status = next; await transaction.save({ session });
}
async function refund(transaction: InstanceType<typeof Transaction>, session: ClientSession, reversePaid: boolean) {
  if (reversePaid) await reverseCommission(transaction, session);
  await moveMoney(session, transaction.tenantId, transaction.userId, transaction.amountMinor, 'REFUND', 'Recharge refund', `refund-${transaction._id}`, { transactionId: transaction._id }, true);
  if (transaction.commissionBudgetMinor > 0) {
    const tenant = await Tenant.findById(transaction.tenantId).session(session); ensure(tenant, 500, 'TENANT_MISSING');
    await moveMoney(session, transaction.tenantId, tenant.ownerId, transaction.commissionBudgetMinor, 'REFUND', 'Commission reserve release', `commission-release-${transaction._id}`, { transactionId: transaction._id }, true);
  }
  await transition(transaction, 'REFUNDED', session);
}
export async function finalize(transactionId: string, result: ProviderResult, session?: ClientSession) {
  const work = async (s: ClientSession) => {
    const transaction = await Transaction.findById(oid(transactionId)).session(s); ensure(transaction, 404, 'TRANSACTION_NOT_FOUND');
    if (['SUCCESS', 'REFUNDED'].includes(transaction.status)) return transaction;
    ensure(transaction.status === 'PROCESSING', 409, 'TRANSACTION_NOT_PROCESSING');
    transaction.providerTransactionId = result.providerTransactionId;
    if (result.status === 'PENDING') { await transaction.save({ session: s }); return transaction; }
    if (result.status === 'SUCCESS') { await transition(transaction, 'SUCCESS', s); await settleCommission(transaction, s); }
    else { transaction.failureReason = result.failureReason ?? 'PROVIDER_DECLINED'; await transition(transaction, 'FAILED', s); await refund(transaction, s, false); }
    await Notification.create([{ tenantId: transaction.tenantId, userId: transaction.userId, title: `Recharge ${transaction.status}`, message: `Transaction ${transaction._id}: ${transaction.status}`, reference: String(transaction._id) }], { session: s });
    return transaction;
  };
  return session ? work(session) : atomic(work);
}
export async function processRecharge(transactionId: string) {
  const initial = await Transaction.findById(oid(transactionId));
  if (!initial || !['PENDING', 'PROCESSING'].includes(initial.status)) return;
  const leaseToken = opaqueToken();
  const order = await RechargeOrder.findOneAndUpdate({ transactionId: initial._id, $or: [{ leaseUntil: null }, { leaseUntil: { $lt: new Date() } }] }, { $set: { leaseUntil: new Date(Date.now() + 60000), leaseToken } }, { returnDocument: 'after' }).select('+account');
  if (!order) return; // Another submission or recovery owns the lease.
  try {
    const claimed = await Transaction.findOneAndUpdate({ _id: initial._id, status: 'PENDING' }, { $set: { status: 'PROCESSING' } }, { returnDocument: 'after' });
    const transaction = claimed ?? await Transaction.findById(transactionId);
    if (!transaction || transaction.status !== 'PROCESSING') return;
    const provider = await Provider.findById(transaction.providerId); ensure(provider, 500, 'PROVIDER_MISSING');
    const operator = await Operator.findById(transaction.operatorId); ensure(operator, 500, 'OPERATOR_MISSING');
    const request: ProviderRequest = { transactionId, account: order.account, amountMinor: transaction.amountMinor, serviceType: transaction.serviceType, operatorCode: operator.code, ...(order.billReference ? { billReference: order.billReference } : {}) };
    // External calls are outside all MongoDB transactions. Redelivery checks status rather than submitting twice.
    const integration = adapter(provider.code);
    const response = integration.validateResponse(await (claimed ? integration.submit(request) : integration.check(request)));
    await finalize(transactionId, response);
    await Reconciliation.create({ tenantId: transaction.tenantId, transactionId, result: claimed ? 'SUBMITTED' : 'CHECKED', providerStatus: response.status });
  } catch {
    await Reconciliation.create({ tenantId: initial.tenantId, transactionId, result: 'AMBIGUOUS_RETRY_STATUS_CHECK', providerStatus: 'UNKNOWN' });
    // Timeout never implies failure: the debit stays reserved until definitive provider evidence.
    throw new Error('PROVIDER_RECONCILIATION_REQUIRED');
  } finally { await RechargeOrder.updateOne({ _id: order._id, leaseToken }, { $set: { lastCheckedAt: new Date() }, $unset: { leaseUntil: 1, leaseToken: 1 } }); }
}
export async function reverseRecharge(req: Request, transactionId: string, reason: string) {
  return atomic(async session => {
    const transaction = await Transaction.findOne({ _id: oid(transactionId), tenantId: req.user!.tenantId }).session(session);
    ensure(transaction, 404, 'TRANSACTION_NOT_FOUND');
    if (transaction.status === 'REFUNDED') return transaction;
    ensure(transaction.status === 'SUCCESS', 409, 'ONLY_CONFIRMED_SUCCESS_REVERSIBLE');
    await refund(transaction, session, true);
    await Audit.create([{ tenantId: transaction.tenantId, actorId: req.user!._id, action: 'RECHARGE_REVERSAL', targetId: transactionId, requestId: req.requestId }], { session });
    transaction.failureReason = reason; await transaction.save({ session }); return transaction;
  });
}
