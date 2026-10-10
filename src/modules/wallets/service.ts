import type { ClientSession, Types } from 'mongoose';
import type { Request } from 'express';
import { Wallet, Ledger, Transfer, FundingRequest, Idempotency, Audit } from '../../models/index.js';
import { ensure, atomic, hash, same, oid } from '../../utils/core.js';
import { accessible } from '../users/service.js';

type Identifier = string | Types.ObjectId;
type Entry = 'DEBIT' | 'CREDIT' | 'REFUND' | 'COMMISSION' | 'COMMISSION_REVERSAL' | 'FUNDING' | 'REVERSAL';
export async function moveMoney(session: ClientSession, tenantId: Identifier, userId: Identifier, delta: number, entryType: Entry, reference: string, idempotencyKey: string, links: { transactionId?: Identifier; transferId?: Identifier } = {}, allowBlocked = false) {
  ensure(Number.isSafeInteger(delta) && delta !== 0, 400, 'INVALID_MONEY');
  const prior = await Wallet.findOneAndUpdate({ tenantId, userId, ...(delta < 0 ? { balanceMinor: { $gte: -delta } } : { balanceMinor: { $lte: 1_000_000_000_000 - delta } }), ...(!allowBlocked ? { status: 'ACTIVE' } : {}) }, { $inc: { balanceMinor: delta } }, { session, returnDocument: 'before' });
  ensure(prior, 409, 'INSUFFICIENT_BALANCE_OR_WALLET_BLOCKED');
  await Ledger.create([{ tenantId, walletId: prior._id, userId, entryType, amountMinor: Math.abs(delta), balanceBeforeMinor: prior.balanceMinor, balanceAfterMinor: prior.balanceMinor + delta, reference, idempotencyKey, ...links }], { session });
  return prior;
}
export async function idempotent<T>(tenantId: Identifier, userId: Identifier, scope: string, key: string, payload: unknown, work: (session: ClientSession) => Promise<{ resourceId: Identifier; result: T }>, recover: (resourceId: string) => Promise<T>): Promise<T> {
  const requestHash = hash(JSON.stringify(payload));
  const find = () => Idempotency.findOne({ tenantId, userId, scope, key });
  const existing = await find();
  if (existing) { ensure(existing.requestHash === requestHash, 409, 'IDEMPOTENCY_CONFLICT'); return recover(String(existing.resourceId)); }
  try {
    return await atomic(async session => {
      const output = await work(session);
      await Idempotency.create([{ tenantId, userId, scope, key, requestHash, resourceId: output.resourceId }], { session });
      return output.result;
    });
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 11000) {
      const record = await find();
      ensure(record && record.requestHash === requestHash, 409, 'IDEMPOTENCY_CONFLICT');
      return recover(String(record.resourceId));
    }
    throw error;
  }
}
export async function transferFunds(req: Request, toUserId: string, amountMinor: number, key: string) {
  const actor = req.user!, tenantId = actor.tenantId!;
  await accessible(req, toUserId, true);
  return idempotent(tenantId, actor._id, 'transfer', key, { toUserId, amountMinor }, async session => {
    const [transfer] = await Transfer.create([{ tenantId, fromUserId: actor._id, toUserId, amountMinor, idempotencyKey: key }], { session });
    ensure(transfer, 500, 'TRANSFER_FAILED');
    const links = { transferId: transfer._id };
    await moveMoney(session, tenantId, actor._id, -amountMinor, 'DEBIT', 'Wallet transfer', `transfer-${transfer._id}-debit`, links);
    await moveMoney(session, tenantId, toUserId, amountMinor, 'CREDIT', 'Wallet transfer', `transfer-${transfer._id}-credit`, links);
    await Audit.create([{ tenantId, actorId: actor._id, action: 'WALLET_TRANSFER', targetId: String(transfer._id) }], { session });
    return { resourceId: transfer._id, result: transfer };
  }, async resourceId => { const transfer = await Transfer.findOne({ _id: resourceId, tenantId }); ensure(transfer, 404, 'TRANSFER_NOT_FOUND'); return transfer; });
}
export async function reverseTransfer(req: Request, transferId: string) {
  return atomic(async session => {
    const transfer = await Transfer.findOne({ _id: oid(transferId), tenantId: req.user!.tenantId }).session(session);
    ensure(transfer, 404, 'TRANSFER_NOT_FOUND');
    if (transfer.reversedAt) return transfer;
    await moveMoney(session, transfer.tenantId, transfer.toUserId, -transfer.amountMinor, 'REVERSAL', 'Transfer reversal', `reverse-${transfer._id}-debit`, { transferId: transfer._id }, true);
    await moveMoney(session, transfer.tenantId, transfer.fromUserId, transfer.amountMinor, 'REVERSAL', 'Transfer reversal', `reverse-${transfer._id}-credit`, { transferId: transfer._id }, true);
    transfer.reversedAt = new Date(); transfer.reversedBy = req.user!._id; await transfer.save({ session });
    await Audit.create([{ tenantId: transfer.tenantId, actorId: req.user!._id, action: 'TRANSFER_REVERSAL', targetId: transferId }], { session });
    return transfer;
  });
}
export async function approveFunding(req: Request, tenantId: string, fundingId: string, approve: boolean) {
  return atomic(async session => {
    const funding = await FundingRequest.findOne({ _id: oid(fundingId), tenantId: oid(tenantId) }).session(session);
    ensure(funding, 404, 'FUNDING_NOT_FOUND');
    if (req.user!.role !== 'DEVELOPER') {
      ensure(!same(funding.userId, req.user!._id), 403, 'SELF_FUNDING_APPROVAL_FORBIDDEN');
      await accessible(req, String(funding.userId), true);
    }
    if (funding.status !== 'REQUESTED') { ensure(funding.status === (approve ? 'APPROVED' : 'REJECTED'), 409, 'FUNDING_ALREADY_DECIDED'); return funding; }
    if (approve) await moveMoney(session, tenantId, funding.userId, funding.amountMinor, 'FUNDING', funding.reference, `funding-${funding._id}`);
    funding.status = approve ? 'APPROVED' : 'REJECTED'; funding.decidedBy = req.user!._id; funding.decidedAt = new Date(); await funding.save({ session });
    await Audit.create([{ tenantId, actorId: req.user!._id, action: `FUNDING_${funding.status}`, targetId: fundingId }], { session });
    return funding;
  });
}
