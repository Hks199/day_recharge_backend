import type { Request } from 'express';
import { User, Transaction, Commission, Wallet } from '../../models/index.js';
import { z } from 'zod';
export async function visibleUserIds(req: Request) {
  if (req.user!.role === 'SUPER_ADMIN') return null;
  return [req.user!._id, ...(req.user!.role === 'DISTRIBUTOR' ? (await User.find({ tenantId: req.user!.tenantId, parentId: req.user!._id }).select('_id')).map(user => user._id) : [])];
}
export async function transactionFilter(req: Request) {
  const ids = await visibleUserIds(req);
  const query = z.object({ from: z.coerce.date().optional(), to: z.coerce.date().optional(), status: z.enum(['PENDING', 'PROCESSING', 'SUCCESS', 'FAILED', 'REFUNDED']).optional() }).parse(req.query);
  return { tenantId: req.user!.tenantId, ...(ids ? { userId: { $in: ids } } : {}), ...(query.status ? { status: query.status } : {}), ...(query.from || query.to ? { createdAt: { ...(query.from ? { $gte: query.from } : {}), ...(query.to ? { $lte: query.to } : {}) } } : {}) };
}
export async function dashboard(req: Request) {
  const ids = await visibleUserIds(req), filter = await transactionFilter(req);
  return {
    users: await User.aggregate([{ $match: { tenantId: req.user!.tenantId, ...(ids ? { _id: { $in: ids } } : {}) } }, { $group: { _id: '$role', count: { $sum: 1 } } }]),
    transactions: await Transaction.aggregate([{ $match: filter }, { $group: { _id: '$status', count: { $sum: 1 }, volumeMinor: { $sum: '$amountMinor' } } }]),
    commissions: await Commission.aggregate([{ $match: { tenantId: req.user!.tenantId, ...(req.user!.role === 'SUPER_ADMIN' ? {} : { beneficiaryUserId: req.user!._id }) } }, { $group: { _id: '$status', amountMinor: { $sum: '$amountMinor' } } }]),
    wallets: await Wallet.aggregate([{ $match: { tenantId: req.user!.tenantId, ...(req.user!.role === 'SUPER_ADMIN' ? {} : { userId: req.user!._id }) } }, { $group: { _id: '$currency', balanceMinor: { $sum: '$balanceMinor' } } }])
  };
}
